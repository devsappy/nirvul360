"""
Courier settlement sheet processing: preview + commit.

Payment postings per delivered parcel (threaded row by row):
- cash (+) and courier fee expenses per the sheet,
- the courier receivable cleared,
- anything the sheet says the courier did NOT pay out of the promised COD is parked in
  settlement_suspense and a short_settlement / zero_settlement exception is raised
  (criterion 5: visible, and excluded from profit until resolved).

Commit is idempotent via the settlement_once unique index: the same consignment
cannot be paid twice, no matter how many times the sheet is re-uploaded.
"""
import json
import hashlib
from typing import Dict, Any, List, Optional
from app.db.session import insert, update, one, all, tx
from app.lib.dates import now_iso, today, is_iso_date
from app.lib.events import event_bus
from app.lib.audit import log_audit
from app.domain import courier_map
from app.domain.ledger import post, live_journals_for_order
from app.domain.accounts import ACCOUNTS
from app.domain.orders import get_order, apply_status
from app.domain.merchants import resolve_cash_account
from app.domain.exceptions import raise_exception, auto_clear

COURIER_EXPENSE_ACCOUNTS = ['courier_delivery', 'courier_cod_fee', 'courier_return_fee']


def _order_for_consignment(merchant_id: int, courier: str, consignment: Optional[str], ref: Optional[str]) -> Optional[Dict[str, Any]]:
    if consignment:
        o = one(
            "SELECT * FROM orders WHERE merchant_id = ? AND courier = ? AND consignment_id = ?",
            merchant_id, courier, consignment
        )
        if not o:
            o = one(
                "SELECT * FROM orders WHERE merchant_id = ? AND consignment_id = ? AND courier IS NULL",
                merchant_id, consignment
            )
        if o:
            return o
    if ref:
        o = one(
            "SELECT * FROM orders WHERE merchant_id = ? AND (external_id = ? OR consignment_id = ?)",
            merchant_id, ref, ref
        )
        if o:
            return o
    return None


def _prior_courier_fees(merchant_id: int, order_id: int) -> int:
    """Courier charges already booked on this order through the normal flow."""
    total = 0
    for j in live_journals_for_order(order_id, ['courier_charges']):
        lines = all(
            "SELECT COALESCE(SUM(amount), 0) AS s FROM journal_lines WHERE journal_id = ? AND account IN ('courier_delivery','courier_cod_fee','courier_return_fee')",
            j['id']
        )
        total += int(lines[0]['s']) if lines else 0
    return total


def prepare_records(raw_rows: List[Dict[str, Any]], courier: str) -> Dict[str, Any]:
    """Preview path: normalise raw sheet rows without touching the database."""
    return courier_map.normalize_rows(raw_rows, courier)


