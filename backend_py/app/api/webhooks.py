"""
Live Webhooks: Courier updates (Steadfast / Pathao), Store orders, and Meta WhatsApp Cloud API.
"""
import os
import hmac
import hashlib
from fastapi import APIRouter, Request, HTTPException, Query, Response
from typing import Optional, Dict, Any
from app.db.session import one
from app.domain.orders import apply_status, upsert_order_from_store
from app.domain.exceptions import scan_merchant
from app.whatsapp.assistant import handle_incoming
from app.lib.events import event_bus
from app.lib.dates import today, now_iso
from app.lib.money import to_poisha

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

@router.post("/courier")
async def courier_webhook(request: Request, merchant_id: Optional[int] = Query(1)):
    payload = await request.json()
    cid = payload.get('consignment_id') or payload.get('consignmentId') or payload.get('tracking_code')
    if not cid:
        raise HTTPException(status_code=400, detail="consignment_id required")

    order = one(
        "SELECT * FROM orders WHERE merchant_id = ? AND (consignment_id = ? OR external_id = ?) LIMIT 1",
        merchant_id, str(cid), str(cid)
    )
    if not order:
        return {"ok": False, "error": f"order with consignment {cid} not found"}

    raw_status = (payload.get('status') or payload.get('delivery_status') or '').lower()
    mapped = None
    if 'delivered' in raw_status:
        mapped = 'delivered'
    elif 'return' in raw_status:
        mapped = 'returned'
    elif 'in_transit' in raw_status or 'picked' in raw_status:
        mapped = 'in_transit'
    elif 'cancel' in raw_status:
        mapped = 'cancelled'

    if mapped and mapped != order['status']:
        apply_status(merchant_id, order['id'], mapped, {
            'source': 'courier_api',
            'actor': 'courier_webhook',
            'date': today(),
        })
        scan_merchant(merchant_id)
        event_bus.broadcast('order_updated', {
            'orderId': order['id'],
            'oldStatus': order['status'],
            'newStatus': mapped,
            'source': 'webhook'
        }, merchant_id)
        return {"ok": True, "order_id": order['id'], "status": mapped}

    return {"ok": True, "order_id": order['id'], "status": order['status'], "note": "no status change"}

@router.post("/orders")
async def store_orders_webhook(request: Request, merchant_id: Optional[int] = Query(1)):
    secret = os.getenv("STORE_WEBHOOK_SECRET")
    if secret and request.headers.get("x-store-secret") != secret:
        raise HTTPException(status_code=401, detail="invalid store webhook secret")

    body = await request.json()
    items = body.get('items', [])
    mapped_items = [{
        'external_product_id': it.get('external_product_id') or it.get('product_id'),
        'sku': it.get('sku'),
        'name': it.get('name'),
        'qty': int(it.get('qty', 1)),
        'unit_price': to_poisha(it.get('unit_price', 0))
    } for it in items]

    res = upsert_order_from_store(merchant_id, {
        'external_id': body.get('external_id') or body.get('id'),
        'order_date': body.get('order_date') or today(),
        'placed_at': body.get('placed_at') or now_iso(),
        'customer_name': body.get('customer_name'),
        'customer_phone': body.get('customer_phone'),
        'address': body.get('address'),
        'discount': to_poisha(body.get('discount', 0)) if body.get('discount') else 0,
        'shipping_charge': to_poisha(body.get('shipping_charge', 0)) if body.get('shipping_charge') else 0,
        'advance_paid': to_poisha(body.get('advance_paid', 0)) if body.get('advance_paid') else 0,
        'courier': body.get('courier'),
        'consignment_id': body.get('consignment_id'),
        'status': body.get('status', 'placed'),
        'items': mapped_items,
    }, {'source': 'store_api', 'actor': 'store:webhook'})

    scan_merchant(merchant_id)
    event_bus.broadcast('order_created', {'orderId': res['id'], 'created': res['created']}, merchant_id)
    return res

@router.get("/whatsapp")
async def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_token: Optional[str] = Query(None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
):
    expected = os.getenv("WHATSAPP_VERIFY_TOKEN", "gross_verify_token")
    if hub_mode == "subscribe" and hub_token == expected:
        return Response(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=403, detail="verification failed")

@router.post("/whatsapp")
async def incoming_whatsapp_message(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256")
    secret = os.getenv("WHATSAPP_APP_SECRET")

    if secret and signature:
        if not signature.startswith("sha256="):
            raise HTTPException(status_code=401, detail="bad signature")
        expected = hmac.new(secret.encode('utf-8'), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature[7:], expected):
            raise HTTPException(status_code=401, detail="signature mismatch")

    data = await request.json()
    for entry in data.get('entry', []):
        for change in entry.get('changes', []):
            messages = change.get('value', {}).get('messages', [])
            for m in messages:
                sender = m.get('from')
                text = m.get('text', {}).get('body') or ''
                if sender and text:
                    await handle_incoming(sender, text)

    return {"ok": True}
