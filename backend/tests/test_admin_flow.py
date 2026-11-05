import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.domain.orders import create_order
from app.lib.dates import reset_clock, today

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()

def test_admin_flow_and_tenant_switching():
    # Setup Tenant 1 and Super Admin
    m1_id = create_merchant({'name': 'Alpha Store', 'phone': '01900000001'})
    create_user(m1_id, {
        'name': 'Chief Super Admin',
        'email': 'superadmin@gross.bd',
        'role': 'super_admin',
        'password': 'password123'
    })

    # Setup Tenant 2
    m2_id = create_merchant({'name': 'Beta Electronics', 'phone': '01900000002'})
    create_user(m2_id, {
        'name': 'Beta Owner',
        'email': 'owner@beta.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    # Add a product and order to Tenant 2
    from app.domain.products import upsert_product
    p_id = upsert_product(m2_id, {'name': 'Beta Device', 'selling_price': 50000}, {'source': 'manual', 'actor': 'test'})
    create_order(m2_id, {
        'external_id': 'ORD-BETA-01',
        'order_date': today(),
        'customer_name': 'Beta Customer',
        'customer_phone': '01700000000',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 50000}],
        'shipping_charge': 6000,
    }, {'source': 'manual', 'actor': 'test'})

    # 1. Login as Super Admin
    login_res = client.post("/api/auth/login", json={'email': 'superadmin@gross.bd', 'password': 'password123'})
    assert login_res.status_code == 200
    assert login_res.json()['user']['role'] == 'super_admin'

    # 2. Get /api/admin/tenants
    tenants_res = client.get("/api/admin/tenants")
    assert tenants_res.status_code == 200
    tenants = tenants_res.json()['tenants']
    assert len(tenants) == 2
    tenant_ids = [t['id'] for t in tenants]
    assert m1_id in tenant_ids
    assert m2_id in tenant_ids

    # 3. Get /api/admin/activity
    act_res = client.get("/api/admin/activity")
    assert act_res.status_code == 200
    assert 'activity' in act_res.json()

    # 4. Switch context to Tenant 2
    switch_res = client.post("/api/admin/switch-tenant", json={'merchant_id': m2_id})
    assert switch_res.status_code == 200
    assert switch_res.json()['ok'] is True
    assert switch_res.json()['active_merchant_id'] == m2_id

    # 5. Check /api/me after switch
    me_res = client.get("/api/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data['merchant']['id'] == m2_id
    assert me_data['merchant']['name'] == 'Beta Electronics'

    # 6. Check /api/orders returns Tenant 2 orders
    orders_res = client.get("/api/orders")
    assert orders_res.status_code == 200
    orders_data = orders_res.json()
    orders = orders_data['rows']
    assert len(orders) == 1
    assert orders[0]['external_id'] == 'ORD-BETA-01'

def test_admin_pause_and_resume_tenant():
    m_id = create_merchant({'name': 'Payment Overdue Store', 'phone': '01900000003'})
    create_user(m_id, {
        'name': 'Tenant Agency Owner',
        'email': 'overdue_owner@test.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })
    create_user(m_id, {
        'name': 'System Super Admin',
        'email': 'super_pause@gross.bd',
        'role': 'super_admin',
        'password': 'password123'
    })

    # 1. Login as Super Admin and pause Tenant
    client.post("/api/auth/login", json={'email': 'super_pause@gross.bd', 'password': 'password123'})
    pause_res = client.post(f"/api/admin/tenants/{m_id}/pause", json={'reason': 'Subscription invoice #1042 overdue'})
    assert pause_res.status_code == 200
    assert pause_res.json()['status'] == 'paused'
    assert '1042 overdue' in pause_res.json()['paused_reason']

    # 2. Verify /api/admin/tenants lists it as paused
    tenants_res = client.get("/api/admin/tenants")
    target = next(t for t in tenants_res.json()['tenants'] if t['id'] == m_id)
    assert target['status'] == 'paused'
    assert target['paused_reason'] == 'Subscription invoice #1042 overdue'

    # 3. Super Admin inspecting paused tenant CAN still access
    switch_res = client.post("/api/admin/switch-tenant", json={'merchant_id': m_id})
    assert switch_res.status_code == 200
    dash_res = client.get("/api/dashboard")
    assert dash_res.status_code == 200

    # 4. Now logout and login as the Tenant Agency Owner
    client.post("/api/auth/logout")
    login_owner = client.post("/api/auth/login", json={'email': 'overdue_owner@test.bd', 'password': 'password123'})
    assert login_owner.status_code == 200

    # /api/me should succeed so frontend knows account is paused
    me_res = client.get("/api/me")
    assert me_res.status_code == 200
    assert me_res.json()['merchant']['status'] == 'paused'
    assert me_res.json()['merchant']['paused_reason'] == 'Subscription invoice #1042 overdue'

    # Operational routes must return 403 Forbidden
    orders_res = client.get("/api/orders")
    assert orders_res.status_code == 403
    assert "Account paused" in orders_res.json()['detail']

    # 5. Login back as Super Admin and resume the tenant
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={'email': 'super_pause@gross.bd', 'password': 'password123'})
    resume_res = client.post(f"/api/admin/tenants/{m_id}/resume")
    assert resume_res.status_code == 200
    assert resume_res.json()['status'] == 'active'

    # 6. Tenant Owner can now access orders normally
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={'email': 'overdue_owner@test.bd', 'password': 'password123'})
    orders_res2 = client.get("/api/orders")
    assert orders_res2.status_code == 200

def test_admin_list_platform_users():
    m_id = create_merchant({'name': 'User Test Store', 'phone': '01900000004'})
    create_user(m_id, {
        'name': 'Chief Super Admin',
        'email': 'super_users@gross.bd',
        'role': 'super_admin',
        'password': 'password123'
    })
    create_user(m_id, {
        'name': 'Regular Owner',
        'email': 'regular_owner@test.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    # 1. Login as Super Admin
    client.post("/api/auth/logout")
    login_res = client.post("/api/auth/login", json={'email': 'super_users@gross.bd', 'password': 'password123'})
    assert login_res.status_code == 200

    # 2. Fetch /api/admin/users
    res = client.get("/api/admin/users")
    assert res.status_code == 200
    data = res.json()
    assert "summary" in data
    assert "users" in data
    assert data["summary"]["total_users"] >= 2
    assert data["summary"]["active_users"] >= 1
    # Check that super_users is listed and active
    user_match = next((u for u in data["users"] if u["email"] == "super_users@gross.bd"), None)
    assert user_match is not None
    assert user_match["is_active"] is True
    assert user_match["role"] == "super_admin"

