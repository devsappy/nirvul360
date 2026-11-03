import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product
from app.lib.dates import reset_clock

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()

def test_inventory_and_store_integration_flow():
    m_id = create_merchant({'name': 'Fashion Hub', 'phone': '01900000003'})
    u_id = create_user(m_id, {
        'name': 'Tamim Ahmed',
        'email': 'owner@demo.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    # Initial product
    p_id = upsert_product(m_id, {
        'name': 'Cotton Polo Shirt',
        'sku': 'POLO-01',
        'selling_price': 150000,
        'purchase_price': 70000,
        'stock_qty': 50,
    }, {'source': 'manual', 'actor': f'user:{u_id}'})

    # 1. Login as Agency Owner
    login_res = client.post("/api/auth/login", json={'email': 'owner@demo.bd', 'password': 'password123'})
    assert login_res.status_code == 200
    assert login_res.json()['ok'] is True

    # 2. Fetch products
    prods_res = client.get("/api/products")
    assert prods_res.status_code == 200
    prods = prods_res.json()
    assert len(prods) == 1
    assert prods[0]['name'] == 'Cotton Polo Shirt'
    assert prods[0]['active'] is True

    # 3. Toggle product status (active -> False)
    toggle_res = client.patch(f"/api/products/{p_id}/status", json={'active': False})
    assert toggle_res.status_code == 200
    assert toggle_res.json()['active'] is False

    # Verify toggle persisted
    prods_after_toggle = client.get("/api/products").json()
    assert prods_after_toggle[0]['active'] is False

    # 4. Update product selling price & cost price
    price_res = client.patch(f"/api/products/{p_id}/price", json={'selling_price': 1750, 'cost_price': 800})
    assert price_res.status_code == 200
    assert price_res.json()['ok'] is True

    # Verify updated price (in poisha: 1750 taka = 175000 poisha, 800 taka = 80000 poisha)
    prods_after_price = client.get("/api/products").json()
    assert prods_after_price[0]['selling_price'] == 175000
    assert prods_after_price[0]['purchase_price'] == 80000

    # 5. Connect store website
    store_res = client.post("/api/integrations/store", json={
        'platform': 'wordpress',
        'store_url': 'https://demo-woocommerce.local',
        'api_key': 'ck_demo123456',
        'api_secret': 'cs_demo654321',
        'auto_sync': True
    })
    assert store_res.status_code == 200
    assert store_res.json()['status'] == 'connected'

    # 6. Pull inventory from store
    pull_res = client.post("/api/integrations/store/pull-inventory", json={'platform': 'wordpress'})
    assert pull_res.status_code == 200
    assert pull_res.json()['ok'] is True
    assert pull_res.json()['pulled_count'] > 0

    # 7. Check products after pulling
    prods_after_pull = client.get("/api/products").json()
    assert len(prods_after_pull) > 1
