"""
Empirical Challenger Test Suite for Milestone 3 (Screens 7-12):
Adversarial challenge and stress-testing of backend financial logic,
double-entry ledgers, and API endpoints.

Scenarios tested:
1. POS Checkout Double-Entry: Debits = Credits on POS sale across Cash, bKash, Card,
   inventory movements, and uncosted SKU suspense routing.
2. Quarantine & Resolution Ledger Impact: Short-settlement resolution posting
   genuine journal lines into P&L and removing items from the unresolved queue.
3. Profit Recognition Invariant: Placed and in-transit orders generate zero recognized
   revenue or profit; delivered orders recognize profit; returned orders recognize return fee loss.
4. Courier Settlement Clearing: Matched consignments debit Cash and credit Courier Receivables;
   disputed items are quarantined into exception queue.
5. Poisha Math & Overflow: Avoidance of floating-point drift and overflow under extreme taka values.
"""
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import open_db, one, all
from app.domain.merchants import create_merchant, create_user, create_cash_account
from app.domain.products import upsert_product, stock_qty, cost_at
from app.domain.orders import create_order, apply_status, get_order, order_items
from app.domain.exceptions import (
    raise_exception, resolve, resolve_short_settlement, seed_reason_codes,
    list_exceptions, unresolved_totals,
)
from app.domain.settlements import commit_settlement
from app.domain.ledger import post, balance, balances_by_party, live_journals_for_order
from app.domain.reports import profit_and_loss
from app.lib.dates import reset_clock, today
from app.lib.money import to_poisha, format_taka, format_taka_bn

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()

def _create_env(name="Challenger Merchant"):
    m_id = create_merchant({'name': name})
    u_id = create_user(m_id, {
        'name': 'Accountant User',
        'email': 'acct@challenger.bd',
        'role': 'owner',
        'password': 'password123'
    })
    # Login client
    login_res = client.post("/api/auth/login", json={'email': 'acct@challenger.bd', 'password': 'password123'})
    assert login_res.status_code == 200
    return m_id, u_id


# ==============================================================================
# SCENARIO 1: POS Checkout Double-Entry & Payment Methods
# ==============================================================================

def test_pos_checkout_double_entry_balance():
    """
    Verify POS checkout creates balanced double-entry journals where debits == credits:
    Debit Cash (+total), Credit Sales (-total), Debit COGS (+cogs), Credit Inventory (-cogs).
    Also verify real-time inventory deduction and receipt calculations.
    """
    m_id, u_id = _create_env("POS Store 1")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    # Setup 2 products: Shirt (cost 500, sell 1200) & Pants (cost 800, sell 2000)
    p1 = upsert_product(m_id, {'name': 'Shirt', 'sku': 'SH-01', 'purchase_price': 50000, 'selling_price': 120000, 'stock_qty': 20}, ctx)
    p2 = upsert_product(m_id, {'name': 'Pants', 'sku': 'PA-01', 'purchase_price': 80000, 'selling_price': 200000, 'stock_qty': 15}, ctx)

    # Initial balances
    assert stock_qty(p1) == 20
    assert stock_qty(p2) == 15
    assert balance(m_id, 'cash') == 0
    assert balance(m_id, 'sales') == 0
    assert balance(m_id, 'cogs') == 0
    assert balance(m_id, 'inventory') == 0

    # Checkout 2 Shirts and 1 Pants with discount ৳200
    # Subtotal = 2 * 1200 + 1 * 2000 = ৳4400 (440,000 poisha)
    # Discount = ৳200 (20,000 poisha) -> Total = ৳4200 (420,000 poisha)
    # Total COGS = 2 * 500 + 1 * 800 = ৳1800 (180,000 poisha)
    checkout_payload = {
        "items": [
            {"product_id": p1, "qty": 2, "unit_price": 1200.0},
            {"product_id": p2, "qty": 1, "unit_price": 2000.0},
        ],
        "customer_name": "Walk-in Buyer",
        "customer_phone": "01700112233",
        "discount": 200.0,
        "payment_method": "cash",
        "tendered": 5000.0,
        "note": "Counter 1"
    }
    res = client.post("/api/pos/checkout", json=checkout_payload)
    assert res.status_code == 200
    receipt = res.json()
    assert receipt["success"] is True
    assert receipt["subtotal"] == 4400.0
    assert receipt["discount"] == 200.0
    assert receipt["total"] == 4200.0
    assert receipt["tendered"] == 5000.0
    assert receipt["change"] == 800.0
    order_id = receipt["order_id"]

    # Verify inventory decrement in stock_movements
    assert stock_qty(p1) == 18
    assert stock_qty(p2) == 14

    # Verify double-entry journals for the order
    order_journals = live_journals_for_order(order_id)
    assert len(order_journals) == 1
    j_id = order_journals[0]["id"]

    lines = all("SELECT * FROM journal_lines WHERE journal_id = ? ORDER BY id ASC", j_id)
    # Total sum of amounts must be strictly 0
    assert sum(l["amount"] for l in lines) == 0

    # Verify specific account entries
    cash_lines = [l for l in lines if l["account"] == 'cash']
    sales_lines = [l for l in lines if l["account"] == 'sales']
    cogs_lines = [l for l in lines if l["account"] == 'cogs']
    inv_lines = [l for l in lines if l["account"] == 'inventory']

    assert sum(l["amount"] for l in cash_lines) == 420000   # +৳4200
    assert sum(l["amount"] for l in sales_lines) == -420000 # -৳4200
    assert sum(l["amount"] for l in cogs_lines) == 180000   # +৳1800
    assert sum(l["amount"] for l in inv_lines) == -180000   # -৳1800

    # Total ledger balances
    assert balance(m_id, 'cash') == 420000
    assert balance(m_id, 'sales') == -420000
    assert balance(m_id, 'cogs') == 180000
    assert balance(m_id, 'inventory') == -180000


