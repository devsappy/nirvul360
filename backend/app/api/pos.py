"""
Point of Sale (POS) & Offline Store API.
Integrates brick-and-mortar in-store sales directly into the double-entry accounting engine:
- Real-time stock decrement upon sale
- Immediate revenue recognition (delivered over the counter)
- Immediate cash/MFS asset entry into the ledger
- Printable / downloadable POS invoice receipts
"""
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from app.api.auth import get_current_user
from app.domain.orders import create_order, apply_status, get_order, order_items
from app.domain.products import get_product, cost_at, stock_qty
from app.domain.exceptions import scan_merchant
from app.lib.money import to_poisha
from app.lib.dates import now_iso, today
from app.lib.audit import log_audit
from app.lib.events import event_bus
from app.db.session import all, one, update, tx

router = APIRouter(prefix="/api/pos", tags=["Point of Sale (POS)"])

class PosItemInput(BaseModel):
    product_id: int
    qty: int = Field(..., gt=0)
    unit_price: float = Field(..., ge=0) # retail selling price in BDT

class PosCheckoutInput(BaseModel):
    items: List[PosItemInput]
    customer_name: Optional[str] = "Walk-in Customer"
    customer_phone: Optional[str] = None
    discount: Optional[float] = 0.0 # in BDT
    payment_method: Optional[str] = "cash" # cash, bkash, nagad, card
    tendered: Optional[float] = None
    note: Optional[str] = "Offline Store POS Checkout"

