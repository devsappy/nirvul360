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
