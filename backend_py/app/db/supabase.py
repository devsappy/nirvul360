"""
Supabase PostgreSQL cloud adapter using httpx.
Async queue for background cloud replication without blocking local double-entry writes.
"""
import os
import json
import asyncio
from typing import Dict, Any, List

_sync_queue = []
_last_status = {"ok": False, "error": None, "checked_at": None}

def get_supabase_config():
    url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY") or ""
    return {"url": url, "key": key, "is_configured": bool(url and key)}

def is_supabase_configured() -> bool:
    return get_supabase_config()["is_configured"]

def get_supabase_status() -> Dict[str, Any]:
    cfg = get_supabase_config()
    return {
        "configured": cfg["is_configured"],
        "url": cfg["url"] if cfg["is_configured"] else None,
        "connected": _last_status["ok"],
        "last_error": _last_status["error"],
        "pending_sync_count": len(_sync_queue),
    }

async def test_supabase_connection():
    global _last_status
    import httpx
    from app.lib.dates import now_iso

    cfg = get_supabase_config()
    if not cfg["is_configured"]:
        _last_status = {"ok": False, "error": "SUPABASE_URL or key not configured", "checked_at": now_iso()}
        return _last_status

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"{cfg['url']}/rest/v1/merchants?select=id&limit=1",
                headers={
                    "apikey": cfg["key"],
                    "Authorization": f"Bearer {cfg['key']}",
                    "Content-Type": "application/json"
                }
            )
            if res.is_success:
                _last_status = {"ok": True, "error": None, "checked_at": now_iso()}
            else:
                _last_status = {"ok": False, "error": f"HTTP {res.status_code}: {res.text[:150]}", "checked_at": now_iso()}
    except Exception as e:
        _last_status = {"ok": False, "error": str(e), "checked_at": now_iso()}

    return _last_status

def queue_supabase_sync(table: str, row: Dict[str, Any], action: str = "insert"):
    if not is_supabase_configured():
        return
    _sync_queue.append({"table": table, "row": row, "action": action, "retries": 0})
    # Non-blocking background sync execution
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(_process_sync_queue())
    except Exception:
        pass

async def _process_sync_queue():
    import httpx
    cfg = get_supabase_config()
    if not cfg["is_configured"] or not _sync_queue:
        return

    async with httpx.AsyncClient(timeout=10.0) as client:
        while _sync_queue:
            item = _sync_queue.pop(0)
            try:
                headers = {
                    "apikey": cfg["key"],
                    "Authorization": f"Bearer {cfg['key']}",
                    "Content-Type": "application/json"
                }
                if item["action"] == "insert":
                    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
                    await client.post(f"{cfg['url']}/rest/v1/{item['table']}", headers=headers, json=item["row"])
                elif item["action"] == "update" and item["row"].get("id"):
                    headers["Prefer"] = "return=minimal"
                    await client.patch(f"{cfg['url']}/rest/v1/{item['table']}?id=eq.{item['row']['id']}", headers=headers, json=item["row"])
            except Exception as e:
                if item["retries"] < 2:
                    item["retries"] += 1
                    _sync_queue.append(item)
                break
