import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, run, one
from app.domain.merchants import create_merchant, create_user
from app.domain.roles import PERMISSIONS_MATRIX
from app.lib.dates import reset_clock, today

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_team_test():
    open_db(":memory:")
    reset_clock()
    m_id = create_merchant({'name': 'Chatterify', 'phone': '01911000002'})

    owner_id = create_user(m_id, {
        'name': 'Tamim Hossain',
        'email': 'owner@chatterify.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    manager_id = create_user(m_id, {
        'name': 'Nabila Jahan',
        'email': 'manager@chatterify.bd',
        'role': 'manager',
        'password': 'password123'
    })

    accountant_id = create_user(m_id, {
        'name': 'Shadman Amin',
        'email': 'accountant@chatterify.bd',
        'role': 'accountant',
        'password': 'password123'
    })

    client.post("/api/auth/login", json={'email': 'owner@chatterify.bd', 'password': 'password123'})
    return {'merchant_id': m_id, 'owner_id': owner_id, 'manager_id': manager_id, 'accountant_id': accountant_id}

def test_team_matrix_and_financial_margin_flags(setup_team_test):
    res = client.get("/api/team")
    assert res.status_code == 200
    data = res.json()

    assert data['member_count'] >= 3
    matrix = data['permissions_matrix']
    assert len(matrix) == 11

    # Check rows 5, 6, 7 are flagged as is_financial_margin
    margin_rows = [r for r in matrix if r.get('is_financial_margin') is True]
    assert len(margin_rows) == 3
    areas = [r['area'] for r in margin_rows]
    assert "Net profit and net margin" in areas
    assert "Product margins and cost prices" in areas
    assert "Supplier purchase prices" in areas

    # Hidden for manager and accountant
    for r in margin_rows:
        assert r['owner'] == "Can see"
        assert r['manager'] == "Hidden"
        assert r['accountant'] == "Hidden"

def test_team_invite_owner_only_and_duplicate_handling(setup_team_test):
    # Owner invites new accountant
    res = client.post("/api/team/invite", json={
        'name': 'Rafiq Khan',
        'email': 'rafiq@chatterify.bd',
        'role': 'accountant',
        'scope': 'current_store'
    })
    assert res.status_code == 200
    inv = res.json()
    assert inv['status'] == 'invited'
    user_id = inv['id']

    # Duplicate email rejected
    dup_res = client.post("/api/team/invite", json={
        'name': 'Rafiq Duplicate',
        'email': 'rafiq@chatterify.bd',
        'role': 'accountant'
    })
    assert dup_res.status_code == 400

    # Role update
    upd_res = client.put(f"/api/team/{user_id}/role", json={'role': 'manager'})
    assert upd_res.status_code == 200
    assert upd_res.json()['ok'] is True

    # Manager cannot invite
    client.post("/api/auth/login", json={'email': 'manager@chatterify.bd', 'password': 'password123'})
    bad_res = client.post("/api/team/invite", json={
        'name': 'Unauthorized',
        'email': 'unauth@chatterify.bd',
        'role': 'manager'
    })
    assert bad_res.status_code == 403
