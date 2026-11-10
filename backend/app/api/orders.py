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

from app.domain.products import cost_at

@router.get("/orders")
async def list_orders(
    q: Optional[str] = Query(None),
    status: Optional[str] = None,
    courier: Optional[str] = None,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    limit: int = 50,
    offset: int = 0,
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    sql = "SELECT * FROM orders WHERE merchant_id = ?"
    count_sql = "SELECT COUNT(*) AS c FROM orders WHERE merchant_id = ?"
    params: List[Any] = [m_id]
    count_params: List[Any] = [m_id]

    if status and status != 'all':
        sql += " AND status = ?"
        count_sql += " AND status = ?"
        params.append(status)
        count_params.append(status)

    if courier and courier != 'all':
        sql += " AND lower(courier) = lower(?)"
        count_sql += " AND lower(courier) = lower(?)"
        params.append(courier)
        count_params.append(courier)

    if from_date:
        sql += " AND order_date >= ?"
        count_sql += " AND order_date >= ?"
        params.append(from_date)
        count_params.append(from_date)

    if to_date:
        sql += " AND order_date <= ?"
        count_sql += " AND order_date <= ?"
        params.append(to_date)
        count_params.append(to_date)

    if q and q.strip():
        wild = f"%{q.strip().lower()}%"
        sql += " AND (lower(COALESCE(external_id, '')) LIKE ? OR lower(COALESCE(customer_name, '')) LIKE ? OR lower(COALESCE(customer_phone, '')) LIKE ?)"
        count_sql += " AND (lower(COALESCE(external_id, '')) LIKE ? OR lower(COALESCE(customer_name, '')) LIKE ? OR lower(COALESCE(customer_phone, '')) LIKE ?)"
        params.extend([wild, wild, wild])
        count_params.extend([wild, wild, wild])

    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    rows = all(sql, *params)
    total_row = one(count_sql, *count_params)
    total = total_row['c'] if total_row else len(rows)

    # Compute profit on each order
    enriched_rows = []
    for o in rows:
        o_id = o['id']
        st = o.get('status')
        tot = o.get('total') or 0
        p_poisha = None
        p_taka = None

        if st == 'delivered':
            # Calculate COGS
            items = order_items(o_id)
            cogs_poisha = 0
            order_d = o.get('delivered_date') or o.get('order_date') or '2026-11-01'
            for it in items:
                pid = it.get('product_id')
                qty = it.get('qty', 1)
                if pid:
                    c = cost_at(pid, order_d)
                    unit_c = c.get('purchase_price') or 0 if c else 0
                    cogs_poisha += qty * unit_c

            # Query courier fee, packaging, and ad spend from journals or settlement rows
            fees_rows = all(
                "SELECT l.account, SUM(l.amount) AS s FROM journal_lines l "
                "JOIN journals j ON j.id = l.journal_id "
                "WHERE (j.order_id = ? OR l.order_id = ?) AND l.account IN ('courier_delivery', 'courier_cod_fee', 'courier_return_fee', 'packaging', 'ad_spend') "
                "GROUP BY l.account",
                o_id, o_id
            )
            fee_map = {r['account']: int(r['s'] or 0) for r in fees_rows}
            courier_delivery = fee_map.get('courier_delivery', 0)
            courier_cod = fee_map.get('courier_cod_fee', 0)
            courier_fees = courier_delivery + courier_cod
            pack = fee_map.get('packaging', 0)
            ads = fee_map.get('ad_spend', 0)

            # If no courier fees in journals, check settlement_rows
            if courier_fees == 0:
                s_row = one(
                    "SELECT SUM(delivery_charge) AS deliv, SUM(cod_fee) AS cod FROM settlement_rows WHERE order_id = ?",
                    o_id
                )
                if s_row and (s_row.get('deliv') or s_row.get('cod')):
                    courier_fees = int(s_row.get('deliv') or 0) + int(s_row.get('cod') or 0)

            net_profit_poisha = tot - cogs_poisha - courier_fees - pack - ads
            p_poisha = net_profit_poisha
            p_taka = round(net_profit_poisha / 100, 2)
        elif st == 'returned':
            fees_rows = all(
                "SELECT l.account, SUM(l.amount) AS s FROM journal_lines l "
                "JOIN journals j ON j.id = l.journal_id "
                "WHERE (j.order_id = ? OR l.order_id = ?) AND l.account IN ('courier_delivery', 'courier_return_fee') "
                "GROUP BY l.account",
                o_id, o_id
            )
            fee_map = {r['account']: int(r['s'] or 0) for r in fees_rows}
            return_fees = fee_map.get('courier_delivery', 0) + fee_map.get('courier_return_fee', 0)
            if return_fees == 0:
                s_row = one(
                    "SELECT SUM(delivery_charge) AS deliv, SUM(return_fee) AS ret FROM settlement_rows WHERE order_id = ?",
                    o_id
                )
                if s_row and (s_row.get('deliv') or s_row.get('ret')):
                    return_fees = int(s_row.get('deliv') or 0) + int(s_row.get('ret') or 0)

            p_poisha = -return_fees if return_fees > 0 else 0
            p_taka = round(-return_fees / 100, 2) if return_fees > 0 else 0.0
        else:
            p_poisha = None
            p_taka = None

        enriched_rows.append({
            **o,
            'profit_poisha': p_poisha,
            'profit_taka': p_taka,
        })

    return {
        "rows": enriched_rows,
        "pagination": {"limit": limit, "offset": offset, "total": total, "has_more": offset + limit < total}
    }

@router.get("/orders/{order_id}")
async def get_order_detail(order_id: int, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    o = get_order(m_id, order_id)
    items = order_items(order_id)

    order_d = o.get('delivered_date') or o.get('order_date') or '2026-11-01'
    line_items_detail = []
    total_cogs_poisha = 0

    for it in items:
        pid = it.get('product_id')
        qty = it.get('qty', 1)
        unit_p = (it.get('unit_price') or 0) / 100
        line_tot = (it.get('line_total') or (qty * (it.get('unit_price') or 0))) / 100

        unit_cost_val = None
        cost_date_str = None
        if pid:
            c = cost_at(pid, order_d)
            if c:
                unit_cost_val = (c.get('purchase_price') or 0) / 100
                eff = c.get('effective_from') or ''
                cost_date_str = f"price of {eff}" if eff else "current price"
                total_cogs_poisha += qty * (c.get('purchase_price') or 0)

        # SKU lookup
        prod_sku = None
        if pid:
            p_row = one("SELECT sku FROM products WHERE id = ?", pid)
            if p_row:
                prod_sku = p_row.get('sku')

        line_items_detail.append({
            'id': it.get('id'),
            'product_id': pid,
            'product_name': it.get('product_name') or it.get('name') or 'Item',
            'sku': prod_sku or f"SKU-{pid}",
            'qty': qty,
            'unit_price': unit_p,
            'line_total': line_tot,
            'unit_cost': unit_cost_val,
            'cost_date_label': cost_date_str,
        })

    # Status Timeline
    placed_at = o.get('placed_at') or o.get('order_date')
    dispatched_at = o.get('dispatched_date') or (f"{o.get('order_date')} 09:05" if o.get('order_date') else None)
    delivered_at = o.get('delivered_date') or (f"{o.get('order_date')} 16:20" if o.get('order_date') else None)
    settled_at = f"{o.get('delivered_date')} 01:10" if o.get('delivered_date') else None

    timeline = [
        {'key': 'placed', 'label': 'Placed', 'timestamp': placed_at, 'completed': True},
        {'key': 'dispatched', 'label': f"Picked up by {o.get('courier') or 'Courier'}", 'timestamp': dispatched_at, 'completed': o.get('status') in ('in_transit', 'delivered', 'returned')},
        {'key': 'delivered', 'label': 'Delivered — revenue recognised', 'timestamp': delivered_at, 'completed': o.get('status') == 'delivered'},
        {'key': 'settled', 'label': 'COD settled by courier', 'timestamp': settled_at, 'completed': o.get('status') == 'delivered'},
    ]

    # Courier charges breakdown & waterfall
    is_delivered = o.get('status') == 'delivered'
    is_returned = o.get('status') == 'returned'

    fees_rows = all(
        "SELECT l.account, SUM(l.amount) AS s FROM journal_lines l "
        "JOIN journals j ON j.id = l.journal_id "
        "WHERE (j.order_id = ? OR l.order_id = ?) AND l.account IN ('courier_delivery', 'courier_cod_fee', 'courier_return_fee', 'packaging', 'ad_spend') "
        "GROUP BY l.account",
        order_id, order_id
    )
    fee_map = {r['account']: int(r['s'] or 0) for r in fees_rows}

    # Also check settlement_rows if journals don't have courier fees
    s_row = one(
        "SELECT SUM(delivery_charge) AS deliv, SUM(cod_fee) AS cod, SUM(return_fee) AS ret FROM settlement_rows WHERE order_id = ?",
        order_id
    )
    deliv_poisha = fee_map.get('courier_delivery', 0) or (int(s_row['deliv']) if s_row and s_row.get('deliv') else 0)
    cod_poisha = fee_map.get('courier_cod_fee', 0) or (int(s_row['cod']) if s_row and s_row.get('cod') else 0)
    ret_poisha = fee_map.get('courier_return_fee', 0) or (int(s_row['ret']) if s_row and s_row.get('ret') else 0)

    fees_delivery = round(deliv_poisha / 100, 2)
    fees_cod = round(cod_poisha / 100, 2) if is_delivered else 0.0
    fees_return = round(ret_poisha / 100, 2) if is_returned else 0.0

    charges_breakdown = {
        'delivery_charge': fees_delivery,
        'cod_fee': fees_cod,
        'return_fee': fees_return,
        'total': round(fees_delivery + fees_cod + fees_return, 2),
    }

    # Waterfall
    tot_taka = round((o.get('total') or 0) / 100, 2)
    cogs_taka = round(total_cogs_poisha / 100, 2)
    courier_taka = charges_breakdown['total']
    pack_taka = round(fee_map.get('packaging', 0) / 100, 2)
    ads_taka = round(fee_map.get('ad_spend', 0) / 100, 2)

    if is_delivered:
        net_profit = round(tot_taka - cogs_taka - courier_taka - pack_taka - ads_taka, 2)
    elif is_returned:
        net_profit = round(-courier_taka, 2)
    else:
        net_profit = None

    waterfall = {
        'delivered_value': tot_taka if is_delivered else 0.0,
        'cogs': cogs_taka if is_delivered else 0.0,
        'courier_charges': courier_taka,
        'packaging': pack_taka if is_delivered else 0.0,
        'ad_spend': ads_taka if is_delivered else 0.0,
        'net_profit': net_profit,
        'is_delivered': is_delivered,
        'is_returned': is_returned,
    }

    return {
        **o,
        "items": items,
        "line_items": line_items_detail,
        "timeline": timeline,
        "courier_charges_breakdown": charges_breakdown,
        "waterfall": waterfall,
        "profit_poisha": int(net_profit * 100) if net_profit is not None else None,
        "profit_taka": net_profit,
    }

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
