"""
Product catalog, versioned purchase price history, and stock tracking.
Non-negotiable rule 1: purchase prices are versioned, never overwritten. Historical profit does not move.
"""
from typing import Dict, Any, List, Optional
from app.db.session import insert, update, one, all, tx
from app.lib.dates import now_iso, today, is_iso_date
from app.domain.exceptions import raise_exception, auto_clear

def get_product(merchant_id: int, product_id: int) -> Dict[str, Any]:
    p = one("SELECT * FROM products WHERE id = ? AND merchant_id = ?", product_id, merchant_id)
    if not p:
        raise ValueError(f"product {product_id} not found")
    return p

def find_product(merchant_id: int, criteria: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    p_id = criteria.get('id')
    ext_id = criteria.get('externalId') or criteria.get('external_id')
    sku = criteria.get('sku')

    if p_id:
        return one("SELECT * FROM products WHERE id = ? AND merchant_id = ?", p_id, merchant_id)
    if ext_id:
        p = one("SELECT * FROM products WHERE merchant_id = ? AND external_id = ?", merchant_id, str(ext_id))
        if p:
            return p
    if sku:
        return one("SELECT * FROM products WHERE merchant_id = ? AND lower(sku) = lower(?) ORDER BY id LIMIT 1", merchant_id, str(sku))
    return None

def has_any_price(product_id: int) -> bool:
    return bool(one("SELECT 1 FROM product_price_history WHERE product_id = ? LIMIT 1", product_id))

def cost_at(product_id: int, date: str) -> Optional[Dict[str, Any]]:
    """The price record in effect on `date` — the latest effective_from on or before it."""
    return one(
        "SELECT * FROM product_price_history WHERE product_id = ? AND effective_from <= ? ORDER BY effective_from DESC, id DESC LIMIT 1",
        product_id, date
    )

def price_history(product_id: int) -> List[Dict[str, Any]]:
    return all("SELECT * FROM product_price_history WHERE product_id = ? ORDER BY effective_from DESC, id DESC", product_id)

def stock_qty(product_id: int) -> int:
    row = one("SELECT COALESCE(SUM(qty), 0) AS q FROM stock_movements WHERE product_id = ?", product_id)
    return int(row['q']) if row else 0

def upsert_product(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    source = ctx.get('source', 'manual')
    actor = ctx.get('actor', 'system')

    with tx():
        existing = find_product(merchant_id, {'externalId': data.get('external_id'), 'sku': data.get('sku') if not data.get('external_id') else None})
        if existing:
            product_id = existing['id']
            changes = {}
            for k in ['name', 'sku', 'selling_price']:
                if data.get(k) is not None and data[k] != existing.get(k):
                    changes[k] = data[k]
            if changes:
                changes['updated_at'] = now_iso()
                update('products', product_id, changes)
        else:
            if not data.get('name'):
                raise ValueError("product name required")
            product_id = insert('products', {
                'merchant_id': merchant_id,
                'external_id': str(data['external_id']) if data.get('external_id') else None,
                'sku': data.get('sku'),
                'name': data['name'],
                'selling_price': data.get('selling_price'),
                'source': source,
                'created_by': actor,
                'created_at': now_iso(),
                'updated_at': now_iso(),
            })
            if data.get('stock_qty'):
                insert('stock_movements', {
                    'merchant_id': merchant_id,
                    'product_id': product_id,
                    'qty': int(data['stock_qty']),
                    'reason': 'opening',
                    'movement_date': today(),
                    'source': source,
                    'created_by': actor,
                    'created_at': now_iso(),
                })

        # Versioned purchase price handling
        if data.get('purchase_price') is not None:
            cur = cost_at(product_id, today())
            if not cur or cur['purchase_price'] != data['purchase_price']:
                set_price(merchant_id, product_id, data['purchase_price'], {'source': source, 'actor': actor, 'note': 'supplied with product data'})
        elif not has_any_price(product_id):
            flag_missing_cost(merchant_id, product_id, actor)

        return product_id

def set_price(merchant_id: int, product_id: int, price: int, ctx: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(price, int) or price < 0:
        raise ValueError("purchase price must be a non-negative integer")

    p = get_product(merchant_id, product_id)
    eff = ctx.get('effectiveFrom') or ctx.get('effective_from') or today()
    source = ctx.get('source', 'manual')
    actor = ctx.get('actor', 'system')

    with tx():
        first = not has_any_price(product_id)
        if first:
            earliest_row = one(
                "SELECT MIN(o.order_date) AS d FROM orders o JOIN order_items i ON i.order_id = o.id WHERE i.product_id = ?",
                product_id
            )
            earliest = earliest_row['d'] if earliest_row else None
            candidates = [c for c in [eff, p['created_at'][:10], earliest] if c]
            eff = min(candidates)

        record_id = insert('product_price_history', {
            'merchant_id': merchant_id,
            'product_id': product_id,
            'purchase_price': price,
            'effective_from': eff,
            'method': ctx.get('method', 'stated'),
            'purchase_id': ctx.get('purchaseId') or ctx.get('purchase_id'),
            'source': source,
            'note': ctx.get('note'),
            'created_by': actor,
            'created_at': now_iso(),
        })

        auto_clear(merchant_id, 'missing_cost', str(product_id), actor, 'purchase price entered')
        
        # Release any deliveries held waiting for this cost
        from app.domain.orders import release_held_deliveries
        release_held_deliveries(merchant_id, product_id, {'source': source, 'actor': actor})

        return {'id': record_id, 'effective_from': eff}

def flag_missing_cost(merchant_id: int, product_id: int, actor: str = 'system'):
    p = get_product(merchant_id, product_id)
    return raise_exception(merchant_id, {
        'type': 'missing_cost',
        'key': str(product_id),
        'value': 0,
        'product_id': product_id,
        'details': {'name': p['name'], 'sku': p.get('sku')}
    }, actor)

def missing_price_products(merchant_id: int) -> List[Dict[str, Any]]:
    rows = all(
        "SELECT * FROM products WHERE merchant_id = ? AND NOT EXISTS (SELECT 1 FROM product_price_history WHERE product_id = products.id)",
        merchant_id
    )
    return rows

def list_products(merchant_id: int, q: Optional[str] = None, missing: bool = False) -> List[Dict[str, Any]]:
    sql = "SELECT p.* FROM products p WHERE p.merchant_id = ?"
    params = [merchant_id]
    if missing:
        sql += " AND NOT EXISTS (SELECT 1 FROM product_price_history WHERE product_id = p.id)"
    if q:
        sql += " AND (lower(p.name) LIKE ? OR lower(p.sku) LIKE ?)"
        like = f"%{q.lower().strip()}%"
        params.extend([like, like])
    sql += " ORDER BY p.id DESC"
    return all(sql, *params)
