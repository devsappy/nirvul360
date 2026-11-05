from fastapi import APIRouter, Depends, HTTPException, Query, File, Form, UploadFile
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
from app.api.auth import get_current_user
from app.domain.orders import create_order, apply_status, get_order, order_items
from app.domain.orders_import import parse_courier_csv, import_courier_orders
from app.domain.exceptions import scan_merchant
from app.lib.money import to_poisha
from app.db.session import all, one

router = APIRouter(prefix="/api", tags=["Orders"])

class OrderItemInput(BaseModel):
    product_id: Optional[int] = None
    name: Optional[str] = None
    qty: int
    unit_price: float

class CreateOrderInput(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    address: Optional[str] = None
    courier: Optional[str] = None
    consignment_id: Optional[str] = None
    discount: Optional[float] = 0
    shipping_charge: Optional[float] = 0
    advance_paid: Optional[float] = 0
    items: List[OrderItemInput]

class UpdateStatusInput(BaseModel):
    status: str
    date: Optional[str] = None
    courier: Optional[str] = None
    consignment_id: Optional[str] = None
    charges: Optional[Dict[str, Any]] = None

@router.get("/orders")
async def list_orders(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    sql = "SELECT * FROM orders WHERE merchant_id = ?"
    count_sql = "SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?"
    params = [m_id]
    count_params = [m_id]
    if status:
        sql += " AND status = ?"
        count_sql += " AND status = ?"
        params.append(status)
        count_params.append(status)
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = all(sql, *params)
    total_row = one(count_sql, *count_params)
    total = total_row['c'] if total_row else len(rows)

    return {
        "rows": rows,
        "pagination": {"limit": limit, "offset": offset, "total": total, "has_more": offset + limit < total}
    }

@router.get("/orders/{order_id}")
async def get_order_detail(order_id: int, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    o = get_order(m_id, order_id)
    items = order_items(order_id)
    return {**o, "items": items}

@router.post("/orders")
async def create_new_order(data: CreateOrderInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]

    items_payload = [{
        'product_id': it.product_id,
        'name': it.name,
        'qty': it.qty,
        'unit_price': to_poisha(it.unit_price)
    } for it in data.items]

    order_id = create_order(m_id, {
        'customer_name': data.customer_name,
        'customer_phone': data.customer_phone,
        'address': data.address,
        'courier': data.courier,
        'consignment_id': data.consignment_id,
        'discount': to_poisha(data.discount) if data.discount else 0,
        'shipping_charge': to_poisha(data.shipping_charge) if data.shipping_charge else 0,
        'advance_paid': to_poisha(data.advance_paid) if data.advance_paid else 0,
        'items': items_payload,
    }, {'source': 'manual', 'actor': actor})

    scan_merchant(m_id)
    return {"id": order_id}

@router.post("/orders/import-courier-csv")
async def import_courier_csv_endpoint(
    file: UploadFile = File(...),
    courier: str = Form("pathao"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    actor = current["actor"]
    data = await file.read()
    records, warnings = parse_courier_csv(data, file.filename or "deliveries.csv", courier)
    if not records:
        raise HTTPException(status_code=400, detail="No valid order records found in file. " + "; ".join(warnings))

    result = import_courier_orders(m_id, records, courier, actor)
    scan_merchant(m_id)
    return {**result, "warnings": warnings}

@router.post("/orders/{order_id}/status")
@router.put("/orders/{order_id}/status")
async def change_order_status(order_id: int, data: UpdateStatusInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]

    charges_poisha = None
    if data.charges:
        charges_poisha = {k: to_poisha(v) for k, v in data.charges.items() if v is not None}

    updated = apply_status(m_id, order_id, data.status, {
        'source': 'manual',
        'actor': actor,
        'date': data.date,
        'charges': charges_poisha
    })
    scan_merchant(m_id)
    return updated
