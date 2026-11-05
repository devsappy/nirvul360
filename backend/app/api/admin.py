"""
Developer & Platform Admin SaaS Cockpit API.
Allows developers/admins to:
1. Monitor all active client tenants in real time.
2. Stream platform-wide user activity logs (what other users are doing).
3. Inspect and impersonate any merchant dashboard with 1 click.
4. Onboard new client merchants and agency owners.
"""
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.api.auth import require_admin, get_current_user
from app.db.session import all, one, run, insert
from app.domain.merchants import create_merchant, create_user, create_cash_account, get_settings
from app.lib.dates import now_iso, today
from app.lib.audit import log_audit
from app.domain.roles import ROLE_LABELS

router = APIRouter(prefix="/api/admin", tags=["Developer Admin"])

class SwitchTenantInput(BaseModel):
    merchant_id: Optional[int] = None

class CreateTenantInput(BaseModel):
    name: str
    owner_name: str
    owner_email: str
    owner_password: str
    owner_whatsapp: Optional[str] = None
    currency: Optional[str] = "BDT"

class PauseTenantInput(BaseModel):
    reason: Optional[str] = "Subscription payment overdue"

def to_iso_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)

@router.get("/users")
async def list_platform_users(current: Dict[str, Any] = Depends(require_admin)):
    """
    Platform-wide user analytics & directory for Super Admin:
    - total users count
    - active users count (users with valid active unexpired sessions)
    - inactive users count
    - role breakdown
    - full list of users with active status, last active timestamp, merchant organization
    """
    users_raw = all("""
        SELECT 
            u.id, u.merchant_id, u.name, u.email, u.whatsapp, u.role, u.created_at,
            m.name as merchant_name, m.status as merchant_status
        FROM users u
        LEFT JOIN merchants m ON u.merchant_id = m.id
        ORDER BY u.id ASC
    """)

    # Active sessions in the system
    now = now_iso()
    active_sessions = all("""
        SELECT user_id, COUNT(*) as session_count, MAX(created_at) as latest_session
        FROM sessions
        WHERE expires_at > ?
        GROUP BY user_id
    """, now)
    session_map = {row["user_id"]: row for row in active_sessions}

    # Latest activity from audit log
    audits = all("""
        SELECT a.actor, a.action, a.at
        FROM audit_log a
        INNER JOIN (
            SELECT actor, MAX(id) as max_id
            FROM audit_log
            WHERE actor LIKE ?
            GROUP BY actor
        ) latest ON a.id = latest.max_id
    """, "user:%")
    audit_map = {row["actor"]: row for row in audits}

    formatted_users = []
    for u in users_raw:
        u_id = u["id"]
        sess = session_map.get(u_id)
        is_active = sess is not None and sess.get("session_count", 0) > 0
        active_count = sess.get("session_count", 0) if sess else 0

        audit_entry = audit_map.get(f"user:{u_id}")
        last_action = audit_entry.get("action") if audit_entry else None
        audit_time = audit_entry.get("at") if audit_entry else None
        sess_time = sess.get("latest_session") if sess else None

        created_iso = to_iso_str(u["created_at"])
        last_active = to_iso_str(audit_time) or to_iso_str(sess_time) or created_iso

        formatted_users.append({
            "id": u_id,
            "name": u["name"],
            "email": u["email"],
            "whatsapp": u["whatsapp"],
            "role": u["role"],
            "role_label": ROLE_LABELS.get(u["role"], u["role"]),
            "merchant_id": u["merchant_id"],
            "merchant_name": u["merchant_name"] or ("Platform Global" if u["role"] in ("super_admin", "admin") else f"Store #{u['merchant_id']}"),
            "merchant_status": u["merchant_status"] or "active",
            "is_active": is_active,
            "active_sessions_count": active_count,
            "last_active": last_active,
            "last_action": last_action,
            "created_at": created_iso,
        })

    total_users = len(formatted_users)
    active_users = sum(1 for u in formatted_users if u["is_active"])
    inactive_users = total_users - active_users

    roles_breakdown = {
        "super_admin": sum(1 for u in formatted_users if u["role"] == "super_admin"),
        "admin": sum(1 for u in formatted_users if u["role"] == "admin"),
        "agency_owner": sum(1 for u in formatted_users if u["role"] in ("agency_owner", "owner")),
        "accountant": sum(1 for u in formatted_users if u["role"] == "accountant"),
    }

    unique_merchants = len(set(u["merchant_id"] for u in formatted_users if u["merchant_id"]))

    return {
        "summary": {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": inactive_users,
            "active_percentage": round((active_users / total_users * 100), 1) if total_users > 0 else 0.0,
            "roles": roles_breakdown,
            "total_merchants": unique_merchants,
        },
        "users": formatted_users,
    }

