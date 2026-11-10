"""
Milestone 3 Iteration 2 Adversarial Challenger Test Suite
Empirically verifies:
1. Endpoint /api/orders list calculation & profit metrics
2. Endpoint /api/orders/{id} order waterfall & courier charges breakdown
3. Invariant: net_profit = delivered_value - cogs - courier_charges - packaging - ad_spend
4. Complete absence of hardcoded waterfall constants (70.0, 25.0, 52.0, 10.0, 53.0, 9500, 1000, 5300, 5200)
5. Endpoint /api/settlements (catalog, preview-json, receivables-summary, commit)
6. Endpoint /api/reports/product-performance (SKU economics, missing cost quarantine, footnote reconciliation)
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import open_db, one, all as db_all
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product
from app.domain.orders import create_order, apply_status, get_order
from app.domain.ledger import post
from app.domain.exceptions import seed_reason_codes
from app.lib.dates import reset_clock, today
from app.lib.money import to_poisha

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db():
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()

def _setup_merchant_and_user(name="M3 Adv Store"):
    m_id = create_merchant({'name': name})
    u_id = create_user(m_id, {
        'name': 'Adv Owner',
        'email': 'owner@m3adv.bd',
        'role': 'owner',
        'password': 'password123'
    })
    res = client.post("/api/auth/login", json={'email': 'owner@m3adv.bd', 'password': 'password123'})
    assert res.status_code == 200
    return m_id, u_id


def test_order_detail_zero_fee_delivered_order():
    """Verify order detail when order is delivered with NO courier, pack, or ad journals."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p_id = upsert_product(m_id, {
        'name': 'Cotton Panjabi',
        'sku': 'PAN-01',
        'purchase_price': 60000, # ৳600 COGS
        'selling_price': 150000, # ৳1500 Total
        'stock_qty': 10
    }, ctx)

    o_id = create_order(m_id, {
        'customer_name': 'Karim Khan',
        'customer_phone': '01811223344',
        'address': 'Chittagong',
        'courier': 'Steadfast',
        'consignment_id': 'STD-9901',
        'items': [{'product_id': p_id, 'name': 'Cotton Panjabi', 'qty': 2, 'unit_price': 150000}],
        'total': 300000 # ৳3000
    }, ctx)

    apply_status(m_id, o_id, 'delivered', ctx)

    # Test /api/orders
    res = client.get("/api/orders")
    assert res.status_code == 200
    orders_data = res.json()
    assert len(orders_data['rows']) == 1
    o_row = orders_data['rows'][0]

    # Total COGS = 2 * 600 = ৳1200 (120,000 poisha)
    # Delivered Total = ৳3000 (300,000 poisha)
    # With 0 fees, profit = 300,000 - 120,000 = 180,000 poisha = ৳1800.00
    assert o_row['profit_poisha'] == 180000
    assert o_row['profit_taka'] == 1800.0

    # Test /api/orders/{id}
    res = client.get(f"/api/orders/{o_id}")
    assert res.status_code == 200
    detail = res.json()

    cb = detail['courier_charges_breakdown']
    wf = detail['waterfall']

    # CRUCIAL: Must NOT emit mockup constants 70.0, 25.0, 52.0
    assert cb['delivery_charge'] == 0.0, f"Expected 0.0, got {cb['delivery_charge']}"
    assert cb['cod_fee'] == 0.0, f"Expected 0.0, got {cb['cod_fee']}"
    assert cb['return_fee'] == 0.0, f"Expected 0.0, got {cb['return_fee']}"
    assert cb['total'] == 0.0

    # CRUCIAL: Waterfall must NOT emit 10.0 or 53.0
    assert wf['delivered_value'] == 3000.0
    assert wf['cogs'] == 1200.0
    assert wf['courier_charges'] == 0.0
    assert wf['packaging'] == 0.0
    assert wf['ad_spend'] == 0.0
    assert wf['net_profit'] == 1800.0

    # Mathematical consistency
    calc_profit = round(wf['delivered_value'] - wf['cogs'] - wf['courier_charges'] - wf['packaging'] - wf['ad_spend'], 2)
    assert wf['net_profit'] == calc_profit


