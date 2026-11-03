"""
Role Hierarchy & Capability System.
Strict 4-tier hierarchy:
SUPER ADMIN (4) -> ADMIN (3) -> AGENCY OWNERS (2) -> ACCOUNTANT (1)
"""

ROLES = {
    'SUPER_ADMIN': 'super_admin',
    'ADMIN': 'admin',
    'AGENCY_OWNER': 'agency_owner',
    'ACCOUNTANT': 'accountant',
}

ROLE_RANKS = {
    'super_admin': 4,
    'admin': 3,
    'agency_owner': 2,
    'owner': 2,        # Backward-compatible alias
    'accountant': 1,
}

ROLE_LABELS = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'agency_owner': 'Agency Owner',
    'owner': 'Agency Owner',
    'accountant': 'Accountant',
}

def role_rank(role: str) -> int:
    return ROLE_RANKS.get(role, 0)

def is_super_admin(role: str) -> bool:
    return role == 'super_admin'

def is_admin_or_super(role: str) -> bool:
    return role_rank(role) >= 3

def is_agency_owner(role: str) -> bool:
    return role_rank(role) >= 2

def is_accountant(role: str) -> bool:
    return role == 'accountant'

def can_connect_integrations(role: str) -> bool:
    """Agency Owners and above CAN connect courier website, Meta ads, and WhatsApp."""
    return role_rank(role) >= 2

def can_add_misc_expense(role: str) -> bool:
    """Accountants and above CAN add miscellaneous offline expenses."""
    return role_rank(role) >= 1

def can_add_product_expense(role: str) -> bool:
    """Accountants and above CAN add offline product purchase expenses."""
    return role_rank(role) >= 1

def can_use_whatsapp_expense(role: str) -> bool:
    """Accountants and above CAN record expenses via WhatsApp."""
    return role_rank(role) >= 1

def can_pause_product(role: str) -> bool:
    """Super Admin, Admin, and Agency Owner CAN pause products. Accountants cannot."""
    return role_rank(role) >= 2

def can_manage_user_with_role(actor_role: str, target_role: str) -> bool:
    """A user can only invite/manage roles with lower rank."""
    return role_rank(actor_role) > role_rank(target_role)
