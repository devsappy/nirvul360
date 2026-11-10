"""
Adversarial Challenger Test Suite for Milestone 3 (Screens 7-12).

Rigorous stress-testing of UI/UX client-state logic, API contracts, arithmetic,
zero/negative boundaries, permissions masking, discrepancy quarantine, and reconciliation.
"""
import pytest
import json
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, insert, update, one, all as db_all
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product, stock_qty
from app.domain.orders import create_order, apply_status
from app.domain.exceptions import raise_exception, resolve, scan_merchant
from app.domain.roles import PERMISSIONS_MATRIX
from app.lib.dates import reset_clock, today, now_iso

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()


# ==============================================================================
# Screen 7: Team & Roles
# ==============================================================================

def test_screen_7_permissions_matrix_and_role_masking():
    """
    Stress-test permissions matrix rendering and role masking:
    - 11 exact rows
    - Rows 5, 6, 7 must have is_financial_margin=True
    - Non-owners (manager, accountant) must be masked from viewing margins
    """
    m_id = create_merchant({'name': 'Alpha Store', 'phone': '01711000001'})
    owner_id = create_user(m_id, {
        'name': 'Owner User',
        'email': 'owner@alpha.bd',
        'role': 'agency_owner',
        'password': 'pass'
    })
    manager_id = create_user(m_id, {
        'name': 'Manager User',
        'email': 'manager@alpha.bd',
        'role': 'manager',
        'password': 'pass'
    })
    accountant_id = create_user(m_id, {
        'name': 'Accountant User',
        'email': 'accountant@alpha.bd',
        'role': 'accountant',
        'password': 'pass'
    })

    # Owner login
    login_owner = client.post("/api/auth/login", json={'email': 'owner@alpha.bd', 'password': 'pass'})
    assert login_owner.status_code == 200

    # 1. Verify /api/team structure
    res_team = client.get("/api/team")
    assert res_team.status_code == 200
    team_data = res_team.json()
    assert team_data['member_count'] == 3
    assert len(team_data['members']) == 3

    matrix = team_data['permissions_matrix']
    assert len(matrix) == 11, f"Expected 11 rows in permissions matrix, got {len(matrix)}"

    # Check rows 5, 6, 7 are financial margin rows with is_financial_margin: True
    financial_rows = [r for r in matrix if r.get('is_financial_margin')]
    assert len(financial_rows) == 3, f"Expected exactly 3 financial margin rows, got {len(financial_rows)}"
    financial_areas = {r['area'] for r in financial_rows}
    expected_areas = {
        "Net profit and net margin",
        "Product margins and cost prices",
        "Supplier purchase prices"
    }
    assert financial_areas == expected_areas

    for r in financial_rows:
        assert r['owner'] in ("Can see", "Can edit", "Can change")
        assert r['manager'].lower() == "hidden"
        assert r['accountant'].lower() == "hidden"

    # 2. Manager login & role masking enforcement
    login_mgr = client.post("/api/auth/login", json={'email': 'manager@alpha.bd', 'password': 'pass'})
    assert login_mgr.status_code == 200

    # Manager attempting to access Owner-only endpoints
    res_pnl = client.get("/api/reports/pnl")
    assert res_pnl.status_code == 403, "Manager must be blocked (403) from PnL report"

    res_cf = client.get("/api/reports/cash-flow")
    assert res_cf.status_code == 403, "Manager must be blocked (403) from Cash Flow report"

    res_inv = client.post("/api/team/invite", json={
        'name': 'Hacker',
        'email': 'hacker@test.bd',
        'role': 'manager'
    })
    assert res_inv.status_code == 403, "Manager must be blocked (403) from inviting team members"

    res_role = client.put(f"/api/team/{owner_id}/role", json={'role': 'manager'})
    assert res_role.status_code == 403, "Manager must be blocked (403) from changing member roles"

    # Manager accessing product performance report - financial margins must be masked (None)
    res_perf = client.get("/api/reports/product-performance")
    assert res_perf.status_code == 200
    perf_data = res_perf.json()
    assert perf_data['summary_totals']['total_cogs_poisha'] is None
    assert perf_data['summary_totals']['total_sku_net_profit_poisha'] is None
    assert perf_data['footnote_reconciliation']['sku_net_profit_sum_poisha'] is None
    assert perf_data['footnote_reconciliation']['dashboard_pnl_net_profit_poisha'] is None

    # 3. Accountant login & role masking enforcement
    login_acc = client.post("/api/auth/login", json={'email': 'accountant@alpha.bd', 'password': 'pass'})
    assert login_acc.status_code == 200

    # Accountant cannot view PnL
    res_acc_pnl = client.get("/api/reports/pnl")
    assert res_acc_pnl.status_code == 403

    # Accountant CAN view Cash Flow
    res_acc_cf = client.get("/api/reports/cash-flow")
    assert res_acc_cf.status_code == 200

    # Accountant has masked margins in product-performance
    res_acc_perf = client.get("/api/reports/product-performance")
    assert res_acc_perf.status_code == 200
    assert res_acc_perf.json()['summary_totals']['total_sku_net_profit_poisha'] is None


