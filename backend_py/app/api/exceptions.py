"""
Exception Queue API: list / detail / resolve / snooze.

The queue is where everything that could not reconcile lands. Resolving an
exception posts the CORRECT accounting entry automatically — the frontend only ever
sends the chosen action (plus a small per-type payload).
"""
import json
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.api.auth import get_current_user
from app.domain.exceptions import (
    list_exceptions, get_exception, resolve, resolve_short_settlement, seed_reason_codes,
    unresolved_totals, EXCEPTION_TYPES,
)
from app.db.session import all as db_all
from app.lib.dates import today, add_days

router = APIRouter(prefix="/api/exceptions", tags=["Exception Queue"])

# Resolution actions in plain words per exception type (mirrors EXCEPTION_TYPES)
ACTIONS = {t: cfg['actions'] for t, cfg in EXCEPTION_TYPES.items()}
ACTIONS['missing_cost'] = ACTIONS['product_without_price']


class ResolveInput(BaseModel):
    action: Optional[str] = None
    reason_code: Optional[str] = None          # short_settlement: partial_delivery | delivery_discount | courier_short
    head: Optional[str] = None                 # unmatched_expense: expense head from the chart
    purchase_price: Optional[float] = None     # product_without_price: taka
    target_order_id: Optional[int] = None      # zero_settlement confirm_exchange
    cash_account_id: Optional[int] = None      # unsettled_cod confirm_received
    date: Optional[str] = None
    note: Optional[str] = None


class SnoozeInput(BaseModel):
    until: Optional[str] = None                # 'YYYY-MM-DD'; default: 7 days from today
    days: Optional[int] = None


def _serialize(e: Dict[str, Any]) -> Dict[str, Any]:
    value = int(e.get('value') or 0)
    etype = e.get('type')
    exc_type = 'product_without_price' if etype == 'missing_cost' else etype
    return {
        'id': e['id'],
        'type': exc_type,
        'legacy_type': etype,
        'label': e.get('resolution'),
        'status': e['status'],
        'value_poisha': value,
        'value_taka': round(value / 100, 2),
        'order_id': e.get('order_id'),
        'product_id': e.get('product_id'),
        'courier': e.get('courier'),
        'settlement_row_id': e.get('settlement_row_id'),
        'details': e.get('details'),
        'raised_at': e.get('raised_at'),
        'raised_by': e.get('raised_by'),
        'snoozed_until': e.get('snoozed_until'),
        'resolution': e.get('resolution'),
        'resolution_data': e.get('resolution_data'),
        'resolved_at': e.get('resolved_at'),
        'resolved_by': e.get('resolved_by'),
        'actions': ACTIONS.get(exc_type, []),
    }


@router.get("")
async def list_exception_queue(
    status: str = Query('open'),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user),
):
    """
    GET /api/exceptions?status=open|resolved|all&from=&to=

    Response:
      {
        "count": <open count, all types>,
        "total_unresolved_poisha": <int>,
        "unresolved_by_type": {"stuck_parcel": {"count": n, "total": poisha}, ...},
        "items": [
          {
            "id", "type", "label", "status", "value_poisha", "value_taka",
            "order_id", "product_id", "courier", "settlement_row_id",
            "details": {...context...}, "raised_at", "raised_by",
            "snoozed_until", "resolution", "resolution_data",
            "resolved_at", "resolved_by",
            "actions": ["mark_lost", ...]
          }, ...
        ]
      }
    Snoozed items stay listed but carry snoozed_until so the UI can dim them.
    """
    m_id = current["merchantId"]
    if status not in ('open', 'resolved', 'all'):
        raise HTTPException(status_code=400, detail="status must be open, resolved or all")

    if status == 'all':
        sql = "SELECT * FROM exception_queue WHERE merchant_id = ?"
        params: List[Any] = [m_id]
    else:
        sql = "SELECT * FROM exception_queue WHERE merchant_id = ? AND status = ?"
        params = [m_id, status]
    if from_date:
        sql += " AND raised_at >= ?"
        params.append(f"{from_date}T00:00:00.000Z" if len(from_date) == 10 else from_date)
    if to_date:
        sql += " AND raised_at <= ?"
        params.append(f"{to_date}T23:59:59.999Z" if len(to_date) == 10 else to_date)
    sql += " ORDER BY raised_at DESC"
    rows = db_all(sql, *params)

    order_ids = [r['order_id'] for r in rows if r.get('order_id')]
    product_ids = [r['product_id'] for r in rows if r.get('product_id')]
    context_refs = {
        'order_ids': order_ids,
        'product_ids': product_ids,
    }

    totals = unresolved_totals(m_id)
    items = [_serialize(e) for e in rows]
    return {
        'count': totals['count'],
        'total_unresolved_poisha': totals['total'],
        'unresolved_by_type': totals['by_type'],
        **context_refs,
        'items': items,
    }


