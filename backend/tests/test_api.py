import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.lib.dates import reset_clock

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup():
    open_db(":memory:")
    reset_clock()

def test_api_system_status():
    res = client.get("/api/system/status")
    assert res.status_code == 401

def test_api_auth_and_hierarchy():
    m_id = create_merchant({'name': 'Alpha Store', 'phone': '01900000000'})
    create_user(m_id, {
        'phone': '01911111111',
        'role': 'agency_owner',
        'full_name': 'Agency Leader',
        'password': 'pass_agency_123'
    })
    create_user(m_id, {
        'phone': '01922222222',
        'role': 'accountant',
        'full_name': 'Junior Accountant',
        'password': 'pass_acc_123'
    })

    # Login as Accountant
    login_acc = client.post("/api/auth/login", json={'phone': '01922222222', 'password': 'pass_acc_123'})
    assert login_acc.status_code == 200
    assert login_acc.json()['user']['role'] == 'accountant'

    # Accountant trying to connect courier integration -> 403 Forbidden!
    courier_attempt = client.post("/api/integrations/courier", json={'courier': 'steadfast', 'apiKey': 'xyz123', 'secretKey': 'abc'})
    assert courier_attempt.status_code == 403
    assert "Agency Owner" in courier_attempt.json()['detail']

    # Accountant recording offline misc expense -> Allowed!
    exp_attempt = client.post("/api/expenses", json={
        'amount': 35000,
        'expense_head': 'packaging',
        'date': '2026-10-31',
        'note': 'Boxes bought offline'
    })
    assert exp_attempt.status_code == 200
    assert exp_attempt.json()['status'] == 'posted'

    # Switch session: Login as Agency Owner
    login_owner = client.post("/api/auth/login", json={'phone': '01911111111', 'password': 'pass_agency_123'})
    assert login_owner.status_code == 200

    # Agency Owner connecting courier integration -> 200 OK!
    courier_success = client.post("/api/integrations/courier", json={'courier': 'steadfast', 'apiKey': 'key_abc_123', 'secretKey': 'sec_xyz_789'})
    assert courier_success.status_code == 200
    assert courier_success.json()['status'] == 'connected'

def test_api_daily_summary_and_reports():
    m_id = create_merchant({'name': 'Beta Store'})
    create_user(m_id, {
        'email': 'owner@beta.bd',
        'role': 'agency_owner',
        'name': 'Beta Owner',
        'password': 'password123'
    })
    login = client.post("/api/auth/login", json={'email': 'owner@beta.bd', 'password': 'password123'})
    assert login.status_code == 200

    res = client.get("/api/reports/daily-summary")
    assert res.status_code == 200
    data = res.json()
    assert "Daily Summary" in data["text"]
    assert "metadata" in data
    assert "revenue" in data["metadata"]
    assert "net_profit" in data["metadata"]

def test_api_order_status_put_and_post():
    from app.domain.products import upsert_product
    m_id = create_merchant({'name': 'Gamma Store'})
    u_id = create_user(m_id, {
        'email': 'owner@gamma.bd',
        'role': 'agency_owner',
        'name': 'Gamma Owner',
        'password': 'password123'
    })
    login = client.post("/api/auth/login", json={'email': 'owner@gamma.bd', 'password': 'password123'})
    assert login.status_code == 200

    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'Polo', 'selling_price': 100000, 'purchase_price': 40000}, ctx)

    # Create order
    create_res = client.post("/api/orders", json={
        'customer_name': 'Test Customer',
        'customer_phone': '01700000099',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 1000}]
    })
    assert create_res.status_code == 200
    order_id = create_res.json()['id']

    # Test PUT status update (called by frontend OrdersView.tsx)
    put_res = client.put(f"/api/orders/{order_id}/status", json={'status': 'in_transit'})
    assert put_res.status_code == 200
    assert put_res.json()['status'] == 'in_transit'

    # Test POST status update (delivered)
    post_res = client.post(f"/api/orders/{order_id}/status", json={'status': 'delivered'})
    assert post_res.status_code == 200
    assert post_res.json()['status'] == 'delivered'

def test_api_money_and_recent_entries():
    m_id = create_merchant({'name': 'Delta Store'})
    create_user(m_id, {
        'email': 'owner@delta.bd',
        'role': 'agency_owner',
        'name': 'Delta Owner',
        'password': 'password123'
    })
    login = client.post("/api/auth/login", json={'email': 'owner@delta.bd', 'password': 'password123'})
    assert login.status_code == 200

    # Add expense
    exp = client.post("/api/expenses", json={
        'amount': 2500,
        'expense_head': 'transport',
        'note': 'Rickshaw fare'
    })
    assert exp.status_code == 200

    # GET /api/money
    money_res = client.get("/api/money")
    assert money_res.status_code == 200
    money_data = money_res.json()
    assert "entries" in money_data
    assert len(money_data["entries"]) >= 1
    first_entry = money_data["entries"][0]
    assert "lines" in first_entry
    assert isinstance(first_entry["lines"], list)
    assert len(first_entry["lines"]) == 2  # balanced double entry (transport + cash)

