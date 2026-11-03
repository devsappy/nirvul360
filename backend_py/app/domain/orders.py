"""
Order lifecycle and accounting effects.
Revenue is recognised on delivery, NEVER on placement (Non-negotiable rule 2).
Returns cost money in both directions (forward delivery + return charges).
Missing cost holds delivery out of profit into revenue_suspense (never zero).
"""
from typing import Dict, Any, List, Optional
from app.db.session import insert, update, one, all, tx
from app.lib.dates import now_iso, today, is_iso_date
from app.domain.ledger import post, reverse, live_journals_for_order
from app.domain.products import cost_at, find_product, upsert_product, flag_missing_cost
from app.domain.exceptions import raise_exception, auto_clear
from app.domain.merchants import get_settings, resolve_cash_account

STATUSES = ['placed', 'in_transit', 'delivered', 'returned', 'cancelled', 'lost']
STOCK_OUT = {'in_transit', 'delivered', 'lost'}
DELIVERY_KINDS = ['delivery', 'delivery_held', 'delivery_release', 'settlement_hold']

def get_order(merchant_id: int, order_id: int) -> Dict[str, Any]:
    o = one("SELECT * FROM orders WHERE id = ? AND merchant_id = ?", order_id, merchant_id)
    if not o:
        raise ValueError(f"order {order_id} not found")
    return o

def order_items(order_id: int) -> List[Dict[str, Any]]:
    return all(
        "SELECT i.*, p.name AS product_name, p.sku FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY i.id",
        order_id
    )

