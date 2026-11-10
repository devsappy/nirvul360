"""
Inventory & Products API.
Manages inventory catalog, active/inactive state, versioned purchase cost price,
and retail selling price.
"""
from typing import Dict, Any, Optional, List
import csv
import io
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from app.api.auth import get_current_user, require_agency_owner
from app.domain.roles import can_pause_product, can_view_cost_prices, can_view_margins
from app.domain.products import (
    get_product, find_product, cost_at, stock_qty,
    upsert_product, set_price, missing_price_products
)
from app.domain.reports import product_performance
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

class BulkProductRow(BaseModel):
    sku: Optional[str] = None
    name: str
    selling_price: Optional[float] = None
    cost_price: Optional[float] = None
    stock_qty: Optional[int] = 0
    active: Optional[bool] = True

class BulkProductsInput(BaseModel):
    products: List[BulkProductRow]

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

    # Batch prefetch prices in 1 query
    price_rows = all(
        "SELECT product_id, purchase_price "
        "FROM product_price_history "
        "WHERE merchant_id = ? AND effective_from <= ? "
        "ORDER BY product_id, effective_from ASC, id ASC",
        m_id, t
    )
    price_by_prod = {pr['product_id']: pr['purchase_price'] for pr in price_rows}

    # Batch prefetch stock in 1 query
    stock_rows = all(
        "SELECT product_id, COALESCE(SUM(qty), 0) AS q "
        "FROM stock_movements "
        "WHERE merchant_id = ? "
        "GROUP BY product_id",
        m_id
    )
    stock_by_prod = {sr['product_id']: int(sr['q']) for sr in stock_rows}

    role = current["user"]["role"]
    hide_cost = not can_view_cost_prices(role)
    hide_margin = not can_view_margins(role)

    rows = []
    missing_count = 0
    missing_ids = set()

    for p in products:
        p_id = p["id"]
        cost = price_by_prod.get(p_id)
        if cost is None:
            missing_ids.add(p_id)
            missing_count += 1

        sell = p.get("selling_price")
        stock = stock_by_prod.get(p_id, 0)

        margin = None
        if cost is not None and sell and sell > 0:
            margin = round(((sell - cost) / sell) * 100, 1)

        rows.append({
            "id": p_id,
            "name": p["name"],
            "sku": p.get("sku") or "",
            "selling_price": sell,
            "purchase_price": None if hide_cost else cost,
            "cost_price": None if hide_cost else cost,
            "stock_qty": stock,
            "active": bool(p.get("active", 1)),
            "external_id": p.get("external_id"),
            "source": p.get("source") or "manual",
            "margin": None if (hide_cost or hide_margin) else margin,
            "created_at": p.get("created_at"),
        })

    if missing == "1":
        rows = [r for r in rows if r["id"] in missing_ids]

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
        update("products", p_id, {"active": bool(data.active)})

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
    Permitted for Super Admin, Admin, and Agency Owner. Accountants are denied.
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    user_role = current["user"].get("role", "")

    if not can_pause_product(user_role):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: Accountants are not authorized to pause or change product status. Only Agency Owners and Admins can perform this action."
        )

    p = get_product(m_id, product_id)
    update("products", product_id, {
        "active": bool(data.active),
        "updated_at": now_iso()
    })

    status_label = "active" if data.active else "paused"
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

class StockAdjustmentInput(BaseModel):
    counted_qty: int
    reason: Optional[str] = "Damaged in storage"
    note: Optional[str] = None

