from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from app.api.auth import get_current_user
from app.db.session import all, one, insert, update
from app.lib.dates import now_iso
from app.domain.roles import (
    ROLE_LABELS, PERMISSIONS_MATRIX, can_view_margins, can_view_cost_prices,
    can_view_supplier_prices, can_edit_expenses, can_edit_stock, can_view_cash_flow,
    can_connect_integrations, can_manage_user_with_role
)

router = APIRouter(prefix="/api/team", tags=["Team"])

class TeamInviteInput(BaseModel):
    name: str
    email: str
    role: str = Field(..., pattern="^(manager|accountant)$")
    scope: Optional[str] = "current_store"

class TeamRoleUpdateInput(BaseModel):
    role: str = Field(..., pattern="^(owner|agency_owner|manager|accountant)$")

@router.get("")
async def get_team_members(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    user_role = current["user"]["role"]
    users = all(
        """
        SELECT id, name, email, whatsapp, role, created_at 
        FROM users 
        WHERE merchant_id = ? 
        ORDER BY id ASC
        """,
        m_id
    )

    # Get store name for scope label
    merchant_row = one("SELECT name FROM merchants WHERE id = ?", m_id)
    store_name = merchant_row["name"] if merchant_row else "Current Store"

    members = []
    for u in users:
        role = u['role']
        r_label = ROLE_LABELS.get(role, role.capitalize())
        last_sess = one("SELECT created_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", u['id'])
        last_active = str(last_sess['created_at'])[:16].replace("T", " ") if last_sess and last_sess.get('created_at') else "Never signed in"
        scope_str = store_name

        members.append({
            'id': u['id'],
            'name': u['name'],
            'email': u['email'],
            'whatsapp': u.get('whatsapp'),
            'role': role,
            'role_label': r_label,
            'last_active': last_active,
            'scope': scope_str,
            'status': 'active',
            'invited_at': str(u.get('created_at', ''))[:10] if u.get('created_at') else None
        })

    capabilities = {
        'can_see_net_profit': can_view_margins(user_role),
        'can_see_cost_prices': can_view_cost_prices(user_role),
        'can_see_supplier_prices': can_view_supplier_prices(user_role),
        'can_edit_expenses': can_edit_expenses(user_role) == 'can_edit',
        'can_add_expenses': can_edit_expenses(user_role) in ('can_edit', 'can_add_only'),
        'can_edit_stock': can_edit_stock(user_role),
        'can_see_cash_flow': can_view_cash_flow(user_role),
        'can_change_integrations': can_connect_integrations(user_role),
        'can_manage_team': can_view_margins(user_role)
    }

    last_audit = one(
        "SELECT at FROM audit_log WHERE merchant_id = ? AND action LIKE ? ORDER BY id DESC LIMIT 1",
        m_id, "%role%"
    )

    return {
        'members': members,
        'member_count': len(members),
        'last_permissions_changed': last_audit['at'] if last_audit else None,
        'activity_synced': now_iso(),
        'permissions_matrix': PERMISSIONS_MATRIX,
        'current_user_capabilities': capabilities
    }

@router.get("/activity")
async def get_team_activity(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    logs = all(
        "SELECT id, actor, action, entity AS target_type, entity_id AS target_id, after AS details, at AS created_at FROM audit_log WHERE merchant_id = ? ORDER BY id DESC LIMIT 20",
        m_id
    )
    return {"activity": logs}

@router.post("/invite")
async def invite_team_member(data: TeamInviteInput, current: Dict[str, Any] = Depends(get_current_user)):
    user_role = current["user"]["role"]
    if not can_view_margins(user_role):
        raise HTTPException(status_code=403, detail="Permission denied: Only Owners can invite team members.")

    m_id = current["merchantId"]
    clean_email = data.email.lower().strip()

    # Check duplicate email
    existing = one("SELECT id FROM users WHERE lower(COALESCE(email, '')) = ?", clean_email)
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    new_id = insert('users', {
        'merchant_id': m_id,
        'name': data.name.strip(),
        'email': clean_email,
        'role': data.role,
        'scope': data.scope or 'current_store',
        'status': 'invited',
        'invited_at': now_iso(),
        'created_at': now_iso()
    })
    return {"id": new_id, "status": "invited"}

@router.put("/{user_id}/role")
async def update_member_role(user_id: int, data: TeamRoleUpdateInput, current: Dict[str, Any] = Depends(get_current_user)):
    user_role = current["user"]["role"]
    if not can_view_margins(user_role):
        raise HTTPException(status_code=403, detail="Permission denied: Only Owners can change team member roles.")

    if current["user"]["id"] == user_id:
        raise HTTPException(status_code=400, detail="Cannot alter your own role.")

    m_id = current["merchantId"]
    target = one("SELECT * FROM users WHERE id = ? AND merchant_id = ?", user_id, m_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    update('users', user_id, {'role': data.role})
    return {"ok": True}
