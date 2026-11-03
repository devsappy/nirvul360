import pytest
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.domain.roles import (
    role_rank, can_connect_integrations, can_add_misc_expense,
    can_add_product_expense, can_use_whatsapp_expense
)
from app.domain.products import upsert_product
from app.domain.entries import record_expense, record_purchase

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")

def test_hierarchy_role_ranks():
    assert role_rank("super_admin") == 4
    assert role_rank("admin") == 3
    assert role_rank("agency_owner") == 2
    assert role_rank("owner") == 2
    assert role_rank("accountant") == 1

def test_hierarchy_permissions():
    # Agency Owner
    assert can_connect_integrations("agency_owner") is True
    assert can_add_misc_expense("agency_owner") is True
    assert can_add_product_expense("agency_owner") is True
    assert can_use_whatsapp_expense("agency_owner") is True

    # Accountant
    assert can_connect_integrations("accountant") is False  # Must be blocked!
    assert can_add_misc_expense("accountant") is True
    assert can_add_product_expense("accountant") is True
    assert can_use_whatsapp_expense("accountant") is True

def test_accountant_can_record_misc_expense():
    m_id = create_merchant({'name': 'Test Store'})
    u_id = create_user(m_id, {'name': 'Karim Accountant', 'email': 'acc@test.bd', 'role': 'accountant'})

    jid = record_expense(m_id, {
        'head': 'rent',
        'amount': 1500000,
        'date': '2026-10-31',
        'note': 'Office rent',
    }, {'source': 'manual', 'actor': f'user:{u_id}'})

    assert isinstance(jid, int)
    assert jid > 0

def test_accountant_can_record_product_purchase():
    m_id = create_merchant({'name': 'Test Store'})
    u_id = create_user(m_id, {'name': 'Karim Accountant', 'email': 'acc@test.bd', 'role': 'accountant'})

    pid = upsert_product(m_id, {'name': 'Cotton Shirt', 'selling_price': 50000}, {'source': 'manual', 'actor': f'user:{u_id}'})
    pur_id = record_purchase(m_id, {
        'productId': pid,
        'qty': 20,
        'unitCost': 25000,
        'date': '2026-10-31',
    }, {'source': 'manual', 'actor': f'user:{u_id}'})

    assert isinstance(pur_id, int)
    assert pur_id > 0

def test_accountant_cannot_pause_product_while_owner_can():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)

    m_id = create_merchant({'name': 'Hierarchy Check Store'})
    create_user(m_id, {'name': 'Owner User', 'email': 'owner_pause@test.bd', 'role': 'agency_owner', 'password': 'password123'})
    create_user(m_id, {'name': 'Accountant User', 'email': 'acc_pause@test.bd', 'role': 'accountant', 'password': 'password123'})

    pid = upsert_product(m_id, {'name': 'Silk Shirt', 'selling_price': 50000, 'active': True}, {'source': 'manual', 'actor': 'test'})

    # 1. Login as Accountant
    client.post("/api/auth/login", json={'email': 'acc_pause@test.bd', 'password': 'password123'})

    # Accountant attempt to pause product -> MUST BE 403 Forbidden!
    res_acc = client.patch(f"/api/products/{pid}/status", json={'active': False})
    assert res_acc.status_code == 403
    assert "Accountants are not authorized to pause" in res_acc.json()['detail']

    # Accountant attempt to bulk upload -> MUST BE 403 Forbidden!
    bulk_res_acc = client.post("/api/products/bulk", json={'products': [{'name': 'New Hat', 'selling_price': 500}]})
    assert bulk_res_acc.status_code == 403

    # 2. Login as Agency Owner
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={'email': 'owner_pause@test.bd', 'password': 'password123'})

    # Owner pauses product -> 200 OK!
    res_owner = client.patch(f"/api/products/{pid}/status", json={'active': False})
    assert res_owner.status_code == 200
    assert res_owner.json()['active'] is False

    # Owner unpauses/resumes product -> 200 OK!
    res_resume = client.patch(f"/api/products/{pid}/status", json={'active': True})
    assert res_resume.status_code == 200
    assert res_resume.json()['active'] is True

    # Owner bulk uploads products -> 200 OK!
    bulk_res_owner = client.post("/api/products/bulk", json={
        'products': [
            {'sku': 'BULK-1', 'name': 'Bulk Polo', 'selling_price': 800, 'cost_price': 400, 'stock_qty': 15},
            {'sku': 'BULK-2', 'name': 'Bulk Cap', 'selling_price': 300, 'cost_price': 120, 'stock_qty': 30}
        ]
    })
    assert bulk_res_owner.status_code == 200
    assert bulk_res_owner.json()['created'] == 2
