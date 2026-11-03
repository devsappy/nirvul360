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
    assert res.status_code == 200
    data = res.json()
    assert data['status'] == 'ok'
    assert 'db' in data
    assert 'active_listeners' in data

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
