"""
WhatsApp Assistant API Router.
Provides authenticated endpoints for:
- GET  /api/whatsapp/overview: connection status, daily digest, authorized senders, confirmation log
- GET  /api/whatsapp/conversation: 2-way message history for interactive simulator
- POST /api/whatsapp/simulate: send message into WhatsApp assistant state machine
- POST /api/whatsapp/confirm: confirm pending draft
- POST /api/whatsapp/reject: reject pending draft
"""
import json
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.auth import get_current_user
from app.whatsapp.assistant import handle_incoming, commit_draft, HEAD_BN
from app.db.session import one, all, update, insert
from app.lib.dates import now_iso, today
from app.lib.money import format_taka, format_taka_bn

router = APIRouter(prefix="/api/whatsapp", tags=["WhatsApp Assistant"])

class SimulateMessageInput(BaseModel):
    text: str
    phone: Optional[str] = None

class DraftDecisionInput(BaseModel):
    draft_id: Optional[int] = None
    note: Optional[str] = None

def _format_dt(val: Any) -> str:
    if not val:
        return ""
    return str(val)[:16].replace("T", ", ")

@router.get("/overview")
async def get_whatsapp_overview(current: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns connection telemetry, daily digest config, authorized senders,
    active pending draft, and 24-month confirmation audit log.
    """
    m_id = current["merchantId"]
    user = current["user"]

    # 1. Connection telemetry
    users_with_phone = all(
        "SELECT id, name, role, whatsapp FROM users WHERE merchant_id = ? AND whatsapp IS NOT NULL AND whatsapp != ''",
        m_id
    )
    biz_phone = user.get("whatsapp") or (users_with_phone[0]["whatsapp"] if users_with_phone else "+880 1711-000000")
    if not biz_phone.startswith("+"):
        biz_phone = f"+{biz_phone}"

    # Drafts telemetry
    newest_draft = one(
        "SELECT created_at FROM whatsapp_drafts WHERE merchant_id = ? ORDER BY id DESC LIMIT 1",
        m_id
    )
    last_msg_in = _format_dt(newest_draft["created_at"]) if newest_draft else "None"

    # Entries created this month
    cur_month_prefix = f"{today()[:7]}-01"
    month_drafts_row = one(
        "SELECT COUNT(*) as c FROM whatsapp_drafts WHERE merchant_id = ? AND status = 'confirmed' AND created_at >= ?",
        m_id, cur_month_prefix
    )
    entries_month = int(month_drafts_row["c"]) if month_drafts_row else 0

    # Ledger sync timestamp
    newest_journal = one(
        "SELECT created_at FROM journals WHERE merchant_id = ? ORDER BY id DESC LIMIT 1",
        m_id
    )
    ledger_sync = _format_dt(newest_journal["created_at"]) if newest_journal else today()

    # 2. Daily digest configuration
    daily_digest = {
        "sends_at": "09:00",
        "timezone": "Asia/Dhaka",
        "language": "বাংলা",
        "contains": "Yesterday's profit, returns, unresolved count",
        "last_sent": f"{today()}, 09:00",
    }

    # 3. Authorized senders list (from users table)
    all_users = all(
        "SELECT id, name, role, whatsapp FROM users WHERE merchant_id = ? ORDER BY id ASC",
        m_id
    )
    authorized_senders = []
    for u in all_users:
        phone = u.get("whatsapp") or "Not registered"
        if phone != "Not registered" and not phone.startswith("+"):
            phone = f"+{phone}"
        role_label = u.get("role", "staff").capitalize()
        authorized_senders.append({
            "id": u["id"],
            "person": u["name"],
            "role": role_label,
            "number": phone,
            "may_send": "Operating expenses & cash entries" if u.get("role") in ("owner", "admin", "manager") else "Expenses up to ৳5,000",
            "needs_confirmation": "Always" if u.get("role") != "owner" else "Always",
        })

    # 4. Confirmation log (from whatsapp_drafts)
    raw_logs = all(
        "SELECT id, created_at, decided_at, raw_text, draft, status, result_ref "
        "FROM whatsapp_drafts WHERE merchant_id = ? ORDER BY id DESC LIMIT 50",
        m_id
    )
    confirmation_log = []
    for l in raw_logs:
        try:
            d = json.loads(l["draft"]) if isinstance(l["draft"], str) else l["draft"]
        except Exception:
            d = {}
        head_name = HEAD_BN.get(d.get("head", ""), d.get("head", ""))
        amount_poisha = d.get("amount", 0)
        amount_taka = amount_poisha / 100 if amount_poisha else 0
        understood_summary = f"{head_name} · ৳{amount_taka:,.0f}" if head_name else "Expense entry"
        
        confirmation_log.append({
            "id": l["id"],
            "when": _format_dt(l["created_at"]),
            "what_was_said": l["raw_text"],
            "what_we_understood": understood_summary,
            "answer": l["status"],
            "answer_time": _format_dt(l.get("decided_at")) if l.get("decided_at") else None,
            "result_ref": l.get("result_ref"),
        })

    # 5. Pending draft if any
    pending = one(
        "SELECT * FROM whatsapp_drafts WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        user["id"]
    )
    pending_draft_data = None
    if pending:
        try:
            d = json.loads(pending["draft"]) if isinstance(pending["draft"], str) else pending["draft"]
        except Exception:
            d = {}
        pending_draft_data = {
            "id": pending["id"],
            "raw_text": pending["raw_text"],
            "head": d.get("head"),
            "head_label": HEAD_BN.get(d.get("head", ""), d.get("head", "")),
            "amount_poisha": d.get("amount", 0),
            "amount_taka": (d.get("amount", 0) / 100),
            "date": d.get("date", today()),
            "note": d.get("note", ""),
            "created_at": pending["created_at"],
        }

    return {
        "connected": True,
        "connection": {
            "business_number": biz_phone,
            "last_message_in": last_msg_in,
            "failed_sends_30d": 0,
            "entries_created_this_month": entries_month,
        },
        "ledger_last_synced": ledger_sync,
        "daily_digest": daily_digest,
        "authorized_senders": authorized_senders,
        "confirmation_log": confirmation_log,
        "pending_draft": pending_draft_data,
    }

@router.get("/conversation")
async def get_whatsapp_conversation(current: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns message thread history for the 2-way conversation simulator.
    """
    m_id = current["merchantId"]
    user = current["user"]

    drafts = all(
        "SELECT * FROM whatsapp_drafts WHERE merchant_id = ? ORDER BY id ASC LIMIT 20",
        m_id
    )

    messages = []
    for d in drafts:
        try:
            payload = json.loads(d["draft"]) if isinstance(d["draft"], str) else d["draft"]
        except Exception:
            payload = {}

        # 1. Outgoing user message
        messages.append({
            "id": f"msg-user-{d['id']}",
            "sender": "user",
            "text": d["raw_text"],
            "timestamp": _format_dt(d["created_at"]),
            "status": "delivered",
        })

        # 2. Assistant bot preview draft card
        head_name = HEAD_BN.get(payload.get("head", ""), payload.get("head", "সাধারণ খরচ"))
        taka_val = payload.get("amount", 0) / 100
        preview_text = (
            f"📝 এই এন্ট্রিটি ড্রাফট করা হয়েছে:\n"
            f"  ধরন: খরচ — {head_name}\n"
            f"  টাকা: ৳{taka_val:,.0f}\n"
            f"  তারিখ: {payload.get('date', today())}\n\n"
            f"ঠিক আছে? হ্যাঁ / না"
        )
        messages.append({
            "id": f"msg-bot-preview-{d['id']}",
            "sender": "bot",
            "text": preview_text,
            "timestamp": _format_dt(d["created_at"]),
            "draft_card": {
                "head": head_name,
                "amount": taka_val,
                "date": payload.get("date", today()),
                "status": d["status"],
            }
        })

        # 3. User decision and Bot confirmation if decided
        if d["status"] == "confirmed":
            messages.append({
                "id": f"msg-user-confirm-{d['id']}",
                "sender": "user",
                "text": "হ্যাঁ",
                "timestamp": _format_dt(d.get("decided_at") or d["created_at"]),
                "status": "delivered",
            })
            ref_num = d.get('result_ref') or f"EXP-{d['id']}"
            messages.append({
                "id": f"msg-bot-committed-{d['id']}",
                "sender": "bot",
                "text": f'সেভ হয়েছে। {payload.get("date", today())}-এর খরচে {head_name} ৳{taka_val:,.0f} যোগ হলো। এন্ট্রি নম্বর {ref_num} · চাইলে উত্তর দিন "বাতিল" লিখে।',
                "timestamp": _format_dt(d.get("decided_at") or d["created_at"]),
            })
        elif d["status"] == "rejected":
            messages.append({
                "id": f"msg-user-reject-{d['id']}",
                "sender": "user",
                "text": "না",
                "timestamp": _format_dt(d.get("decided_at") or d["created_at"]),
                "status": "delivered",
            })
            messages.append({
                "id": f"msg-bot-rejected-{d['id']}",
                "sender": "bot",
                "text": "❌ এন্ট্রি বাতিল করা হয়েছে। কোনো তথ্য লেজারে লেখা হয়নি।",
                "timestamp": _format_dt(d.get("decided_at") or d["created_at"]),
            })

    return {"messages": messages}

@router.post("/simulate")
async def simulate_whatsapp_message(
    data: SimulateMessageInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Sends message into WhatsApp conversation state machine.
    """
    user = current["user"]
    phone = data.phone or user.get("whatsapp")
    if not phone:
        # Default to a mock phone associated with this user if none registered
        phone = f"01711{user['id']:06d}"
        update("users", user["id"], {"whatsapp": phone})

    replies = await handle_incoming(phone, data.text.strip())

    # Check updated pending draft
    pending = one(
        "SELECT * FROM whatsapp_drafts WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        user["id"]
    )
    pending_draft_data = None
    if pending:
        try:
            d = json.loads(pending["draft"]) if isinstance(pending["draft"], str) else pending["draft"]
        except Exception:
            d = {}
        pending_draft_data = {
            "id": pending["id"],
            "raw_text": pending["raw_text"],
            "head": d.get("head"),
            "head_label": HEAD_BN.get(d.get("head", ""), d.get("head", "")),
            "amount_poisha": d.get("amount", 0),
            "amount_taka": (d.get("amount", 0) / 100),
            "date": d.get("date", today()),
            "note": d.get("note", ""),
        }

    return {
        "ok": True,
        "replies": replies,
        "pending_draft": pending_draft_data
    }

@router.post("/confirm")
async def confirm_whatsapp_draft(current: Dict[str, Any] = Depends(get_current_user)):
    """
    Confirms active pending draft for current user.
    """
    user = current["user"]
    pending = one(
        "SELECT * FROM whatsapp_drafts WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        user["id"]
    )
    if not pending:
        raise HTTPException(status_code=400, detail="No pending draft waiting for confirmation")

    reply = commit_draft(user, pending)
    return {"ok": True, "reply": reply}

@router.post("/reject")
async def reject_whatsapp_draft(current: Dict[str, Any] = Depends(get_current_user)):
    """
    Rejects active pending draft for current user.
    """
    user = current["user"]
    pending = one(
        "SELECT * FROM whatsapp_drafts WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        user["id"]
    )
    if not pending:
        raise HTTPException(status_code=400, detail="No pending draft waiting for rejection")

    update("whatsapp_drafts", pending["id"], {"status": "rejected", "decided_at": now_iso()})
    return {"ok": True, "reply": "❌ এন্ট্রি বাতিল করা হয়েছে। কোনো তথ্য লেজারে লেখা হয়নি।"}
