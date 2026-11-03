"""
Product performance report tests: revenue/COGS per delivered product, courier
fee apportionment per order, duplicates excluded, rows sorted by profit.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import open_db, one
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product
from app.domain.orders import create_order, apply_status
from app.domain.entries import record_ad_spend
from app.domain.exceptions import seed_reason_codes
from app.lib.dates import reset_clock

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()


def _merchant():
    m_id = create_merchant({'name': 'Perf Tests'})
    u_id = create_user(m_id, {'name': 'Owner', 'email': 'pf@y.bd', 'role': 'owner', 'password': 'pw123456'})
    login = client.post("/api/auth/login", json={'email': 'pf@y.bd', 'password': 'pw123456'})
    assert login.status_code == 200
    return m_id, u_id


def test_product_performance_rows_and_sorting():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p1 = upsert_product(m_id, {'name': 'T-Shirt', 'sku': 'TS', 'selling_price': 100000, 'purchase_price': 40000}, ctx)
    p2 = upsert_product(m_id, {'name': 'Hoodie', 'sku': 'HD', 'selling_price': 200000, 'purchase_price': 100000}, ctx)
    p3 = upsert_product(m_id, {'name': 'Cap', 'selling_price': 50000}, ctx)  # no cost — never delivered

    # P1: delivered once, fees 3000 → profit 100000 − 40000 − 3000 = 57000
    o1 = create_order(m_id, {
        'order_date': '2026-11-01', 'customer_phone': '01714000000', 'courier': 'steadfast',
        'items': [{'product_id': p1, 'qty': 1, 'unit_price': 100000}],
    }, ctx)
    apply_status(m_id, o1, 'delivered', {'date': '2026-11-02', 'charges': {'delivery_charge': 3000}, **ctx})

    # P2: delivered once, fees 3000 → profit 200000 − 100000 − 3000 = 97000
    o2 = create_order(m_id, {
        'order_date': '2026-11-01', 'customer_phone': '01714000001', 'courier': 'steadfast',
        'items': [{'product_id': p2, 'qty': 1, 'unit_price': 200000}],
    }, ctx)
    apply_status(m_id, o2, 'delivered', {'date': '2026-11-02', 'charges': {'delivery_charge': 3000}, **ctx})

    # P3: only placed — still appears, revenue 0
    create_order(m_id, {
        'order_date': '2026-11-01', 'customer_phone': '01714000002',
        'items': [{'product_id': p3, 'qty': 1, 'unit_price': 50000}],
    }, ctx)

    # A duplicate does not inflate order counts (the flag is on the new order)
    create_order(m_id, {
        'order_date': '2026-11-02', 'customer_phone': '01714000000',
        'items': [{'product_id': p1, 'qty': 1, 'unit_price': 100000}],
    }, ctx)
    dup = one("SELECT 1 AS v FROM orders WHERE is_duplicate = TRUE")
    assert dup

    record_ad_spend(m_id, {'amount': 50000, 'date': '2026-11-01', 'note': 'boost'}, ctx)

    res = client.get("/api/products/performance?from=2026-11-01&to=2026-11-30")
    assert res.status_code == 200
    data = res.json()
    assert data['from'] == '2026-11-01'
    assert data['unattributed_ad_spend_poisha'] == 50000

    by_pid = {r['product_id']: r for r in data['rows']}
    assert set(by_pid) == {p1, p2, p3}

    r1 = by_pid[p1]
    assert r1['orders_placed'] == 1                # the duplicate is excluded
    assert r1['delivered'] == 1
    assert r1['revenue_poisha'] == 100000
    assert r1['cogs_poisha'] == 40000
    assert r1['courier_cost_poisha'] == 3000
    assert r1['net_profit_poisha'] == 57000
    assert r1['delivered_pct'] == 1.0

    r2 = by_pid[p2]
    assert r2['net_profit_poisha'] == 97000
    assert r2['net_margin'] == round(97000 / 200000, 3)

    r3 = by_pid[p3]
    assert r3['orders_placed'] == 1
    assert r3['delivered'] == 0
    assert r3['revenue_poisha'] == 0

    # Sorted by net profit, best first
    profits = [r['net_profit_poisha'] for r in data['rows']]
    assert profits == sorted(profits, reverse=True)
    assert profits[0] == 97000
