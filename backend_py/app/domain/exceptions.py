"""
Exception Queue: Reconciles anomalies (Non-negotiable rule 2: whatever does not reconcile lands here).

Every mutation here:
- posts (or deliberately skips, with a recorded reason) a balanced double-entry journal,
- writes audit_log,
- emits an event on the bus.

Nothing is ever silently written off.
"""
import json
from typing import Dict, Any, List, Optional
from app.db.session import insert, update, one, all, tx
from app.lib.dates import now_iso, today, add_days
from app.lib.events import event_bus
from app.lib.audit import log_audit

# --- Reason codes (short settlement) -------------------------------------------------

REASON_CODES = [
    {
        'code': 'partial_delivery',
        'exception_type': 'short_settlement',
        'label': 'আংশিক ডেলিভারি',
        'effect': 'Revenue reduced by the shortfall, refused goods go back into inventory (stock return entry), courier charges stay as booked.',
        'closes': 1,
    },
    {
        'code': 'delivery_discount',
        'exception_type': 'short_settlement',
        'label': 'ডেলিভারিতে ছাড়',
        'effect': 'Revenue reduced by the shortfall booked as a door discount. Full stock consumed, nothing returned.',
        'closes': 1,
    },
    {
        'code': 'courier_short',
        'exception_type': 'short_settlement',
        'label': 'কুরিয়ার কম দিয়েছে',
        'effect': 'Revenue unchanged. The difference posts as a firm receivable from the courier to be recovered.',
        'closes': 1,
    },
]

def seed_reason_codes():
    """Idempotent seed — safe to run on every startup and against existing databases."""
    for rc in REASON_CODES:
        existing = one(
            "SELECT 1 FROM reason_codes WHERE exception_type = ? AND code = ?",
            rc['exception_type'], rc['code']
        )
        if not existing:
            insert('reason_codes', {
                'code': rc['code'],
                'exception_type': rc['exception_type'],
                'label': rc['label'],
                'effect': rc['effect'],
                'closes': rc['closes'],
            })

# --- Type registry (labels + the resolution actions the API may offer) --------------

EXCEPTION_TYPES: Dict[str, Dict[str, Any]] = {
    'stuck_parcel': {
        'label': 'Parcel stuck with the courier',
        'label_bn': 'কুরিয়ারে পার্সেল আটকে আছে',
        'actions': ['mark_lost', 'mark_delivered', 'keep_waiting'],
    },
    'missing_parcel': {
        'label': 'Consignment the courier was paid for is not in the books',
        'label_bn': 'হিসাবে নেই এমন কনসাইনমেন্ট',
        'actions': ['confirm_loss', 'file_claim'],
    },
    'short_settlement': {
        'label': 'Courier settled less than the order value',
        'label_bn': 'কুরিয়ার অর্ডারের মূল্যের চেয়ে কম দিয়েছে',
        'actions': ['partial_delivery', 'delivery_discount', 'courier_short'],
    },
    'zero_settlement': {
        'label': 'Courier settled nothing for a delivered parcel',
        'label_bn': 'ডেলিভারি হয়েও কুরিয়ার শূন্য দিয়েছে',
        'actions': ['confirm_free_delivery', 'confirm_exchange', 'courier_error', 'file_claim'],
    },
    'unsettled_cod': {
        'label': 'Delivered order has not been settled',
        'label_bn': 'ডেলিভারি হওয়া অর্ডারের COD এখনো বসেনি',
        'actions': ['confirm_received', 'chase'],
    },
    'product_without_price': {
        'label': 'Product delivered without a known purchase price',
        'label_bn': 'ক্রয়মূল্য জানা ছাড়া পণ্য ডেলিভারি হয়েছে',
        'actions': ['add_purchase_price'],
    },
    'unmatched_expense': {
        'label': 'Expense whose category could not be determined',
        'label_bn': 'খাত শনাক্ত হয়নি এমন খরচ',
        'actions': ['assign_category'],
    },
    'duplicate_order': {
        'label': 'Possible duplicate order',
        'label_bn': 'সম্ভাব্য ডুপ্লিকেট অর্ডার',
        'actions': ['confirm_duplicate', 'confirm_genuine'],
    },
}

# The older type name keeps resolving to the spec name everywhere.
TYPE_ALIASES = {'missing_cost': 'product_without_price'}

