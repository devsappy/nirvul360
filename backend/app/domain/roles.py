"""
Role Hierarchy & Capability System.
Strict 4-tier hierarchy with Granular Permissions Matrix:
SUPER ADMIN (4) -> ADMIN (3) -> AGENCY OWNERS (2) -> ACCOUNTANT / MANAGER (1)
"""

ROLES = {
    'SUPER_ADMIN': 'super_admin',
    'ADMIN': 'admin',
    'AGENCY_OWNER': 'agency_owner',
    'OWNER': 'owner',
    'MANAGER': 'manager',
    'ACCOUNTANT': 'accountant',
}

ROLE_RANKS = {
    'super_admin': 4,
    'admin': 3,
    'agency_owner': 2,
    'owner': 2,        # Backward-compatible alias
    'manager': 1,
    'accountant': 1,
}

ROLE_LABELS = {
    'super_admin': 'Super Admin',
    'admin': 'Admin',
    'agency_owner': 'Agency Owner',
    'owner': 'Owner',
    'manager': 'Manager',
    'accountant': 'Accountant',
}

PERMISSIONS_MATRIX = [
    {
        "area": "Orders and customers",
        "owner": "Can see",
        "manager": "Can see",
        "accountant": "Can see",
        "is_financial_margin": False,
        "description": "Customer orders, contact details and delivery status."
    },
    {
        "area": "Needs attention queue",
        "owner": "Can resolve",
        "manager": "Can resolve",
        "accountant": "Can resolve",
        "is_financial_margin": False,
        "description": "Quarantined discrepancies, stuck parcels and short settlements."
    },
    {
        "area": "Courier settlements",
        "owner": "Can see",
        "manager": "Can see",
        "accountant": "Can see",
        "is_financial_margin": False,
        "description": "Settlement uploads, matching tables and courier receivables."
    },
    {
        "area": "Expenses and recurring costs",
        "owner": "Can edit",
        "manager": "Can add only",
        "accountant": "Can see",
        "is_financial_margin": False,
        "description": "Operating expense heads, recurring overheads and manual entries."
    },
    {
        "area": "Net profit and net margin",
        "owner": "Can see",
        "manager": "Hidden",
        "accountant": "Hidden",
        "is_financial_margin": True,
        "description": "Overall store net profit, margin percentages, and bottom line."
    },
    {
        "area": "Product margins and cost prices",
        "owner": "Can see",
        "manager": "Hidden",
        "accountant": "Hidden",
        "is_financial_margin": True,
        "description": "Unit cost prices, FIFO cost history and product margins."
    },
    {
        "area": "Supplier purchase prices",
        "owner": "Can see",
        "manager": "Hidden",
        "accountant": "Hidden",
        "is_financial_margin": True,
        "description": "Purchase batch costs and supplier statement payables."
    },
    {
        "area": "Stock on hand and stock counts",
        "owner": "Can edit",
        "manager": "Can edit",
        "accountant": "Can see",
        "is_financial_margin": False,
        "description": "Physical inventory counts, stock adjustments and shrinkage."
    },
    {
        "area": "Reports — cash flow and tax pack",
        "owner": "Can see",
        "manager": "Hidden",
        "accountant": "Can see",
        "is_financial_margin": False,
        "description": "Cash flow statements, bank balances and tax pack reports."
    },
    {
        "area": "Integrations and tokens",
        "owner": "Can change",
        "manager": "Hidden",
        "accountant": "Hidden",
        "is_financial_margin": False,
        "description": "Connecting couriers, Meta Ads tokens and WhatsApp."
    },
    {
        "area": "Team, roles and billing",
        "owner": "Can change",
        "manager": "Hidden",
        "accountant": "Hidden",
        "is_financial_margin": False,
        "description": "Inviting staff, changing role scopes and billing configuration."
    }
]

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

def is_manager(role: str) -> bool:
    return role == 'manager'

def can_view_margins(role: str) -> bool:
    """Non-negotiable rule: Net profit & margins are masked from non-owners (Manager, Accountant)."""
    return role in ('super_admin', 'admin', 'agency_owner', 'owner')

def can_view_cost_prices(role: str) -> bool:
    """Non-negotiable rule: Unit costs are masked from non-owners (Manager, Accountant)."""
    return role in ('super_admin', 'admin', 'agency_owner', 'owner')

def can_view_supplier_prices(role: str) -> bool:
    """Owners and Accountants can see supplier purchase prices; Managers are masked."""
    return role in ('super_admin', 'admin', 'agency_owner', 'owner', 'accountant')

def can_edit_expenses(role: str) -> str:
    """Returns 'can_edit', 'can_add_only', or 'none'."""
    if role in ('super_admin', 'admin', 'agency_owner', 'owner', 'accountant'):
        return 'can_edit'
    if role == 'manager':
        return 'can_add_only'
    return 'none'

def can_edit_stock(role: str) -> bool:
    """Owners and Managers can adjust physical stock count; Accountants have view-only."""
    return role in ('super_admin', 'admin', 'agency_owner', 'owner', 'manager')

def can_view_cash_flow(role: str) -> bool:
    """Owners and Accountants can view cash flow; Managers are masked."""
    return role in ('super_admin', 'admin', 'agency_owner', 'owner', 'accountant')

def can_connect_integrations(role: str) -> bool:
    """Agency Owners and above CAN connect courier website, Meta ads, and WhatsApp."""
    return role_rank(role) >= 2

def can_add_misc_expense(role: str) -> bool:
    """Accountants, Managers, and above CAN add miscellaneous offline expenses."""
    return role_rank(role) >= 1

def can_add_product_expense(role: str) -> bool:
    """Accountants and above CAN add offline product purchase expenses."""
    return role in ('super_admin', 'admin', 'agency_owner', 'owner', 'accountant')

def can_use_whatsapp_expense(role: str) -> bool:
    """Accountants and above CAN record expenses via WhatsApp."""
    return role_rank(role) >= 1

def can_pause_product(role: str) -> bool:
    """Super Admin, Admin, and Agency Owner CAN pause products. Accountants cannot."""
    return role_rank(role) >= 2

def can_manage_user_with_role(actor_role: str, target_role: str) -> bool:
    """A user can only invite/manage roles with lower rank, or owners managing store staff."""
    if is_agency_owner(actor_role):
        return target_role in ('manager', 'accountant')
    return role_rank(actor_role) > role_rank(target_role)