@router.get("/tenants")
async def list_tenants(current: Dict[str, Any] = Depends(require_admin)):
    """
    Returns list of all SaaS tenants with high-level stats, owners, and active status.
    """
    active_m_id = current.get("merchantId")
    merchants = all("SELECT * FROM merchants ORDER BY id ASC")
    
    tenant_list = []
    for m in merchants:
        m_id = m["id"]
        # Owner & Users
        users = all("SELECT id, name, email, whatsapp, role, created_at FROM users WHERE merchant_id = ? ORDER BY id ASC", m_id)
        owner = next((u for u in users if u["role"] in ("agency_owner", "owner")), None)
        accountants = [u for u in users if u["role"] == "accountant"]
        
        # Orders summary
        orders_stat = one("""
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total), 0) as total_gmv,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) as delivered_gmv,
                COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered_count,
                COALESCE(SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END), 0) as returned_count,
                COALESCE(SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END), 0) as in_transit_count
            FROM orders WHERE merchant_id = ?
        """, m_id) or {"total_orders": 0, "total_gmv": 0, "delivered_gmv": 0, "delivered_count": 0, "returned_count": 0, "in_transit_count": 0}

        # Cash summary from the ledger: cash account balances live in the
        # journal_lines account 'cash' (parties = cash_accounts rows). The old query
        # summed accounts that never existed in the chart.
        cash_stat = one("""
            SELECT COALESCE(SUM(amount), 0) as total_cash
            FROM journal_lines
            WHERE merchant_id = ? AND account = 'cash'
        """, m_id) or {"total_cash": 0}
        
        # Integrations
        s = get_settings(m_id)
        integ = s.get("integrations", {})
        courier_conn = bool(integ.get("courier_website", {}).get("connected") or integ.get("courier_website", {}).get("api_key"))
        meta_conn = bool(integ.get("meta_ads", {}).get("connected") or integ.get("meta_ads", {}).get("access_token"))
        wa_conn = bool(integ.get("whatsapp_business", {}).get("connected") or integ.get("whatsapp_business", {}).get("phone_number_id"))

        # Last activity
        last_log = one("SELECT at, action, actor FROM audit_log WHERE merchant_id = ? ORDER BY id DESC LIMIT 1", m_id)
        last_order = one("SELECT order_date FROM orders WHERE merchant_id = ? ORDER BY id DESC LIMIT 1", m_id)
        last_active = (last_log.get("at") if last_log else None) or (last_order.get("order_date") if last_order else m["created_at"])

        tenant_list.append({
            "id": m_id,
            "name": m["name"],
            "status": m.get("status") or "active",
            "paused_reason": m.get("paused_reason"),
            "created_at": m["created_at"],
            "is_active_selection": (m_id == active_m_id),
            "owner": {
                "id": owner["id"] if owner else None,
                "name": owner["name"] if owner else "Unassigned",
                "email": owner["email"] if owner else None,
                "phone": owner.get("whatsapp") if owner else None,
            },
            "user_counts": {
                "total": len(users),
                "accountants": len(accountants),
            },
            "metrics": {
                "total_orders": orders_stat["total_orders"],
                "total_gmv": orders_stat["total_gmv"],
                "delivered_gmv": orders_stat["delivered_gmv"],
                "delivered_count": orders_stat["delivered_count"],
                "returned_count": orders_stat["returned_count"],
                "in_transit_count": orders_stat["in_transit_count"],
                "recorded_cash": cash_stat["total_cash"] if cash_stat else 0,
            },
            "integrations": {
                "courier": courier_conn,
                "meta_ads": meta_conn,
                "whatsapp": wa_conn,
            },
            "last_active": last_active,
        })

    return {"tenants": tenant_list, "current_merchant_id": active_m_id}