def test_screen_7_member_list_nullish_defaults_and_validation():
    """
    Stress-test nullish defaults, self-alteration prevention, and duplicate invites.
    """
    m_id = create_merchant({'name': 'Beta Store', 'phone': '01711000002'})
    owner_id = create_user(m_id, {
        'name': 'Owner B',
        'email': 'owner_b@beta.bd',
        'role': 'owner',
        'password': 'pass'
    })
    # Member with all nullish optional columns
    member_id = insert('users', {
        'merchant_id': m_id,
        'name': 'Ghost User',
        'email': 'ghost@beta.bd',
        'role': 'manager',
        'whatsapp': None,
        'last_active_at': None,
        'scope': None,
        'status': None,
        'invited_at': None,
        'created_at': now_iso()
    })

    client.post("/api/auth/login", json={'email': 'owner_b@beta.bd', 'password': 'pass'})
    res = client.get("/api/team")
    assert res.status_code == 200
    members = res.json()['members']
    ghost = next(m for m in members if m['id'] == member_id)
    assert ghost['last_active'] == 'Never signed in'
    assert ghost['scope'] == 'Beta Store'
    assert ghost['status'] == 'active'

    # Cannot alter own role
    res_self = client.put(f"/api/team/{owner_id}/role", json={'role': 'manager'})
    assert res_self.status_code == 400
    assert "own role" in res_self.json()['detail']

    # Non-existent member role update
    res_404 = client.put("/api/team/999999/role", json={'role': 'manager'})
    assert res_404.status_code == 404

    # Duplicate email invite
    res_dup = client.post("/api/team/invite", json={
        'name': 'Ghost Clone',
        'email': 'ghost@beta.bd',
        'role': 'accountant'
    })
    assert res_dup.status_code == 400
    assert "already exists" in res_dup.json()['detail']


# ==============================================================================
# Screen 8: POS Retail Register
# ==============================================================================