def create_order(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    source = ctx.get('source', 'manual')
    actor = ctx.get('actor', 'system')

    with tx():
        raw_items = data.get('items') or []
        if not raw_items:
            raise ValueError("order needs at least one item")

        items = []
        for it in raw_items:
            p = find_product(merchant_id, {
                'id': it.get('product_id'),
                'externalId': it.get('external_product_id'),
                'sku': it.get('sku')
            })
            if not p:
                if not it.get('name'):
                    raise ValueError(f"unknown product {it.get('product_id') or it.get('sku')}")
                p_id = upsert_product(merchant_id, {
                    'external_id': it.get('external_product_id'),
                    'sku': it.get('sku'),
                    'name': it['name'],
                    'selling_price': it.get('unit_price')
                }, {'source': source, 'actor': actor})
                p = find_product(merchant_id, {'id': p_id})

            qty = int(it['qty'])
            unit_price = int(it['unit_price'])
            items.append({
                'product_id': p['id'],
                'qty': qty,
                'unit_price': unit_price,
                'line_total': qty * unit_price
            })

        subtotal = sum(i['line_total'] for i in items)
        discount = data.get('discount', 0) or 0
        shipping = data.get('shipping_charge', 0) or 0
        total = subtotal - discount + shipping
        advance = data.get('advance_paid', 0) or 0
        cod = max(0, total - advance)

        order_id = insert('orders', {
            'merchant_id': merchant_id,
            'external_id': str(data['external_id']) if data.get('external_id') else None,
            'order_date': data.get('order_date') or today(),
            'placed_at': data.get('placed_at') or now_iso(),
            'customer_name': data.get('customer_name'),
            'customer_phone': data.get('customer_phone'),
            'address': data.get('address'),
            'subtotal': subtotal,
            'discount': discount,
            'shipping_charge': shipping,
            'total': total,
            'advance_paid': advance,
            'cod_amount': cod,
            'courier': data.get('courier'),
            'consignment_id': data.get('consignment_id'),
            'status': 'placed',
            'status_changed_at': now_iso(),
            'source': source,
            'created_by': actor,
            'created_at': now_iso(),
            'updated_at': now_iso(),
        })

        for it in items:
            insert('order_items', {
                'order_id': order_id,
                'product_id': it['product_id'],
                'qty': it['qty'],
                'unit_price': it['unit_price'],
                'line_total': it['line_total'],
            })

        if advance > 0:
            post({
                'merchant_id': merchant_id,
                'date': data.get('order_date') or today(),
                'kind': 'advance_received',
                'memo': f"Advance on order {order_id}",
                'source': source,
                'created_by': actor,
                'order_id': order_id,
            }, [
                {'account': 'cash', 'party': resolve_cash_account(merchant_id), 'amount': advance},
                {'account': 'customer_advances', 'party': None, 'amount': -advance},
            ])

        if data.get('status') and data['status'] != 'placed':
            apply_status(merchant_id, order_id, data['status'], {
                'date': data.get('status_date'),
                'source': source,
                'actor': actor,
                'charges': data.get('charges')
            })

        # 3. Duplicate detection (same phone + same items + same amount inside the
        #    duplicate window): the order is kept but flagged, and the queue asks.
        if data.get('customer_phone'):
            _flag_if_duplicate(merchant_id, order_id, source, actor)

        return order_id


def _duplicate_signature(items: List[Dict[str, Any]]) -> List[tuple]:
    return sorted((i['product_id'], i['qty']) for i in items)


def _flag_if_duplicate(merchant_id: int, order_id: int, source: str, actor: str) -> bool:
    from app.domain.merchants import get_settings
    from datetime import datetime, timezone, timedelta

    order = one("SELECT * FROM orders WHERE id = ?", order_id)
    if not order or order.get('is_duplicate'):
        return False
    window = get_settings(merchant_id).get('duplicate_window_hours', 72)
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=window)).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    candidates = all(
        "SELECT id, total, status FROM orders WHERE merchant_id = ? AND customer_phone = ? "
        "AND total = ? AND id != ? AND status != 'cancelled' AND is_duplicate = FALSE AND placed_at >= ?",
        merchant_id, order['customer_phone'], order['total'], order_id, cutoff
    )
    signature = _duplicate_signature(order_items(order_id))
    for c in candidates:
        other = _duplicate_signature(all(
            "SELECT product_id, qty FROM order_items WHERE order_id = ?", c['id']
        ))
        if other == signature:
            update('orders', order_id, {'is_duplicate': True})
            raise_exception(merchant_id, {
                'type': 'duplicate_order',
                'key': f"dup:{order_id}",
                'value': order['total'],
                'order_id': order_id,
                'details': {
                    'previous_order_id': c['id'],
                    'customer_phone': order['customer_phone'],
                    'window_hours': window,
                },
            }, actor)
            return True
    return False

