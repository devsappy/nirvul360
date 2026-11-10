"""
Empirical Challenger 2 Verification Suite: Accounting & Business Logic Integrity

Tests the non-negotiable financial invariants:
1. Owner withdrawals isolation:
   - Multiple owner withdrawals do not alter net profit in /api/dashboard/pnl, /api/reports/pnl, or /api/dashboard
   - Cash decreases by the exact withdrawal amounts, but operating expenses and P&L remain untouched.
2. FIFO purchase batch costing:
   - Adding a new purchase batch (at radically different unit costs) does not rewrite past delivered orders' COGS
   - Past journal_lines, P&L COGS, and product performance reports remain immutable.
3. Exception queue quarantine:
   - 3A: Unpriced SKUs are held in revenue_suspense and excluded from P&L net profit until price is set.
   - 3B: Unresolved courier settlement shortfalls are parked in settlement_suspense and held out of P&L net profit until resolved.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, one, all, run
from app.domain.merchants import create_merchant, create_user, create_cash_account
from app.domain.products import upsert_product, cost_at
from app.domain.orders import create_order, apply_status, get_order
from app.domain.entries import record_expense, record_withdrawal, record_purchase
from app.domain.settlements import commit_settlement
from app.domain.exceptions import seed_reason_codes, list_exceptions
from app.domain.reports import profit_and_loss
from app.lib.dates import reset_clock, today, add_days

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_challenger_env():
    """Initializes in-memory database with test merchant, user, and cash accounts."""
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()
    t = today()

    # Create Merchant
    m_id = create_merchant({'name': 'Challenger Textiles BD', 'phone': '01700112233'})
    run("UPDATE merchants SET plan = 'growth', plan_price = 100000, order_limit = 5000 WHERE id = ?", m_id)

    # Create Owner User
    u_id = create_user(m_id, {
        'name': 'Challenger Owner',
        'email': 'owner@challenger.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    actor = f"user:{u_id}"
    ctx = {'source': 'manual', 'actor': actor}

    # Bank and bKash Accounts
    bank_acc = create_cash_account(m_id, {
        'name': 'Prime Bank General',
        'kind': 'bank',
        'opening_balance': 50000000, # 500,000 Taka
        'opening_date': add_days(t, -30),
        'is_default': True
    }, actor)

    bkash_acc = create_cash_account(m_id, {
        'name': 'bKash Wallet',
        'kind': 'bkash',
        'opening_balance': 20000000, # 200,000 Taka
        'opening_date': add_days(t, -30)
    }, actor)

    return {
        'm_id': m_id,
        'u_id': u_id,
        'actor': actor,
        'ctx': ctx,
        'bank_acc': bank_acc,
        'bkash_acc': bkash_acc,
        'today': t
    }


def _auth_login():
    res = client.post("/api/auth/login", json={'email': 'owner@challenger.bd', 'password': 'password123'})
    assert res.status_code == 200, f"Login failed: {res.text}"


def test_empirical_owner_withdrawals_isolation(setup_challenger_env):
    """
    Challenge 1: Owner withdrawals isolation.
    Post multiple owner withdrawals and verify that net profit in:
      - /api/dashboard/pnl
      - /api/reports/pnl
      - /api/dashboard (kpis.net_profit and pnl.net_profit)
    remains completely unchanged.
    """
    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    # 1. Establish initial operational revenue & expenses
    # Product with purchase price 200 Taka (20,000 poisha), selling price 500 Taka (50,000 poisha)
    pid = upsert_product(m_id, {
        'sku': 'POLO-01',
        'name': 'Premium Polo',
        'selling_price': 50000,
        'purchase_price': 20000,
        'stock_qty': 50
    }, ctx)

    # Order 1: 2 units -> Sales: 100,000 poisha, COGS: 40,000 poisha
    oid = create_order(m_id, {
        'customer_phone': '01899112233',
        'courier': 'pathao',
        'consignment_id': 'PTH-001',
        'items': [{'product_id': pid, 'qty': 2, 'unit_price': 50000}]
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': t, **ctx})

    # Operating expenses: rent 15,000 poisha, packaging 5,000 poisha
    record_expense(m_id, {'head': 'rent', 'amount': 15000, 'date': t, 'cash_account_id': env['bank_acc'], 'note': 'Office rent'}, ctx)
    record_expense(m_id, {'head': 'packaging', 'amount': 5000, 'date': t, 'cash_account_id': env['bkash_acc'], 'note': 'Boxes'}, ctx)

    # Baseline calculations:
    # Gross Sales: 100,000
    # COGS: 40,000
    # Operating Expenses: 20,000 (15,000 + 5,000)
    # Expected Net Profit = 100,000 - 40,000 - 20,000 = 40,000 poisha
    expected_net_profit = 40000

    dash_res_before = client.get("/api/dashboard")
    assert dash_res_before.status_code == 200
    dash_before = dash_res_before.json()
    assert dash_before['kpis']['net_profit'] == expected_net_profit
    assert dash_before['pnl']['net_profit'] == expected_net_profit

    dash_pnl_res_before = client.get("/api/dashboard/pnl")
    assert dash_pnl_res_before.status_code == 200
    dash_pnl_before = dash_pnl_res_before.json()
    assert dash_pnl_before['net_profit'] == expected_net_profit

    reports_pnl_res_before = client.get(f"/api/reports/pnl?from_date={t[:7]}-01&to_date={t}")
    assert reports_pnl_res_before.status_code == 200
    reports_pnl_before = reports_pnl_res_before.json()
    assert reports_pnl_before['net_profit'] == expected_net_profit

    cash_before = dash_before['cash']['cash_in_hand']

    # 2. Post MULTIPLE owner withdrawals of various amounts on various dates/accounts
    # Withdrawal 1: 500 Taka (50,000 poisha) via API POST /api/withdrawals
    res_w1 = client.post("/api/withdrawals", json={
        'amount': 500.0,
        'date': t,
        'cash_account_id': env['bank_acc'],
        'note': 'Owner personal drawing 1'
    })
    assert res_w1.status_code == 200

    # Withdrawal 2: 1,250 Taka (125,000 poisha) via API POST /api/withdrawals
    res_w2 = client.post("/api/withdrawals", json={
        'amount': 1250.0,
        'date': t,
        'cash_account_id': env['bkash_acc'],
        'note': 'Owner personal drawing 2'
    })
    assert res_w2.status_code == 200

    # Withdrawal 3: 300 Taka (30,000 poisha) via domain record_withdrawal
    record_withdrawal(m_id, {
        'amount': 30000,
        'date': t,
        'cash_account_id': env['bank_acc'],
        'note': 'Owner personal drawing 3'
    }, ctx)

    total_withdrawn_poisha = 50000 + 125000 + 30000 # 205,000 poisha

    # 3. EMPIRICAL VERIFICATION: Net profit in ALL endpoints MUST remain EXACTLY identical!
    # /api/dashboard/pnl
    dash_pnl_res_after = client.get("/api/dashboard/pnl")
    assert dash_pnl_res_after.status_code == 200
    dash_pnl_after = dash_pnl_res_after.json()
    assert dash_pnl_after['net_profit'] == expected_net_profit, (
        f"VIOLATION: /api/dashboard/pnl net profit shifted from {expected_net_profit} to {dash_pnl_after['net_profit']}"
    )

    # /api/reports/pnl
    reports_pnl_res_after = client.get(f"/api/reports/pnl?from_date={t[:7]}-01&to_date={t}")
    assert reports_pnl_res_after.status_code == 200
    reports_pnl_after = reports_pnl_res_after.json()
    assert reports_pnl_after['net_profit'] == expected_net_profit, (
        f"VIOLATION: /api/reports/pnl net profit shifted from {expected_net_profit} to {reports_pnl_after['net_profit']}"
    )

    # /api/dashboard
    dash_res_after = client.get("/api/dashboard")
    assert dash_res_after.status_code == 200
    dash_after = dash_res_after.json()
    assert dash_after['kpis']['net_profit'] == expected_net_profit
    assert dash_after['pnl']['net_profit'] == expected_net_profit

    # 4. Verify operating expenses summary strictly excludes withdrawals
    exp_summary_res = client.get(f"/api/expenses/summary?from_date={t[:7]}-01&to_date={t}")
    assert exp_summary_res.status_code == 200
    exp_summary = exp_summary_res.json()
    assert exp_summary['total_operating_expenses_poisha'] == 20000 # 15,000 rent + 5,000 packaging
    assert exp_summary['owner_withdrawals']['total_poisha'] == total_withdrawn_poisha

    # 5. Verify cash position: cash in hand reduced by exactly total_withdrawn_poisha
    cash_after = dash_after['cash']['cash_in_hand']
    assert cash_after == cash_before - total_withdrawn_poisha, (
        f"Cash reduction mismatch: expected {cash_before - total_withdrawn_poisha}, got {cash_after}"
    )


def test_empirical_fifo_purchase_batch_costing(setup_challenger_env):
    """
    Challenge 2: FIFO purchase batch costing immutability.
    Verify that adding a new purchase batch does not rewrite past delivered orders' COGS.
    """
    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    # Step 1: Create Product
    pid = upsert_product(m_id, {
        'sku': 'JEANS-01',
        'name': 'Slim Indigo Jeans',
        'selling_price': 120000, # 1,200 Taka
    }, ctx)

    # Batch 1 (PB-001): 10 units at 400 Taka (40,000 poisha)
    p1_date = add_days(t, -10)
    pur1_id = record_purchase(m_id, {
        'productId': pid,
        'qty': 10,
        'unitCost': 40000,
        'date': p1_date,
        'paidAmount': 400000,
        'cashAccountId': env['bank_acc']
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-001' WHERE id = ?", pur1_id)

    # Place and Deliver Order 1 on date p1_date + 2 days
    o1_date = add_days(t, -8)
    oid1 = create_order(m_id, {
        'customer_phone': '01711002211',
        'courier': 'pathao',
        'consignment_id': 'PTH-J01',
        'order_date': o1_date,
        'items': [{'product_id': pid, 'qty': 4, 'unit_price': 120000}]
    }, ctx)
    apply_status(m_id, oid1, 'delivered', {'date': o1_date, **ctx})

    # Order 1 delivered: 4 units * 40,000 poisha = 160,000 poisha COGS
    expected_o1_cogs = 160000
    expected_o1_rev = 480000 # 4 * 120,000

    # Query initial COGS in journal_lines
    cogs_line_1 = one(
        "SELECT l.id, l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'cogs'",
        m_id, oid1
    )
    assert cogs_line_1 is not None
    assert cogs_line_1['amount'] == expected_o1_cogs
    original_cogs_line_id = cogs_line_1['id']

    # Query P&L for Order 1's period
    pnl_before = client.get(f"/api/reports/pnl?from_date={o1_date}&to_date={o1_date}").json()
    assert pnl_before['gross_sales'] == expected_o1_rev
    assert pnl_before['cogs'] == expected_o1_cogs
    assert pnl_before['net_profit'] == expected_o1_rev - expected_o1_cogs

    # Step 2: ADD NEW PURCHASE BATCH with radically higher cost (3.5x higher cost)
    # Batch 2 (PB-002): 20 units at 1,400 Taka (140,000 poisha) on date p1_date + 4 days
    p2_date = add_days(t, -4)
    pur2_id = record_purchase(m_id, {
        'productId': pid,
        'qty': 20,
        'unitCost': 140000,
        'date': p2_date,
        'paidAmount': 2800000,
        'cashAccountId': env['bank_acc']
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-002' WHERE id = ?", pur2_id)

    # Step 3: EMPIRICAL VERIFICATION: Did Batch 2 rewrite Order 1's COGS?
    # A. Check journal_lines for Order 1: MUST NOT BE REWRITTEN
    cogs_lines_after = all(
        "SELECT l.id, l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'cogs'",
        m_id, oid1
    )
    assert len(cogs_lines_after) == 1, "VIOLATION: Multiple COGS lines or mutation on Order 1!"
    assert cogs_lines_after[0]['id'] == original_cogs_line_id, "VIOLATION: COGS line ID changed!"
    assert cogs_lines_after[0]['amount'] == expected_o1_cogs, (
        f"VIOLATION: Order 1 COGS rewritten from {expected_o1_cogs} to {cogs_lines_after[0]['amount']}!"
    )

    # B. Check P&L for past delivered period: COGS and Net Profit MUST be completely identical
    pnl_past_after = client.get(f"/api/reports/pnl?from_date={o1_date}&to_date={o1_date}").json()
    assert pnl_past_after['gross_sales'] == expected_o1_rev
    assert pnl_past_after['cogs'] == expected_o1_cogs, (
        f"VIOLATION: Historical P&L COGS rewritten from {expected_o1_cogs} to {pnl_past_after['cogs']}!"
    )
    assert pnl_past_after['net_profit'] == expected_o1_rev - expected_o1_cogs

    # C. Check Product Performance report for that historical window: COGS must remain 160,000
    perf_past = client.get(f"/api/reports/product-performance?from_date={o1_date}&to_date={o1_date}").json()
    jeans_perf = next((r for r in perf_past['rows'] if r['product_id'] == pid), None)
    assert jeans_perf is not None
    assert jeans_perf['cogs_poisha'] == expected_o1_cogs, (
        f"VIOLATION: Product performance COGS rewritten from {expected_o1_cogs} to {jeans_perf['cogs_poisha']}!"
    )

    # Step 4: Now deliver Order 2 under new cost regime and verify independent costing
    o2_date = t
    oid2 = create_order(m_id, {
        'customer_phone': '01711002299',
        'courier': 'pathao',
        'consignment_id': 'PTH-J02',
        'items': [{'product_id': pid, 'qty': 2, 'unit_price': 120000}]
    }, ctx)
    apply_status(m_id, oid2, 'delivered', {'date': o2_date, **ctx})

    # Effective cost on o2_date is moving average of (6 remaining units @ 40,000 + 20 units @ 140,000) / 26
    # = (240,000 + 2,800,000) / 26 = 3,040,000 / 26 = 116,923 poisha
    cost_o2 = cost_at(pid, o2_date)
    expected_o2_cogs = 2 * cost_o2['purchase_price']

    cogs_o2_line = one(
        "SELECT l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'cogs'",
        m_id, oid2
    )
    assert cogs_o2_line['amount'] == expected_o2_cogs

    # Order 1 COGS is STILL 160,000 poisha
    cogs_o1_final = one(
        "SELECT l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'cogs'",
        m_id, oid1
    )
    assert cogs_o1_final['amount'] == expected_o1_cogs


def test_empirical_exception_queue_quarantine_unpriced_sku(setup_challenger_env):
    """
    Challenge 3A: Exception queue quarantine — Unpriced SKUs.
    Verify that unpriced SKUs are held out of P&L net profit until purchase price is entered.
    """
    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    # 1. Create product with NO purchase price
    pid = upsert_product(m_id, {
        'sku': 'UNPRICED-01',
        'name': 'Mystery Uncosted Item',
        'selling_price': 80000, # 800 Taka
        'stock_qty': 25
    }, ctx)

    # 2. Place and deliver Order for this unpriced product
    oid = create_order(m_id, {
        'customer_phone': '01611223344',
        'courier': 'steadfast',
        'consignment_id': 'SF-UNPRICED',
        'items': [{'product_id': pid, 'qty': 2, 'unit_price': 80000}]
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': t, **ctx})

    # Order state must be 'held'
    ord_row = get_order(m_id, oid)
    assert ord_row['posting_state'] == 'held', f"Expected posting_state 'held', got {ord_row['posting_state']}"

    # 3. Double-entry verification: NO sales or cogs rows, revenue parked in revenue_suspense
    j_lines = all(
        "SELECT l.account, l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ?",
        m_id, oid
    )
    accounts_hit = {l['account']: l['amount'] for l in j_lines}
    assert 'sales' not in accounts_hit, "VIOLATION: Unpriced SKU posted to sales account!"
    assert 'cogs' not in accounts_hit, "VIOLATION: Unpriced SKU posted to cogs account!"
    assert 'revenue_suspense' in accounts_hit, "VIOLATION: Unpriced SKU not held in revenue_suspense!"
    assert accounts_hit['revenue_suspense'] == -160000 # 2 * 80,000 credit

    # 4. P&L verification: Net Profit MUST BE 0 (strictly quarantined)
    dash_pnl = client.get("/api/dashboard/pnl").json()
    assert dash_pnl['gross_sales'] == 0
    assert dash_pnl['cogs'] == 0
    assert dash_pnl['net_profit'] == 0, (
        f"VIOLATION: Unpriced SKU leaked into dashboard P&L net profit: {dash_pnl['net_profit']}"
    )

    reports_pnl = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert reports_pnl['gross_sales'] == 0
    assert reports_pnl['cogs'] == 0
    assert reports_pnl['net_profit'] == 0, (
        f"VIOLATION: Unpriced SKU leaked into reports P&L net profit: {reports_pnl['net_profit']}"
    )

    # 5. Exception Queue verification: open exception exists
    exc_list = client.get("/api/exceptions?status=open").json()
    missing_cost_exc = next((e for e in exc_list['items'] if e['product_id'] == pid), None)
    assert missing_cost_exc is not None, "VIOLATION: Exception queue missing unpriced SKU entry!"
    exc_id = missing_cost_exc['id']

    # Product performance masking
    perf = client.get(f"/api/reports/product-performance?from_date={t}&to_date={t}").json()
    prod_row = next((r for r in perf['rows'] if r['product_id'] == pid), None)
    assert prod_row is not None
    assert prod_row['missing_cost_price'] is True
    assert prod_row['cogs_poisha'] is None # Masked
    assert prod_row['net_profit_poisha'] is None # Masked

    # 6. RESOLVE the exception by adding the purchase price (e.g. 350 Taka = 35,000 poisha)
    resolve_res = client.post(f"/api/exceptions/{exc_id}/resolve", json={
        'action': 'add_purchase_price',
        'purchase_price': 350.0
    })
    assert resolve_res.status_code == 200

    # 7. Verify clean release from quarantine into P&L
    ord_row_resolved = get_order(m_id, oid)
    assert ord_row_resolved['posting_state'] == 'posted'

    # Revenue released to sales (160,000), COGS posted (2 * 35,000 = 70,000), Net Profit = 90,000
    expected_profit_released = 160000 - 70000 # 90,000 poisha

    dash_pnl_released = client.get("/api/dashboard/pnl").json()
    assert dash_pnl_released['gross_sales'] == 160000
    assert dash_pnl_released['cogs'] == 70000
    assert dash_pnl_released['net_profit'] == expected_profit_released

    reports_pnl_released = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert reports_pnl_released['gross_sales'] == 160000
    assert reports_pnl_released['cogs'] == 70000
    assert reports_pnl_released['net_profit'] == expected_profit_released


def test_empirical_exception_queue_quarantine_courier_shortfall(setup_challenger_env):
    """
    Challenge 3B: Exception queue quarantine — Unresolved courier settlement discrepancies.
    Verify that unresolved courier shortfalls are parked in settlement_suspense and held out of P&L net profit.
    """
    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    # 1. Product and delivered order
    # Selling price: 1,000 Taka (100,000 poisha), Cost: 400 Taka (40,000 poisha)
    pid = upsert_product(m_id, {
        'sku': 'WATCH-01',
        'name': 'Quartz Watch',
        'selling_price': 100000,
        'purchase_price': 40000,
        'stock_qty': 10
    }, ctx)

    oid = create_order(m_id, {
        'customer_phone': '01511223344',
        'courier': 'steadfast',
        'consignment_id': 'SF-SHORT-99',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 100000}]
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': t, **ctx})

    # Baseline P&L before settlement:
    # Gross sales: 100,000 poisha
    # COGS: 40,000 poisha
    # Net profit: 60,000 poisha
    pnl_initial = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert pnl_initial['gross_sales'] == 100000
    assert pnl_initial['cogs'] == 40000
    assert pnl_initial['net_profit'] == 60000

    # 2. Courier settles short: COD promised was 100,000 poisha, but courier remits only 60,000 poisha (shortfall = 40,000 poisha)
    # Courier fees: 5,000 poisha delivery charge
    sheet_rows = [{
        'consignment_id': 'SF-SHORT-99',
        'order_id': oid,
        'status': 'Delivered',
        'cod_collected': 60000,
        'delivery_charge': 5000,
        'cod_fee': 0,
        'return_charge': 0,
        'settlement_date': t
    }]
    commit_res = commit_settlement(
        m_id, sheet_rows, 'steadfast', 'sf_sheet.csv', 'sha256-test-courier-short',
        {'source': 'courier_sheet_upload', 'actor': env['actor']}
    )
    assert commit_res['exceptions'] == 1

    # 3. Check settlement_suspense: The 40,000 poisha shortfall MUST be parked in settlement_suspense
    suspense_row = one(
        "SELECT l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'settlement_suspense'",
        m_id, oid
    )
    assert suspense_row is not None
    assert suspense_row['amount'] == 40000

    # 4. EMPIRICAL VERIFICATION: While UNRESOLVED, the 40,000 poisha shortfall is held OUT of P&L net profit
    # Gross sales must remain 100,000 poisha
    # Courier fee expense booked: 5,000 poisha
    # Net profit must be 100,000 (sales) - 40,000 (cogs) - 5,000 (courier fee) = 55,000 poisha!
    # The 40,000 poisha shortfall CANNOT reduce net profit before the merchant determines why the courier underpaid!
    pnl_unresolved = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert pnl_unresolved['gross_sales'] == 100000
    assert pnl_unresolved['cogs'] == 40000
    assert pnl_unresolved['sections']['courier']['amount'] == 5000
    assert pnl_unresolved['net_profit'] == 55000, (
        f"VIOLATION: Unresolved courier discrepancy leaked into P&L net profit! Expected 55,000, got {pnl_unresolved['net_profit']}"
    )

    dash_pnl_unresolved = client.get("/api/dashboard/pnl").json()
    assert dash_pnl_unresolved['net_profit'] == 55000

    # 5. Exception queue has open short_settlement exception
    exc_list = client.get("/api/exceptions?status=open").json()
    short_exc = next((e for e in exc_list['items'] if e['order_id'] == oid and e['type'] == 'short_settlement'), None)
    assert short_exc is not None
    assert short_exc['value_poisha'] == 40000
    exc_id = short_exc['id']

    # 6. Now RESOLVE the discrepancy: Merchant confirms a door discount was given ('delivery_discount')
    # This officially recognizes a door discount, reducing net sales by 40,000 poisha
    res_resolve = client.post(f"/api/exceptions/{exc_id}/resolve", json={
        'action': 'delivery_discount',
        'reason_code': 'delivery_discount'
    })
    assert res_resolve.status_code == 200

    # 7. After resolution: door discount enters returns section, reducing net profit from 55,000 to 15,000 poisha
    pnl_resolved = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert pnl_resolved['gross_sales'] == 100000
    assert pnl_resolved['sections']['returns']['amount'] == 40000 # sales_discounts line
    assert pnl_resolved['net_sales'] == 60000 # 100,000 - 40,000
    assert pnl_resolved['cogs'] == 40000
    assert pnl_resolved['sections']['courier']['amount'] == 5000
    assert pnl_resolved['net_profit'] == 15000 # 60,000 - 40,000 - 5,000

    # And exception is now marked resolved
    exc_list_after = client.get("/api/exceptions?status=open").json()
    assert not any(e['id'] == exc_id for e in exc_list_after['items'])


def test_empirical_owner_withdrawals_exceeding_profit_and_cash_flow(setup_challenger_env):
    """
    Challenge 1 (Adversarial Stress):
    Verify that massive owner withdrawals exceeding operating profit do NOT cause negative P&L profit,
    and verify that cash flow report properly records withdrawals while P&L strictly excludes them.
    """
    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    # Create small profit: Sales 50,000 poisha, COGS 20,000 poisha -> Net profit = 30,000 poisha
    pid = upsert_product(m_id, {'sku': 'TEE-MIN', 'name': 'Minimal Tee', 'selling_price': 50000, 'purchase_price': 20000}, ctx)
    oid = create_order(m_id, {'items': [{'product_id': pid, 'qty': 1, 'unit_price': 50000}]}, ctx)
    apply_status(m_id, oid, 'delivered', {'date': t, **ctx})

    pnl_pre = client.get("/api/dashboard/pnl").json()
    assert pnl_pre['net_profit'] == 30000

    # Owner withdraws 10,000,000 poisha (100,000 Taka) — over 333x the net profit!
    res_w = client.post("/api/withdrawals", json={
        'amount': 100000.0,
        'date': t,
        'cash_account_id': env['bank_acc'],
        'note': 'Massive owner withdrawal'
    })
    assert res_w.status_code == 200

    # P&L net profit MUST still be +30,000 poisha! (NOT negative 9,970,000 poisha!)
    pnl_post_dash = client.get("/api/dashboard/pnl").json()
    assert pnl_post_dash['net_profit'] == 30000

    pnl_post_rep = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert pnl_post_rep['net_profit'] == 30000

    # Cash flow report MUST show the withdrawal under outflows
    cf_res = client.get(f"/api/reports/cash-flow?from_date={t}&to_date={t}")
    assert cf_res.status_code == 200
    cf = cf_res.json()
    w_outflow = next((o for o in cf['outflows'] if o['category'] == 'owner_withdrawal'), None)
    assert w_outflow is not None
    assert w_outflow['amount_poisha'] == 10000000


def test_empirical_supplier_fifo_statement_and_multi_batch(setup_challenger_env):
    """
    Challenge 2 (Adversarial Stress):
    Verify supplier statement FIFO payment allocation across 3 sequential batches,
    and verify delivered orders across each batch window remain sealed at their historical COGS.
    """
    from app.domain.merchants import create_supplier
    from app.domain.entries import record_supplier_payment

    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    sup_id = create_supplier(m_id, {
        'name': 'Dhaka Fabrics Ltd',
        'phone': '01988776655',
        'terms_days': 15
    })

    pid = upsert_product(m_id, {'sku': 'SILK-01', 'name': 'Pure Silk Scarf', 'selling_price': 150000}, ctx)

    # Batch 1 (PB-101): 10 units @ 50,000 poisha (500,000 total)
    d1 = add_days(t, -20)
    p1 = record_purchase(m_id, {'productId': pid, 'qty': 10, 'unitCost': 50000, 'supplierId': sup_id, 'date': d1}, ctx)
    run("UPDATE purchases SET batch_no = 'PB-101' WHERE id = ?", p1)

    # Batch 2 (PB-102): 10 units @ 80,000 poisha (800,000 total)
    d2 = add_days(t, -10)
    p2 = record_purchase(m_id, {'productId': pid, 'qty': 10, 'unitCost': 80000, 'supplierId': sup_id, 'date': d2}, ctx)
    run("UPDATE purchases SET batch_no = 'PB-102' WHERE id = ?", p2)

    # Batch 3 (PB-103): 10 units @ 120,000 poisha (1,200,000 total)
    d3 = add_days(t, -2)
    p3 = record_purchase(m_id, {'productId': pid, 'qty': 10, 'unitCost': 120000, 'supplierId': sup_id, 'date': d3}, ctx)
    run("UPDATE purchases SET batch_no = 'PB-103' WHERE id = ?", p3)

    # Total payable = 500k + 800k + 1200k = 2,500,000 poisha
    stmt = client.get(f"/api/suppliers/{sup_id}/statement").json()
    assert stmt['supplier']['payable_balance_poisha'] == 2500000
    # All 3 batches Unpaid
    assert [b['status'] for b in stmt['batches']] == ['Unpaid', 'Unpaid', 'Unpaid']

    # Now pay 900,000 poisha to supplier:
    # Under FIFO: PB-101 (500k) should be "Paid", PB-102 (800k) should be "Part paid" (400k paid), PB-103 should be "Unpaid"
    record_supplier_payment(m_id, {
        'supplier_id': sup_id,
        'amount': 900000,
        'date': add_days(t, -1),
        'cash_account_id': env['bank_acc']
    }, ctx)

    stmt_after = client.get(f"/api/suppliers/{sup_id}/statement").json()
    assert stmt_after['supplier']['payable_balance_poisha'] == 1600000
    # batches are returned newest-first: PB-103, PB-102, PB-101
    batch_map = {b['batch_no']: b for b in stmt_after['batches']}
    assert batch_map['PB-101']['status'] == 'Paid'
    assert batch_map['PB-101']['paid_poisha'] == 500000
    assert batch_map['PB-102']['status'] == 'Part paid'
    assert batch_map['PB-102']['paid_poisha'] == 400000
    assert batch_map['PB-103']['status'] == 'Unpaid'
    assert batch_map['PB-103']['paid_poisha'] == 0


def test_empirical_mixed_order_unpriced_sku_and_zero_settlement(setup_challenger_env):
    """
    Challenge 3 (Adversarial Stress):
    Verify that an order with a MIX of priced and unpriced SKUs is 100% held in quarantine,
    and verify zero-settlement courier discrepancy is held in settlement_suspense.
    """
    env = setup_challenger_env
    m_id = env['m_id']
    ctx = env['ctx']
    t = env['today']
    _auth_login()

    # Product A: priced @ 30,000 poisha, selling price 80,000 poisha
    p_priced = upsert_product(m_id, {'sku': 'PRICED-01', 'name': 'Priced Item', 'selling_price': 80000, 'purchase_price': 30000}, ctx)
    # Product B: unpriced (no cost price)
    p_unpriced = upsert_product(m_id, {'sku': 'NOCOST-01', 'name': 'Unpriced Item', 'selling_price': 120000}, ctx)

    # Multi-item order containing BOTH
    oid = create_order(m_id, {
        'customer_phone': '01333445566',
        'courier': 'pathao',
        'consignment_id': 'PTH-MIX-1',
        'items': [
            {'product_id': p_priced, 'qty': 1, 'unit_price': 80000},
            {'product_id': p_unpriced, 'qty': 1, 'unit_price': 120000}
        ]
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': t, **ctx})

    # Order total = 200,000 poisha.
    # INVARIANT: Because Product B has missing cost, NEITHER Product A nor Product B may enter sales!
    ord_row = get_order(m_id, oid)
    assert ord_row['posting_state'] == 'held'

    pnl = client.get(f"/api/reports/pnl?from_date={t}&to_date={t}").json()
    assert pnl['gross_sales'] == 0
    assert pnl['cogs'] == 0
    assert pnl['net_profit'] == 0

    # Suspense has 200,000 poisha
    suspense_row = one(
        "SELECT l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'revenue_suspense'",
        m_id, oid
    )
    assert suspense_row['amount'] == -200000

    # Now test Zero-settlement on a separate priced delivered order
    oid_zero = create_order(m_id, {
        'customer_phone': '01444556677',
        'courier': 'steadfast',
        'consignment_id': 'SF-ZERO-1',
        'items': [{'product_id': p_priced, 'qty': 2, 'unit_price': 80000}]
    }, ctx)
    apply_status(m_id, oid_zero, 'delivered', {'date': t, **ctx})

    # Courier remits 0 COD (zero settlement)
    sheet_rows = [{
        'consignment_id': 'SF-ZERO-1',
        'order_id': oid_zero,
        'status': 'Delivered',
        'cod_collected': 0, # ZERO COD collected!
        'delivery_charge': 6000,
        'cod_fee': 0,
        'return_charge': 0,
        'settlement_date': t
    }]
    commit_res = commit_settlement(
        m_id, sheet_rows, 'steadfast', 'zero.csv', 'sha256-zero-test',
        {'source': 'courier_sheet_upload', 'actor': env['actor']}
    )
    assert commit_res['exceptions'] == 1

    # Entire COD (160,000 poisha) must be parked in settlement_suspense
    zero_suspense = one(
        "SELECT l.amount FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE j.merchant_id = ? AND j.order_id = ? AND l.account = 'settlement_suspense'",
        m_id, oid_zero
    )
    assert zero_suspense['amount'] == 160000

    # Unresolved zero_settlement exception exists
    exc_list = client.get("/api/exceptions?status=open").json()
    zero_exc = next((e for e in exc_list['items'] if e['order_id'] == oid_zero and e['type'] == 'zero_settlement'), None)
    assert zero_exc is not None
    assert zero_exc['value_poisha'] == 160000