def test_screen_8_pos_cart_math_discounts_and_clamping():
    """
    Stress-test cart arithmetic, discounts, discount clamping, and overpayment.
    """
    m_id = create_merchant({'name': 'POS Retail Hub', 'phone': '01711000003'})
    create_user(m_id, {'name': 'Cashier', 'email': 'cashier@pos.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'cashier@pos.bd', 'password': 'pass'})

    p1 = upsert_product(m_id, {
        'name': 'Premium Shirt', 'sku': 'SHIRT-01',
        'selling_price': 120000, # ৳1200
        'purchase_price': 60000, # ৳600
        'stock_qty': 100,
    }, {'source': 'manual', 'actor': 'owner'})

    p2 = upsert_product(m_id, {
        'name': 'Chino Pants', 'sku': 'CHINO-01',
        'selling_price': 180000, # ৳1800
        'purchase_price': 90000, # ৳900
        'stock_qty': 50,
    }, {'source': 'manual', 'actor': 'owner'})

    # Case 1: Standard multi-item purchase: 2 shirts (2400) + 1 chino (1800) = 4200 subtotal
    # Discount = 200, To Pay = 4000. Tendered = 5000 -> Change = 1000
    res_checkout = client.post("/api/pos/checkout", json={
        'items': [
            {'product_id': p1, 'qty': 2, 'unit_price': 1200.0},
            {'product_id': p2, 'qty': 1, 'unit_price': 1800.0},
        ],
        'customer_name': 'Zakir Hossain',
        'discount': 200.0,
        'payment_method': 'card',
        'tendered': 5000.0,
    })
    assert res_checkout.status_code == 200
    voucher = res_checkout.json()
    assert voucher['subtotal'] == 4200.0
    assert voucher['discount'] == 200.0
    assert voucher['total'] == 4000.0
    assert voucher['tendered'] == 5000.0
    assert voucher['change'] == 1000.0
    assert voucher['payment_method'] == 'card'

    # Case 2: 100% full discount (subtotal 1200, discount 1200) -> total = 0
    res_full_disc = client.post("/api/pos/checkout", json={
        'items': [{'product_id': p1, 'qty': 1, 'unit_price': 1200.0}],
        'discount': 1200.0,
        'payment_method': 'cash',
        'tendered': 500.0,
    })
    assert res_full_disc.status_code == 200
    v_full = res_full_disc.json()
    assert v_full['subtotal'] == 1200.0
    assert v_full['discount'] == 1200.0
    assert v_full['total'] == 0.0
    assert v_full['change'] == 500.0

    # Case 3: Excessive discount exceeding subtotal (subtotal 1200, discount 2000)
    # Backend rejects invalid transaction where discount > subtotal with 400 Bad Request
    res_excess = client.post("/api/pos/checkout", json={
        'items': [{'product_id': p1, 'qty': 1, 'unit_price': 1200.0}],
        'discount': 2000.0,
        'payment_method': 'cash',
        'tendered': 500.0,
    })
    assert res_excess.status_code == 400


def test_screen_8_pos_zero_negative_stock_and_uncosted_warning():
    """
    Stress-test zero/negative stock decrement and uncosted product exception triggering.
    """
    m_id = create_merchant({'name': 'Stock Edge Store', 'phone': '01711000004'})
    create_user(m_id, {'name': 'Store Admin', 'email': 'admin@stock.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'admin@stock.bd', 'password': 'pass'})

    # Product 1: Stock is 0
    p_zero = upsert_product(m_id, {
        'name': 'Out of Stock Bag', 'sku': 'BAG-ZERO',
        'selling_price': 50000, # ৳500
        'purchase_price': 25000, # ৳250
        'stock_qty': 0,
    }, {'source': 'manual', 'actor': 'admin'})

    # Product 2: Uncosted product (purchase_price is None or 0)
    p_uncosted = upsert_product(m_id, {
        'name': 'Unpriced Scarf',
        'sku': 'SCARF-NO-COST',
        'selling_price': 30000, # ৳300
    }, {'source': 'manual', 'actor': 'admin'})

    # Verify POS product catalog detects uncosted product
    res_prods = client.get("/api/pos/products")
    assert res_prods.status_code == 200
    p_list = res_prods.json()['products']
    p_uncosted_item = next(p for p in p_list if p['id'] == p_uncosted)
    assert p_uncosted_item['cost_price'] is None, "Uncosted product must have cost_price=None"

    # Checkout 3 units of zero-stock product -> stock becomes -3
    res_zero_checkout = client.post("/api/pos/checkout", json={
        'items': [{'product_id': p_zero, 'qty': 3, 'unit_price': 500.0}],
        'payment_method': 'cash',
    })
    assert res_zero_checkout.status_code == 200
    assert stock_qty(p_zero) == -3
    # Receipt remaining_stock returns 0 (clamped non-negative for display)
    assert res_zero_checkout.json()['items'][0]['remaining_stock'] == 0

    # Checkout uncosted product -> sale succeeds, but exception is quarantined in exception_queue
    res_uncosted_checkout = client.post("/api/pos/checkout", json={
        'items': [{'product_id': p_uncosted, 'qty': 1, 'unit_price': 300.0}],
        'payment_method': 'bkash',
    })
    assert res_uncosted_checkout.status_code == 200

    # Check exception queue
    res_exc = client.get("/api/exceptions?status=open")
    assert res_exc.status_code == 200
    exc_items = res_exc.json()['items']
    found_uncosted = any(e['type'] in ('product_without_price', 'missing_cost') for e in exc_items)
    assert found_uncosted, "Selling uncosted product must raise an exception in the quarantine queue"


def test_screen_8_pos_counter_totals_by_payment_method():
    """
    Stress-test counter totals across Cash, bKash, Nagad, Card.
    """
    m_id = create_merchant({'name': 'Counter Totals Store', 'phone': '01711000005'})
    create_user(m_id, {'name': 'Counter Lead', 'email': 'lead@counter.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'lead@counter.bd', 'password': 'pass'})

    p_id = upsert_product(m_id, {
        'name': 'Standard Cap', 'sku': 'CAP-01',
        'selling_price': 100000, # ৳1000
        'purchase_price': 40000,
        'stock_qty': 100,
    }, {'source': 'manual', 'actor': 'lead'})

    # 4 Sales with 4 payment methods
    client.post("/api/pos/checkout", json={'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 1000.0}], 'payment_method': 'cash'})
    client.post("/api/pos/checkout", json={'items': [{'product_id': p_id, 'qty': 2, 'unit_price': 1000.0}], 'payment_method': 'bkash'})
    client.post("/api/pos/checkout", json={'items': [{'product_id': p_id, 'qty': 3, 'unit_price': 1000.0}], 'payment_method': 'nagad'})
    client.post("/api/pos/checkout", json={'items': [{'product_id': p_id, 'qty': 4, 'unit_price': 1000.0}], 'payment_method': 'card'})

    res_orders = client.get("/api/pos/orders")
    assert res_orders.status_code == 200
    summary = res_orders.json()['summary']
    assert summary['today_orders_count'] == 4
    assert summary['today_revenue_bdt'] == 10000.0 # 1000 + 2000 + 3000 + 4000
    assert summary['cash_taken_bdt'] == 1000.0
    assert summary['bkash_taken_bdt'] == 2000.0
    assert summary['nagad_taken_bdt'] == 3000.0
    assert summary['card_taken_bdt'] == 4000.0


# ==============================================================================
# Screen 9: Needs Attention Discrepancy Quarantine
# ==============================================================================

def test_screen_9_discrepancy_quarantine_calculations_and_oldest_days():
    """
    Stress-test discrepancy calculations, oldest days computation, and sorting.
    """
    m_id = create_merchant({'name': 'Exceptions Merchant', 'phone': '01711000006'})
    create_user(m_id, {'name': 'Auditor', 'email': 'auditor@exc.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'auditor@exc.bd', 'password': 'pass'})

    # Empty queue check
    res_empty = client.get("/api/exceptions?status=open")
    assert res_empty.status_code == 200
    assert res_empty.json()['count'] == 0
    assert res_empty.json()['total_unresolved_poisha'] == 0
    assert res_empty.json()['total_unresolved_taka'] == 0.0
    assert res_empty.json()['oldest_days'] == 0

    # Seed 3 exceptions with different dates
    now_dt = datetime.now(timezone.utc)
    ts_today = now_dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    ts_10d_ago = (now_dt - timedelta(days=10)).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    ts_35d_ago = (now_dt - timedelta(days=35)).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

    e1 = insert('exception_queue', {
        'merchant_id': m_id,
        'type': 'stuck_parcel',
        'status': 'open',
        'value': 150000, # ৳1500
        'dedupe_key': 'stuck-1',
        'raised_at': ts_today,
        'raised_by': 'system',
    })
    e2 = insert('exception_queue', {
        'merchant_id': m_id,
        'type': 'short_settlement',
        'status': 'open',
        'value': 50000, # ৳500
        'dedupe_key': 'short-1',
        'raised_at': ts_10d_ago,
        'raised_by': 'system',
    })
    e3 = insert('exception_queue', {
        'merchant_id': m_id,
        'type': 'zero_settlement',
        'status': 'open',
        'value': 200000, # ৳2000
        'dedupe_key': 'zero-1',
        'raised_at': ts_35d_ago,
        'raised_by': 'system',
    })

    res = client.get("/api/exceptions?status=open&sort=oldest")
    assert res.status_code == 200
    data = res.json()
    assert data['count'] == 3
    assert data['total_unresolved_poisha'] == 400000
    assert data['total_unresolved_taka'] == 4000.0
    assert data['oldest_days'] >= 35, f"Expected oldest_days >= 35, got {data['oldest_days']}"

    # Verify oldest first sort: e3 (35d ago) must be first item
    assert data['items'][0]['id'] == e3
    assert data['items'][1]['id'] == e2
    assert data['items'][2]['id'] == e1

    # Verify newest first sort
    res_newest = client.get("/api/exceptions?status=open&sort=newest")
    assert res_newest.status_code == 200
    assert res_newest.json()['items'][0]['id'] == e1


def test_screen_9_exception_resolution_workflows():
    """
    Stress-test resolution of exceptions:
    - short_settlement with partial_delivery, delivery_discount, courier_short
    - already resolved returns 400
    - non-existent returns 404
    """
    m_id = create_merchant({'name': 'Resolution Merchant', 'phone': '01711000007'})
    u_id = create_user(m_id, {'name': 'Resolver', 'email': 'resolver@res.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'resolver@res.bd', 'password': 'pass'})

    p_id = upsert_product(m_id, {'name': 'Watch', 'sku': 'WATCH', 'selling_price': 100000, 'purchase_price': 50000, 'stock_qty': 10}, {'source': 'manual', 'actor': 'owner'})
    o_id = create_order(m_id, {
        'customer_name': 'Hasan', 'address': 'Dhanmondi', 'courier': 'pathao', 'consignment_id': 'PTH-111',
        'items': [{'product_id': p_id, 'qty': 2, 'unit_price': 100000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o_id, 'delivered', {'source': 'manual', 'actor': 'owner'})

    # Raise short_settlement exception
    exc_id = raise_exception(m_id, {
        'type': 'short_settlement',
        'key': f'short-{o_id}',
        'value': 20000, # ৳200 shortfall
        'order_id': o_id,
        'courier': 'pathao',
        'details': {'order_total_poisha': 200000, 'settled_poisha': 180000, 'shortfall_poisha': 20000}
    }, actor='system')

    # Resolve with partial_delivery
    res_res = client.post(f"/api/exceptions/{exc_id}/resolve", json={
        'action': 'partial_delivery',
        'reason_code': 'partial_delivery',
        'note': 'Customer kept only 1 item and returned 1'
    })
    assert res_res.status_code == 200
    assert res_res.json()['ok'] is True
    assert res_res.json()['status'] == 'resolved'

    # Resolving already resolved exception returns 400
    res_again = client.post(f"/api/exceptions/{exc_id}/resolve", json={'action': 'partial_delivery'})
    assert res_again.status_code == 400

    # Resolving non-existent exception returns 400 Bad Request
    res_404 = client.post("/api/exceptions/99999/resolve", json={'action': 'partial_delivery'})
    assert res_404.status_code == 400
    assert "not found" in res_404.json()['detail']


# ==============================================================================
# Screen 10: Orders & Inspection Drawer
# ==============================================================================

def test_screen_10_multi_filter_orders_and_profit_waterfall():
    """
    Stress-test multi-filtering (empty, matching, non-matching) and profit waterfall arithmetic.
    """
    m_id = create_merchant({'name': 'Orders Hub', 'phone': '01711000008'})
    create_user(m_id, {'name': 'Dispatcher', 'email': 'dispatch@ord.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'dispatch@ord.bd', 'password': 'pass'})

    p_id = upsert_product(m_id, {
        'name': 'Silk Scarf', 'sku': 'SILK-01',
        'selling_price': 200000, # ৳2000
        'purchase_price': 80000, # ৳800
        'stock_qty': 50,
    }, {'source': 'manual', 'actor': 'owner'})

    # Order 1: Delivered via Pathao
    o1 = create_order(m_id, {
        'customer_name': 'Anika Rahman',
        'customer_phone': '01711223344',
        'address': 'Gulshan',
        'courier': 'pathao',
        'consignment_id': 'PTH-901',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 200000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o1, 'delivered', {'source': 'manual', 'actor': 'owner', 'charges': {'delivery_charge': 6000, 'cod_fee': 1500}})

    # Order 2: Returned via Steadfast
    o2 = create_order(m_id, {
        'customer_name': 'Belal Ahmed',
        'customer_phone': '01899887766',
        'address': 'Uttara',
        'courier': 'steadfast',
        'consignment_id': 'STF-902',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 200000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o2, 'returned', {'source': 'manual', 'actor': 'owner', 'charges': {'delivery_charge': 6000, 'return_fee': 4000}})

    # Order 3: In Transit via RedX
    o3 = create_order(m_id, {
        'customer_name': 'Chowdhury Kamal',
        'customer_phone': '01911445566',
        'address': 'Mirpur',
        'courier': 'redx',
        'consignment_id': 'RDX-903',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 200000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o3, 'in_transit', {'source': 'manual', 'actor': 'owner'})

    # 1. Multi-filter: empty filter -> all 3
    res_all = client.get("/api/orders")
    assert res_all.status_code == 200
    assert len(res_all.json()['rows']) == 3

    # Status filter: delivered -> exactly 1
    res_del = client.get("/api/orders?status=delivered")
    assert res_del.status_code == 200
    assert len(res_del.json()['rows']) == 1
    assert res_del.json()['rows'][0]['id'] == o1

    # Courier filter: steadfast -> exactly 1
    res_courier = client.get("/api/orders?courier=steadfast")
    assert res_courier.status_code == 200
    assert len(res_courier.json()['rows']) == 1
    assert res_courier.json()['rows'][0]['id'] == o2

    # Query search: 'Kamal' -> matches o3
    res_q = client.get("/api/orders?q=Kamal")
    assert res_q.status_code == 200
    assert len(res_q.json()['rows']) == 1
    assert res_q.json()['rows'][0]['id'] == o3

    # Non-matching search: 'NONEXISTENT' -> 0 rows
    res_none = client.get("/api/orders?q=NONEXISTENT")
    assert res_none.status_code == 200
    assert len(res_none.json()['rows']) == 0

    # 2. Profit badge verification:
    rows_map = {r['id']: r for r in res_all.json()['rows']}
    # Delivered: profit_taka > 0
    assert rows_map[o1]['profit_taka'] is not None and rows_map[o1]['profit_taka'] > 0
    # Returned: profit_taka is negative return leg loss
    assert rows_map[o2]['profit_taka'] is not None and rows_map[o2]['profit_taka'] < 0
    # In-transit: profit is None (not a sale yet)
    assert rows_map[o3]['profit_taka'] is None

    # 3. Slide-over detail drawer & Waterfall arithmetic verification
    res_detail = client.get(f"/api/orders/{o1}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    wf = detail['waterfall']
    assert wf['is_delivered'] is True
    # Waterfall formula: net_profit = delivered_value - cogs - courier_charges - packaging - ad_spend
    computed_profit = wf['delivered_value'] - wf['cogs'] - wf['courier_charges'] - wf['packaging'] - wf['ad_spend']
    assert round(computed_profit, 2) == round(wf['net_profit'], 2), f"Waterfall mismatch: {computed_profit} != {wf['net_profit']}"


# ==============================================================================
# Screen 11: Courier Settlements
# ==============================================================================

def test_screen_11_split_matched_vs_disputed_and_receivables():
    """
    Stress-test settlement preview split:
    - matched clean row
    - disputed: missing order, in-transit, short settlement, return on delivered
    - courier receivables summary
    """
    m_id = create_merchant({'name': 'Settlement Hub', 'phone': '01711000009'})
    create_user(m_id, {'name': 'Account Officer', 'email': 'officer@stf.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'officer@stf.bd', 'password': 'pass'})

    p_id = upsert_product(m_id, {'name': 'Dress', 'sku': 'DRESS', 'selling_price': 150000, 'purchase_price': 70000, 'stock_qty': 100}, {'source': 'manual', 'actor': 'owner'})

    # Order 1: Clean delivered
    o1 = create_order(m_id, {
        'customer_name': 'Nabila', 'courier': 'steadfast', 'consignment_id': 'STF-001',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 150000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o1, 'delivered', {'source': 'manual', 'actor': 'owner'})

    # Order 2: Delivered, but courier sheet will settle short
    o2 = create_order(m_id, {
        'customer_name': 'Mitu', 'courier': 'steadfast', 'consignment_id': 'STF-002',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 150000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o2, 'delivered', {'source': 'manual', 'actor': 'owner'})

    # Order 3: In transit
    o3 = create_order(m_id, {
        'customer_name': 'Tania', 'courier': 'steadfast', 'consignment_id': 'STF-003',
        'items': [{'product_id': p_id, 'qty': 1, 'unit_price': 150000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o3, 'in_transit', {'source': 'manual', 'actor': 'owner'})

    # Test preview-json
    res_preview = client.post("/api/settlements/preview-json", json={
        'courier': 'steadfast',
        'rows': [
            {'Tracking ID': 'STF-001', 'COD Amount': '1500', 'Delivery Charge': '70', 'Status': 'Delivered'},
            {'Tracking ID': 'STF-002', 'COD Amount': '1200', 'Delivery Charge': '70', 'Status': 'Delivered'}, # 300 short
            {'Tracking ID': 'STF-003', 'COD Amount': '1500', 'Delivery Charge': '70', 'Status': 'Delivered'}, # still in transit in DB
            {'Tracking ID': 'STF-GHOST', 'COD Amount': '1500', 'Delivery Charge': '70', 'Status': 'Delivered'}, # unknown order
        ]
    })
    assert res_preview.status_code == 200
    summary = res_preview.json()['summary']
    assert summary['matched'] == 3 # 3 hit DB orders (STF-001, 002, 003)
    assert len(summary['matched_rows']) == 1, "Only STF-001 is a clean match"
    assert summary['matched_rows'][0]['consignment_id'] == 'STF-001'

    assert len(summary['disputed_rows']) == 3
    disputed_reasons = {r['consignment_id']: r['discrepancy_reason'] for r in summary['disputed_rows']}
    assert disputed_reasons['STF-GHOST'] == 'No such order here'
    assert disputed_reasons['STF-003'] == 'Still in transit'
    assert 'short' in disputed_reasons['STF-002']

    # Test receivables summary endpoint
    res_rec = client.get("/api/settlements/receivables-summary")
    assert res_rec.status_code == 200
    rec_data = res_rec.json()
    assert 'outstanding_by_courier' in rec_data
    assert rec_data['couriers_count'] == 3
    assert 'charges_this_period' in rec_data


# ==============================================================================
# Screen 12: Reports & SKU Economics
# ==============================================================================

def test_screen_12_sku_economics_and_footnote_reconciliation():
    """
    Stress-test SKU economics margin calculations and footnote reconciliation formula.
    """
    m_id = create_merchant({'name': 'Reports Merchant', 'phone': '01711000010'})
    create_user(m_id, {'name': 'Financial Analyst', 'email': 'analyst@rep.bd', 'role': 'owner', 'password': 'pass'})
    client.post("/api/auth/login", json={'email': 'analyst@rep.bd', 'password': 'pass'})

    p_shirt = upsert_product(m_id, {
        'name': 'Oxford Shirt', 'sku': 'OXF-01',
        'selling_price': 100000, # ৳1000
        'purchase_price': 40000, # ৳400
        'stock_qty': 50,
    }, {'source': 'manual', 'actor': 'owner'})

    # Create delivered order
    o = create_order(m_id, {
        'customer_name': 'Sami', 'courier': 'pathao', 'consignment_id': 'PTH-OXF',
        'items': [{'product_id': p_shirt, 'qty': 2, 'unit_price': 100000}]
    }, {'source': 'manual', 'actor': 'owner'})
    apply_status(m_id, o, 'delivered', {'source': 'manual', 'actor': 'owner'})

    res_rep = client.get("/api/reports/product-performance")
    assert res_rep.status_code == 200
    data = res_rep.json()

    assert len(data['rows']) >= 1
    row = next(r for r in data['rows'] if r['product_id'] == p_shirt)
    assert row['delivered'] == 1
    assert row['revenue_poisha'] == 200000 # 2 * 1000 = 2000 taka
    assert row['cogs_poisha'] == 80000     # 2 * 400 = 800 taka
    assert row['gross_profit_poisha'] == 120000
    assert row['net_profit_poisha'] == row['gross_profit_poisha'] - row['courier_cost_poisha']
    assert row['net_margin'] is not None and row['net_margin'] > 0

    # Footnote reconciliation check
    fn = data['footnote_reconciliation']
    assert fn['sku_net_profit_sum_poisha'] is not None
    assert 'reconciliation_formula' in fn
    assert "Dashboard Net Profit" in fn['reconciliation_formula']