def test_order_detail_with_explicit_custom_journal_fees():
    """Verify waterfall with arbitrary, non-mockup fee values from ledger journals."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p_id = upsert_product(m_id, {
        'name': 'Silk Scarf',
        'sku': 'SCF-02',
        'purchase_price': 25000, # ৳250 COGS
        'selling_price': 80000,  # ৳800 Total
        'stock_qty': 5
    }, ctx)

    o_id = create_order(m_id, {
        'customer_name': 'Fatima',
        'customer_phone': '01911223344',
        'address': 'Sylhet',
        'courier': 'Pathao',
        'consignment_id': 'PTH-8821',
        'items': [{'product_id': p_id, 'name': 'Silk Scarf', 'qty': 1, 'unit_price': 80000}],
        'total': 80000 # ৳800
    }, ctx)

    apply_status(m_id, o_id, 'delivered', ctx)

    # Post custom ledger entries for this order
    # Delivery fee: ৳130 (13,000 poisha)
    # COD fee: ৳45 (4,500 poisha)
    # Packaging: ৳30 (3,000 poisha)
    # Ad spend: ৳85 (8,500 poisha)
    post({
        'merchant_id': m_id,
        'kind': 'operational_expense',
        'date': today(),
        'source': 'manual',
        'created_by': f'user:{u_id}',
        'order_id': o_id,
    }, [
        {'account': 'courier_delivery', 'amount': 13000, 'order_id': o_id},
        {'account': 'courier_cod_fee', 'amount': 4500, 'order_id': o_id},
        {'account': 'packaging', 'amount': 3000, 'order_id': o_id},
        {'account': 'ad_spend', 'amount': 8500, 'order_id': o_id},
        {'account': 'cash', 'amount': -29000, 'order_id': o_id},
    ])

    res = client.get(f"/api/orders/{o_id}")
    assert res.status_code == 200
    detail = res.json()

    cb = detail['courier_charges_breakdown']
    wf = detail['waterfall']

    # Verify custom fees
    assert cb['delivery_charge'] == 130.0
    assert cb['cod_fee'] == 45.0
    assert cb['return_fee'] == 0.0
    assert cb['total'] == 175.0

    # Verify waterfall
    assert wf['delivered_value'] == 800.0
    assert wf['cogs'] == 250.0
    assert wf['courier_charges'] == 175.0
    assert wf['packaging'] == 30.0
    assert wf['ad_spend'] == 85.0

    # Expected net profit: 800 - 250 - 175 - 30 - 85 = ৳260.0
    assert wf['net_profit'] == 260.0
    assert detail['profit_taka'] == 260.0
    assert detail['profit_poisha'] == 26000

    calc_profit = round(wf['delivered_value'] - wf['cogs'] - wf['courier_charges'] - wf['packaging'] - wf['ad_spend'], 2)
    assert wf['net_profit'] == calc_profit


def test_order_detail_returned_order():
    """Verify returned order waterfall and negative profit."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p_id = upsert_product(m_id, {
        'name': 'Polo Shirt',
        'sku': 'POLO-03',
        'purchase_price': 40000,
        'selling_price': 100000,
        'stock_qty': 8
    }, ctx)

    o_id = create_order(m_id, {
        'customer_name': 'Hasan',
        'customer_phone': '01611223344',
        'address': 'Rajshahi',
        'courier': 'RedX',
        'consignment_id': 'RDX-3312',
        'items': [{'product_id': p_id, 'name': 'Polo Shirt', 'qty': 1, 'unit_price': 100000}],
        'total': 100000
    }, ctx)

    apply_status(m_id, o_id, 'returned', ctx)

    # Post return fee in journal: delivery ৳60, return fee ৳40
    post({
        'merchant_id': m_id,
        'kind': 'operational_expense',
        'date': today(),
        'source': 'manual',
        'created_by': f'user:{u_id}',
        'order_id': o_id,
    }, [
        {'account': 'courier_delivery', 'amount': 6000, 'order_id': o_id},
        {'account': 'courier_return_fee', 'amount': 4000, 'order_id': o_id},
        {'account': 'cash', 'amount': -10000, 'order_id': o_id},
    ])

    res = client.get(f"/api/orders/{o_id}")
    assert res.status_code == 200
    detail = res.json()

    cb = detail['courier_charges_breakdown']
    wf = detail['waterfall']

    assert cb['delivery_charge'] == 60.0
    assert cb['cod_fee'] == 0.0 # No COD on returned order
    assert cb['return_fee'] == 40.0
    assert cb['total'] == 100.0

    assert wf['delivered_value'] == 0.0
    assert wf['cogs'] == 0.0
    assert wf['courier_charges'] == 100.0
    assert wf['packaging'] == 0.0
    assert wf['ad_spend'] == 0.0
    assert wf['net_profit'] == -100.0
    assert detail['profit_taka'] == -100.0
    assert detail['profit_poisha'] == -10000


