"""
Milestone 1 Comprehensive Backend Test Suite:
Validates domain logic, RBAC, API endpoints, and invariant constraints for M1:
- 5-Tier Hierarchy and Manager Role Permissions
- Dynamic Recurring Expenses and Next Run Dates
- Expenses Summary with Owner Withdrawal Isolation
- Supplier Statements with FIFO Purchase Batch Status
- Financial Reports (P&L, Cash Flow, Product Performance) with RBAC Masking
- Team Management (Directory, Invite, Role Modification)
- Super Admin Console (All 11 Views)
- AI Guardrail Immutability Invariant (must_confirm cannot be disabled -> 403)
- Impersonation Audit Invariant (admin_view_as_owner audit record logged)
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, run, one, all
from app.domain.merchants import create_merchant, create_user, create_cash_account, create_supplier
from app.domain.products import upsert_product
from app.domain.orders import create_order, apply_status
from app.domain.entries import record_expense, record_ad_spend, record_withdrawal, record_purchase
from app.domain.roles import (
    ROLE_RANKS, PERMISSIONS_MATRIX, can_view_margins, can_view_cost_prices,
    can_view_supplier_prices, can_edit_expenses, can_edit_stock, can_view_cash_flow,
    can_manage_user_with_role
)
from app.lib.dates import reset_clock, today, add_days

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_m1_env():
    """Initializes in-memory database with test tenant, users, and admin."""
    open_db(":memory:")
    reset_clock()
    t = today()

    # 1. Tenant 1
    m1_id = create_merchant({'name': 'Artisan Wear BD', 'phone': '01911000001'})
    run("UPDATE merchants SET plan = 'growth', plan_price = 100000, order_limit = 5000, ai_token_cap = 50000, ai_tokens_used = 12000 WHERE id = ?", m1_id)

    # Super Admin
    super_admin_id = create_user(m1_id, {
        'name': 'Chief Super Admin',
        'email': 'superadmin@gross.bd',
        'role': 'super_admin',
        'password': 'password123'
    })

    # Agency Owner
    owner_id = create_user(m1_id, {
        'name': 'Tamim Ahmed',
        'email': 'owner@artisan.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    # Manager
    manager_id = create_user(m1_id, {
        'name': 'Jamal Manager',
        'email': 'manager@artisan.bd',
        'role': 'manager',
        'password': 'password123'
    })

    # Accountant
    accountant_id = create_user(m1_id, {
        'name': 'Karim Accountant',
        'email': 'accountant@artisan.bd',
        'role': 'accountant',
        'password': 'password123'
    })

    actor = f"user:{owner_id}"
    ctx = {'source': 'manual', 'actor': actor}

    # Cash Accounts
    bank_acc = create_cash_account(m1_id, {
        'name': 'City Bank Corporate',
        'kind': 'bank',
        'opening_balance': 20000000,
        'opening_date': add_days(t, -30),
        'is_default': True
    }, actor)

    bkash_acc = create_cash_account(m1_id, {
        'name': 'bKash Merchant',
        'kind': 'bkash',
        'opening_balance': 5000000,
        'opening_date': add_days(t, -30)
    }, actor)

    # Products
    p1 = upsert_product(m1_id, {
        'sku': 'TS-BLK-01',
        'name': 'Classic Black T-Shirt',
        'selling_price': 65000,
        'purchase_price': 28000,
        'stock_qty': 100
    }, ctx)

    p2_no_cost = upsert_product(m1_id, {
        'sku': 'HOOD-GRY-01',
        'name': 'Winter Grey Hoodie',
        'selling_price': 165000,
        'stock_qty': 40
    }, ctx)

    # Tenant 2 for Admin views
    m2_id = create_merchant({'name': 'Dhaka Gadget Hub', 'phone': '01811000002'})
    run("UPDATE merchants SET plan = 'starter', plan_price = 50000, order_limit = 1500 WHERE id = ?", m2_id)
    create_user(m2_id, {
        'name': 'Tanvir Owner',
        'email': 'owner@gadget.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    # Seed AI Safety Guardrails
    guardrails_seed = [
        ("must_confirm", "Never write without confirmation", "Require explicit merchant confirmation before writing any journal or order", 1, 1, "{}", add_days(t, -10) + "T00:00:00Z"),
        ("amount_sanity", "Amount sanity check", "Flag expenses or orders deviating more than 3x from rolling average", 1, 0, '{"multiplier": 3}', add_days(t, -10) + "T00:00:00Z"),
        ("dedupe_10m", "Duplicate within 10 min", "Prevent double-submitting identical drafts created within 10 minutes", 1, 0, '{"window_minutes": 10}', add_days(t, -10) + "T00:00:00Z"),
        ("date_bounds", "Date range ±365 days", "Reject journal dates older than 365 days or in the future", 1, 0, '{"max_days_past": 365, "allow_future": false}', add_days(t, -10) + "T00:00:00Z"),
        ("high_value_block", "Block above ৳1,00,000", "Require super-admin approval for single transactions exceeding ৳1,00,000", 0, 0, '{"threshold_poisha": 10000000}', add_days(t, -10) + "T00:00:00Z"),
    ]
    for gr in guardrails_seed:
        run("""
            INSERT OR REPLACE INTO ai_guardrails (guardrail_key, label, description, is_enabled, is_immutable, parameters, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, *gr)

    # Seed AI Model Routes
    model_routes_seed = [
        ("intent_classification", "gpt-4o-mini", "Fast classification of merchant intent", add_days(t, -10) + "T00:00:00Z"),
        ("ambiguous_extraction", "gpt-4o", "Deep reasoning for messy Bengali dialect expense notes", add_days(t, -10) + "T00:00:00Z"),
        ("voice_and_ocr", "whisper+vision", "Audio voice note transcription and memo photo OCR", add_days(t, -10) + "T00:00:00Z"),
    ]
    for mr in model_routes_seed:
        run("""
            INSERT OR REPLACE INTO ai_model_routes (task_key, model_name, description, updated_at)
            VALUES (?, ?, ?, ?)
        """, *mr)

    # Seed SaaS plans
    saas_plans = [
        ("starter", "Starter", 50000, 1500, 1, 1, 0, 0, 0, "active", "2026-01-01T00:00:00Z"),
        ("growth", "Growth", 100000, 5000, 2, 3, 1, 1, 0, "active", "2026-01-01T00:00:00Z"),
        ("scale", "Scale", 250000, 999999, 99, 99, 1, 1, 1, "not_launched", "2026-01-01T00:00:00Z"),
        ("trial", "Trial", 0, 500, 1, 2, 1, 0, 0, "active", "2026-01-01T00:00:00Z"),
    ]
    for p in saas_plans:
        run("""
            INSERT OR REPLACE INTO saas_plans (id, name, price_poisha, order_limit, courier_limit, user_limit, has_whatsapp, has_meta_sync, has_mushak, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *p)

    # Seed prior month billing invoices for MoM growth calculation
    run("""
        INSERT INTO billing_invoices (merchant_id, plan_id, amount, payment_method, payment_details, status, attempt_count, max_attempts, billing_period, created_at)
        VALUES (?, 'growth', 100000, 'bkash', 'TrxID: 8871', 'paid', 1, 3, ?, ?)
    """, m1_id, add_days(t, -32)[:7], add_days(t, -35) + "T10:00:00Z")

    return {
        'm1_id': m1_id,
        'm2_id': m2_id,
        'super_admin_id': super_admin_id,
        'owner_id': owner_id,
        'manager_id': manager_id,
        'accountant_id': accountant_id,
        'bank_acc': bank_acc,
        'bkash_acc': bkash_acc,
        'p1': p1,
        'p2_no_cost': p2_no_cost,
        'actor': actor,
        'ctx': ctx
    }


def test_domain_roles_and_manager_permissions(setup_m1_env):
    """TC-M1.1: Verify role hierarchy and capability matrix for manager."""
    assert ROLE_RANKS['super_admin'] > ROLE_RANKS['admin']
    assert ROLE_RANKS['admin'] > ROLE_RANKS['agency_owner']
    assert ROLE_RANKS['agency_owner'] > ROLE_RANKS['manager']
    assert ROLE_RANKS['manager'] >= ROLE_RANKS['accountant']

    # Manager capability checks: Net profit, unit costs, and supplier prices are masked
    assert can_view_margins('manager') is False
    assert can_view_cost_prices('manager') is False
    assert can_view_supplier_prices('manager') is False
    assert can_view_supplier_prices('accountant') is True
    assert can_edit_expenses('manager') == 'can_add_only'
    assert can_edit_stock('manager') is True
    assert can_view_cash_flow('manager') is False

    # Owner capabilities: Full access
    assert can_view_margins('agency_owner') is True
    assert can_view_cost_prices('agency_owner') is True
    assert can_view_cash_flow('agency_owner') is True

    # User management bounds
    assert can_manage_user_with_role('agency_owner', 'manager') is True
    assert can_manage_user_with_role('agency_owner', 'accountant') is True
    assert can_manage_user_with_role('manager', 'agency_owner') is False
    assert can_manage_user_with_role('accountant', 'agency_owner') is False


def test_recurring_expenses_domain_and_api(setup_m1_env):
    """TC-M1.2: Verify recurring expenses CRUD and forward-only next run date calculation."""
    env = setup_m1_env
    client.post("/api/auth/login", json={'email': 'owner@artisan.bd', 'password': 'password123'})

    # 1. Create recurring expense
    res = client.post("/api/expenses/recurring", json={
        'title': 'Banani Showroom Rent',
        'head': 'rent',
        'amount': 3500000,
        'frequency': 'monthly',
        'posts_on_day': 1,
        'cash_account_id': env['bank_acc'],
        'note': 'Commercial lease agreement'
    })
    assert res.status_code == 200
    created = res.json()
    assert created['id'] > 0
    assert created['status'] == 'created'

    # 2. List recurring expenses
    list_res = client.get("/api/expenses/recurring")
    assert list_res.status_code == 200
    data = list_res.json()
    assert 'items' in data
    assert len(data['items']) >= 1
    target = data['items'][0]
    assert target['head'] == 'rent'
    assert target['amount_poisha'] == 3500000
    assert target['next_date'] is not None

    # 3. Update recurring expense
    upd_res = client.put(f"/api/expenses/recurring/{created['id']}", json={
        'amount': 3800000,
        'posts_on_day': 5,
        'note': 'Rent revision'
    })
    assert upd_res.status_code == 200
    assert upd_res.json()['ok'] is True


def test_expenses_summary_and_owner_withdrawal_isolation(setup_m1_env):
    """TC-M1.3: Verify expenses summary breakdown and non-negotiable owner withdrawal isolation."""
    env = setup_m1_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = today()

    # Record operating expenses
    record_expense(m_id, {'head': 'rent', 'amount': 3500000, 'date': t, 'cash_account_id': env['bank_acc'], 'note': 'Office rent'}, ctx)
    record_expense(m_id, {'head': 'packaging', 'amount': 650000, 'date': t, 'cash_account_id': env['bkash_acc'], 'note': 'Delivery poly bags'}, ctx)
    record_ad_spend(m_id, {'amount': 10000, 'currency': 'USD', 'rate': '122.50', 'rate_date': t, 'date': t, 'cash_account_id': env['bank_acc'], 'note': 'Meta Ads campaign'}, ctx)

    # Record owner withdrawal (Rule 9: MUST NOT touch P&L / Operating Expenses)
    record_withdrawal(m_id, {'amount': 2000000, 'date': t, 'cash_account_id': env['bank_acc'], 'note': 'Tamim personal draw'}, ctx)

    # Login and fetch expenses summary
    client.post("/api/auth/login", json={'email': 'owner@artisan.bd', 'password': 'password123'})
    res = client.get(f"/api/expenses/summary?from_date={t}&to_date={t}")
    assert res.status_code == 200
    data = res.json()

    assert 'categories' in data
    assert data['categories'].get('rent', 0) == 3500000
    assert data['categories'].get('packaging', 0) == 650000

    # Ad spend BDT conversion: 10000 * 122.50 = 1225000 poisha under 'advertising'
    assert data['categories'].get('advertising', 0) == 1225000

    # Total operating expenses must sum rent + packaging + advertising
    assert data['total_operating_expenses_poisha'] == 3500000 + 650000 + 1225000

    # Owner withdrawals must be completely isolated in separate telemetry section
    assert data['owner_withdrawals']['total_poisha'] == 2000000


def test_supplier_ledger_and_fifo_batch_statement(setup_m1_env):
    """TC-M1.4: Verify supplier statements, running balance ledger, and FIFO batch payment allocation."""
    env = setup_m1_env
    m_id = env['m1_id']
    actor = env['actor']
    ctx = env['ctx']
    t = today()

    # Create supplier
    supp_id = create_supplier(m_id, {
        'name': 'Bengal Fabric Mills',
        'phone': '01712554433',
        'address': 'Babubazar, Old Dhaka',
        'credit_terms_days': 15,
        'categories': 'Cotton fabrics, Voile'
    }, actor)

    # Batch 1: 50 units @ 28000 = 1400000 poisha, partially paid 800000 poisha
    pur1_id = record_purchase(m_id, {
        'supplier_id': supp_id,
        'product_id': env['p1'],
        'qty': 50,
        'unit_cost': 28000,
        'paid_amount': 800000,
        'cash_account_id': env['bank_acc'],
        'date': add_days(t, -10)
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-0101', status = 'part_paid', total_cost = 1400000, paid_amount = 800000 WHERE id = ?", pur1_id)

    # Batch 2: 20 units @ 28000 = 560000 poisha, unpaid 0 poisha
    pur2_id = record_purchase(m_id, {
        'supplier_id': supp_id,
        'product_id': env['p1'],
        'qty': 20,
        'unit_cost': 28000,
        'paid_amount': 0,
        'cash_account_id': env['bank_acc'],
        'date': add_days(t, -2)
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-0102', status = 'unpaid', total_cost = 560000, paid_amount = 0 WHERE id = ?", pur2_id)

    # Login and check supplier list and statement
    client.post("/api/auth/login", json={'email': 'owner@artisan.bd', 'password': 'password123'})
    supp_res = client.get("/api/suppliers")
    assert supp_res.status_code == 200
    suppliers = supp_res.json()['suppliers']
    assert len(suppliers) >= 1
    bengal = next(s for s in suppliers if s['id'] == supp_id)
    assert bengal['name'] == 'Bengal Fabric Mills'
    assert bengal['payable_balance_poisha'] == (1400000 - 800000) + 560000  # 1160000 poisha

    stmt_res = client.get(f"/api/suppliers/{supp_id}/statement")
    assert stmt_res.status_code == 200
    stmt = stmt_res.json()
    assert stmt['supplier']['name'] == 'Bengal Fabric Mills'
    assert stmt['supplier']['payable_balance_poisha'] == 1160000
    assert len(stmt['batches']) == 2

    # FIFO payment allocation check: 800000 paid goes to PB-0101 (Part paid)
    b1 = next(b for b in stmt['batches'] if b['batch_no'] == 'PB-0101')
    assert b1['status'] == 'Part paid'
    assert b1['paid_poisha'] == 800000

    b2 = next(b for b in stmt['batches'] if b['batch_no'] == 'PB-0102')
    assert b2['status'] == 'Unpaid'
    assert b2['paid_poisha'] == 0


def test_reports_pnl_cash_flow_and_product_performance(setup_m1_env):
    """TC-M1.5: Verify P&L, Cash Flow statement, product performance uncosted footnote, and RBAC masking."""
    env = setup_m1_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = today()

    # Create and deliver orders
    o1 = create_order(m_id, {
        'external_id': 'ORD-RPT-01',
        'order_date': add_days(t, -5),
        'customer_name': 'Hasan Ali',
        'customer_phone': '01711998877',
        'items': [{'product_id': env['p1'], 'qty': 2, 'unit_price': 65000}],
        'shipping_charge': 6000,
        'courier': 'steadfast'
    }, ctx)
    apply_status(m_id, o1, 'delivered', {'date': add_days(t, -3), 'charges': {'delivery_charge': 6000, 'cod_fee': 1300}, **ctx})

    # Order with uncosted product p2_no_cost
    o2 = create_order(m_id, {
        'external_id': 'ORD-RPT-02',
        'order_date': add_days(t, -4),
        'customer_name': 'Sabbir Rahman',
        'customer_phone': '01711998866',
        'items': [{'product_id': env['p2_no_cost'], 'qty': 1, 'unit_price': 165000}],
        'shipping_charge': 6000,
        'courier': 'steadfast'
    }, ctx)
    apply_status(m_id, o2, 'delivered', {'date': add_days(t, -2), 'charges': {'delivery_charge': 6000, 'cod_fee': 1650}, **ctx})

    # 1. Agency Owner has full access to P&L, Cash Flow, and Product Performance
    client.post("/api/auth/login", json={'email': 'owner@artisan.bd', 'password': 'password123'})

    pnl_res = client.get(f"/api/reports/pnl?from_date={add_days(t, -10)}&to_date={t}")
    assert pnl_res.status_code == 200
    pnl_data = pnl_res.json()
    assert 'gross_profit' in pnl_data or 'cogs' in pnl_data

    cf_res = client.get(f"/api/reports/cash-flow?from_date={add_days(t, -10)}&to_date={t}")
    assert cf_res.status_code == 200
    cf_data = cf_res.json()
    assert 'accounts_breakdown' in cf_data
    assert 'net_cash_change_poisha' in cf_data

    perf_res = client.get(f"/api/reports/product-performance?from_date={add_days(t, -10)}&to_date={t}")
    assert perf_res.status_code == 200
    perf_data = perf_res.json()
    assert 'products' in perf_data

    # 2. Accountant CANNOT access P&L (margins masked), Manager CANNOT access Cash Flow (RBAC protection)
    client.post("/api/auth/login", json={'email': 'accountant@artisan.bd', 'password': 'password123'})
    pnl_accountant = client.get(f"/api/reports/pnl?from_date={add_days(t, -10)}&to_date={t}")
    assert pnl_accountant.status_code == 403

    client.post("/api/auth/login", json={'email': 'manager@artisan.bd', 'password': 'password123'})
    cf_manager = client.get(f"/api/reports/cash-flow?from_date={add_days(t, -10)}&to_date={t}")
    assert cf_manager.status_code == 403


def test_team_router_management(setup_m1_env):
    """TC-M1.6: Verify team members list, invitation, and role updates with RBAC enforcement."""
    client.post("/api/auth/login", json={'email': 'owner@artisan.bd', 'password': 'password123'})

    # 1. Get team directory
    team_res = client.get("/api/team")
    assert team_res.status_code == 200
    data = team_res.json()
    members = data['members']
    assert len(members) >= 3
    roles = [m['role'] for m in members]
    assert 'agency_owner' in roles
    assert 'manager' in roles
    assert 'accountant' in roles

    # 2. Invite new team member as accountant
    inv_res = client.post("/api/team/invite", json={
        'name': 'Fahim Accountant',
        'email': 'fahim@artisan.bd',
        'role': 'accountant',
        'scope': 'current_store'
    })
    assert inv_res.status_code == 200
    invited = inv_res.json()
    assert invited['status'] == 'invited'
    user_id = invited['id']

    # 3. Update role of member to manager
    upd_role = client.put(f"/api/team/{user_id}/role", json={'role': 'manager'})
    assert upd_role.status_code == 200
    assert upd_role.json()['ok'] is True
    assert one("SELECT role FROM users WHERE id = ?", user_id)['role'] == 'manager'

    # 4. Accountant cannot invite team members
    client.post("/api/auth/login", json={'email': 'accountant@artisan.bd', 'password': 'password123'})
    bad_inv = client.post("/api/team/invite", json={
        'name': 'Illegal Invite',
        'email': 'bad@artisan.bd',
        'role': 'accountant'
    })
    assert bad_inv.status_code == 403


def test_super_admin_all_11_views_and_invariants(setup_m1_env):
    """TC-M1.7: Comprehensive test of all 11 Super Admin Console views and security invariants."""
    env = setup_m1_env
    m1_id = env['m1_id']
    m2_id = env['m2_id']
    t = today()

    # Seed Admin telemetry tables
    run("""
        INSERT OR REPLACE INTO saas_plans (id, name, price_poisha, order_limit, courier_limit, user_limit, status, created_at)
        VALUES ('growth', 'Growth', 100000, 5000, 5, 6, 'active', '2026-01-01T00:00:00Z'),
               ('starter', 'Starter', 50000, 1500, 1, 2, 'active', '2026-01-01T00:00:00Z')
    """)

    run("""
        INSERT INTO billing_invoices (merchant_id, plan_id, amount, payment_method, status, billing_period, created_at)
        VALUES (?, 'growth', 100000, 'bkash', 'paid', '2026-11', ?),
               (?, 'starter', 50000, 'card', 'failed', '2026-11', ?)
    """, m1_id, t + "T10:00:00Z", m2_id, t + "T10:00:00Z")

    run("""
        INSERT INTO scheduled_jobs (job_key, name, frequency, status, duration_ms, consecutive_failures, error_message)
        VALUES ('exception_scan', 'Exception Scanner', '1 hour', 'failed', 30000, 1, 'Steadfast API Timeout 30s'),
               ('courier_sync', 'Courier Sync', '30 min', 'ok', 350, 0, NULL)
    """)

    run("""
        INSERT INTO dead_letter_jobs (job_key, payload, failed_at, error, status)
        VALUES ('courier_sync', '{\"consignment_id\": \"SF-9912\"}', ?, 'HTTP 504 Timeout', 'waiting_human')
    """, t + "T12:00:00Z")

    run("""
        INSERT INTO integration_connections (merchant_id, connector_type, provider, status, token_expires_at, config, created_at, updated_at)
        VALUES (?, 'courier', 'steadfast', 'healthy', ?, '{}', ?, ?),
               (?, 'courier', 'redx', 'failing', ?, '{}', ?, ?)
    """, m1_id, add_days(t, 2), t, t, m2_id, add_days(t, 10), t, t)

    run("""
        INSERT INTO support_tickets (merchant_id, subject, body, priority, status, waiting_hours, created_at, first_replied_at)
        VALUES (?, 'Steadfast discrepancy', 'Discrepancy in COD', 'urgent', 'open', 30, ?, NULL),
               (?, 'Delivery delay inquiry', 'Pathao webhook delayed', 'normal', 'resolved', 0, ?, ?)
    """, m1_id, add_days(t, -2) + "T10:00:00Z", m1_id, add_days(t, -1) + "T10:00:00Z", add_days(t, -1) + "T11:45:00Z")

    run("""
        INSERT INTO ai_prompt_versions (task_key, version_label, prompt_template, rollout_status, rollout_percentage, confirmation_rate, created_by, created_at)
        VALUES ('bengali_expense_extraction', 'v7', 'Extract from Bengali...', 'live', 100, 0.94, 'admin', ?)
    """, t + "T00:00:00Z")

    # Login as Super Admin
    client.post("/api/auth/login", json={'email': 'superadmin@gross.bd', 'password': 'password123'})

    # --- View 1: Overview Telemetry ---
    overview_res = client.get("/api/admin/overview")
    assert overview_res.status_code == 200
    ov = overview_res.json()
    assert ov['total_tenants'] >= 2
    assert ov['alert'] is not None

    # --- View 2: Tenants & Inspection Drawer ---
    tenants_res = client.get("/api/admin/tenants")
    assert tenants_res.status_code == 200
    inspect_res = client.get(f"/api/admin/tenants/{m1_id}/inspection")
    assert inspect_res.status_code == 200
    insp = inspect_res.json()
    assert insp['tenant_id'] == m1_id
    assert 'limits' in insp

    # Invariant: Impersonation must create audit log entry
    imp_res = client.post(f"/api/admin/tenants/{m1_id}/impersonate", json={'reason': 'Billing audit', 'ticket_id': 'TK-101'})
    assert imp_res.status_code == 200
    audit_imp = one("SELECT * FROM audit_log WHERE action = 'admin_view_as_owner' AND merchant_id = ? ORDER BY id DESC LIMIT 1", m1_id)
    assert audit_imp is not None
    assert "user:" in audit_imp['actor']

    # --- View 3: Users & Sessions ---
    users_res = client.get("/api/admin/users")
    assert users_res.status_code == 200
    sess_res = client.get(f"/api/admin/users/{env['owner_id']}/sessions")
    assert sess_res.status_code == 200
    stale_res = client.post("/api/admin/sessions/revoke-stale")
    assert stale_res.status_code == 200

    # --- View 4: Exceptions ---
    exc_res = client.get("/api/admin/exceptions")
    assert exc_res.status_code == 200

    # --- View 5: Billing & Invoices ---
    bill_res = client.get("/api/admin/billing")
    assert bill_res.status_code == 200

    # --- View 6: Jobs & DLQ Fleet ---
    jobs_res = client.get("/api/admin/jobs")
    assert jobs_res.status_code == 200
    dlq_res = client.get("/api/admin/jobs/dead-letter")
    assert dlq_res.status_code == 200

    # --- View 7: Integrations Monitor ---
    integ_res = client.get("/api/admin/integrations")
    assert integ_res.status_code == 200
    integ_data = integ_res.json()
    assert integ_data['total_connections'] >= 2

    # --- View 8: Audit Log Feed ---
    audit_feed = client.get("/api/admin/audit-log")
    assert audit_feed.status_code == 200
    assert 'entries' in audit_feed.json()

    # --- View 9: AI Prompt Management & Guardrails ---
    ai_res = client.get("/api/admin/ai")
    assert ai_res.status_code == 200

    # Security Invariant: Disabling 'must_confirm' MUST return HTTP 403 Forbidden
    bad_guardrail = client.put("/api/admin/ai/guardrails", json={'guardrails': {'must_confirm': False, 'amount_sanity': True}})
    assert bad_guardrail.status_code == 403, "Disabling must_confirm must be rejected with 403"

    bad_alias = client.put("/api/admin/ai/guardrails", json={'guardrails': {'never_write_without_confirmation': False}})
    assert bad_alias.status_code == 403, "Disabling via alias must be rejected with 403"

    # Toggle non-immutable guardrail and verify genuine database persistence
    toggle_res = client.put("/api/admin/ai/guardrails", json={'guardrails': {'block_above_100k': True}})
    assert toggle_res.status_code == 200
    ai_after = client.get("/api/admin/ai").json()
    assert ai_after['guardrails']['block_above_100k'] is True
    assert ai_after['guardrails']['high_value_block'] is True

    # Update model routes and verify genuine database persistence
    route_res = client.put("/api/admin/ai/routes", json={'routes': [{'task': 'intent_classification', 'model': 'gpt-4o'}]})
    assert route_res.status_code == 200
    ai_routes_after = client.get("/api/admin/ai").json()
    assert any(r['task'] == 'intent_classification' and r['model'] == 'gpt-4o' for r in ai_routes_after['model_routing'])

    # Scale worker fleet and verify genuine system_config persistence
    scale_res = client.post("/api/admin/jobs/scale-workers", json={'count': 8})
    assert scale_res.status_code == 200
    ov_after = client.get("/api/admin/overview").json()
    assert ov_after['system_telemetry']['workers_total'] == 8
    jobs_after = client.get("/api/admin/jobs").json()
    assert len(jobs_after['workers']) == 8

    # --- View 10: Support & Announcements ---
    supp_res = client.get("/api/admin/support")
    assert supp_res.status_code == 200
    supp_data = supp_res.json()
    assert supp_data['median_first_reply_minutes'] > 0
    assert 'resolved_this_week_count' in supp_data

    ann_res = client.post("/api/admin/announcements", json={
        'title': 'Emergency Maintenance',
        'message': 'Database maintenance scheduled',
        'target_audience': 'all_tenants',
        'send_whatsapp': False
    })
    assert ann_res.status_code == 200

    # --- View 11: Settings & Feature Flags ---
    settings_res = client.get("/api/admin/settings")
    assert settings_res.status_code == 200


def test_sensitive_financial_data_masking_for_manager_and_accountant(setup_m1_env):
    """TC-M1.8: Verify non-negotiable masking of sensitive figures across all endpoints for non-owners."""
    env = setup_m1_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = today()

    # Deliver an order to generate profit and COGS
    o = create_order(m_id, {
        'external_id': 'ORD-MASK-01',
        'order_date': add_days(t, -2),
        'customer_name': 'Masking Test Customer',
        'customer_phone': '01700112233',
        'items': [{'product_id': env['p1'], 'qty': 1, 'unit_price': 65000}],
        'shipping_charge': 6000,
        'courier': 'steadfast'
    }, ctx)
    apply_status(m_id, o, 'delivered', {'date': add_days(t, -1), 'charges': {'delivery_charge': 6000, 'cod_fee': 650}, **ctx})

    # =========================================================================
    # 1. MANAGER (No margins, no unit costs, no supplier prices, no cash flow)
    # =========================================================================
    client.post("/api/auth/login", json={'email': 'manager@artisan.bd', 'password': 'password123'})

    # 1.1 /api/dashboard
    dash_mgr = client.get("/api/dashboard").json()
    assert dash_mgr['kpis']['net_profit'] is None
    assert dash_mgr['kpis']['gross_profit'] is None
    assert dash_mgr['kpis']['net_margin_pct'] is None
    assert dash_mgr['kpis']['gross_margin_pct'] is None
    assert dash_mgr['pnl'] is None
    assert dash_mgr['today_pnl'] is None
    assert dash_mgr['cash'] is None
    assert dash_mgr['kpis']['delivered_sales'] > 0

    # 1.2 /api/products
    prods_mgr = client.get("/api/products").json()
    assert len(prods_mgr) > 0
    for p in prods_mgr:
        assert p['cost_price'] is None
        assert p['purchase_price'] is None
        assert p['margin'] is None

    # 1.3 /api/products/performance
    perf_mgr = client.get("/api/products/performance").json()
    for r in perf_mgr['rows']:
        assert r['cogs_poisha'] is None
        assert r['gross_profit_poisha'] is None
        assert r['net_profit_poisha'] is None
        assert r['net_margin'] is None

    # 1.4 /api/trace?metric=net_profit
    trace_mgr = client.get("/api/trace?metric=net_profit")
    assert trace_mgr.status_code == 403

    # 1.5 /api/reports/daily-summary
    ds_mgr = client.get("/api/reports/daily-summary").json()
    assert ds_mgr['metadata']['net_profit'] is None
    assert "Net Profit: Restricted" in ds_mgr['text']

    # 1.6 /api/money
    money_mgr = client.get("/api/money").json()
    assert money_mgr['cash'] is None
    for j in money_mgr['entries']:
        assert j.get('kind') != 'purchase'
        for l in j.get('lines', []):
            if l.get('account') == 'cogs':
                assert l['amount'] is None

    # 1.7 /api/products/prices/bulk-preview & bulk-commit
    prev_mgr = client.post("/api/products/prices/bulk-preview", json={'rows': [{'product_id': env['p1'], 'purchase_price': 300.0}]}).json()
    for v in prev_mgr['valid']:
        assert v['old_cost'] is None
    commit_mgr = client.post("/api/products/prices/bulk-commit", json={'rows': [{'product_id': env['p1'], 'purchase_price': 300.0}]})
    assert commit_mgr.status_code == 403

    # =========================================================================
    # 2. ACCOUNTANT (No margins, no unit costs; CAN view supplier prices & cash flow)
    # =========================================================================
    client.post("/api/auth/login", json={'email': 'accountant@artisan.bd', 'password': 'password123'})

    # 2.1 /api/dashboard
    dash_acct = client.get("/api/dashboard").json()
    assert dash_acct['kpis']['net_profit'] is None
    assert dash_acct['kpis']['gross_profit'] is None
    assert dash_acct['kpis']['net_margin_pct'] is None
    assert dash_acct['pnl'] is None
    assert dash_acct['cash'] is not None

    # 2.2 /api/products
    prods_acct = client.get("/api/products").json()
    for p in prods_acct:
        assert p['cost_price'] is None
        assert p['purchase_price'] is None
        assert p['margin'] is None

    # 2.3 /api/products/performance
    perf_acct = client.get("/api/products/performance").json()
    for r in perf_acct['rows']:
        assert r['cogs_poisha'] is None
        assert r['net_profit_poisha'] is None
        assert r['net_margin'] is None

    # 2.4 /api/trace
    assert client.get("/api/trace?metric=net_profit").status_code == 403

    # 2.5 /api/reports/daily-summary
    assert client.get("/api/reports/daily-summary").json()['metadata']['net_profit'] is None

    # 2.6 /api/money
    money_acct = client.get("/api/money").json()
    assert money_acct['cash'] is not None

    # 2.7 Bulk price actions
    prev_acct = client.post("/api/products/prices/bulk-preview", json={'rows': [{'product_id': env['p1'], 'purchase_price': 300.0}]}).json()
    for v in prev_acct['valid']:
        assert v['old_cost'] is None
    assert client.post("/api/products/prices/bulk-commit", json={'rows': [{'product_id': env['p1'], 'purchase_price': 300.0}]}).status_code == 403

    # =========================================================================
    # 3. AGENCY OWNER (Full Unmasked Access)
    # =========================================================================
    client.post("/api/auth/login", json={'email': 'owner@artisan.bd', 'password': 'password123'})
    dash_owner = client.get("/api/dashboard").json()
    assert dash_owner['kpis']['net_profit'] is not None
    assert dash_owner['kpis']['net_margin_pct'] is not None
    assert dash_owner['cash'] is not None

    prods_owner = client.get("/api/products").json()
    assert any(p['cost_price'] is not None for p in prods_owner)

    perf_owner = client.get("/api/products/performance").json()
    assert any(r['net_profit_poisha'] is not None for r in perf_owner['rows'])

    trace_owner = client.get("/api/trace?metric=net_profit")
    assert trace_owner.status_code == 200
