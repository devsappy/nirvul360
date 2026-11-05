import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product, stock_qty
from app.lib.dates import reset_clock

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()

def test_pos_products_and_checkout():
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
        'selling_price': 150000, # ৳1500
        'purchase_price': 70000, # ৳700
        'stock_qty': 50,
    }, {'source': 'manual', 'actor': f'user:{u_id}'})

    # 1. Login
    login_res = client.post("/api/auth/login", json={'email': 'owner@demo.bd', 'password': 'password123'})
    assert login_res.status_code == 200

    # 2. Fetch active POS products
    res = client.get("/api/pos/products")
    assert res.status_code == 200
    data = res.json()
    assert "products" in data
    assert len(data["products"]) == 1
    assert data["products"][0]["name"] == "Cotton Polo Shirt"
    assert data["products"][0]["selling_price_bdt"] == 1500.0

    # 3. Complete in-store POS checkout
    payload = {
        "items": [
            {
                "product_id": p_id,
                "qty": 2,
                "unit_price": 1500.0
            }
        ],
        "customer_name": "Rahim Khan (In-Store)",
        "customer_phone": "01811223344",
        "discount": 100.0,
        "payment_method": "cash",
        "tendered": 3000.0,
        "note": "POS Counter 1 Sale"
    }

    checkout_res = client.post("/api/pos/checkout", json=payload)
    assert checkout_res.status_code == 200
    receipt = checkout_res.json()

    assert receipt["success"] is True
    assert "receipt_no" in receipt
    assert receipt["receipt_no"].startswith("POS-")
    assert receipt["customer_name"] == "Rahim Khan (In-Store)"
    assert receipt["items_count"] == 2
    assert receipt["subtotal"] == 3000.0
    assert receipt["discount"] == 100.0
    assert receipt["total"] == 2900.0
    assert receipt["tendered"] == 3000.0
    assert receipt["change"] == 100.0

    # 4. Verify real-time stock deduction
    assert stock_qty(p_id) == 48

    # 5. Verify order in POS orders history
    history_res = client.get("/api/pos/orders")
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history["orders"]) == 1
    assert history["orders"][0]["external_id"] == receipt["receipt_no"]
    assert history["orders"][0]["customer_name"] == "Rahim Khan (In-Store)"
    assert history["summary"]["today_orders_count"] == 1
    assert history["summary"]["today_revenue_bdt"] == 2900.0