@router.get("/products")
async def list_pos_products(
    q: Optional[str] = None,
    limit: Optional[int] = Query(None),
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns active inventory items for the offline POS grid.
    Only active products with pricing are presented for instant in-store checkout.
    """
    m_id = current["merchantId"]
    t = today()

    sql = "SELECT * FROM products WHERE merchant_id = ? AND active = 1"
    params = [m_id]

    if q and q.strip():
        sql += " AND (lower(name) LIKE ? OR lower(COALESCE(sku, '')) LIKE ?)"
        q_wild = f"%{q.lower().strip()}%"
        params.extend([q_wild, q_wild])

    sql += " ORDER BY name ASC"
    if limit and limit > 0:
        sql += f" LIMIT {int(limit)}"
    elif not q:
        sql += " LIMIT 250"

    products = all(sql, *params)
    if not products:
        return {"products": [], "total": 0}

    p_ids = [p["id"] for p in products]

    # Batch fetch stock levels in 1 single query
    stock_map = {}
    if p_ids:
        stocks_rows = all(
            "SELECT product_id, COALESCE(SUM(qty), 0) as q FROM stock_movements WHERE product_id IN (" +
            ",".join("?" * len(p_ids)) + ") GROUP BY product_id",
            *p_ids
        )
        stock_map = {r["product_id"]: int(r["q"]) for r in stocks_rows}

    # Batch fetch price history in 1 single query
    cost_map = {}
    if p_ids:
        costs_rows = all(
            "SELECT product_id, purchase_price, effective_from FROM product_price_history WHERE product_id IN (" +
            ",".join("?" * len(p_ids)) + ") ORDER BY effective_from ASC, id ASC",
            *p_ids
        )
        for r in costs_rows:
            if r["effective_from"] <= t or r["product_id"] not in cost_map:
                cost_map[r["product_id"]] = r["purchase_price"]

    items = []
    for p in products:
        p_id = p["id"]
        cost = cost_map.get(p_id)
        sell = p.get("selling_price") or 0
        stock = stock_map.get(p_id, 0)

        items.append({
            "id": p_id,
            "name": p["name"],
            "sku": p.get("sku") or f"SKU-{p_id}",
            "selling_price": sell,
            "selling_price_bdt": sell / 100 if sell else 0,
            "cost_price": cost,
            "stock_qty": stock,
            "in_stock": stock > 0,
            "active": True,
            "source": p.get("source") or "store",
        })

    return {"products": items, "total": len(items)}

@router.post("/checkout")
async def pos_checkout(
    data: PosCheckoutInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Process an in-store POS transaction:
    1. Validates product availability
    2. Immediately creates order and transitions to 'delivered'
    3. Decrements inventory stock via double-entry stock movement
    4. Posts balanced double-entry journals:
       Debit Cash / MFS Asset
       Credit Sales Revenue
       Debit COGS
       Credit Inventory
    5. Returns receipt voucher details
    """
    m_id = current["merchantId"]
    actor = current["actor"]

    if not data.items:
        raise HTTPException(status_code=400, detail="POS ticket must contain at least one product item.")

    with tx():
        # 1. Validate all products
        order_items_payload = []
        receipt_items = []
        subtotal_poisha = 0

        for it in data.items:
            p = one("SELECT * FROM products WHERE id = ? AND merchant_id = ?", it.product_id, m_id)
            if not p:
                raise HTTPException(status_code=404, detail=f"Product #{it.product_id} not found.")

            current_stock = stock_qty(it.product_id)
            # Allow checkout, but track quantity
            line_unit_poisha = to_poisha(it.unit_price) if it.unit_price else (p.get("selling_price") or 0)
            line_total_poisha = it.qty * line_unit_poisha
            subtotal_poisha += line_total_poisha

            order_items_payload.append({
                'product_id': it.product_id,
                'name': p['name'],
                'qty': it.qty,
                'unit_price': line_unit_poisha,
            })

            receipt_items.append({
                'product_id': it.product_id,
                'name': p['name'],
                'sku': p.get('sku') or f"SKU-{it.product_id}",
                'qty': it.qty,
                'unit_price': line_unit_poisha / 100,
                'line_total': line_total_poisha / 100,
                'remaining_stock': max(0, current_stock - it.qty),
            })

        discount_poisha = to_poisha(data.discount) if data.discount else 0
        total_poisha = max(0, subtotal_poisha - discount_poisha)

        # 2. Create order record with source = 'pos'
        order_id = create_order(m_id, {
            'customer_name': data.customer_name or 'Walk-in Customer',
            'customer_phone': data.customer_phone,
            'address': 'Over the Counter (Offline Store)',
            'courier': None, # In-store over the counter
            'discount': discount_poisha,
            'shipping_charge': 0,
            'advance_paid': 0,
            'items': order_items_payload,
            'source': 'pos',
        }, {'source': 'store_api', 'actor': actor})

        # 3. Transition order to 'delivered' over-the-counter
        # This executes _sync_stock (decrements stock) and _post_delivery (posts sales + COGS)
        apply_status(m_id, order_id, 'delivered', {
            'source': 'store_api',
            'actor': actor,
            'date': today(),
        })

        # 4. Set professional POS receipt number and save payment method in consignment_id
        receipt_no = f"POS-{order_id:05d}"
        pm = data.payment_method or 'cash'
        update('orders', order_id, {'external_id': receipt_no, 'consignment_id': pm})

        # 5. Log audit telemetry
        total_bdt = total_poisha / 100
        subtotal_bdt = subtotal_poisha / 100
        discount_bdt = discount_poisha / 100
        tendered_bdt = data.tendered if (data.tendered is not None and data.tendered >= total_bdt) else total_bdt
        change_bdt = max(0.0, round(tendered_bdt - total_bdt, 2))

        log_audit(
            m_id,
            actor,
            'pos_checkout_completed',
            'order',
            order_id,
            details={
                'receipt_no': receipt_no,
                'total': total_bdt,
                'items_count': sum(it.qty for it in data.items),
                'payment_method': pm,
                'customer': data.customer_name or 'Walk-in Customer',
            }
        )

        scan_merchant(m_id)
        event_bus.publish({
            'type': 'order_delivered',
            'merchantId': m_id,
            'orderId': order_id,
            'receiptNo': receipt_no,
            'source': 'pos',
            'total': total_bdt
        })

        return {
            "success": True,
            "order_id": order_id,
            "receipt_no": receipt_no,
            "date": today(),
            "time": now_iso(),
            "customer_name": data.customer_name or "Walk-in Customer",
            "customer_phone": data.customer_phone or "",
            "payment_method": pm,
            "items": receipt_items,
            "items_count": sum(it.qty for it in data.items),
            "subtotal": subtotal_bdt,
            "discount": discount_bdt,
            "total": total_bdt,
            "tendered": tendered_bdt,
            "change": change_bdt,
            "note": data.note or "Offline Store Sale",
        }

@router.get("/orders")
async def list_pos_orders(
    limit: int = 50,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns recent in-store POS sales history with items and daily stats.
    """
    m_id = current["merchantId"]
    t = today()

    sql = """
        SELECT * FROM orders
        WHERE merchant_id = ? AND (source = 'pos' OR address LIKE ?)
        ORDER BY id DESC
        LIMIT ?
    """
    rows = all(sql, m_id, "%Over the Counter%", limit)

    enriched_orders = []
    today_total_poisha = 0
    today_count = 0
    cash_taken_poisha = 0
    bkash_taken_poisha = 0
    nagad_taken_poisha = 0
    card_taken_poisha = 0

    for r in rows:
        o_id = r["id"]
        items = order_items(o_id)
        is_today = r.get("order_date") == t or (r.get("delivered_date") == t)
        tot = r.get("total") or 0
        pm = r.get("consignment_id") or "cash"

        if is_today:
            today_total_poisha += tot
            today_count += 1
            pm_lower = pm.lower()
            if 'cash' in pm_lower:
                cash_taken_poisha += tot
            elif 'bkash' in pm_lower:
                bkash_taken_poisha += tot
            elif 'nagad' in pm_lower:
                nagad_taken_poisha += tot
            elif 'card' in pm_lower:
                card_taken_poisha += tot
            else:
                cash_taken_poisha += tot

        time_str = ""
        placed_at = r.get("placed_at") or r.get("created_at")
        if placed_at:
            try:
                time_str = placed_at.split("T")[1][:5]
            except Exception:
                time_str = ""

        enriched_orders.append({
            "id": o_id,
            "external_id": r.get("external_id") or f"POS-{o_id:05d}",
            "order_date": r.get("order_date"),
            "delivered_date": r.get("delivered_date"),
            "customer_name": r.get("customer_name") or "Walk-in Customer",
            "customer_phone": r.get("customer_phone") or "",
            "payment_method": pm.capitalize() if pm else "Cash",
            "time": time_str,
            "total": tot,
            "total_bdt": tot / 100,
            "discount": (r.get("discount") or 0) / 100,
            "status": r.get("status"),
            "posting_state": r.get("posting_state"),
            "items_count": sum(it["qty"] for it in items),
            "items": [{
                "name": it.get("product_name") or it.get("name"),
                "qty": it["qty"],
                "unit_price": it["unit_price"] / 100,
                "line_total": it["line_total"] / 100,
            } for it in items],
        })

    return {
        "orders": enriched_orders,
        "summary": {
            "today_orders_count": today_count,
            "today_revenue_bdt": today_total_poisha / 100,
            "cash_taken_bdt": cash_taken_poisha / 100,
            "bkash_taken_bdt": bkash_taken_poisha / 100,
            "nagad_taken_bdt": nagad_taken_poisha / 100,
            "card_taken_bdt": card_taken_poisha / 100,
            "total_pos_orders": len(enriched_orders),
        }
    }
