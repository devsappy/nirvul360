"""
Exception Queue: Reconciles anomalies (Non-negotiable rule 2: whatever does not reconcile lands here).
"""
import json
from typing import Dict, Any, List, Optional
from app.db.session import insert, update, one, all, tx
from app.lib.dates import now_iso, today, add_days

def raise_exception(merchant_id: int, exc: Dict[str, Any], actor: str = 'system') -> int:
    dedupe = str(exc['key'])
    existing = one(
        "SELECT id FROM exception_queue WHERE merchant_id = ? AND dedupe_key = ? AND status = 'open'",
        merchant_id, dedupe
    )
    if existing:
        return existing['id']

    details = exc.get('details') or {}
    return insert('exception_queue', {
        'merchant_id': merchant_id,
        'type': exc['type'],
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

def auto_clear(merchant_id: int, exc_type: str, dedupe_key: str, actor: str, reason: str):
    open_exc = one(
        "SELECT id FROM exception_queue WHERE merchant_id = ? AND type = ? AND dedupe_key = ? AND status = 'open'",
        merchant_id, exc_type, dedupe_key
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