def commit_settlement(
    merchant_id: int,
    records: List[Dict[str, Any]],
    courier: str,
    filename: str,
    sha256: str,
    ctx: Dict[str, Any],
    deposit_account_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Commits a validated, normalised settlement sheet. `records` must already be in
    the canonical shape produced by courier_map.normalize_rows (the API validates
    them against the same mapping). Writes settlement_rows + an upload row, threads
    the payment postings per delivered parcel and raises courier exceptions.
    """
    source = ctx.get('source', 'courier_sheet_upload')
    actor = ctx.get('actor', 'system')
    courier_map.get_courier(courier)  # validate courier early

    with tx():
        upload_id = insert('uploads', {
            'merchant_id': merchant_id,
            'kind': 'courier_settlement',
            'courier': courier,
            'filename': filename,
            'sha256': sha256,
            'status': 'committed',
            'row_count': len(records),
            'summary': json.dumps(_running_summary(records)),
            'created_by': actor,
            'created_at': now_iso(),
            'committed_at': now_iso(),
            'deposit_account_id': deposit_account_id,
        })

        posted = 0
        exceptions = 0
        skipped = 0
        unmatched = 0
        total_cash = 0
        errors_back: List[Dict[str, Any]] = []

        for seq, rec in enumerate(records, start=1):
            rec = dict(rec)
            if not rec.get('row_no'):
                rec['row_no'] = seq
            consignment = rec.get('consignment_id')
            dedupe = f"{courier}:{consignment}" if consignment else f"{courier}:row{rec.get('row_no')}"
            if one(
                "SELECT id FROM settlement_rows WHERE merchant_id = ? AND dedupe_key = ? AND outcome IN ('posted','exception','unmatched')",
                merchant_id, dedupe
            ):
                skipped += 1
                continue

            order = _order_for_consignment(merchant_id, courier, consignment, rec.get('order_id'))
            row_id: Optional[int] = None

            def _insert_row(outcome: str, detail: str):
                nonlocal row_id
                row_id = insert('settlement_rows', {
                    'merchant_id': merchant_id,
                    'upload_id': upload_id,
                    'courier': courier,
                    'row_no': rec.get('row_no'),
                    'raw': json.dumps(rec),
                    'consignment_id': consignment,
                    'merchant_ref': rec.get('order_id'),
                    'status_raw': rec.get('status_raw'),
                    'status': rec.get('status'),
                    'cod_collected': rec.get('cod_collected') or 0,
                    'delivery_charge': rec.get('delivery_charge') or 0,
                    'cod_fee': rec.get('cod_fee') or 0,
                    'return_fee': rec.get('return_charge') or 0,
                    'sheet_payout': rec.get('consignment_total'),
                    'delivery_date': rec.get('delivery_date'),
                    'settlement_date': rec.get('settlement_date'),
                    'settlement_ref': None,
                    'order_id': order['id'] if order else None,
                    'outcome': outcome,
                    'outcome_detail': detail,
                    'dedupe_key': dedupe,
                })

            if rec.get('errors'):
                errors_back.append({'row_no': rec.get('row_no'), 'consignment_id': consignment, **{'errors': rec['errors']}})
                _insert_row('error', '; '.join(rec['errors']))
                continue

            sheet_status = (rec.get('status') or '').lower()
            fees = (rec.get('delivery_charge') or 0) + (rec.get('cod_fee') or 0) + (rec.get('return_charge') or 0)
            collected = int(rec.get('cod_collected') or 0)
            d = rec.get('delivery_date') or rec.get('settlement_date')
            delivery_date = d if (d and is_iso_date(d)) else None

            if not order:
                unmatched += 1
                _insert_row('unmatched', 'no order in the books for this consignment')
                raise_exception(merchant_id, {
                    'type': 'missing_parcel',
                    'key': f"c_sheet:{consignment}",
                    'value': collected,
                    'courier': courier,
                    'details': {
                        'consignment_id': consignment,
                        'from_sheet': True,
                        'status': rec.get('status_raw'),
                        'cod_collected': collected,
                        'upload_id': upload_id,
                    },
                }, actor)
                continue

            order = get_order(merchant_id, order['id'])

            # Books agree with the sheet?
            books_status = order['status']
            if sheet_status in ('returned', 'cancelled') and books_status in ('returned', 'cancelled'):
                # Courier kept/held fees for the failed parcel. Do not double-charge:
                prior = _prior_courier_fees(merchant_id, order['id'])
                if fees > 0 and prior == 0:
                    _post_row_fees(merchant_id, order['id'], courier, rec, fees, delivery_date or today(), source, actor)
                _insert_row('posted', f"{sheet_status} parcel fees booked")
                posted += 1
                continue

            if sheet_status in ('returned', 'cancelled') and books_status not in ('returned', 'cancelled'):
                _insert_row('exception', f"sheet says {sheet_status}, books say {books_status}")
                raise_exception(merchant_id, {
                    'type': 'stuck_parcel',
                    'key': f"mismatch:{consignment}",
                    'value': order['total'],
                    'order_id': order['id'],
                    'courier': courier,
                    'details': {
                        'consignment_id': consignment,
                        'sheet_status': sheet_status,
                        'order_status': books_status,
                        'upload_id': upload_id,
                    },
                }, actor)
                exceptions += 1
                continue

            # ---- delivered/partial sheet row -------------------------------------
            if books_status in ('placed', 'in_transit'):
                apply_status(merchant_id, order['id'], 'delivered', {
                    'source': source,
                    'actor': actor,
                    'date': delivery_date or today(),
                })
                order = get_order(merchant_id, order['id'])

            cod = order['cod_amount']
            prior = _prior_courier_fees(merchant_id, order['id'])
            pay_in = collected - fees
            cash_acct = resolve_cash_account(merchant_id, deposit_account_id)

            lines: List[Dict[str, Any]] = []
            if pay_in != 0:
                lines.append({'account': 'cash', 'party': cash_acct, 'amount': pay_in})
            if prior == 0 and fees > 0:
                if rec.get('delivery_charge'):
                    lines.append({'account': 'courier_delivery', 'amount': rec['delivery_charge']})
                if rec.get('cod_fee'):
                    lines.append({'account': 'courier_cod_fee', 'amount': rec['cod_fee']})
                if rec.get('return_charge'):
                    lines.append({'account': 'courier_return_fee', 'amount': rec['return_charge']})
            receivable_clear = int(-(cod - prior))
            lines.append({'account': 'courier_receivable', 'party': str(order.get('courier') or courier), 'amount': receivable_clear})
            park = int(cod - collected)
            if park != 0:
                lines.append({'account': 'settlement_suspense', 'amount': park})

            if lines:
                post({
                    'merchant_id': merchant_id,
                    # The settlement happened when the parcel was delivered (sheets that
                    # carry their own dates take precedence) — otherwise the adjustments
                    # would escape the reporting period the delivery belongs to.
                    'date': rec.get('settlement_date') if (rec.get('settlement_date') and is_iso_date(rec.get('settlement_date')))
                            else delivery_date or (order.get('delivered_date') if isinstance(order.get('delivered_date'), str) else None) or today(),
                    'kind': 'settlement',
                    'memo': f"{courier_map.display_name(courier)} settlement: {consignment}",
                    'source': source,
                    'created_by': actor,
                    'order_id': order['id'],
                    'exception_id': None,
                    'upload_id': upload_id,
                }, lines)
            total_cash += pay_in

            if collected == 0 and cod > 0:
                # Nothing came back for a parcel the books say was delivered.
                _insert_row('exception', 'courier settled zero against the order COD')
                raise_exception(merchant_id, {
                    'type': 'zero_settlement',
                    'key': str(order['id']),
                    'value': park,
                    'order_id': order['id'],
                    'courier': courier,
                    'settlement_row_id': row_id,
                    'details': {
                        'consignment_id': consignment,
                        'order_total': order['total'],
                        'order_cod': cod,
                        'settled_amount': collected,
                        'payout_poisha': pay_in,
                        'upload_id': upload_id,
                    },
                }, actor)
                exceptions += 1
            elif collected < cod and cod > 0:
                _insert_row('exception', f"courier settled {collected} of {cod} poisha")
                raise_exception(merchant_id, {
                    'type': 'short_settlement',
                    'key': str(order['id']),
                    'value': park,
                    'order_id': order['id'],
                    'courier': courier,
                    'settlement_row_id': row_id,
                    'details': {
                        'consignment_id': consignment,
                        'order_total': order['total'],
                        'order_cod': cod,
                        'settled_amount': collected,
                        'payout_poisha': pay_in,
                        'upload_id': upload_id,
                    },
                }, actor)
                exceptions += 1
            else:
                _insert_row('posted', 'settlement posted')
                posted += 1
                auto_clear(merchant_id, 'unsettled_cod', str(order['id']), actor, 'courier sheet settled this order')

        update('uploads', upload_id, {
            'summary': json.dumps({
                'rows': len(records),
                'posted': posted,
                'exceptions': exceptions,
                'unmatched': unmatched,
                'skipped': skipped,
                'total_cash_poisha': total_cash,
            })
        })

    log_audit(
        merchant_id=merchant_id,
        action='settlement_committed',
        actor=actor,
        entity='uploads',
        entity_id=upload_id,
        details={
            'courier': courier,
            'filename': filename,
            'posted': posted,
            'exceptions': exceptions,
            'unmatched': unmatched,
            'skipped': skipped,
        },
    )
    event_bus.broadcast('settlement_committed', {
        'uploadId': upload_id,
        'courier': courier,
        'posted': posted,
        'exceptions': exceptions,
    }, merchant_id)

    return {
        'upload_id': upload_id,
        'courier': courier,
        'rows': len(records),
        'posted': posted,
        'exceptions': exceptions,
        'unmatched': unmatched,
        'skipped': skipped,
        'total_cash_poisha': total_cash,
        'row_errors': errors_back,
    }


def _post_row_fees(merchant_id, order_id, courier, rec, fees, d, source, actor):
    """Fees for returned/cancelled parcels when nothing was charged through the flow yet."""
    lines = []
    if rec.get('delivery_charge'):
        lines.append({'account': 'courier_delivery', 'amount': rec['delivery_charge']})
    if rec.get('cod_fee'):
        lines.append({'account': 'courier_cod_fee', 'amount': rec['cod_fee']})
    if rec.get('return_charge'):
        lines.append({'account': 'courier_return_fee', 'amount': rec['return_charge']})
    lines.append({'account': 'courier_receivable', 'party': str(courier), 'amount': -fees})
    post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'courier_charges',
        'memo': f"{courier_map.display_name(courier)} fees for consignment {rec.get('consignment_id')}",
        'source': source,
        'created_by': actor,
        'order_id': order_id,
    }, lines)


def _running_summary(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_status: Dict[str, int] = {}
    for r in records:
        s = r.get('status') or 'unknown'
        by_status[s] = by_status.get(s, 0) + 1
    return {'rows': len(records), 'by_status': by_status}


def recent_uploads(merchant_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    uploads = all(
        "SELECT * FROM uploads WHERE merchant_id = ? ORDER BY id DESC LIMIT ?",
        merchant_id, limit
    )
    out = []
    for u in uploads:
        try:
            summary = json.loads(u.get('summary') or '{}')
        except Exception:
            summary = {}
        stats = one(
            "SELECT "
            "SUM(CASE WHEN outcome = 'posted' THEN 1 ELSE 0 END) AS posted, "
            "SUM(CASE WHEN outcome = 'exception' THEN 1 ELSE 0 END) AS exceptions, "
            "SUM(CASE WHEN outcome = 'unmatched' THEN 1 ELSE 0 END) AS unmatched, "
            "COUNT(*) AS total "
            "FROM settlement_rows WHERE upload_id = ?",
            u['id']
        )
        out.append({
            'id': u['id'],
            'kind': u['kind'],
            'courier': u['courier'],
            'filename': u['filename'],
            'status': u['status'],
            'row_count': u['row_count'],
            'summary': summary,
            'rows': {k: int(stats.get(k) or 0) for k in ('posted', 'exceptions', 'unmatched', 'total')} if stats else {},
            'created_at': u['created_at'],
            'committed_at': u['committed_at'],
        })
    return out