@router.get("/activity")
async def list_activity(
    merchant_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current: Dict[str, Any] = Depends(require_admin)
):
    """
    Live global activity feed across all merchants showing what other users are doing.
    """
    if merchant_id:
        logs = all("""
            SELECT a.*, m.name as merchant_name 
            FROM audit_log a
            LEFT JOIN merchants m ON a.merchant_id = m.id
            WHERE a.merchant_id = ?
            ORDER BY a.id DESC LIMIT ?
        """, merchant_id, limit)
    else:
        logs = all("""
            SELECT a.*, m.name as merchant_name 
            FROM audit_log a
            LEFT JOIN merchants m ON a.merchant_id = m.id
            ORDER BY a.id DESC LIMIT ?
        """, limit)

    # Format human-friendly descriptions
    results = []
    for row in logs:
        # Determine actor label
        actor_label = row["actor"]
        if actor_label.startswith("user:"):
            try:
                u_id = int(actor_label.split(":")[1])
                user_info = one("SELECT name, role FROM users WHERE id = ?", u_id)
                if user_info:
                    actor_label = f"{user_info['name']} ({ROLE_LABELS.get(user_info['role'], user_info['role'])})"
            except Exception:
                pass

        results.append({
            "id": row["id"],
            "at": row["at"],
            "merchant_id": row["merchant_id"],
            "merchant_name": row["merchant_name"] or f"Merchant #{row['merchant_id']}",
            "actor": actor_label,
            "raw_actor": row["actor"],
            "action": row["action"],
            "entity": row["entity"],
            "entity_id": row["entity_id"],
            "details": row["after"],
        })

    return {"activity": results}