def test_settlements_preview_and_receivables_summary():
    """Verify /api/settlements endpoints and matched vs disputed segregation."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p_id = upsert_product(m_id, {
        'name': 'Formal Shirt',
        'sku': 'FSH-01',
        'purchase_price': 70000,
        'selling_price': 180000,
        'stock_qty': 20
    }, ctx)

    o1 = create_order(m_id, {
        'customer_name': 'Buyer One',
        'customer_phone': '01711000001',
        'address': 'Dhaka',
        'courier': 'Steadfast',
        'consignment_id': 'STD-MATCH-1',
        'items': [{'product_id': p_id, 'name': 'Formal Shirt', 'qty': 1, 'unit_price': 180000}],
        'total': 180000
    }, ctx)
    apply_status(m_id, o1, 'delivered', ctx)

    # Test catalog
    res = client.get("/api/settlements/couriers")
    assert res.status_code == 200
    couriers = res.json()['couriers']
    assert any(c['key'] == 'steadfast' for c in couriers)
    assert any(c['key'] == 'pathao' for c in couriers)

    # Test preview-json
    preview_payload = {
        'courier': 'steadfast',
        'rows': [
            # Row 1: matches o1
            {
                'Tracking ID': 'STD-MATCH-1',
                'Status': 'Delivered',
                'Collected Amount': '1800',
                'Delivery Charge': '70',
                'COD Fee': '18',
            },
            # Row 2: unknown consignment
            {
                'Tracking ID': 'UNKNOWN-CID-999',
                'Status': 'Delivered',
                'Collected Amount': '2000',
                'Delivery Charge': '80',
                'COD Fee': '20',
            }
        ]
    }

    res = client.post("/api/settlements/preview-json", json=preview_payload)
    assert res.status_code == 200
    prev_data = res.json()
    summary = prev_data['summary']

    assert summary['matched'] == 1
    assert summary['disputed'] == 1
    assert summary['matched_rows'][0]['consignment_id'] == 'STD-MATCH-1'
    assert summary['matched_rows'][0]['match_status'] == 'matched'
    assert summary['disputed_rows'][0]['consignment_id'] == 'UNKNOWN-CID-999'
    assert summary['disputed_rows'][0]['match_status'] == 'disputed'
    assert summary['disputed_rows'][0]['discrepancy_reason'] == 'No such order here'

    # Test receivables-summary
    res = client.get("/api/settlements/receivables-summary")
    assert res.status_code == 200
    rec_sum = res.json()
    assert 'total_held_poisha' in rec_sum
    assert 'total_held_taka' in rec_sum
    assert 'outstanding_by_courier' in rec_sum
    assert 'charges_this_period' in rec_sum
    assert 'returned_parcels_count' in rec_sum


def test_product_performance_report_math_and_footnote():
    """Verify /api/reports/product-performance SKU economics and footnote math."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p1 = upsert_product(m_id, {
        'name': 'Pants Black',
        'sku': 'PNT-BLK',
        'purchase_price': 50000, # ৳500
        'selling_price': 120000, # ৳1200
        'stock_qty': 10
    }, ctx)

    # Create uncosted product
    p2 = upsert_product(m_id, {
        'name': 'Free Bag',
        'sku': 'FREE-BAG',
        'purchase_price': 0, # Uncosted
        'selling_price': 30000,
        'stock_qty': 10
    }, ctx)

    o1 = create_order(m_id, {
        'customer_name': 'Buyer P1',
        'customer_phone': '01711000010',
        'address': 'Dhaka',
        'courier': 'Pathao',
        'consignment_id': 'PTH-P1',
        'items': [{'product_id': p1, 'name': 'Pants Black', 'qty': 1, 'unit_price': 120000}],
        'total': 120000
    }, ctx)
    apply_status(m_id, o1, 'delivered', ctx)

    o2 = create_order(m_id, {
        'customer_name': 'Buyer P2',
        'customer_phone': '01711000020',
        'address': 'Dhaka',
        'courier': 'Pathao',
        'consignment_id': 'PTH-P2',
        'items': [{'product_id': p2, 'name': 'Free Bag', 'qty': 1, 'unit_price': 30000}],
        'total': 30000
    }, ctx)
    apply_status(m_id, o2, 'delivered', ctx)

    res = client.get("/api/reports/product-performance?period=this_month")
    assert res.status_code == 200
    perf = res.json()

    assert 'products' in perf
    assert 'summary_totals' in perf
    assert 'footnote_reconciliation' in perf

    footnote = perf['footnote_reconciliation']
    assert 'reconciliation_formula' in footnote
    assert 'unallocated_packaging_poisha' in footnote
    assert 'unallocated_fixed_costs_poisha' in footnote
    assert 'unmapped_ad_spend_poisha' in footnote
    assert 'dashboard_pnl_net_profit_poisha' in footnote
    assert 'unresolved_exceptions_poisha' in footnote

    # Verify uncosted product is flagged
    prod_map = {p['sku']: p for p in perf['products']}
    assert prod_map['FREE-BAG']['missing_cost_price'] is True
    assert prod_map['FREE-BAG']['net_profit_poisha'] is None

    assert prod_map['PNT-BLK']['missing_cost_price'] is False
    assert prod_map['PNT-BLK']['cogs_poisha'] == 50000
    assert prod_map['PNT-BLK']['revenue_poisha'] == 120000
    assert prod_map['PNT-BLK']['gross_profit_poisha'] == 70000