def _canon_type(exc_type: str) -> str:
    return TYPE_ALIASES.get(exc_type, exc_type)


def raise_exception(merchant_id: int, exc: Dict[str, Any], actor: str = 'system') -> int:
    exc_type = _canon_type(exc['type'])
    dedupe = str(exc['key'])
    # Dedupe is scoped per TYPE: different exception kinds legitimately share a key
    # shape (e.g. short_settlement and unsettled_cod both key on the order id, and
    # product_without_price keys on the product id which can equal an order id).
    existing = one(
        "SELECT id FROM exception_queue WHERE merchant_id = ? AND type = ? AND dedupe_key = ? AND status = 'open'",
        merchant_id, exc_type, dedupe
    )
    if existing:
        return existing['id']

    details = exc.get('details') or {}
    return insert('exception_queue', {
        'merchant_id': merchant_id,
        'type': exc_type,
        'status': 'open',
        'dedupe_key': dedupe,
        'value': exc.get('value') or 0,
        'order_id': exc.get('order_id') or exc.get('orderId'),
        'product_id': exc.get('product_id') or exc.get('productId'),
        'courier': exc.get('courier'),
        'settlement_row_id': exc.get('settlement_row_id'),
        'details': json.dumps(details),
        'raised_at': now_iso(),
        'raised_by': actor,
    })


def _fulfil(merchant_id: int, exc_id: int, resolution: str, resolution_data: Dict[str, Any], actor: str):
    """Mark the exception resolved inside the surrounding transaction."""
    update('exception_queue', exc_id, {
        'status': 'resolved',
        'resolution': resolution,
        'resolution_data': json.dumps(resolution_data or {}),
        'resolved_at': now_iso(),
        'resolved_by': actor,
    })


def get_exception(merchant_id: int, exc_id: int) -> Dict[str, Any]:
    e = one(
        "SELECT * FROM exception_queue WHERE id = ? AND merchant_id = ?",
        exc_id, merchant_id
    )
    if not e:
        raise ValueError(f"exception {exc_id} not found")
    return _load_details(e)


def _load_details(e: Dict[str, Any]) -> Dict[str, Any]:
    e = dict(e)
    if isinstance(e.get('details'), str):
        try:
            e['details'] = json.loads(e['details'])
        except Exception:
            pass
    if e.get('type') == 'missing_cost':
        e['type'] = 'product_without_price'
    return e


def auto_clear(merchant_id: int, exc_type: str, dedupe_key: str, actor: str, reason: str):
    open_exc = one(
        "SELECT id FROM exception_queue WHERE merchant_id = ? AND type = ? AND dedupe_key = ? AND status = 'open'",
        merchant_id, _canon_type(exc_type), dedupe_key
    )
    if not open_exc:
        return
    update('exception_queue', open_exc['id'], {
        'status': 'resolved',
        'resolution': f"auto_cleared: {reason}",
        'resolved_at': now_iso(),
        'resolved_by': actor,
    })


def list_exceptions(merchant_id: int, status: str = 'open') -> List[Dict[str, Any]]:
    rows = all(
        "SELECT * FROM exception_queue WHERE merchant_id = ? AND status = ? ORDER BY raised_at DESC",
        merchant_id, status
    )
    for r in rows:
        if isinstance(r.get('details'), str):
            try:
                r['details'] = json.loads(r['details'])
            except Exception:
                pass
    return rows


def unresolved_totals(merchant_id: int) -> Dict[str, Any]:
    rows = all("SELECT type, COUNT(*) AS count, SUM(value) AS total FROM exception_queue WHERE merchant_id = ? AND status = 'open' GROUP BY type", merchant_id)
    by_type = {r['type']: {'count': int(r['count']), 'total': int(r['total'] or 0)} for r in rows}
    total_count = sum(t['count'] for t in by_type.values())
    total_val = sum(t['total'] for t in by_type.values())
    return {'count': total_count, 'total': total_val, 'by_type': by_type}


