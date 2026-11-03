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
