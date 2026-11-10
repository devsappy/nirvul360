"""
Courier settlement sheet API: courier catalog, preview (CSV/XLSX upload or JSON rows),
commit, and recent uploads.

Preview never writes. Commit is idempotent — the same consignment in the same or a
different sheet cannot be paid twice (settlement_once unique index + dedupe check).
"""
import hashlib
import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from pydantic import BaseModel
from app.api.auth import get_current_user
from app.domain import courier_map
from app.domain.settlements import prepare_records, commit_settlement, recent_uploads
from app.db.session import all as db_all

router = APIRouter(prefix="/api/settlements", tags=["Courier Settlements"])


class CommitBody(BaseModel):
    courier: str
    rows: List[Dict[str, Any]]
    deposit_account_id: Optional[int] = None
    filename: Optional[str] = None


class PreviewBody(BaseModel):
    courier: str
    rows: List[Dict[str, Any]]


@router.get("/couriers")
async def list_couriers(current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/settlements/couriers
    → {"couriers": [{"key": "steadfast", "display_name": "Steadfast",
                     "columns": {"consignment_id": ["cod amount", ...], ...},
                     "status_words": {"delivered": ["delivered", ...], ...}}, ...]}
    """
    return {"couriers": courier_map.courier_catalog()}


@router.post("/preview")
async def preview_upload(
    file: UploadFile = File(...),
    courier: str = Form(...),
    current: Dict[str, Any] = Depends(get_current_user),
):
    """
    POST /api/settlements/preview   (multipart: file=CSV or XLSX, courier=steadfast|pathao|redx|sa_paribahan)

    Maps the sheet and returns the normalised rows + warnings + summary. Writes nothing.

    Response:
      {
        "courier", "display_name",
        "rows": [{"row_no", "consignment_id", "customer_name", "order_id",
                  "status_raw", "status", "cod_collected", "delivery_charge",
                  "cod_fee", "return_charge", "settlement_date",
                  "consignment_total", "errors": ["..."]?}, ...],
        "warnings": ["column not found for 'cod_fee' — accepted names: ..."],
        "errors": [{"row_no", "consignment_id", "errors": [...]}, ...],
        "summary": {"rows", "errors", "total_cod_poisha", "total_fees_poisha",
                    "by_status": {"delivered": {"count", "cod_poisha", "fees_poisha"}, ...}}
      }
    """
    m_id = current["merchantId"]
    data = await file.read()
    try:
        raw_rows, file_warnings = courier_map.parse_file_bytes(data, file.filename or 'sheet.csv')
        result = prepare_records(raw_rows, courier)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    result['warnings'] = file_warnings + result.get('warnings', [])
    result['summary'] = _match_summary(m_id, result['rows'])
    return result


@router.post("/preview-json")
async def preview_json(body: PreviewBody, current: Dict[str, Any] = Depends(get_current_user)):
    """
    POST /api/settlements/preview-json
    Body: {"courier": "redx", "rows": [{"Tracking ID": "...", "Status": "Delivered", ...}, ...]}
    (The frontend may pre-parse the CSV itself and send raw header-keyed rows.)
    Response shape: identical to /preview, nothing stored.
    """
    m_id = current["merchantId"]
    try:
        result = prepare_records(body.rows, body.courier)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    result['summary'] = _match_summary(m_id, result['rows'])
    return result


from app.lib.dates import today, month_start, now_iso

def _match_summary(merchant_id: int, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Consignment→order matching for preview with matched vs disputed separation."""
    matched_rows = []
    disputed_rows = []

    order_hits = db_all(
        "SELECT id, consignment_id, customer_name, cod_amount, status FROM orders WHERE merchant_id = ? AND consignment_id IS NOT NULL",
        merchant_id
    )
    consignment_map = {o['consignment_id']: o for o in order_hits if o.get('consignment_id')}

    matched_orders_count = 0
    for r in rows:
        cid = r.get('consignment_id')
        cod = r.get('cod_collected', 0)
        fees = (r.get('delivery_charge') or 0) + (r.get('cod_fee') or 0) + (r.get('return_charge') or 0)
        r['charges'] = fees

        if not cid or cid not in consignment_map:
            r_copy = dict(r)
            r_copy['match_status'] = 'disputed'
            r_copy['discrepancy_reason'] = 'No such order here'
            r_copy['recommended_action'] = 'resolve'
            disputed_rows.append(r_copy)
            continue

        o = consignment_map[cid]
        r['order_id'] = o['id']
        r['customer_name'] = o['customer_name'] or 'Customer'
        matched_orders_count += 1
        r_copy = dict(r)

        if o['status'] == 'in_transit':
            r_copy['match_status'] = 'disputed'
            r_copy['discrepancy_reason'] = 'Still in transit'
            r_copy['recommended_action'] = 'hold'
            disputed_rows.append(r_copy)
        elif cod == 0 and (o.get('cod_amount') or 0) > 0:
            r_copy['match_status'] = 'disputed'
            r_copy['discrepancy_reason'] = 'Amount is blank in the sheet'
            r_copy['recommended_action'] = 'resolve'
            disputed_rows.append(r_copy)
        elif cod < (o.get('cod_amount') or 0):
            diff = ((o.get('cod_amount') or 0) - cod) / 100.0
            r_copy['match_status'] = 'disputed'
            r_copy['discrepancy_reason'] = f"Settled ৳{diff:,.0f} short"
            r_copy['recommended_action'] = 'resolve'
            disputed_rows.append(r_copy)
        elif r.get('return_charge', 0) > 0 and o['status'] == 'delivered':
            r_copy['match_status'] = 'disputed'
            r_copy['discrepancy_reason'] = 'Return charge on a delivered parcel'
            r_copy['recommended_action'] = 'resolve'
            disputed_rows.append(r_copy)
        else:
            r_copy['match_status'] = 'matched'
            matched_rows.append(r_copy)

    by_status: Dict[str, Dict[str, Any]] = {}
    total_cod = 0
    total_fees = 0
    errors = 0
    rows_n = 0
    for r in rows:
        rows_n += 1
        stat = r.get('status') or 'unknown'
        slot = by_status.setdefault(stat, {'count': 0, 'cod_poisha': 0, 'fees_poisha': 0})
        slot['count'] += 1
        fees = (r.get('delivery_charge') or 0) + (r.get('cod_fee') or 0) + (r.get('return_charge') or 0)
        slot['cod_poisha'] += r.get('cod_collected') or 0
        slot['fees_poisha'] += fees
        if r.get('errors'):
            errors += 1
            continue
        total_cod += r.get('cod_collected') or 0
        total_fees += fees

    return {
        'rows': rows_n,
        'matched': matched_orders_count,
        'disputed': len(disputed_rows),
        'matched_cod_poisha': sum(r.get('cod_collected', 0) for r in matched_rows),
        'disputed_amount_poisha': sum(r.get('cod_collected', 0) for r in disputed_rows),
        'matched_rows': matched_rows,
        'disputed_rows': disputed_rows,
        'errors': errors,
        'total_cod_poisha': total_cod,
        'total_fees_poisha': total_fees,
        'by_status': by_status
    }


@router.get("/receivables-summary")
async def get_receivables_summary(
    period: Optional[str] = "this_month",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    GET /api/settlements/receivables-summary
    Returns balances held at couriers, parcel counts, and charge separation for Screen 11.
    """
    m_id = current["merchantId"]
    t = today()
    f_d = from_date or month_start(t)
    t_d = to_date or t

    # 1. Held at couriers by courier party
    receivable_rows = db_all(
        "SELECT party, COALESCE(SUM(amount), 0) AS balance "
        "FROM journal_lines WHERE merchant_id = ? AND account = 'courier_receivable' "
        "GROUP BY party",
        m_id
    )
    receivables_by_courier = { (r['party'] or '').lower(): int(r['balance']) for r in receivable_rows if r.get('party') }

    order_counts = db_all(
        "SELECT courier, COUNT(*) AS parcels "
        "FROM orders WHERE merchant_id = ? AND status IN ('delivered', 'in_transit') "
        "AND NOT EXISTS (SELECT 1 FROM journals j WHERE j.order_id = orders.id AND j.kind = 'settlement') "
        "GROUP BY courier",
        m_id
    )
    parcels_by_courier = { (r['courier'] or '').lower(): int(r['parcels']) for r in order_counts if r.get('courier') }

    couriers_catalog = ['pathao', 'steadfast', 'redx']
    outstanding_list = []
    tot_held = 0
    tot_parcels = 0

    for c_key in couriers_catalog:
        held = max(0, receivables_by_courier.get(c_key, 0))
        parcels = parcels_by_courier.get(c_key, 0)
        tot_held += held
        tot_parcels += parcels
        outstanding_list.append({
            'courier': c_key,
            'name': c_key.capitalize(),
            'parcels': parcels,
            'held_poisha': held,
            'held_taka': held / 100.0,
        })

    charges_rows = db_all(
        "SELECT l.account, j.source, COALESCE(SUM(l.amount), 0) AS s "
        "FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE l.merchant_id = ? AND l.account IN ('courier_delivery', 'courier_cod_fee', 'courier_return_fee') "
        "AND l.entry_date >= ? AND l.entry_date <= ? "
        "GROUP BY l.account, j.source",
        m_id, f_d, t_d
    )
    charges_by_type: Dict[str, Dict[str, int]] = {'delivery': {}, 'cod_fee': {}, 'return_charge': {}}
    for cr in charges_rows:
        acct = cr['account']
        typ = 'delivery' if acct == 'courier_delivery' else 'cod_fee' if acct == 'courier_cod_fee' else 'return_charge'
        src = (cr['source'] or '').lower()
        c_hit = 'pathao' if 'pathao' in src else 'steadfast' if 'steadfast' in src else 'redx' if 'redx' in src else 'other'
        charges_by_type[typ][c_hit] = charges_by_type[typ].get(c_hit, 0) + int(cr['s'])

    last_up = db_all(
        "SELECT created_at FROM uploads WHERE merchant_id = ? AND kind = 'courier_settlement' ORDER BY id DESC LIMIT 1",
        m_id
    )
    last_uploaded_at = last_up[0]['created_at'] if last_up else None

    last_synced_at = None
    try:
        sync_row = db_all("SELECT last_sync_at FROM integration_connections WHERE merchant_id = ? ORDER BY id DESC LIMIT 1", m_id)
        if sync_row and sync_row[0].get('last_sync_at'):
            last_synced_at = sync_row[0]['last_sync_at']
    except Exception:
        last_synced_at = None

    returned_count = db_all(
        "SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ? AND status = 'returned' AND order_date >= ? AND order_date <= ?",
        m_id, f_d, t_d
    )

    return {
        'total_held_poisha': tot_held,
        'total_held_taka': tot_held / 100.0,
        'couriers_count': len(outstanding_list),
        'last_synced_at': last_synced_at,
        'last_uploaded_at': last_uploaded_at,
        'outstanding_by_courier': outstanding_list,
        'charges_this_period': charges_by_type,
        'returned_parcels_count': returned_count[0]['c'] if returned_count else 0,
    }


@router.post("/commit")
async def commit(body: CommitBody, current: Dict[str, Any] = Depends(get_current_user)):
    """
    POST /api/settlements/commit
    Body:
      {
        "courier": "steadfast",
        "rows": [ ...normalised (or raw header-keyed) rows... ],
        "deposit_account_id": 3?,        // cash account the payout lands in (default: default cash)
        "filename": "steadfast-oct.csv"? // required only when rows were pre-parsed by the frontend
      }

    Writes an uploads row (source-tagged settlement_rows), threads payment postings
    for delivered parcels, raises courier exceptions (missing_parcel /
    short_settlement / zero_settlement) and is idempotent per consignment.

    Response:
      {"ok": true, "upload_id": 4, "courier": "steadfast", "rows": 9,
       "posted": 6, "exceptions": 1, "unmatched": 1, "skipped": 1,
       "total_cash_poisha": 254500, "row_errors": [...]}
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    try:
        rows = body.rows
        needs_norm = any(rec for rec in rows if ('consignment_id' not in (rec or {})))
        if needs_norm:
            prepared = prepare_records(rows, body.courier)
            prepared_rows = prepared['rows']
        else:
            prepared_rows = rows
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    sha = hashlib.sha256(
        json.dumps(prepared_rows, sort_keys=True, default=str).encode('utf-8')
    ).hexdigest()
    filename = body.filename or f"{body.courier}-{sha[:8]}.csv"

    try:
        result = commit_settlement(
            m_id, prepared_rows, body.courier, filename, sha,
            {'source': 'courier_sheet_upload', 'actor': actor},
            deposit_account_id=body.deposit_account_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    return {"ok": True, **result}


@router.get("")
async def list_settlements(current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/settlements → recent uploads with row stats.
    {"uploads": [{"id", "kind", "courier", "filename", "status", "row_count",
                  "summary": {...}, "rows": {"posted": n, "exceptions": n, "unmatched": n, "total": n},
                  "created_at", "committed_at"}, ...]}
    """
    m_id = current["merchantId"]
    return {"uploads": recent_uploads(m_id)}