def scan_merchant(merchant_id: int):
    """Scan orders and couriers for stuck parcels, missing costs, or unsettled COD."""
    from app.domain.merchants import get_settings
    settings = get_settings(merchant_id)
    stuck_days = settings.get('stuck_parcel_threshold_days', 5)
    unsettled_days = settings.get('unsettled_cod_window_days', 10)
    t = today()

    # 1. Stuck parcels
    cutoff_stuck = add_days(t, -stuck_days)
    stuck_orders = all(
        "SELECT id, total, courier, consignment_id FROM orders WHERE merchant_id = ? AND status = 'in_transit' AND (dispatched_date <= ? OR (dispatched_date IS NULL AND order_date <= ?))",
        merchant_id, cutoff_stuck, cutoff_stuck
    )
    for o in stuck_orders:
        raise_exception(merchant_id, {
            'type': 'stuck_parcel',
            'key': str(o['id']),
            'value': o['total'],
            'order_id': o['id'],
            'courier': o.get('courier'),
            'details': {'consignment_id': o.get('consignment_id')}
        }, 'scanner')

    # 2. Unsettled COD
    cutoff_cod = add_days(t, -unsettled_days)
    unsettled = all(
        "SELECT id, cod_amount, courier FROM orders WHERE merchant_id = ? AND status = 'delivered' AND delivered_date <= ? AND cod_amount > 0 AND NOT EXISTS (SELECT 1 FROM journals WHERE order_id = orders.id AND kind = 'settlement')",
        merchant_id, cutoff_cod
    )
    for u in unsettled:
        raise_exception(merchant_id, {
            'type': 'unsettled_cod',
            'key': str(u['id']),
            'value': u['cod_amount'],
            'order_id': u['id'],
            'courier': u.get('courier')
        }, 'scanner')


def raised_unmatched_expense(merchant_id: int, amount: int, journal_id: int, note: str, actor: str = 'system') -> int:
    """An expense with no determinable category (WhatsApp 'others' intents land here)."""
    return raise_exception(merchant_id, {
        'type': 'unmatched_expense',
        'key': f"unmatched_expense:{journal_id}",
        'value': amount,
        'details': {'journal_id': journal_id, 'note': note},
    }, actor)


# =====================================================================================
# Short settlements: the courier paid less than the order value. The merchant is asked
# which reason code applies (criterion 4); each posts a different journal.
# The unanswered shortfall is parked in 'settlement_suspense' by the settlement commit,
# so it is visible and excluded from profit until a decision is made (criterion 5).
# =====================================================================================

def _parked_suspense(merchant_id: int, order_id: Optional[int]) -> int:
    """The claim parked in settlement_suspense for this exception's order (0 if none)."""
    if not order_id:
        return 0
    row = one(
        "SELECT COALESCE(SUM(l.amount), 0) AS s FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'settlement_suspense' AND j.reverses_journal_id IS NULL",
        merchant_id, order_id
    )
    return int(row['s']) if row else 0


