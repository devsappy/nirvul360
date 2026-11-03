"""
Real-time Event Broadcaster: Async in-memory pub-sub for Server-Sent Events (SSE).
"""
import asyncio
from typing import Dict, Any, Optional, Set
from datetime import datetime, timezone

class EventBroadcaster:
    def __init__(self):
        self._listeners: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._listeners.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self._listeners.discard(q)

    def broadcast(self, event_type: str, payload: Dict[str, Any] = None, merchant_id: Optional[int] = None):
        event = {
            "type": event_type,
            "payload": payload or {},
            "merchantId": merchant_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        for q in list(self._listeners):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                self._listeners.discard(q)
        return event

    def emit(self, event_data: Dict[str, Any]):
        if not isinstance(event_data, dict):
            return None
        event_type = event_data.get("type", "update")
        merchant_id = event_data.get("merchantId") or event_data.get("merchant_id")
        return self.broadcast(event_type, payload=event_data, merchant_id=merchant_id)

    def publish(self, event_data: Dict[str, Any]):
        return self.emit(event_data)

event_bus = EventBroadcaster()