def apply_status(merchant_id: int, order_id: int, new_status: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    if new_status not in STATUSES:
        raise ValueError(f"unknown status {new_status}")

    source = ctx.get('source', 'manual')
    actor = ctx.get('actor', 'system')
    d = ctx.get('date') or today()

    with tx():
        old = get_order(merchant_id, order_id)
        if old.get('is_duplicate'):
            raise ValueError("order was marked as a duplicate and is excluded from the books")

        if old['status'] != new_status:
            # 1. Undo old status effects
            if old['status'] == 'delivered':
                for j in live_journals_for_order(order_id, DELIVERY_KINDS):
                    reverse(j['id'], {'created_by': actor, 'source': source, 'memo': f"Order left delivered status ({new_status})"})
                auto_clear(merchant_id, 'short_settlement', str(order_id), actor, f"order is now {new_status}")
                auto_clear(merchant_id, 'zero_settlement', str(order_id), actor, f"order is now {new_status}")
                auto_clear(merchant_id, 'unsettled_cod', str(order_id), actor, f"order is now {new_status}")

            if old['status'] in ('returned', 'cancelled'):
                for j in live_journals_for_order(order_id, ['advance_retained', 'advance_refund']):
                    reverse(j['id'], {'created_by': actor, 'source': source})

            # 2. Update order row
            changes = {
                'status': new_status,
                'status_changed_at': now_iso(),
                'updated_at': now_iso(),
            }
            if new_status in STOCK_OUT and not old.get('dispatched_date'):
                changes['dispatched_date'] = d
            if new_status == 'delivered':
                changes['delivered_date'] = d
                changes['posting_state'] = 'none'
            if new_status == 'returned':
                changes['returned_date'] = d
            update('orders', order_id, changes)

            # 3. Stock sync & effects of new status
            _sync_stock(merchant_id, order_id, new_status, d, source, actor)
            order = get_order(merchant_id, order_id)

            if new_status == 'delivered':
                _post_delivery(merchant_id, order, source, actor)

            if new_status == 'returned' and order.get('advance_paid', 0) > 0:
                post({
                    'merchant_id': merchant_id,
                    'date': d,
                    'kind': 'advance_retained',
                    'memo': 'Delivery advance kept on returned order',
                    'source': source,
                    'created_by': actor,
                    'order_id': order_id,
                }, [
                    {'account': 'customer_advances', 'amount': order['advance_paid']},
                    {'account': 'courier_recovery', 'amount': -order['advance_paid']},
                ])

            if new_status == 'cancelled' and order.get('advance_paid', 0) > 0:
                post({
                    'merchant_id': merchant_id,
                    'date': d,
                    'kind': 'advance_refund',
                    'memo': 'Advance refunded on cancelled order',
                    'source': source,
                    'created_by': actor,
                    'order_id': order_id,
                }, [
                    {'account': 'customer_advances', 'amount': order['advance_paid']},
                    {'account': 'cash', 'party': resolve_cash_account(merchant_id), 'amount': -order['advance_paid']},
                ])

            if old['status'] == 'in_transit' and new_status != 'in_transit':
                auto_clear(merchant_id, 'stuck_parcel', str(order_id), actor, f"order is now {new_status}")

        if ctx.get('charges'):
            _post_courier_charges(merchant_id, order_id, ctx['charges'], d, source, actor)

        return get_order(merchant_id, order_id)

def _sync_stock(merchant_id: int, order_id: int, status: str, d: str, source: str, actor: str):
    want_out = status in STOCK_OUT
    items = all("SELECT product_id, SUM(qty) AS qty FROM order_items WHERE order_id = ? GROUP BY product_id", order_id)
    for it in items:
        pid = it['product_id']
        cur_row = one(
            "SELECT COALESCE(SUM(qty), 0) AS q FROM stock_movements WHERE order_id = ? AND product_id = ? AND reason IN ('dispatch','return','cancel')",
            order_id, pid
        )
        current = int(cur_row['q']) if cur_row else 0
        wanted = -int(it['qty']) if want_out else 0
        delta = wanted - current
        if delta != 0:
            insert('stock_movements', {
                'merchant_id': merchant_id,
                'product_id': pid,
                'qty': delta,
                'reason': 'dispatch' if delta < 0 else ('cancel' if status == 'cancelled' else 'return'),
                'movement_date': d,
                'order_id': order_id,
                'source': source,
                'created_by': actor,
                'created_at': now_iso(),
            })

def _post_delivery(merchant_id: int, order: Dict[str, Any], source: str, actor: str):
    d = order['delivered_date'] or today()
    items = order_items(order['id'])
    costed = [{**it, 'cost': cost_at(it['product_id'], d)} for it in items]
    missing = [c for c in costed if not c['cost']]

    receivable_party = order.get('courier') or resolve_cash_account(merchant_id)
    receivable_account = 'courier_receivable' if order.get('courier') else 'cash'

    head = [{'account': receivable_account, 'party': receivable_party, 'amount': order['cod_amount']}]
    if order.get('advance_paid', 0) > 0:
        head.append({'account': 'customer_advances', 'amount': order['advance_paid']})

    if missing:
        # Held out of profit until price is known (Non-negotiable rule 11)
        post({
            'merchant_id': merchant_id,
            'date': d,
            'kind': 'delivery_held',
            'memo': 'Delivered — held out of profit until purchase price is entered',
            'source': source,
            'created_by': actor,
            'order_id': order['id'],
        }, [
            *head,
            {'account': 'revenue_suspense', 'amount': -order['total']}
        ])
        update('orders', order['id'], {'posting_state': 'held'})
        for m in missing:
            flag_missing_cost(merchant_id, m['product_id'], actor, order_id=order['id'])
        return 'held'

    cogs_lines = []
    for c in costed:
        unit_cost = c['cost']['purchase_price']
        total_cogs = c['qty'] * unit_cost
        cogs_lines.extend([
            {'account': 'cogs', 'amount': total_cogs, 'product_id': c['product_id'], 'qty': c['qty']},
            {'account': 'inventory', 'amount': -total_cogs, 'product_id': c['product_id'], 'qty': -c['qty']}
        ])

    post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'delivery',
        'memo': f"Delivered order {order.get('external_id') or order['id']}",
        'source': source,
        'created_by': actor,
        'order_id': order['id'],
    }, [
        *head,
        {'account': 'sales', 'amount': -order['total']},
        *cogs_lines,
    ])
    update('orders', order['id'], {'posting_state': 'posted'})
    return 'posted'

