"""
Real-time Server-Sent Events (SSE) stream for live UI hot-updates.
"""
import json
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from app.api.auth import get_current_user
from app.lib.events import event_bus
def get_supabase_status():
    import os
    url = os.getenv("SUPABASE_URL")
    return {"configured": bool(url), "connected": False, "pending_sync_count": 0}
from app.lib.dates import now_iso

router = APIRouter(prefix="/api", tags=["Realtime"])

@router.get("/events")
async def events_stream(request: Request, current: dict = Depends(get_current_user)):
    merchant_id = current["merchantId"]
    q = event_bus.subscribe()

    async def event_generator():
        # 1. Initial handshake
        yield ":connected\n\n"
        init_data = json.dumps({
            "type": "connected",
            "merchantId": merchant_id,
            "supabase": get_supabase_status(),
            "timestamp": now_iso()
        })
        yield f"data: {init_data}\n\n"

        # 2. Stream events with keepalive
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=20.0)
                    if not event.get('merchantId') or event['merchantId'] == merchant_id:
                        yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ":keepalive\n\n"
        finally:
            event_bus.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@router.get("/system/status")
async def system_status(current: dict = Depends(get_current_user)):
    import os
    sup = {"configured": bool(os.getenv("SUPABASE_URL")), "connected": False, "pending_sync_count": 0}
    return {
        "status": "ok",
        "db": "connected",
        "active_listeners": len(event_bus._listeners),
        "supabase": sup,
        "realtime": {
            "active": True,
            "transport": "sse",
            "connected_clients": len(event_bus._listeners),
        },
        "integrations": {
            "courier_configured": bool(os.getenv("STEADFAST_API_KEY")),
            "meta_configured": bool(os.getenv("META_ACCESS_TOKEN") and os.getenv("META_AD_ACCOUNT_ID")),
            "whatsapp_configured": bool(os.getenv("WHATSAPP_TOKEN") and os.getenv("WHATSAPP_PHONE_NUMBER_ID")),
            "supabase_configured": sup["configured"],
        }
    }