@router.get("/stats")
async def get_system_stats(current: Dict[str, Any] = Depends(require_admin)):
    """
    System-wide SaaS statistics for developers.
    """
    def get_supabase_status():
        import os
        from app.db.session import is_postgres
        configured = bool(os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL"))
        return {"configured": configured, "connected": is_postgres(), "pending_sync_count": 0}
    from app.lib.events import event_bus

    tenants_count = one("SELECT COUNT(*) as c FROM merchants")["c"]
    users_count = one("SELECT COUNT(*) as c FROM users")["c"]
    orders_stat = one("""
        SELECT 
            COUNT(*) as total_orders, 
            COALESCE(SUM(total), 0) as total_gmv
        FROM orders
    """) or {"total_orders": 0, "total_gmv": 0}
    journals_count = one("SELECT COUNT(*) as c FROM journals")["c"]

    return {
        "tenants_count": tenants_count,
        "users_count": users_count,
        "total_orders": orders_stat["total_orders"],
        "total_gmv": orders_stat["total_gmv"],
        "total_journals": journals_count,
        "active_realtime_listeners": len(event_bus._listeners),
        "supabase": get_supabase_status(),
        "today": today(),
    }

@router.post("/switch-tenant")
async def switch_tenant(data: SwitchTenantInput, current: Dict[str, Any] = Depends(require_admin)):
    """
    Allows a Developer / Admin to switch active merchant context to inspect that merchant's dashboard.
    """
    session_token = current["session"]["token"]
    admin_user = current["user"]

    if data.merchant_id is None:
        # Reset back to default merchant
        run("UPDATE sessions SET active_merchant_id = NULL WHERE token = ?", session_token)
        m = one("SELECT * FROM merchants WHERE id = ?", admin_user["merchant_id"])
        target_name = m["name"] if m else "Default Merchant"
        target_id = admin_user["merchant_id"]
    else:
        m = one("SELECT * FROM merchants WHERE id = ?", data.merchant_id)
        if not m:
            raise HTTPException(status_code=404, detail="Merchant not found")
        run("UPDATE sessions SET active_merchant_id = ? WHERE token = ?", data.merchant_id, session_token)
        target_name = m["name"]
        target_id = data.merchant_id

    log_audit(
        merchant_id=target_id,
        action="admin_switch_context",
        actor=f"user:{admin_user['id']}",
        entity="sessions",
        details={"switched_to_merchant": target_name, "merchant_id": target_id}
    )

    return {
        "ok": True,
        "active_merchant_id": target_id,
        "merchant_name": target_name,
        "message": f"Successfully switched context to {target_name}. Dashboard and data are now scoped to this merchant."
    }

@router.post("/create-tenant")
async def create_new_tenant(data: CreateTenantInput, current: Dict[str, Any] = Depends(require_admin)):
    """
    Onboard a brand new SaaS tenant with an Agency Owner account.
    """
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Merchant name required")
    if not data.owner_email.strip():
        raise HTTPException(status_code=400, detail="Owner email required")

    # Check if email is already taken
    existing = one("SELECT id FROM users WHERE lower(email) = ?", data.owner_email.strip().lower())
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    # 1. Create merchant
    m_id = create_merchant({
        "name": data.name.strip(),
        "currency": data.currency or "BDT",
    })

    # 2. Create Owner User
    owner_id = create_user(m_id, {
        "name": data.owner_name.strip(),
        "email": data.owner_email.strip().lower(),
        "password": data.owner_password or "password123",
        "whatsapp": data.owner_whatsapp.strip() if data.owner_whatsapp else None,
        "role": "agency_owner",
    })

    # 3. Create default primary cash account
    actor = f"user:{current['user']['id']}"
    create_cash_account(m_id, {
        "name": "Main Cash / Bank Account",
        "kind": "bank",
        "opening_balance": 0,
        "opening_date": today(),
        "is_default": True,
    }, actor)

    log_audit(
        merchant_id=m_id,
        action="tenant_created",
        actor=actor,
        entity="merchants",
        entity_id=str(m_id),
        details={"name": data.name, "owner_email": data.owner_email}
    )

    return {
        "ok": True,
        "merchant": {"id": m_id, "name": data.name},
        "owner": {"id": owner_id, "name": data.owner_name, "email": data.owner_email}
    }

@router.post("/tenants/{tenant_id}/pause")
async def pause_tenant(
    tenant_id: int, 
    data: Optional[PauseTenantInput] = None, 
    current: Dict[str, Any] = Depends(require_admin)
):
    """
    Pause/Suspend a tenant merchant account (e.g. overdue subscription payment).
    Tenant staff users will be locked out until resumed.
    """
    merchant = one("SELECT * FROM merchants WHERE id = ?", tenant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    reason = (data.reason.strip() if (data and data.reason) else None) or "Subscription payment overdue"
    run("UPDATE merchants SET status = 'paused', paused_reason = ? WHERE id = ?", reason, tenant_id)

    log_audit(
        merchant_id=tenant_id,
        action="tenant_paused",
        actor=f"user:{current['user']['id']}",
        entity="merchants",
        entity_id=str(tenant_id),
        details={"reason": reason, "merchant_name": merchant["name"]}
    )

    return {
        "ok": True,
        "tenant_id": tenant_id,
        "status": "paused",
        "paused_reason": reason,
        "message": f"Tenant '{merchant['name']}' paused successfully ({reason}). Staff access is now locked."
    }

@router.post("/tenants/{tenant_id}/resume")
async def resume_tenant(
    tenant_id: int, 
    current: Dict[str, Any] = Depends(require_admin)
):
    """
    Resume/Reactivate a paused tenant merchant account.
    """
    merchant = one("SELECT * FROM merchants WHERE id = ?", tenant_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    run("UPDATE merchants SET status = 'active', paused_reason = NULL WHERE id = ?", tenant_id)

    log_audit(
        merchant_id=tenant_id,
        action="tenant_resumed",
        actor=f"user:{current['user']['id']}",
        entity="merchants",
        entity_id=str(tenant_id),
        details={"merchant_name": merchant["name"]}
    )

    return {
        "ok": True,
        "tenant_id": tenant_id,
        "status": "active",
        "message": f"Tenant '{merchant['name']}' resumed successfully. Staff access has been restored."
    }