def _post_courier_charges(merchant_id: int, order_id: int, charges: Dict[str, Any], d: str, source: str, actor: str):
    o = get_order(merchant_id, order_id)
    courier = o.get('courier') or 'courier'
    lines = []
    delivery = charges.get('delivery_charge') or 0
    cod_fee = charges.get('cod_fee') or 0
    return_fee = charges.get('return_fee') or 0
    total = delivery + cod_fee + return_fee
    if total <= 0:
        return

    if delivery > 0:
        lines.append({'account': 'courier_delivery', 'amount': delivery})
    if cod_fee > 0:
        lines.append({'account': 'courier_cod_fee', 'amount': cod_fee})
    if return_fee > 0:
        lines.append({'account': 'courier_return_fee', 'amount': return_fee})

    lines.append({'account': 'courier_receivable', 'party': courier, 'amount': -total})

    post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'courier_charges',
        'memo': f"Courier fees for order {order_id}",
        'source': source,
        'created_by': actor,
        'order_id': order_id,
    }, lines)

def release_held_deliveries(merchant_id: int, product_id: int, ctx: Dict[str, Any]) -> int:
    source = ctx.get('source', 'system')
    actor = ctx.get('actor', 'system')
    held = all(
        "SELECT DISTINCT o.* FROM orders o JOIN order_items i ON i.order_id = o.id WHERE o.merchant_id = ? AND o.posting_state = 'held' AND i.product_id = ?",
        merchant_id, product_id
    )
    released = 0
    for o in held:
        items = order_items(o['id'])
        still_missing = any(not cost_at(it['product_id'], o['delivered_date']) for it in items)
        if not still_missing:
            for j in live_journals_for_order(o['id'], ['delivery_held']):
                reverse(j['id'], {'created_by': actor, 'source': source, 'memo': 'Held delivery released'})
            _post_delivery(merchant_id, o, source, actor)
            released += 1
    return released

def upsert_order_from_store(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
    with tx():
        ext_id = data.get('external_id')
        existing = one("SELECT * FROM orders WHERE merchant_id = ? AND external_id = ?", merchant_id, str(ext_id)) if ext_id else None
        if not existing:
            return {'id': create_order(merchant_id, data, ctx), 'created': True}

        changes = {}
        for k in ['courier', 'consignment_id']:
            if data.get(k) and data[k] != existing.get(k):
                changes[k] = data[k]
        if changes:
            changes['updated_at'] = now_iso()
            update('orders', existing['id'], changes)

        if data.get('status') and data['status'] != existing['status']:
            apply_status(merchant_id, existing['id'], data['status'], {**ctx, 'date': data.get('status_date')})

        return {'id': existing['id'], 'created': False}