def test_order_settlement_rows_fallback_and_negative_margin():
    """Verify orders.py picks up delivery and COD fees from settlement_rows when no journals exist."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p_id = upsert_product(m_id, {
        'name': 'Loss Leader Hat',
        'sku': 'HAT-01',
        'purchase_price': 50000, # ৳500
        'selling_price': 40000,  # ৳400
        'stock_qty': 10
    }, ctx)

    o_id = create_order(m_id, {
        'customer_name': 'Bargain Hunter',
        'customer_phone': '01711999999',
        'address': 'Barisal',
        'courier': 'Steadfast',
        'consignment_id': 'STD-SETTLE-ROW-1',
        'items': [{'product_id': p_id, 'name': 'Loss Leader Hat', 'qty': 1, 'unit_price': 40000}],
        'total': 40000
    }, ctx)
    apply_status(m_id, o_id, 'delivered', ctx)

    # Insert into settlement_rows directly (simulating imported sheet before journal post)
    from app.db.session import insert
    upload_id = insert('uploads', {
        'merchant_id': m_id,
        'kind': 'courier_settlement',
        'courier': 'Steadfast',
        'filename': 'test.csv',
        'sha256': 'dummy',
        'status': 'committed',
        'created_by': f'user:{u_id}',
        'created_at': '2026-11-10T00:00:00Z',
    })
    insert('settlement_rows', {
        'merchant_id': m_id,
        'upload_id': upload_id,
        'courier': 'Steadfast',
        'row_no': 1,
        'raw': '{}',
        'order_id': o_id,
        'consignment_id': 'STD-SETTLE-ROW-1',
        'status': 'delivered',
        'cod_collected': 40000,
        'delivery_charge': 9000, # ৳90
        'cod_fee': 400,          # ৳4
        'return_fee': 0,
    })

    res = client.get(f"/api/orders/{o_id}")
    assert res.status_code == 200
    detail = res.json()
    wf = detail['waterfall']
    cb = detail['courier_charges_breakdown']

    assert cb['delivery_charge'] == 90.0
    assert cb['cod_fee'] == 4.0
    assert cb['total'] == 94.0

    # Net profit: 400 (delivered) - 500 (COGS) - 94 (courier) - 0 (pack) - 0 (ads) = -৳194.0
    assert wf['net_profit'] == -194.0
    assert detail['profit_taka'] == -194.0
    assert detail['profit_poisha'] == -19400
    assert wf['net_profit'] == round(wf['delivered_value'] - wf['cogs'] - wf['courier_charges'] - wf['packaging'] - wf['ad_spend'], 2)


def test_unplaced_orders_have_no_profit():
    """Verify placed and in_transit orders have None profit in /api/orders and waterfall."""
    m_id, u_id = _setup_merchant_and_user()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p_id = upsert_product(m_id, {
        'name': 'Belt',
        'sku': 'BLT-01',
        'purchase_price': 20000,
        'selling_price': 50000,
        'stock_qty': 10
    }, ctx)

    o1 = create_order(m_id, {
        'customer_name': 'Pending Buyer',
        'customer_phone': '01711888888',
        'address': 'Dhaka',
        'courier': 'Pathao',
        'consignment_id': 'PTH-PEND-1',
        'items': [{'product_id': p_id, 'name': 'Belt', 'qty': 1, 'unit_price': 50000}],
        'total': 50000
    }, ctx)
    # Default status is 'placed'

    o2 = create_order(m_id, {
        'customer_name': 'Transit Buyer',
        'customer_phone': '01711777777',
        'address': 'Khulna',
        'courier': 'Pathao',
        'consignment_id': 'PTH-TRANSIT-1',
        'items': [{'product_id': p_id, 'name': 'Belt', 'qty': 1, 'unit_price': 50000}],
        'total': 50000
    }, ctx)
    apply_status(m_id, o2, 'in_transit', ctx)

    res = client.get("/api/orders")
    assert res.status_code == 200
    data = res.json()
    order_map = {o['id']: o for o in data['rows']}

    assert order_map[o1]['profit_poisha'] is None
    assert order_map[o1]['profit_taka'] is None
    assert order_map[o2]['profit_poisha'] is None
    assert order_map[o2]['profit_taka'] is None

    # Check detail waterfall
    res1 = client.get(f"/api/orders/{o1}")
    wf1 = res1.json()['waterfall']
    assert wf1['net_profit'] is None
    assert wf1['delivered_value'] == 0.0
    assert wf1['cogs'] == 0.0

    res2 = client.get(f"/api/orders/{o2}")
    wf2 = res2.json()['waterfall']
    assert wf2['net_profit'] is None
    assert wf2['delivered_value'] == 0.0
    assert wf2['cogs'] == 0.0


def test_frontend_orders_view_no_hardcoded_delivery_fee():
    """Adversarially verify that frontend OrdersView does NOT contain || 70 fallback."""
    from pathlib import Path
    orders_view_path = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "components" / "OrdersView.tsx"
    assert orders_view_path.exists()
    content = orders_view_path.read_text(encoding="utf-8")

    # Line 498 check: selectedOrder.courier_charges_breakdown?.delivery_charge || 70
    assert "|| 70" not in content, "Found hardcoded mockup delivery fee fallback '|| 70' in OrdersView.tsx!"