@router.get("/{product_id}/history")
async def get_product_price_history(product_id: int, current: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns dated FIFO purchase cost price history for product.
    Enriched with linked purchase batch and supplier.
    """
    m_id = current["merchantId"]
    get_product(m_id, product_id)
    rows = all(
        "SELECT pph.id, pph.purchase_price, pph.effective_from, pph.source, pph.note, "
        "p.batch_no, s.name as supplier_name "
        "FROM product_price_history pph "
        "LEFT JOIN purchases p ON pph.purchase_id = p.id "
        "LEFT JOIN suppliers s ON p.supplier_id = s.id "
        "WHERE pph.merchant_id = ? AND pph.product_id = ? "
        "ORDER BY pph.effective_from DESC, pph.id DESC",
        m_id, product_id
    )
    result = []
    for idx, r in enumerate(rows):
        is_current = (idx == 0)
        eff_from = r["effective_from"]
        eff_to = rows[idx - 1]["effective_from"] if idx > 0 else None
        date_range_label = f"From {eff_from}" if is_current else (f"{eff_from} – {eff_to}" if eff_to else eff_from)
        
        result.append({
            "id": r["id"],
            "purchase_price": r["purchase_price"],
            "purchase_price_taka": r["purchase_price"] / 100,
            "effective_from": eff_from,
            "effective_to": eff_to,
            "date_range_label": date_range_label,
            "is_current": is_current,
            "batch_no": r["batch_no"],
            "supplier_name": r["supplier_name"],
            "note": r["note"],
            "source": r["source"],
        })
    return {"product_id": product_id, "history": result}

@router.post("/{product_id}/stock-adjustment")
async def stock_count_adjustment(
    product_id: int,
    data: StockAdjustmentInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/products/{product_id}/stock-adjustment
    Adjusts stock count based on physical inventory count.
    Calculates shrinkage units and shrinkage loss in poisha.
    Posts stock movement and P&L shrinkage entry if shrinkage occurred.
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    p = get_product(m_id, product_id)

    current_stock = stock_qty(product_id)
    delta = data.counted_qty - current_stock
    c = cost_at(product_id, today())
    unit_cost_poisha = c["purchase_price"] if c else 0
    shrinkage_units = -delta if delta < 0 else 0
    shrinkage_loss_poisha = shrinkage_units * unit_cost_poisha

    with tx():
        insert("stock_movements", {
            "merchant_id": m_id,
            "product_id": product_id,
            "qty": delta,
            "reason": "adjustment",
            "movement_date": today(),
            "source": "manual",
            "created_by": actor,
            "created_at": now_iso()
        })

        if shrinkage_loss_poisha > 0:
            from app.domain.ledger import post
            post({
                "merchant_id": m_id,
                "date": today(),
                "kind": "stock_adjustment",
                "memo": f"Stock shrinkage adjustment for {p['name']}: {delta} units ({data.reason})",
                "source": "manual",
                "created_by": actor,
            }, [
                {"account": "stock_loss", "party": str(product_id), "amount": shrinkage_loss_poisha},
                {"account": "inventory", "party": str(product_id), "amount": -shrinkage_loss_poisha},
            ])

    new_stock = stock_qty(product_id)
    log_audit(
        merchant_id=m_id,
        action="stock_count_adjusted",
        actor=actor,
        entity="products",
        entity_id=str(product_id),
        details={
            "system_qty": current_stock,
            "counted_qty": data.counted_qty,
            "delta": delta,
            "shrinkage_units": shrinkage_units,
            "shrinkage_loss_poisha": shrinkage_loss_poisha,
            "reason": data.reason,
        }
    )

    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "productId": product_id,
        "action": "stock_count_adjusted"
    })

    return {
        "ok": True,
        "product_id": product_id,
        "product_name": p["name"],
        "system_qty": current_stock,
        "counted_qty": data.counted_qty,
        "delta": delta,
        "shrinkage_units": shrinkage_units,
        "shrinkage_loss_poisha": shrinkage_loss_poisha,
        "shrinkage_loss_taka": shrinkage_loss_poisha / 100,
        "new_stock": new_stock,
        "unit_cost_taka": unit_cost_poisha / 100,
        "reason": data.reason,
    }

@router.get("/bulk/template")
async def download_bulk_template():
    """
    GET /api/products/bulk/template
    Download standard CSV template for inventory product catalog bulk upload.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["sku", "name", "selling_price", "cost_price", "stock_qty", "active"])
    writer.writerow(["TS-101", "Classic Cotton T-Shirt", "650", "280", "50", "yes"])
    writer.writerow(["HD-201", "Fleece Winter Hoodie", "1650", "750", "30", "yes"])
    writer.writerow(["PJ-301", "Traditional Silk Panjabi", "2200", "1100", "20", "yes"])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="inventory_template.csv"'},
    )