def test_pos_multi_payment_methods_aggregation():
    """
    Verify POS checkout supports cash, bkash, nagad, and card payments,
    and /api/pos/orders correctly computes counter totals across each payment rail.
    """
    m_id, u_id = _create_env("POS Multi Rail")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p = upsert_product(m_id, {'name': 'Accessory', 'sku': 'ACC-01', 'purchase_price': 10000, 'selling_price': 50000, 'stock_qty': 100}, ctx)

    # 1. Cash sale: ৳500
    client.post("/api/pos/checkout", json={
        "items": [{"product_id": p, "qty": 1, "unit_price": 500.0}],
        "payment_method": "cash",
        "customer_name": "Cash Buyer"
    })
    # 2. bKash sale: ৳1000
    client.post("/api/pos/checkout", json={
        "items": [{"product_id": p, "qty": 2, "unit_price": 500.0}],
        "payment_method": "bkash",
        "customer_name": "bKash Buyer"
    })
    # 3. Card sale: ৳1500
    client.post("/api/pos/checkout", json={
        "items": [{"product_id": p, "qty": 3, "unit_price": 500.0}],
        "payment_method": "card",
        "customer_name": "Card Buyer"
    })
    # 4. Nagad sale: ৳2000
    client.post("/api/pos/checkout", json={
        "items": [{"product_id": p, "qty": 4, "unit_price": 500.0}],
        "payment_method": "nagad",
        "customer_name": "Nagad Buyer"
    })

    # Fetch /api/pos/orders
    res = client.get("/api/pos/orders")
    assert res.status_code == 200
    data = res.json()
    summary = data["summary"]

    assert summary["today_orders_count"] == 4
    assert summary["today_revenue_bdt"] == 5000.0
    assert summary["cash_taken_bdt"] == 500.0
    assert summary["bkash_taken_bdt"] == 1000.0
    assert summary["card_taken_bdt"] == 1500.0
    assert summary["nagad_taken_bdt"] == 2000.0


def test_pos_uncosted_sku_held_out_of_profit():
    """
    Adversarial scenario: When an uncosted SKU is sold over POS counter,
    revenue MUST be quarantined in revenue_suspense and not booked into sales profit.
    """
    m_id, u_id = _create_env("POS Uncosted")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    # Product with no purchase price
    p_uncosted = upsert_product(m_id, {'name': 'Mystery Item', 'sku': 'MYS-01', 'selling_price': 100000, 'stock_qty': 10}, ctx)

    res = client.post("/api/pos/checkout", json={
        "items": [{"product_id": p_uncosted, "qty": 1, "unit_price": 1000.0}],
        "payment_method": "cash"
    })
    assert res.status_code == 200
    receipt = res.json()
    order_id = receipt["order_id"]

    order = get_order(m_id, order_id)
    assert order["posting_state"] == "held"
    # Revenue is held in suspense
    assert balance(m_id, 'revenue_suspense') == -100000
    assert balance(m_id, 'sales') == 0
    assert balance(m_id, 'cogs') == 0

    # P&L shows 0 gross sales and 0 profit
    pnl = profit_and_loss(m_id, today(), today())
    assert pnl["gross_sales"] == 0
    assert pnl["net_profit"] == 0


