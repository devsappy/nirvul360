"""
Global SaaS Audit & Activity Logger.
Logs all user actions, transactions, and system events for developer/admin monitoring.
"""
import json
from typing import Optional, Dict, Any
from app.db.session import insert, all, one
from app.lib.dates import now_iso
from app.lib.events import event_bus

def log_audit(
    merchant_id: int,
    action: str,
    actor: str,
    entity: str = "general",
    entity_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    before: Optional[Any] = None,
    after: Optional[Any] = None,
):
    """
    Records an audit log entry and broadcasts an event to developer listeners.
    """
    ts = now_iso()
    payload = {
        "merchant_id": merchant_id,
        "at": ts,
        "actor": actor,
        "action": action,
        "entity": entity,
        "entity_id": str(entity_id) if entity_id is not None else None,
        "before": json.dumps(before) if before is not None else None,
        "after": json.dumps(after or details) if (after or details) is not None else None,
    }
    
    try:
        log_id = insert("audit_log", payload)
    except Exception as e:
        print(f"Audit log insert warning: {e}")
        log_id = None

    # Broadcast to real-time event bus
    try:
        m = one("SELECT name FROM merchants WHERE id = ?", merchant_id)
        m_name = m["name"] if m else f"Merchant #{merchant_id}"
        event_bus.publish({
            "type": "audit_event",
            "merchantId": merchant_id,
            "merchantName": m_name,
            "actor": actor,
            "action": action,
            "entity": entity,
            "entityId": entity_id,
            "details": details or {},
            "timestamp": ts,
        })
    except Exception:
        pass

    return log_id