@router.post("/bulk")
async def bulk_upload_products(
    data: BulkProductsInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    POST /api/products/bulk
    Bulk imports or updates inventory items.
    Permitted for Super Admin, Admin, and Agency Owner.
    Matches by SKU or Name.
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    user_role = current["user"].get("role", "")

    if not can_pause_product(user_role):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: Accountants are not authorized to bulk import products. Agency Owner or Admin access required."
        )

    if not data.products:
        raise HTTPException(status_code=400, detail="No products provided in upload payload")

    created_count = 0
    updated_count = 0
    errors = []

    with tx():
        for idx, item in enumerate(data.products):
            name = (item.name or "").strip()
            if not name:
                errors.append(f"Row {idx + 1}: Name is required")
                continue

            sku = (item.sku or "").strip() if item.sku else None
            sell_poisha = to_poisha(item.selling_price) if item.selling_price is not None else None
            cost_poisha = to_poisha(item.cost_price) if item.cost_price is not None else None

            # Check if exists by SKU or Name
            existing = None
            if sku:
                existing = one("SELECT * FROM products WHERE merchant_id = ? AND lower(sku) = ?", m_id, sku.lower())
            if not existing:
                existing = one("SELECT * FROM products WHERE merchant_id = ? AND lower(name) = ?", m_id, name.lower())

            if existing:
                p_id = existing["id"]
                update_fields = {"name": name}
                if sku:
                    update_fields["sku"] = sku
                if sell_poisha is not None:
                    update_fields["selling_price"] = sell_poisha
                if item.active is not None:
                    update_fields["active"] = bool(item.active)
                update_fields["updated_at"] = now_iso()
                update("products", p_id, update_fields)

                if cost_poisha is not None:
                    set_price(m_id, p_id, cost_poisha, {
                        "source": "bulk_upload",
                        "actor": actor,
                        "effective_from": today(),
                        "note": "Bulk inventory upload"
                    })

                if item.stock_qty and item.stock_qty != 0:
                    current_stock = stock_qty(p_id)
                    delta = item.stock_qty - current_stock
                    if delta != 0:
                        insert("stock_movements", {
                            "merchant_id": m_id,
                            "product_id": p_id,
                            "qty": delta,
                            "reason": "bulk_upload_adjustment",
                            "movement_date": today(),
                            "source": "bulk_upload",
                            "created_by": actor,
                            "created_at": now_iso()
                        })
                updated_count += 1
            else:
                p_id = upsert_product(m_id, {
                    "name": name,
                    "sku": sku,
                    "selling_price": sell_poisha,
                    "purchase_price": cost_poisha,
                    "stock_qty": item.stock_qty or 0,
                    "active": item.active if item.active is not None else True,
                }, {"source": "bulk_upload", "actor": actor})
                created_count += 1

    log_audit(
        merchant_id=m_id,
        action="inventory_bulk_uploaded",
        actor=actor,
        entity="products",
        entity_id=None,
        details={"created": created_count, "updated": updated_count, "total": len(data.products)}
    )

    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "action": "bulk_upload",
        "count": len(data.products)
    })

    return {
        "ok": True,
        "created": created_count,
        "updated": updated_count,
        "total": len(data.products),
        "errors": errors,
        "message": f"Bulk import processed {len(data.products)} items ({created_count} added, {updated_count} updated)."
    }


# =====================================================================================
# Missing purchase prices + bulk price upload (rule 1: versioned, never overwritten)
# =====================================================================================

class BulkPriceRow(BaseModel):
    product_id: Optional[int] = None
    sku: Optional[str] = None
    purchase_price: Optional[float] = None
    effective_from: Optional[str] = None


class BulkPriceInput(BaseModel):
    rows: List[BulkPriceRow]


@router.get("/missing-prices")
async def get_missing_prices(current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/products/missing-prices
    → {"count": n, "products": [{"id", "name", "sku"}, ...]}
    """
    m_id = current["merchantId"]
    prods = missing_price_products(m_id)
    return {
        "count": len(prods),
        "products": [{"id": p["id"], "name": p["name"], "sku": p.get("sku") or ""} for p in prods],
    }


@router.get("/missing-prices/download")
async def download_missing_prices(current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/products/missing-prices/download
    → CSV attachment (missing_prices.csv) with columns id, name, sku, purchase_price
      (purchase_price left blank for the merchant to fill in and re-upload).
    """
    m_id = current["merchantId"]
    prods = missing_price_products(m_id)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "name", "sku", "purchase_price"])
    for p in prods:
        writer.writerow([p["id"], p["name"], p.get("sku") or "", ""])

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="missing_prices.csv"'},
    )


def _validate_bulk_rows(m_id: int, rows: List[BulkPriceRow]):
    """
    Validate rows in merchant scope. Returns (valid, skipped):
      valid:   [{'product_id', 'sku', 'name', 'old_cost', 'old_cost_taka', 'new_cost', 'new_cost_taka', 'change_type', 'change_delta', 'effective_date', 'warnings': []}]
      skipped: [{'product_id', 'sku', 'reason'}]
    """
    valid = []
    skipped = []
    for r in rows:
        p = None
        if r.product_id is not None:
            try:
                p = get_product(m_id, r.product_id)
            except ValueError:
                skipped.append({"product_id": r.product_id, "sku": r.sku, "reason": "product not found"})
                continue
        elif r.sku:
            p = one("SELECT * FROM products WHERE merchant_id = ? AND lower(sku) = ?", m_id, r.sku.lower().strip())
            if not p:
                skipped.append({"product_id": None, "sku": r.sku, "reason": "unknown SKU"})
                continue
        else:
            skipped.append({"product_id": None, "sku": None, "reason": "product_id or sku required"})
            continue

        prod_id = p["id"]
        if r.purchase_price is None:
            skipped.append({"product_id": prod_id, "sku": p.get("sku"), "reason": "purchase_price missing"})
            continue
        try:
            poisha = to_poisha(r.purchase_price)
        except ValueError as err:
            skipped.append({"product_id": prod_id, "sku": p.get("sku"), "reason": f"unreadable price: {err}"})
            continue
        if poisha < 0:
            skipped.append({"product_id": prod_id, "sku": p.get("sku"), "reason": "purchase price cannot be negative"})
            continue

        c = cost_at(prod_id, today())
        warnings = []
        old_cost = c["purchase_price"] if c else None
        old_cost_taka = (old_cost / 100) if old_cost is not None else None
        new_cost_taka = poisha / 100

        if old_cost is None:
            warnings.append("product has no price yet — new record created")
            change_type = "first_price"
            change_delta = "First price"
        elif poisha > old_cost:
            change_type = "price_increase"
            change_delta = f"+৳{(poisha - old_cost) / 100:,.0f}"
        elif poisha < old_cost:
            change_type = "price_decrease"
            change_delta = f"-৳{(old_cost - poisha) / 100:,.0f}"
        else:
            change_type = "no_change"
            change_delta = "no change"

        valid.append({
            "product_id": prod_id,
            "sku": p.get("sku") or "",
            "name": p["name"],
            "old_cost": old_cost,
            "old_cost_taka": old_cost_taka,
            "new_cost": poisha,
            "new_cost_taka": new_cost_taka,
            "change_type": change_type,
            "change_delta": change_delta,
            "effective_date": r.effective_from or today(),
            "warnings": warnings,
        })
    return valid, skipped