@router.get("/{exception_id}")
async def exception_detail(exception_id: int, current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/exceptions/{id} → the same shape as one list item, plus the full
    context payload in `details`.
    """
    m_id = current["merchantId"]
    try:
        e = get_exception(m_id, exception_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    return _serialize(e)


@router.post("/{exception_id}/resolve")
async def resolve_exception(
    exception_id: int,
    body: ResolveInput,
    current: Dict[str, Any] = Depends(get_current_user),
):
    """
    POST /api/exceptions/{id}/resolve

    Body per type:
      stuck_parcel:          {"action": "mark_lost" | "mark_delivered" | "keep_waiting"}
      missing_parcel:        {"action": "confirm_loss" | "file_claim"}
      short_settlement:      {"action": "partial_delivery",
                              "reason_code": "partial_delivery" | "delivery_discount" | "courier_short"}
      zero_settlement:       {"action": "confirm_free_delivery" | "confirm_exchange" |
                                          "courier_error" | "file_claim"}
      unsettled_cod:         {"action": "confirm_received" | "chase",
                              "cash_account_id": int?, "date": "YYYY-MM-DD"?}
      product_without_price: {"action": "add_purchase_price", "purchase_price": 350.00}  // taka
      unmatched_expense:     {"action": "assign_category", "head": "packaging"}
      duplicate_order:       {"action": "confirm_duplicate" | "confirm_genuine"}

    The accounting entry posts automatically; the exception is resolved in the same
    transaction; audit log + event are written.

    Response: {"ok": true, "status": "resolved", "exception_id": n, ...action extras}
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    try:
        result = resolve(m_id, exception_id, body.action, body.model_dump(), actor)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    return {"ok": True, **result}


@router.post("/{exception_id}/snooze")
async def snooze_exception(
    exception_id: int,
    body: SnoozeInput,
    current: Dict[str, Any] = Depends(get_current_user),
):
    """
    POST /api/exceptions/{id}/snooze     body: {"until": "YYYY-MM-DD"} or {"days": 7}
    Response: {"ok": true, "id": n, "snoozed_until": "YYYY-MM-DD", "status": "open"}
    """
    from app.db.session import update
    m_id = current["merchantId"]
    try:
        e = get_exception(m_id, exception_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err))
    if e['status'] != 'open':
        raise HTTPException(status_code=400, detail="exception already resolved")

    until = body.until
    if not until:
        until = add_days(today(), max(1, body.days or 7))
    update('exception_queue', exception_id, {'snoozed_until': until})

    from app.lib.audit import log_audit
    from app.lib.events import event_bus
    event_bus.broadcast('exception_snoozed', {'exceptionId': exception_id, 'until': until}, m_id)
    log_audit(merchant_id=m_id, action="exception_snoozed", actor=current["actor"],
              entity="exception_queue", entity_id=exception_id,
              details={"snoozed_until": until})

    return {"ok": True, "id": exception_id, "snoozed_until": until, "status": "open"}