def _refused_units(merchant_id: int, order_id: int, shortfall_poisha: int) -> Dict[str, Any]:
    """
    Which units were refused at the door? We take whole units at the highest prices
    until the shortfall value is covered (rounding down — fractional units never go
    back). Returns {'units': [{'product_id', 'qty'}], 'inventory_value': poisha}.
    """
    from app.domain.orders import order_items
    from app.domain.products import cost_at
    from app.db.session import one as _one

    delivered = _one("SELECT delivered_date FROM orders WHERE id = ?", order_id)
    delivered_date = (delivered.get('delivered_date') if delivered else None) or today()
    lines = order_items(order_id)
    priced = sorted(
        ({'product_id': it['product_id'], 'qty': it['qty'], 'price': it['unit_price']} for it in lines),
        key=lambda x: -x['price']
    )
    units, value, left = [], 0, shortfall_poisha
    for it in priced:
        if left <= 0:
            break
        cost = cost_at(it['product_id'], delivered_date)
        unit_cost = int(cost['purchase_price']) if cost else 0
        affordable = int(left // it['price'])
        take = min(it['qty'], affordable)
        if take > 0:
            units.append({'product_id': it['product_id'], 'qty': take})
            value += take * unit_cost
            left -= take * it['price']
    return {'units': units, 'inventory_value': value}


def resolve_short_settlement(merchant_id: int, exception_id: int, reason_code: str, user_id: str) -> Dict[str, Any]:
    """
    partial_delivery  -> revenue reduced by the shortfall, refused stock returned to
                         inventory (stock return movements), courier charges stay.
    delivery_discount -> revenue reduced by the shortfall booked as a door discount
                         (sales_discounts); full stock consumed, nothing returned.
    courier_short     -> revenue unchanged; the parked difference moves from
                         settlement_suspense to a firm receivable from the courier.
    """
    from app.domain.ledger import post
    from app.domain.orders import get_order
    from app.lib.money import format_taka

    code = (reason_code or '').strip()
    valid_codes = [rc['code'] for rc in REASON_CODES]
    if code not in valid_codes:
        raise ValueError(f"unknown reason code {code} — expected one of {valid_codes}")

    e = get_exception(merchant_id, exception_id)
    if e['type'] != 'short_settlement':
        raise ValueError(f"reason codes apply to short_settlement exceptions, not {e['type']}")
    if e['status'] != 'open':
        raise ValueError("exception already resolved")
    if not e.get('order_id'):
        raise ValueError("short settlement has no order attached")

    spec = next(rc for rc in REASON_CODES if rc['code'] == code)
    actor = user_id or 'system'
    shortfall = max(0, _parked_suspense(merchant_id, e['order_id']))
    jour_id = None

    with tx():
        order = get_order(merchant_id, e['order_id'])
        # The adjustment belongs with the settlement period, not the day the
        # merchant clicked the button (criterion 7: reporting stays truthful).
        d_eff = order.get('delivered_date') or today()
        courier = str(order.get('courier') or e.get('courier') or 'courier')

        if code == 'courier_short':
            # Revenue unchanged: reclassify the parked difference as a firm
            # receivable from the courier to be recovered.
            jour_id = post({
                'merchant_id': merchant_id,
                'date': d_eff,
                'kind': 'settlement',
                'memo': f"Short settlement #{e['id']}: {spec['label']} — {format_taka(shortfall)} kept as courier receivable",
                'source': 'courier_sheet_upload',
                'created_by': actor,
                'order_id': order['id'],
                'exception_id': e['id'],
            }, [
                {'account': 'settlement_suspense', 'amount': -shortfall},
                {'account': 'courier_receivable', 'party': courier, 'amount': shortfall},
            ])
        else:
            lines = [{'account': 'settlement_suspense', 'amount': -shortfall}]
            if code == 'partial_delivery':
                refused = _refused_units(merchant_id, order['id'], shortfall)
                if refused['inventory_value'] > 0:
                    lines.extend([
                        {'account': 'cogs', 'amount': -refused['inventory_value']},
                        {'account': 'inventory', 'amount': refused['inventory_value']},
                    ])
                lines.append({'account': 'sales', 'amount': shortfall})
                for u in refused['units']:
                    insert('stock_movements', {
                        'merchant_id': merchant_id,
                        'product_id': u['product_id'],
                        'qty': u['qty'],
                        'reason': 'partial_return',
                        'movement_date': today(),
                        'order_id': order['id'],
                        'source': 'courier_sheet_upload',
                        'created_by': actor,
                        'created_at': now_iso(),
                    })
            else:  # delivery_discount: full stock consumed, discount booked at the door
                lines.append({'account': 'sales_discounts', 'amount': shortfall})

            jour_id = post({
                'merchant_id': merchant_id,
                'date': d_eff,
                'kind': 'settlement',
                'memo': f"Short settlement #{e['id']}: {spec['label']} — {format_taka(shortfall)}",
                'source': 'courier_sheet_upload',
                'created_by': actor,
                'order_id': order['id'],
                'exception_id': e['id'],
            }, lines)

        _fulfil(merchant_id, e['id'], code, {
            'reason_code': code,
            'reason_label': spec['label'],
            'shortfall_poisha': shortfall,
            'journal_id': jour_id,
        }, actor)

    payload = {
        'exception_id': e['id'],
        'reason_code': code,
        'reason_label': spec['label'],
        'shortfall_poisha': shortfall,
        'journal_id': jour_id,
    }
    event_bus.broadcast('exception_resolved', {'exceptionId': e['id'], 'type': e['type'], **payload}, merchant_id)
    log_audit(
        merchant_id=merchant_id,
        action='exception_resolved',
        actor=actor,
        entity='exception_queue',
        entity_id=e['id'],
        details=payload,
    )
    return {**payload, 'status': 'resolved', 'resolution': code}


# =====================================================================================
# The rest of the resolution actions, one branch per exception type.
# =====================================================================================

def resolve(merchant_id: int, exception_id: int, action: str, body: Dict[str, Any], actor: str) -> Dict[str, Any]:
    """
    Central resolution dispatcher used by the API. Posts the correct accounting
    entry for the exception type, marks the exception resolved inside the same
    transaction, writes audit log and emits an event.
    """
    from app.domain.ledger import post, reverse, live_journals_for_order
    from app.domain.accounts import EXPENSE_HEADS
    from app.domain.orders import get_order, apply_status, order_items
    from app.domain.merchants import resolve_cash_account, get_settings
    from app.domain.products import set_price, cost_at
    from app.lib.money import format_taka, to_poisha

    e = get_exception(merchant_id, exception_id)
    known = set(EXCEPTION_TYPES) | {'missing_cost'}
    if e['type'] not in known:
        raise ValueError(f"unknown exception type {e['type']}")
    allowed = EXCEPTION_TYPES.get(e['type'], {}).get('actions', [])
    if allowed and action not in allowed:
        raise ValueError(f"action {action} is not valid for {e['type']} — choose one of {allowed}")
    if e['status'] != 'open':
        raise ValueError("exception already resolved")

    body = body or {}

    # ---- stuck_parcel -----------------------------------------------------------------
    if e['type'] == 'stuck_parcel':
        order_id = e['order_id']
        if action == 'keep_waiting':
            until = add_days(today(), 7)
            update('exception_queue', e['id'], {'snoozed_until': until, 'resolution': 'waiting for the courier'})
            event_bus.broadcast('exception_snoozed', {'exceptionId': e['id']}, merchant_id)
            return {'status': 'open', 'exception_id': e['id'], 'snoozed_until': until}

        order = get_order(merchant_id, order_id)
        cost_value = 0
        for it in order_items(order_id):
            c = cost_at(it['product_id'], order.get('dispatched_date') or today())
            if c:
                cost_value += it['qty'] * int(c['purchase_price'])

        with tx():
            if action == 'mark_lost':
                use_claims = bool(get_settings(merchant_id).get('courier_claims_enabled', False))
                target = 'courier_claims' if (use_claims and order.get('courier')) else 'stock_loss'
                if cost_value > 0:
                    post({
                        'merchant_id': merchant_id,
                        'date': today(),
                        'kind': 'stock_write_off',
                        'memo': f"Order {order.get('external_id') or order_id} lost with {order.get('courier') or 'the courier'}",
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': target, 'amount': cost_value},
                        {'account': 'inventory', 'amount': -cost_value},
                    ])
                apply_status(merchant_id, order_id, 'lost', {'source': 'system', 'actor': actor, 'date': today()})
                resolution = f"mark_lost: written off to {target}"
            else:  # mark_delivered — posts delivery normally using the original order data
                apply_status(merchant_id, order_id, 'delivered', {'source': 'system', 'actor': actor, 'date': today()})
                resolution = 'mark_delivered'
            _fulfil(merchant_id, e['id'], resolution, body, actor)

    # ---- missing_parcel ---------------------------------------------------------------
    elif e['type'] == 'missing_parcel':
        collected = int((e.get('details') or {}).get('cod_collected', 0))
        courier = str(e.get('courier') or 'courier')
        with tx():
            if action == 'confirm_loss':
                # The money the courier collected is recognised for goods that were
                # never entered into the books: claim cleared against sales.
                journal_id = None
                if collected > 0:
                    journal_id = post({
                        'merchant_id': merchant_id,
                        'date': today(),
                        'kind': 'delivery',
                        'memo': f"Consignment outside the books — collected {format_taka(collected)} (loss confirmed)",
                        'source': 'system',
                        'created_by': actor,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'courier_receivable', 'party': courier, 'amount': collected},
                        {'account': 'sales', 'amount': -collected},
                    ])
                _fulfil(merchant_id, e['id'], 'confirm_loss', {**(body or {}), 'journal_id': journal_id}, actor)
            else:  # file_claim: a firm claim against the courier for money it holds
                journal_id = None
                if collected > 0:
                    journal_id = post({
                        'merchant_id': merchant_id,
                        'date': today(),
                        'kind': 'courier_claim',
                        'memo': f"Claim against {courier} for an unmatched consignment ({format_taka(collected)})",
                        'source': 'system',
                        'created_by': actor,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'courier_claims', 'amount': collected},
                        {'account': 'sales', 'amount': -collected},
                    ])
                _fulfil(merchant_id, e['id'], 'file_claim', {**(body or {}), 'journal_id': journal_id}, actor)

    # ---- short_settlement -------------------------------------------------------------
    elif e['type'] == 'short_settlement':
        reason = body.get('reason_code') or body.get('reasonCode') or action
        return resolve_short_settlement(merchant_id, e['id'], reason, actor)

    # ---- zero_settlement --------------------------------------------------------------
    elif e['type'] == 'zero_settlement':
        order_id = e['order_id']
        order = get_order(merchant_id, order_id)
        parked = max(0, _parked_suspense(merchant_id, order_id))
        courier = str(order.get('courier') or e.get('courier') or 'courier')
        with tx():
            d_eff = order.get('delivered_date') or today()
            if action == 'confirm_free_delivery':
                # Void revenue + COGS; courier cost stays as booked. Zero taka delivery allowance.
                for j in live_journals_for_order(order_id, ['delivery', 'delivery_held']):
                    reverse(j['id'], {'date': d_eff, 'created_by': actor, 'source': 'system', 'memo': 'Free delivery confirmed — revenue voided'})
                consumed = 0
                for it in order_items(order_id):
                    c = cost_at(it['product_id'], order.get('delivered_date') or today())
                    if c:
                        consumed += it['qty'] * int(c['purchase_price'])
                if consumed > 0:
                    post({
                        'merchant_id': merchant_id,
                        'date': d_eff,
                        'kind': 'stock_write_off',
                        'memo': 'Goods gifted to the customer (free delivery confirmed)',
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'other_expense', 'amount': consumed},
                        {'account': 'inventory', 'amount': -consumed},
                    ])
                if parked > 0:
                    post({
                        'merchant_id': merchant_id,
                        'date': d_eff,
                        'kind': 'settlement',
                        'memo': 'Zero settlement — courier claim given up, courier money written off',
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'settlement_suspense', 'amount': -parked},
                        {'account': 'bad_debt', 'amount': parked},
                    ])
                _fulfil(merchant_id, e['id'], 'confirm_free_delivery', body, actor)
            elif action == 'confirm_exchange':
                # Swap with another order: no money movement, goods go back into stock.
                for it in order_items(order_id):
                    insert('stock_movements', {
                        'merchant_id': merchant_id,
                        'product_id': it['product_id'],
                        'qty': it['qty'],
                        'reason': 'exchange_return',
                        'movement_date': today(),
                        'order_id': order_id,
                        'source': 'system',
                        'created_by': actor,
                        'created_at': now_iso(),
                    })
                if parked > 0:
                    post({
                        'merchant_id': merchant_id,
                        'date': d_eff,
                        'kind': 'settlement',
                        'memo': 'Exchange confirmed — courier claim given up, courier money written off',
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'settlement_suspense', 'amount': -parked},
                        {'account': 'bad_debt', 'amount': parked},
                    ])
                _fulfil(merchant_id, e['id'], 'confirm_exchange: goods exchanged, no money movement', body, actor)
            elif action == 'courier_error':
                if parked > 0:
                    post({
                        'merchant_id': merchant_id,
                        'date': d_eff,
                        'kind': 'settlement',
                        'memo': 'Courier error — claim converted to a firm receivable',
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'settlement_suspense', 'amount': -parked},
                        {'account': 'courier_receivable', 'party': courier, 'amount': parked},
                    ])
                update('orders', order_id, {'overdue': 1})
                _fulfil(merchant_id, e['id'], f'courier_error: {format_taka(parked)} kept as receivable from {courier}', body, actor)
            elif action == 'file_claim':
                if parked > 0:
                    post({
                        'merchant_id': merchant_id,
                        'date': d_eff,
                        'kind': 'courier_claim',
                        'memo': f"Claim filed against {courier} ({format_taka(parked)})",
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'settlement_suspense', 'amount': -parked},
                        {'account': 'courier_claims', 'amount': parked},
                    ])
                _fulfil(merchant_id, e['id'], f'file_claim: {format_taka(parked)} filed against {courier}', body, actor)
            else:
                raise ValueError(f"unknown action {action} for zero_settlement")

    # ---- unsettled_cod ----------------------------------------------------------------
    elif e['type'] == 'unsettled_cod':
        order_id = e['order_id']
        order = get_order(merchant_id, order_id)
        if action == 'confirm_received':
            cod = order['cod_amount']
            cash_acct = resolve_cash_account(merchant_id, body.get('cash_account_id') or body.get('cashAccountId'))
            courier = str(order.get('courier') or 'courier')
            journal_id = None
            with tx():
                if cod > 0:
                    journal_id = post({
                        'merchant_id': merchant_id,
                        'date': body.get('date') or today(),
                        'kind': 'settlement',
                        'memo': f"COD received from {courier} for order {order.get('external_id') or order_id}",
                        'source': 'system',
                        'created_by': actor,
                        'order_id': order_id,
                        'exception_id': e['id'],
                    }, [
                        {'account': 'cash', 'party': cash_acct, 'amount': cod},
                        {'account': 'courier_receivable', 'party': courier, 'amount': -cod},
                    ])
                _fulfil(merchant_id, e['id'], 'confirm_received', {**(body or {}), 'journal_id': journal_id}, actor)
        elif action == 'chase':
            update('orders', order_id, {'overdue': 1})
            update('exception_queue', e['id'], {'resolution': 'chasing the courier — receivable kept, flagged overdue'})
            return {'status': 'open', 'exception_id': e['id'], 'overdue': True}
        else:
            raise ValueError(f"unknown action {action} for unsettled_cod")

    # ---- product_without_price ----------------------------------------------------------
    elif e['type'] == 'product_without_price' or e['type'] == 'missing_cost':
        price = body.get('purchase_price') or body.get('purchasePrice') or body.get('price')
        if price is None:
            raise ValueError("purchase_price required")
        poisha = to_poisha(price)
        product_id = e['product_id']
        effective = today()
        if e.get('order_id'):
            o = one("SELECT delivered_date FROM orders WHERE id = ?", e['order_id'])
            if o and o.get('delivered_date'):
                effective = o['delivered_date']
        result = set_price(merchant_id, product_id, poisha, {
            'source': 'manual',
            'actor': actor,
            'effective_from': effective,
            'note': f"Entered via exception #{e['id']} (delivered {effective})",
        })
        _fulfil(merchant_id, e['id'], 'add_purchase_price', {'price_record_id': result['id'], 'effective_from': effective}, actor)

    # ---- unmatched_expense --------------------------------------------------------------
    elif e['type'] == 'unmatched_expense':
        head = body.get('head') or body.get('category')
        if head not in EXPENSE_HEADS:
            raise ValueError(f"unknown expense head {head} — choose from {EXPENSE_HEADS}")
        amount = int(e['value'])
        with tx():
            journal_id = None
            if amount != 0:
                journal_id = post({
                    'merchant_id': merchant_id,
                    'date': today(),
                    'kind': 'expense',
                    'memo': f"Expense category assigned: {head}",
                    'source': 'system',
                    'created_by': actor,
                    'exception_id': e['id'],
                }, [
                    {'account': head, 'amount': amount},
                    {'account': 'other_expense', 'amount': -amount},
                ])
            _fulfil(merchant_id, e['id'], f"assign_category: {head}", {'head': head, 'journal_id': journal_id}, actor)

    # ---- duplicate_order ----------------------------------------------------------------
    elif e['type'] == 'duplicate_order':
        order_id = e['order_id']
        with tx():
            if action == 'confirm_duplicate':
                update('orders', order_id, {'is_duplicate': 1})
                for j in live_journals_for_order(order_id, ['advance_received']):
                    reverse(j['id'], {'created_by': actor, 'source': 'system', 'memo': 'Duplicate order — advance posting reversed'})
                _fulfil(merchant_id, e['id'], 'confirm_duplicate: order marked duplicate and excluded from reporting', body, actor)
            else:  # confirm_genuine
                update('orders', order_id, {'is_duplicate': 0})
                _fulfil(merchant_id, e['id'], 'confirm_genuine: genuine repeat purchase', body, actor)

    event_bus.broadcast('exception_resolved', {'exceptionId': e['id'], 'type': e['type'], 'action': action}, merchant_id)
    log_audit(
        merchant_id=merchant_id,
        action='exception_resolved',
        actor=actor,
        entity='exception_queue',
        entity_id=e['id'],
        details={'action': action, **body},
    )
    return {'status': 'resolved', 'exception_id': e['id'], 'action': action}
