"""
Milestone 1 Adversarial & Stress Test Suite:
Empirical challenge tests evaluating backend robustness:
1. SQL injection / malformed query parameters on target endpoints.
2. Concurrent / out-of-order date filters (from_date > to_date, invalid date strings).
3. FIFO payment allocation stress (overpayment exceeding total batch value, zero batches, multiple batches).
4. Extreme inputs (negative amounts, zero values, massive poisha numbers, invalid day ranges).
5. System behavior verification: Clean HTTP 400/422 responses vs unhandled HTTP 500 exceptions.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, run, one, all
from app.domain.merchants import create_merchant, create_user, create_cash_account, create_supplier
from app.domain.products import upsert_product
from app.domain.entries import record_purchase, record_supplier_payment
from app.lib.dates import reset_clock, today, add_days

client = TestClient(app, raise_server_exceptions=False)

@pytest.fixture(autouse=True)
def setup_adversarial_env():
    """Initializes in-memory database with test tenant, users, and cash accounts."""
    open_db(":memory:")
    reset_clock()
    t = today()

    # Create Merchant
    m1_id = create_merchant({'name': 'Adversarial Test Merchant', 'phone': '01700000001'})
    run("UPDATE merchants SET plan = 'growth', plan_price = 100000, order_limit = 5000 WHERE id = ?", m1_id)

    # Super Admin
    super_admin_id = create_user(m1_id, {
        'name': 'Platform Admin',
        'email': 'admin@adversarial.bd',
        'role': 'super_admin',
        'password': 'password123'
    })

    # Agency Owner
    owner_id = create_user(m1_id, {
        'name': 'Store Owner',
        'email': 'owner@adversarial.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    actor = f"user:{owner_id}"
    ctx = {'source': 'manual', 'actor': actor}

    # Cash Account
    bank_acc = create_cash_account(m1_id, {
        'name': 'Main Bank',
        'kind': 'bank',
        'opening_balance': 50000000,
        'opening_date': add_days(t, -30),
        'is_default': True
    }, actor)

    # Product
    p1 = upsert_product(m1_id, {
        'sku': 'ADV-SKU-01',
        'name': 'Stress Product',
        'selling_price': 50000,
        'purchase_price': 20000,
        'stock_qty': 500
    }, ctx)

    return {
        'm1_id': m1_id,
        'super_admin_id': super_admin_id,
        'owner_id': owner_id,
        'bank_acc': bank_acc,
        'p1': p1,
        'actor': actor,
        'ctx': ctx
    }


def login_super_admin():
    res = client.post("/api/auth/login", json={'email': 'admin@adversarial.bd', 'password': 'password123'})
    assert res.status_code == 200


def login_owner():
    res = client.post("/api/auth/login", json={'email': 'owner@adversarial.bd', 'password': 'password123'})
    assert res.status_code == 200


# ==============================================================================
# 1. SQL INJECTION & MALFORMED QUERY PARAMETERS
# ==============================================================================

SQLI_PAYLOADS = [
    "' OR '1'='1",
    "'; DROP TABLE merchants; --",
    "1' UNION SELECT NULL, NULL, NULL --",
    "' AND 1=0 UNION ALL SELECT 1, 'admin', 'pass' --",
    "'; UPDATE users SET role='super_admin' WHERE 1=1; --",
    "%27%20OR%201%3D1%20--",
    "../../../etc/passwd",
    "null",
    "undefined",
    "NaN",
    "{}[]!@#$%^&*()",
]

def test_sqli_and_malformed_params_on_admin_overview():
    """Verify /api/admin/overview with SQL injection and malformed range params."""
    login_super_admin()
    for payload in SQLI_PAYLOADS:
        res = client.get(f"/api/admin/overview?range={payload}")
        assert res.status_code in (200, 400, 422), f"Failed with {res.status_code} for payload: {payload}"
        # Ensure merchants table is not dropped
        merchants = all("SELECT id FROM merchants")
        assert len(merchants) >= 1, "Data corruption: merchants table was altered or dropped!"


def test_sqli_and_malformed_params_on_admin_exceptions():
    """Verify /api/admin/exceptions with SQL injection and malformed query params."""
    login_super_admin()
    for payload in SQLI_PAYLOADS:
        res = client.get(f"/api/admin/exceptions?status={payload}&type={payload}")
        assert res.status_code in (200, 400, 422), f"Failed with {res.status_code} for payload: {payload}"


def test_sqli_and_malformed_params_on_admin_billing():
    """Verify /api/admin/billing with SQL injection and malformed query params."""
    login_super_admin()
    for payload in SQLI_PAYLOADS:
        res = client.get(f"/api/admin/billing?period={payload}")
        assert res.status_code in (200, 400, 422), f"Failed with {res.status_code} for payload: {payload}"


def test_sqli_and_malformed_params_on_expenses_summary():
    """Verify /api/expenses/summary with SQL injection in from_date, to_date, period."""
    login_owner()
    for payload in SQLI_PAYLOADS:
        res = client.get(f"/api/expenses/summary?from_date={payload}&to_date={payload}&period={payload}")
        assert res.status_code in (200, 400, 422), f"Failed with {res.status_code} for payload: {payload}"


def test_sqli_and_malformed_params_on_suppliers():
    """Verify /api/suppliers with SQL injection and malformed query params."""
    login_owner()
    for payload in SQLI_PAYLOADS:
        res = client.get(f"/api/suppliers?search={payload}&status={payload}")
        assert res.status_code in (200, 400, 422), f"Failed with {res.status_code} for payload: {payload}"


# ==============================================================================
# 2. OUT-OF-ORDER AND MALFORMED DATE FILTERS
# ==============================================================================

def test_out_of_order_date_filters_inverted_range():
    """Verify behavior when from_date > to_date across reporting and summary endpoints."""
    login_owner()
    from_date = "2026-12-31"
    to_date = "2026-01-01"

    # /api/expenses/summary
    res_exp = client.get(f"/api/expenses/summary?from_date={from_date}&to_date={to_date}")
    assert res_exp.status_code in (200, 400, 422)
    if res_exp.status_code == 200:
        data = res_exp.json()
        assert data['total_operating_expenses_poisha'] == 0
        assert data['owner_withdrawals']['total_poisha'] == 0

    # /api/reports/pnl
    res_pnl = client.get(f"/api/reports/pnl?from_date={from_date}&to_date={to_date}")
    assert res_pnl.status_code in (200, 400, 422)

    # /api/reports/cash-flow
    res_cf = client.get(f"/api/reports/cash-flow?from_date={from_date}&to_date={to_date}")
    assert res_cf.status_code in (200, 400, 422)

    # /api/reports/product-performance
    res_pp = client.get(f"/api/reports/product-performance?from_date={from_date}&to_date={to_date}")
    assert res_pp.status_code in (200, 400, 422)


def test_malformed_date_strings_handling():
    """Verify behavior when date parameter is not an ISO date string."""
    login_owner()
    malformed_dates = ["invalid-date", "2026-02-31", "9999-99-99", "12/31/2026", "2026-1-1"]
    for md in malformed_dates:
        res = client.get(f"/api/expenses/summary?from_date={md}&to_date={md}")
        assert res.status_code in (200, 400, 422), f"Unhandled error for date: {md}"


# ==============================================================================
# 3. FIFO ALLOCATION STRESS ON SUPPLIER PAYMENTS
# ==============================================================================

def test_fifo_allocation_payment_exceeding_total_batch_value(setup_adversarial_env):
    """
    Stress-test FIFO allocation when total payments exceed the sum of all purchase batches.
    System must:
    - Mark all batches as 'Paid' (none should remain Unpaid or Part paid).
    - Not fail or return negative unpaid amounts.
    - Set net payable balance to 0 (no negative liability).
    - Keep running ledger consistent with surplus/credit balance.
    """
    env = setup_adversarial_env
    m_id = env['m1_id']
    actor = env['actor']
    ctx = env['ctx']
    t = today()

    login_owner()

    supp_id = create_supplier(m_id, {
        'name': 'Overpayment Vendor Ltd',
        'phone': '01888000001',
        'address': 'Narayanganj',
        'terms_days': 30
    }, actor)

    # Batch 1: 50 units @ 20000 = 1,000,000 poisha (10,000 taka)
    pur1_id = record_purchase(m_id, {
        'supplier_id': supp_id,
        'product_id': env['p1'],
        'qty': 50,
        'unit_cost': 20000,
        'date': add_days(t, -10),
        'cash_account_id': env['bank_acc']
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-STRESS-01', total_cost = 1000000 WHERE id = ?", pur1_id)

    # Batch 2: 25 units @ 20000 = 500,000 poisha (5,000 taka)
    pur2_id = record_purchase(m_id, {
        'supplier_id': supp_id,
        'product_id': env['p1'],
        'qty': 25,
        'unit_cost': 20000,
        'date': add_days(t, -5),
        'cash_account_id': env['bank_acc']
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-STRESS-02', total_cost = 500000 WHERE id = ?", pur2_id)

    # Total batch value = 1,500,000 poisha (15,000 taka)
    # Payment = 2,500,000 poisha (25,000 taka) -> Overpayment by 1,000,000 poisha
    record_supplier_payment(m_id, {
        'supplier_id': supp_id,
        'amount': 2500000,
        'date': t,
        'cash_account_id': env['bank_acc'],
        'note': 'Substantial overpayment and advance for future batches'
    }, ctx)

    # Query statement
    stmt_res = client.get(f"/api/suppliers/{supp_id}/statement")
    assert stmt_res.status_code == 200, f"Statement failed: {stmt_res.status_code}"
    stmt = stmt_res.json()

    # Net payable balance must be 0 (cannot be negative liability)
    assert stmt['supplier']['payable_balance_poisha'] == 0

    # Both batches must be marked 'Paid'
    batches = {b['batch_no']: b for b in stmt['batches']}
    assert 'PB-STRESS-01' in batches
    assert 'PB-STRESS-02' in batches
    assert batches['PB-STRESS-01']['status'] == 'Paid'
    assert batches['PB-STRESS-01']['paid_poisha'] == 1000000
    assert batches['PB-STRESS-02']['status'] == 'Paid'
    assert batches['PB-STRESS-02']['paid_poisha'] == 500000

    # Running ledger must have 3 entries (Purchase 1, Purchase 2, Payment)
    ledger = stmt['running_ledger']
    assert len(ledger) == 3
    # Net running balance after overpayment must reflect vendor credit (-1,000,000 poisha)
    final_entry = ledger[-1]
    assert final_entry['running_balance_poisha'] == -1000000


def test_fifo_allocation_with_zero_purchase_batches(setup_adversarial_env):
    """Verify statement when supplier has payment/advance but zero purchase batches."""
    env = setup_adversarial_env
    m_id = env['m1_id']
    actor = env['actor']
    ctx = env['ctx']
    t = today()

    login_owner()

    supp_id = create_supplier(m_id, {
        'name': 'Advance Only Vendor',
        'phone': '01888000002',
        'advance_balance': 500000
    }, actor)

    # Make a supplier payment before any purchase batch is recorded
    record_supplier_payment(m_id, {
        'supplier_id': supp_id,
        'amount': 300000,
        'date': t,
        'cash_account_id': env['bank_acc'],
        'note': 'Deposit advance payment'
    }, ctx)

    stmt_res = client.get(f"/api/suppliers/{supp_id}/statement")
    assert stmt_res.status_code == 200
    stmt = stmt_res.json()

    assert stmt['supplier']['payable_balance_poisha'] == 0
    assert len(stmt['batches']) == 0
    assert len(stmt['running_ledger']) == 1


# ==============================================================================
# 4. EXTREME INPUTS & UNHANDLED 500 DETECTION
# ==============================================================================

def test_extreme_inputs_supplier_statement_non_existent():
    """Verify /api/suppliers/{id}/statement returns 404 or 400, NOT unhandled 500."""
    login_owner()
    res = client.get("/api/suppliers/999999/statement")
    assert res.status_code in (400, 404), f"CRITICAL: Non-existent supplier statement returned HTTP {res.status_code} instead of 400/404"


def test_extreme_inputs_create_supplier_empty_name():
    """Verify POST /api/suppliers with blank name returns 400 or 422, NOT unhandled 500."""
    login_owner()
    res = client.post("/api/suppliers", json={'name': '   '})
    assert res.status_code in (400, 422), f"CRITICAL: Supplier creation with blank name returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_recurring_expenses_negative_amount():
    """Verify POST /api/expenses/recurring with negative amount returns 400 or 422, NOT unhandled 500."""
    login_owner()
    res = client.post("/api/expenses/recurring", json={
        'head': 'rent',
        'amount': -50000,
        'posts_on_day': 1
    })
    assert res.status_code in (400, 422), f"CRITICAL: Negative recurring expense returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_recurring_expenses_invalid_posts_on_day():
    """Verify POST /api/expenses/recurring with posts_on_day out of range (1..28) returns 400 or 422, NOT unhandled 500."""
    login_owner()
    res = client.post("/api/expenses/recurring", json={
        'head': 'rent',
        'amount': 50000,
        'posts_on_day': 35
    })
    assert res.status_code in (400, 422), f"CRITICAL: Invalid posts_on_day returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_update_non_existent_recurring_expense():
    """Verify PUT /api/expenses/recurring/{id} on non-existent expense returns 404 or 400, NOT unhandled 500."""
    login_owner()
    res = client.put("/api/expenses/recurring/999999", json={'amount': 100000})
    assert res.status_code in (400, 404), f"CRITICAL: Updating non-existent recurring expense returned HTTP {res.status_code} instead of 400/404"


def test_extreme_inputs_negative_direct_expense():
    """Verify POST /api/expenses with negative amount returns 400 or 422, NOT unhandled 500."""
    login_owner()
    res = client.post("/api/expenses", json={'head': 'packaging', 'amount': -100})
    assert res.status_code in (400, 422), f"CRITICAL: Negative direct expense returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_negative_purchase_qty(setup_adversarial_env):
    """Verify POST /api/purchases with negative qty returns 400 or 422, NOT unhandled 500."""
    env = setup_adversarial_env
    login_owner()
    res = client.post("/api/purchases", json={
        'product_id': env['p1'],
        'qty': -10,
        'unit_cost': 20000
    })
    assert res.status_code in (400, 422), f"CRITICAL: Purchase with negative qty returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_negative_supplier_payment():
    """Verify POST /api/supplier-payments with negative amount returns 400 or 422, NOT unhandled 500."""
    login_owner()
    res = client.post("/api/supplier-payments", json={'supplier_id': 1, 'amount': -500})
    assert res.status_code in (400, 422), f"CRITICAL: Supplier payment with negative amount returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_negative_withdrawal():
    """Verify POST /api/withdrawals with negative amount returns 400 or 422, NOT unhandled 500."""
    login_owner()
    res = client.post("/api/withdrawals", json={'amount': -1000})
    assert res.status_code in (400, 422), f"CRITICAL: Withdrawal with negative amount returned HTTP {res.status_code} instead of 400/422"


def test_extreme_inputs_massive_integer_poisha_overflow_limits(setup_adversarial_env):
    """
    Verify handling of massive integer poisha amounts (e.g. 10^15 poisha = 10 trillion taka).
    The system must safely handle large numbers without Python overflow crashes or data corruption.
    """
    env = setup_adversarial_env
    login_owner()

    massive_amount = 10**14  # 100 trillion poisha = 1 trillion taka
    res = client.post("/api/expenses/recurring", json={
        'head': 'salary',
        'name': 'Massive Corp Payroll',
        'amount': massive_amount,
        'posts_on_day': 15
    })
    # Must either succeed cleanly or return 400/422 if an upper limit is enforced
    assert res.status_code in (200, 400, 422), f"Failed with {res.status_code}"
    if res.status_code == 200:
        rec_id = res.json()['id']
        row = one("SELECT amount FROM recurring_expenses WHERE id = ?", rec_id)
        assert row['amount'] == massive_amount