@router.post("/prices/bulk-preview")
async def bulk_price_preview(data: BulkPriceInput, current: Dict[str, Any] = Depends(get_current_user)):
    """
    POST /api/products/prices/bulk-preview
    Body: {"rows": [{"product_id": 3, "purchase_price": 350.00}, ...]}   // taka
    → {"valid": [{"product_id", "name", "old_cost", "new_cost", "warnings": [...]}],
       "skipped": [{"product_id", "reason"}]}
    Writes nothing.
    """
    m_id = current["merchantId"]
    role = current["user"]["role"]
    valid, skipped = _validate_bulk_rows(m_id, data.rows)
    if not can_view_cost_prices(role):
        for v in valid:
            v["old_cost"] = None
    return {"valid": valid, "skipped": skipped}


@router.post("/prices/bulk-commit")
async def bulk_price_commit(data: BulkPriceInput, current: Dict[str, Any] = Depends(get_current_user)):
    """
    POST /api/products/prices/bulk-commit
    Body: same rows shape as bulk-preview.
    Each valid row creates a NEW product_price_history record effective today
    (never overwritten; historical profit does not move). Source: 'bulk_upload'.
    → {"ok": true, "applied": n,
       "skipped": [{"product_id", "reason"}],
       "records": [{"product_id", "price_record_id", "effective_from"}]}
    """
    role = current["user"]["role"]
    if not can_view_cost_prices(role):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: Only store owners can update cost prices."
        )
    m_id = current["merchantId"]
    actor = current["actor"]
    valid, skipped = _validate_bulk_rows(m_id, data.rows)

    applied = []
    with tx():
        for row in valid:
            result = set_price(m_id, row["product_id"], row["new_cost"], {
                "source": "bulk_upload",
                "actor": actor,
                "effective_from": today(),
                "note": "Bulk purchase price upload",
            })
            applied.append({
                "product_id": row["product_id"],
                "price_record_id": result["id"],
                "effective_from": result["effective_from"],
            })

    log_audit(
        merchant_id=m_id,
        action="bulk_price_commit",
        actor=actor,
        entity="product_price_history",
        entity_id=None,
        details={"rows_applied": len(applied), "rows_skipped": len(skipped)},
    )
    event_bus.publish({
        "type": "inventory_updated",
        "merchantId": m_id,
        "action": "bulk_price_commit",
        "rows": len(applied),
    })

    return {"ok": True, "applied": len(applied), "skipped": skipped, "records": applied}


@router.get("/performance")
async def get_product_performance(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user),
):
    """
    GET /api/products/performance?from=YYYY-MM-DD&to=YYYY-MM-DD
    → {"from", "to", "unattributed_ad_spend_poisha",
       "rows": [{"product_id", "name", "sku", "orders_placed", "delivered", "returned",
                 "delivered_pct", "returned_pct", "revenue_poisha", "cogs_poisha",
                 "gross_profit_poisha", "ad_spend_poisha" (null — no campaign mapping),
                 "courier_cost_poisha", "net_profit_poisha", "net_margin"}, ...]}
    Sorted net_profit DESC.
    """
    role = current["user"]["role"]
    m_id = current["merchantId"]
    f = from_date or today()[:8] + "01"
    t = to_date or today()
    data = product_performance(m_id, f, t)
    if not can_view_margins(role):
        for r in data.get("rows", []):
            r["cogs_poisha"] = None
            r["gross_profit_poisha"] = None
            r["net_profit_poisha"] = None
            r["net_margin"] = None
    return data
