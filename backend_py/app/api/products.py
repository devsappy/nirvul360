"""
Inventory & Products API.
Manages inventory catalog, active/inactive state, versioned purchase cost price,
and retail selling price.
"""
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.api.auth import get_current_user, require_agency_owner
from app.domain.products import (
    get_product, find_product, cost_at, stock_qty,
    upsert_product, set_price
)
from app.lib.money import to_poisha
from app.lib.dates import now_iso, today
from app.lib.audit import log_audit
from app.lib.events import event_bus
from app.db.session import all, one, update, insert, tx

router = APIRouter(prefix="/api/products", tags=["Inventory"])

class CreateProductInput(BaseModel):
    name: str
    sku: Optional[str] = None
    selling_price: Optional[float] = None
    cost_price: Optional[float] = None
    purchase_price: Optional[float] = None
    stock_qty: Optional[int] = 0
    active: Optional[bool] = True

class UpdateStatusInput(BaseModel):
    active: bool

class UpdatePriceInput(BaseModel):
    selling_price: Optional[float] = None
    cost_price: Optional[float] = None
    purchase_price: Optional[float] = None
    note: Optional[str] = None

class AdjustStockInput(BaseModel):
    qty: int
    reason: Optional[str] = "adjustment"

@router.get("")
async def list_products(
    missing: Optional[str] = None,
    q: Optional[str] = None,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns inventory items for the active merchant with:
    - active / inactive status
    - cost price (versioned purchase price)
    - selling price
    - stock on hand
    - gross margin %
    """
    m_id = current["merchantId"]
    t = today()

    sql = "SELECT * FROM products WHERE merchant_id = ?"
    params = [m_id]

    if q:
        sql += " AND (lower(name) LIKE ? OR lower(COALESCE(sku, '')) LIKE ?)"
        q_wild = f"%{q.lower().strip()}%"
        params.extend([q_wild, q_wild])

    sql += " ORDER BY id DESC"
    products = all(sql, *params)

    rows = []
    missing_count = 0

    for p in products:
        p_id = p["id"]
        # Determine cost price
        c = cost_at(p_id, t)
        cost = c["purchase_price"] if c else None
        if cost is None:
            missing_count += 1

        sell = p.get("selling_price")
        stock = stock_qty(p_id)

        margin = None
        if cost is not None and sell and sell > 0:
            margin = round(((sell - cost) / sell) * 100, 1)

        rows.append({
            "id": p_id,
            "name": p["name"],
            "sku": p.get("sku") or "",
            "selling_price": sell,
            "purchase_price": cost,
            "cost_price": cost,
            "stock_qty": stock,
            "active": bool(p.get("active", 1)),
            "external_id": p.get("external_id"),
            "source": p.get("source") or "manual",
            "margin": margin,
            "created_at": p.get("created_at"),
        })

    if missing == "1":
        rows = [r for r in rows if r["purchase_price"] is None]

    return rows

@router.post("")
async def create_inventory_item(
    data: CreateProductInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create a new inventory item with active/inactive, cost price, selling price, and stock.
    """
    m_id = current["merchantId"]
    actor = current["actor"]

    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Product name is required")

    sell_poisha = to_poisha(data.selling_price) if data.selling_price is not None else None
    cost_poisha = to_poisha(data.cost_price or data.purchase_price) if (data.cost_price or data.purchase_price) is not None else None

    ctx = {"source": "manual", "actor": actor}
    p_id = upsert_product(m_id, {
        "name": data.name.strip(),
        "sku": data.sku.strip() if data.sku else None,
        "selling_price": sell_poisha,
        "purchase_price": cost_poisha,
        "stock_qty": data.stock_qty or 0,
        "active": data.active if data.active is not None else True,
    }, ctx)

    # Ensure active flag is saved
    if data.active is not None:
        update("products", p_id, {"active": 1 if data.active else 0})

    log_audit(
        merchant_id=m_id,
        action="inventory_item_created",
        actor=actor,
        entity="products",
        entity_id=str(p_id),
        details={"name": data.name, "selling_price": sell_poisha, "cost_price": cost_poisha, "active": data.active}
    )

    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "productId": p_id,
        "action": "create"
    })

    return {"ok": True, "id": p_id, "message": f"Inventory item '{data.name}' created successfully"}

@router.patch("/{product_id}/status")
async def toggle_product_status(
    product_id: int,
    data: UpdateStatusInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Toggle or update active / inactive state of an inventory item.
    """
    m_id = current["merchantId"]
    actor = current["actor"]

    p = get_product(m_id, product_id)
    update("products", product_id, {
        "active": 1 if data.active else 0,
        "updated_at": now_iso()
    })

    status_label = "active" if data.active else "inactive"
    log_audit(
        merchant_id=m_id,
        action="product_status_changed",
        actor=actor,
        entity="products",
        entity_id=str(product_id),
        details={"product_name": p["name"], "status": status_label}
    )

    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "productId": product_id,
        "action": "status_changed",
        "active": data.active
    })

    return {"ok": True, "product_id": product_id, "active": data.active, "message": f"Product marked as {status_label}"}

@router.patch("/{product_id}/price")
async def update_product_price(
    product_id: int,
    data: UpdatePriceInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Update selling price and/or cost price.
    Cost price updates create a new versioned entry preserving historical profit!
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    p = get_product(m_id, product_id)

    changes = {}
    if data.selling_price is not None:
        sell_poisha = to_poisha(data.selling_price)
        changes["selling_price"] = sell_poisha

    if changes:
        changes["updated_at"] = now_iso()
        update("products", product_id, changes)

    # Versioned cost price
    raw_cost = data.cost_price if data.cost_price is not None else data.purchase_price
    if raw_cost is not None:
        cost_poisha = to_poisha(raw_cost)
        set_price(m_id, product_id, cost_poisha, {
            "source": "manual",
            "actor": actor,
            "note": data.note or "Price revised from Inventory management",
            "effective_from": today()
        })

    log_audit(
        merchant_id=m_id,
        action="product_price_updated",
        actor=actor,
        entity="products",
        entity_id=str(product_id),
        details={"name": p["name"], "selling_price": data.selling_price, "cost_price": raw_cost}
    )

    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "productId": product_id,
        "action": "price_updated"
    })

    return {"ok": True, "product_id": product_id, "message": "Product pricing updated successfully"}

@router.post("/{product_id}/stock")
async def adjust_stock(
    product_id: int,
    data: AdjustStockInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Record stock adjustment for inventory item.
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    p = get_product(m_id, product_id)

    insert("stock_movements", {
        "merchant_id": m_id,
        "product_id": product_id,
        "qty": data.qty,
        "reason": data.reason or "adjustment",
        "movement_date": today(),
        "source": "manual",
        "created_by": actor,
        "created_at": now_iso()
    })

    new_stock = stock_qty(product_id)
    log_audit(
        merchant_id=m_id,
        action="stock_adjusted",
        actor=actor,
        entity="products",
        entity_id=str(product_id),
        details={"name": p["name"], "delta": data.qty, "new_stock": new_stock}
    )

    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "productId": product_id,
        "action": "stock_adjusted"
    })

    return {"ok": True, "product_id": product_id, "stock_qty": new_stock}
