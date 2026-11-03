"""
Authentication & Hierarchy Authorization middleware and endpoints.
"""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel
from app.db.session import one, insert, run
from app.domain.merchants import verify_password, get_merchant
from app.domain.roles import (
    role_rank, ROLE_LABELS, is_super_admin, is_admin_or_super,
    can_connect_integrations, can_add_misc_expense, can_add_product_expense,
    can_use_whatsapp_expense, can_manage_user_with_role
)
from app.lib.dates import now_iso, today

router = APIRouter(prefix="/api", tags=["Auth"])
SESSION_DAYS = 14

class LoginRequest(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    identifier: Optional[str] = None
    password: str

def get_current_user(request: Request) -> Dict[str, Any]:
    token = request.cookies.get("gm_session")
    if not token:
        raise HTTPException(status_code=401, detail="please sign in")

    s = one("SELECT * FROM sessions WHERE token = ? AND expires_at > ?", token, now_iso())
    if not s:
        raise HTTPException(status_code=401, detail="session expired or invalid")

    user = one("SELECT * FROM users WHERE id = ?", s['user_id'])
    if not user:
        raise HTTPException(status_code=401, detail="user not found")

    merchant_id = s.get('active_merchant_id') if (user['role'] in ('super_admin', 'admin') and s.get('active_merchant_id')) else user['merchant_id']

    return {
        "user": user,
        "session": s,
        "merchantId": merchant_id,
        "actor": f"user:{user['id']}"
    }

def require_agency_owner(current: Dict[str, Any] = Depends(get_current_user)):
    role = current["user"]["role"]
    if not can_connect_integrations(role):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: Only Agency Owners, Admins, or Super Admins can connect integrations."
        )
    return current

def require_admin(current: Dict[str, Any] = Depends(get_current_user)):
    role = current["user"]["role"]
    if not is_admin_or_super(role):
        raise HTTPException(status_code=403, detail="Permission denied: Admin or Super Admin access required.")
    return current

def require_super_admin(current: Dict[str, Any] = Depends(get_current_user)):
    role = current["user"]["role"]
    if not is_super_admin(role):
        raise HTTPException(status_code=403, detail="Permission denied: Super Admin access required.")
    return current

@router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    target = (req.email or req.phone or req.identifier or "").strip().lower()
    if not target:
        raise HTTPException(status_code=400, detail="email or phone number required")

    user = one("SELECT * FROM users WHERE lower(COALESCE(email, '')) = ? OR lower(COALESCE(whatsapp, '')) = ?", target, target)
    if not user or not verify_password(req.password, user.get('password_hash') or ''):
        raise HTTPException(status_code=401, detail="wrong email or password")

    token = secrets.token_hex(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
    insert('sessions', {
        'token': token,
        'user_id': user['id'],
        'created_at': now_iso(),
        'expires_at': expires,
    })

    response.set_cookie(
        key="gm_session",
        value=token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        path="/"
    )

    try:
        from app.lib.audit import log_audit
        log_audit(
            merchant_id=user["merchant_id"],
            action="user_login",
            actor=f"user:{user['id']}",
            entity="sessions",
            details={"email": user["email"], "role": user["role"], "name": user["name"]}
        )
    except Exception:
        pass

    return {
        "ok": True,
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "role": user['role'],
            "role_label": ROLE_LABELS.get(user['role'], user['role']),
        }
    }

@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("gm_session")
    if token:
        run("DELETE FROM sessions WHERE token = ?", token)
    response.delete_cookie("gm_session", path="/")
    return {"ok": True}

@router.get("/me")
async def me(current: Dict[str, Any] = Depends(get_current_user)):
    user = current["user"]
    m_id = current["merchantId"]
    m = get_merchant(m_id)
    role = user.get('role', 'agency_owner')

    return {
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "whatsapp": user.get('whatsapp'),
            "role": role,
            "role_label": ROLE_LABELS.get(role, role),
            "rank": role_rank(role),
        },
        "merchant": {
            "id": m['id'],
            "name": m['name'],
        },
        "today": today(),
        "meta": {
            "hierarchy": {
                "role": role,
                "role_label": ROLE_LABELS.get(role, role),
                "rank": role_rank(role),
                "can_connect_courier": can_connect_integrations(role),
                "can_connect_meta_ads": can_connect_integrations(role),
                "can_connect_whatsapp": can_connect_integrations(role),
                "can_add_misc_expense": can_add_misc_expense(role),
                "can_add_product_expense": can_add_product_expense(role),
                "can_use_whatsapp_expense": can_use_whatsapp_expense(role),
                "is_admin_or_super": is_admin_or_super(role),
                "is_super_admin": is_super_admin(role),
            }
        }
    }