# ==============================================================================
# SCENARIO 2: Quarantine & Resolution Ledger Impact
# ==============================================================================

def test_quarantine_short_settlement_resolution_ledger_impact():
    """
    Verify short-settlement resolution posts genuine journal lines into P&L
    and removes the item from the unresolved queue.
    """
    m_id, u_id = _create_env("Quarantine Resolution")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    # Create delivered order: 2 units at ৳1000 (total ৳2000 = 200,000 poisha). Cost = ৳400 (40,000 poisha)
    pid = upsert_product(m_id, {'name': 'Jacket', 'sku': 'JK-01', 'purchase_price': 40000, 'selling_price': 100000, 'stock_qty': 10}, ctx)
    oid = create_order(m_id, {
        'customer_phone': '01711223344',
        'courier': 'steadfast',
        'consignment_id': 'SF-Q1',
        'items': [{'product_id': pid, 'qty': 2, 'unit_price': 100000}],
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': today(), **ctx})

    # Initially before settlement:
    # Gross sales = ৳2000, COGS = ৳800, Net profit = ৳1200
    pnl_init = profit_and_loss(m_id, today(), today())
    assert pnl_init["gross_sales"] == 200000
    assert pnl_init["cogs"] == 80000
    assert pnl_init["net_profit"] == 120000

    # Courier settles short: pays ৳1000 instead of ৳2000 (shortfall = ৳1000 = 100,000 poisha)
    # Fee = ৳50
    rows = [{
        'consignment_id': 'SF-Q1',
        'status': 'Delivered',
        'cod_collected': 100000,
        'delivery_charge': 3000,
        'cod_fee': 2000,
        'return_charge': 0,
    }]
    commit_res = commit_settlement(m_id, rows, 'steadfast', 'short_q.csv', 'sha_q1', ctx)
    assert commit_res["exceptions"] == 1

    # Exception is raised and in queue
    exc = one("SELECT * FROM exception_queue WHERE type = 'short_settlement' AND order_id = ?", oid)
    assert exc["status"] == "open"
    assert exc["value"] == 100000
    assert balance(m_id, 'settlement_suspense') == 100000

    # Open queue API lists this item
    open_res = client.get("/api/exceptions?status=open")
    assert open_res.status_code == 200
    items = open_res.json()["items"]
    assert any(it["id"] == exc["id"] for it in items)

    # Now resolve via API with 'partial_delivery'
    resolve_res = client.post(f"/api/exceptions/{exc['id']}/resolve", json={
        "action": "partial_delivery",
        "reason_code": "partial_delivery",
        "note": "Customer rejected 1 unit at door"
    })
    assert resolve_res.status_code == 200
    assert resolve_res.json()["status"] == "resolved"

    # 1. Verify item is removed from open queue
    open_after = client.get("/api/exceptions?status=open").json()["items"]
    assert not any(it["id"] == exc["id"] for it in open_after)

    # 2. Verify suspense is cleared to 0
    assert balance(m_id, 'settlement_suspense') == 0

    # 3. Verify ledger impact:
    # Gross sales reduced by shortfall 100,000 poisha (was -200,000, now -100,000)
    assert balance(m_id, 'sales') == -100000
    # COGS reduced by 1 returned unit (was 80,000, now 40,000)
    assert balance(m_id, 'cogs') == 40000
    # Inventory restored by 1 unit (+40,000)
    assert balance(m_id, 'inventory') == -40000
    # Stock qty restored to 9 (was 8)
    assert stock_qty(pid) == 9

    # 4. P&L now reflects genuine updated numbers
    pnl_resolved = profit_and_loss(m_id, today(), today())
    assert pnl_resolved["gross_sales"] == 100000
    assert pnl_resolved["cogs"] == 40000
    # Net profit = 100000 - 40000 - 5000 (fees) = 55000 poisha (৳550)
    assert pnl_resolved["net_profit"] == 55000


def test_quarantine_delivery_discount_resolution():
    """
    Verify resolution with 'delivery_discount' books sales_discounts,
    leaves inventory consumed, and clears the exception queue.
    """
    m_id, u_id = _create_env("Quarantine Discount")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    pid = upsert_product(m_id, {'name': 'Shoes', 'sku': 'SH-02', 'purchase_price': 50000, 'selling_price': 150000, 'stock_qty': 10}, ctx)
    oid = create_order(m_id, {
        'customer_phone': '01711223399',
        'courier': 'pathao',
        'consignment_id': 'PT-D1',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 150000}],
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': today(), **ctx})

    # Courier settled ৳1200 instead of ৳1500 (short by ৳300 = 30,000 poisha)
    rows = [{
        'consignment_id': 'PT-D1',
        'status': 'Delivered',
        'cod_collected': 120000,
        'delivery_charge': 6000,
        'cod_fee': 1000,
        'return_charge': 0,
    }]
    commit_settlement(m_id, rows, 'pathao', 'short_d.csv', 'sha_d1', ctx)

    exc = one("SELECT * FROM exception_queue WHERE type = 'short_settlement' AND order_id = ?", oid)
    assert exc["status"] == "open"
    assert exc["value"] == 30000

    # Resolve with delivery_discount
    res = client.post(f"/api/exceptions/{exc['id']}/resolve", json={
        "action": "delivery_discount",
        "reason_code": "delivery_discount",
        "note": "Bargained at the door"
    })
    assert res.status_code == 200

    # Suspense cleared
    assert balance(m_id, 'settlement_suspense') == 0
    # Sales discounts debited
    assert balance(m_id, 'sales_discounts') == 30000
    # Inventory remains consumed
    assert balance(m_id, 'cogs') == 50000
    assert balance(m_id, 'inventory') == -50000

    # P&L net sales: gross (150,000) - returns/discounts (30,000) = 120,000 poisha
    pnl = profit_and_loss(m_id, today(), today())
    assert pnl["gross_sales"] == 150000
    assert pnl["net_sales"] == 120000


# ==============================================================================
# SCENARIO 3: Profit Recognition Invariant
# ==============================================================================

def test_profit_recognition_invariant_lifecycle():
    """
    Verify:
    - Placed & in-transit orders generate zero recognized revenue or profit (not a sale yet).
    - Delivered orders recognize profit.
    - Returned orders recognize return fee loss.
    """
    m_id, u_id = _create_env("Profit Invariant")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p = upsert_product(m_id, {'name': 'Silk Scarf', 'sku': 'SCF-01', 'purchase_price': 30000, 'selling_price': 80000, 'stock_qty': 50}, ctx)

    # 1. PLACED ORDER
    o_placed = create_order(m_id, {
        'customer_name': 'Buyer Placed',
        'customer_phone': '01911111111',
        'courier': 'steadfast',
        'consignment_id': 'SF-ORD-PLACED',
        'items': [{'product_id': p, 'qty': 1, 'unit_price': 80000}],
    }, ctx)

    # Verify orders API
    res = client.get("/api/orders")
    assert res.status_code == 200
    row_placed = next(r for r in res.json()["rows"] if r["id"] == o_placed)
    assert row_placed["status"] == "placed"
    assert row_placed["profit_poisha"] is None
    assert row_placed["profit_taka"] is None

    # Verify P&L
    pnl = profit_and_loss(m_id, today(), today())
    assert pnl["gross_sales"] == 0
    assert pnl["cogs"] == 0
    assert pnl["net_profit"] == 0

    # 2. TRANSITION TO IN_TRANSIT
    apply_status(m_id, o_placed, 'in_transit', {'date': today(), **ctx})
    res2 = client.get("/api/orders")
    row_transit = next(r for r in res2.json()["rows"] if r["id"] == o_placed)
    assert row_transit["status"] == "in_transit"
    assert row_transit["profit_poisha"] is None
    assert row_transit["profit_taka"] is None

    # Still zero revenue or profit
    pnl2 = profit_and_loss(m_id, today(), today())
    assert pnl2["gross_sales"] == 0
    assert pnl2["cogs"] == 0
    assert pnl2["net_profit"] == 0

    # 3. TRANSITION TO DELIVERED
    apply_status(m_id, o_placed, 'delivered', {'date': today(), **ctx})
    res3 = client.get("/api/orders")
    row_del = next(r for r in res3.json()["rows"] if r["id"] == o_placed)
    assert row_del["status"] == "delivered"
    assert row_del["profit_poisha"] is not None
    assert row_del["profit_taka"] is not None
    # Profit on delivered order is positive
    assert row_del["profit_taka"] > 0

    # Ledger now has sales revenue and COGS
    assert balance(m_id, 'sales') == -80000
    assert balance(m_id, 'cogs') == 30000

    # 4. CREATE A SECOND ORDER AND MARK RETURNED
    o_returned = create_order(m_id, {
        'customer_name': 'Buyer Return',
        'customer_phone': '01922222222',
        'courier': 'steadfast',
        'consignment_id': 'SF-ORD-RET',
        'items': [{'product_id': p, 'qty': 1, 'unit_price': 80000}],
    }, ctx)
    apply_status(m_id, o_returned, 'in_transit', {'date': today(), **ctx})
    # Apply status returned with courier charges
    apply_status(m_id, o_returned, 'returned', {
        'date': today(),
        'charges': {'delivery_charge': 7000, 'return_fee': 5000},
        **ctx
    })

    res4 = client.get("/api/orders")
    row_ret = next(r for r in res4.json()["rows"] if r["id"] == o_returned)
    assert row_ret["status"] == "returned"
    assert row_ret["profit_poisha"] is not None
    # Returned order recognizes return fee loss (negative profit)
    assert row_ret["profit_poisha"] < 0
    assert row_ret["profit_taka"] < 0


# ==============================================================================
# SCENARIO 4: Courier Settlement Clearing & Receivables
# ==============================================================================

def test_courier_settlement_clearing_matched_and_disputed():
    """
    Verify:
    - Matched consignments debit Cash and credit Courier Receivables to 0.
    - Disputed consignments are quarantined into the exception queue.
    - Receivables summary endpoint (/api/settlements/receivables-summary) accurately reflects balances.
    """
    m_id, u_id = _create_env("Courier Clearing")
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    p = upsert_product(m_id, {'name': 'Watch', 'sku': 'WAT-01', 'purchase_price': 100000, 'selling_price': 250000, 'stock_qty': 20}, ctx)

    # 1. Matched Order: Delivered, COD = ৳2500 (250,000 poisha)
    o_matched = create_order(m_id, {
        'customer_phone': '01800000001',
        'courier': 'steadfast',
        'consignment_id': 'SF-MATCH-1',
        'items': [{'product_id': p, 'qty': 1, 'unit_price': 250000}],
    }, ctx)
    apply_status(m_id, o_matched, 'delivered', {'date': today(), **ctx})

    # Receivable established at courier
    assert balance(m_id, 'courier_receivable', party='steadfast') == 250000
    assert balance(m_id, 'cash') == 0

    # 2. Preview sheet with:
    # - SF-MATCH-1: Clean match (collected 2500, delivery fee 30, cod fee 25)
    # - SF-GHOST: Unmatched consignment not in books
    # - SF-SHORT: Short payment for a new order
    o_short = create_order(m_id, {
        'customer_phone': '01800000002',
        'courier': 'steadfast',
        'consignment_id': 'SF-SHORT-1',
        'items': [{'product_id': p, 'qty': 1, 'unit_price': 250000}],
    }, ctx)
    apply_status(m_id, o_short, 'delivered', {'date': today(), **ctx})

    sheet_rows = [
        # Matched row
        {
            'Consignment ID': 'SF-MATCH-1',
            'Status': 'Delivered',
            'COD Amount': '2500',
            'Delivery Charge': '30',
            'COD fee': '25',
        },
        # Ghost consignment
        {
            'Consignment ID': 'SF-GHOST',
            'Status': 'Delivered',
            'COD Amount': '1200',
            'Delivery Charge': '30',
        },
        # Short payment
        {
            'Consignment ID': 'SF-SHORT-1',
            'Status': 'Delivered',
            'COD Amount': '1500',
            'Delivery Charge': '30',
            'COD fee': '15',
        }
    ]

    # Test preview API
    preview_res = client.post("/api/settlements/preview-json", json={'courier': 'steadfast', 'rows': sheet_rows})
    assert preview_res.status_code == 200
    pdata = preview_res.json()
    summary = pdata["summary"]
    assert summary["matched"] == 2
    assert summary["disputed"] >= 1 # SF-GHOST and SF-SHORT-1 classified as disputed

    # Now commit the settlement sheet
    commit_res = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': sheet_rows, 'filename': 'oct_sheet.csv'})
    assert commit_res.status_code == 200
    cdata = commit_res.json()
    assert cdata["ok"] is True
    assert cdata["posted"] == 1       # Clean match posted
    assert cdata["exceptions"] == 1   # Short settlement
    assert cdata["unmatched"] == 1    # Ghost consignment

    # Verify matched consignment cleared receivable and debited cash
    # Cash collected for SF-MATCH-1 = 250,000 - 5,500 = 244,500
    # Cash for SF-SHORT-1 = 150,000 - 4,500 = 145,500
    # Total cash in ledger = 244,500 + 145,500 = 390,000
    assert balance(m_id, 'cash') == 390000

    # SF-MATCH-1 receivable was fully cleared (-250,000).
    # SF-SHORT-1 receivable was cleared (-250,000) and 100,000 parked in suspense.
    # Ghost had 0 ledger postings.
    assert balance(m_id, 'settlement_suspense') == 100000

    # Verify exceptions were raised in quarantine
    ghost_exc = one("SELECT * FROM exception_queue WHERE type = 'missing_parcel'")
    assert ghost_exc is not None
    assert ghost_exc["value"] == 120000

    short_exc = one("SELECT * FROM exception_queue WHERE type = 'short_settlement'")
    assert short_exc is not None
    assert short_exc["value"] == 100000

    # Test GET /api/settlements/receivables-summary
    rec_res = client.get("/api/settlements/receivables-summary")
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert "outstanding_by_courier" in rec_data
    assert "charges_this_period" in rec_data
    assert rec_data["couriers_count"] >= 3


# ==============================================================================
# SCENARIO 5: Poisha Math & Overflow Under Extreme Values
# ==============================================================================

def test_poisha_math_floating_point_safety():
    """
    Verify to_poisha and format_taka avoid floating-point drift and handle formatting.
    """
    # Floating-point classic drift: 0.1 + 0.2 in float is 0.30000000000000004
    f_sum = 0.1 + 0.2
    assert to_poisha(f_sum) == 30

    # Common Taka amounts
    assert to_poisha(1500.50) == 150050
    assert to_poisha("1500.50") == 150050
    assert to_poisha("1,50,000.75 ৳") == 15000075
    assert to_poisha(" -500.25 ") == -50025

    # Bengali numerals
    assert to_poisha("৳ ১,৫০,০০০.৫০") == 15000050
    assert to_poisha("৫০০ টাকা") == 50000

    # Formatting in Bangladeshi grouping (e.g. 1,50,000.50)
    assert format_taka(15000050) == "৳1,50,000.50"
    assert format_taka_bn(15000050) == "৳১,৫০,০০০.৫০"
    assert format_taka(0) == "৳0"
    assert format_taka(-50025) == "-৳500.25"


def test_extreme_taka_values_and_ledger_overflow_protection():
    """
    Adversarial stress-test:
    Post massive transactions (e.g. 100 Crore Taka = 1,000,000,000 Taka = 100,000,000,000 poisha).
    Verify Python integer arithmetic and database storage maintain zero drift,
    exact balance check (sum == 0), and accurate P&L calculation.
    """
    m_id, u_id = _create_env("Extreme Scale Store")

    # 100 Crore Taka = 10^9 Taka = 10^11 poisha (100,000,000,000 poisha)
    extreme_amount = 100_000_000_000

    # 1. Post a massive journal entry
    j_id = post({
        'merchant_id': m_id,
        'date': today(),
        'kind': 'wholesale_delivery',
        'memo': 'Massive 100 Crore enterprise shipment',
        'source': 'system',
        'created_by': f'user:{u_id}'
    }, [
        {'account': 'cash', 'party': 'prime_bank', 'amount': extreme_amount},
        {'account': 'sales', 'amount': -extreme_amount},
    ])
    assert j_id > 0

    # 2. Check balance query
    cash_bal = balance(m_id, 'cash', party='prime_bank')
    assert cash_bal == extreme_amount
    sales_bal = balance(m_id, 'sales')
    assert sales_bal == -extreme_amount

    # 3. Check profit and loss handles the extreme numbers without overflow or scientific notation
    pnl = profit_and_loss(m_id, today(), today())
    assert pnl["gross_sales"] == extreme_amount
    assert pnl["net_profit"] == extreme_amount

    # 4. Format extreme numbers in Bangladeshi commas
    # 100 Crore = ৳1,00,00,00,000
    fmt = format_taka(extreme_amount, show_decimals=False)
    assert fmt == "৳1,00,00,00,000"

    # 5. Out of balance rejection on extreme numbers:
    # If off by even 1 poisha on a 100 Crore transaction, it MUST raise ValueError
    with pytest.raises(ValueError, match="out of balance"):
        post({
            'merchant_id': m_id,
            'date': today(),
            'kind': 'test_err',
            'source': 'system',
            'created_by': f'user:{u_id}'
        }, [
            {'account': 'cash', 'amount': extreme_amount},
            {'account': 'sales', 'amount': -(extreme_amount - 1)}, # 1 poisha drift
        ])
