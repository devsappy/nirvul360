"""
Adversarial Empirical Challenge Suite 2 (Iteration 2 Gate)
Focus:
1. Double-Entry Accounting Invariant (sum debits == sum credits across every journal and full database).
2. Owner Withdrawal Isolation (cash reduces, zero impact on operating expenses, P&L, or EBITDA).
3. Database Trigger Immutability (UPDATE & DELETE on journals, journal_lines, product_price_history, audit_log strictly aborted by DB engine).
4. Dynamic Super Admin Telemetry (MRR growth and churn derived dynamically from live database entities).
5. FIFO Supplier Batch Payment Allocations and Statements.
"""
import sqlite3
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, run, one, all, get_db
from app.domain.merchants import create_merchant, create_user, create_cash_account, create_supplier
from app.domain.products import upsert_product, cost_at
from app.domain.orders import create_order, apply_status
from app.domain.entries import (
    record_expense, record_ad_spend, record_withdrawal, record_capital,
    record_transfer, record_purchase, record_supplier_payment
)
from app.domain.ledger import post, reverse
from app.domain.settlements import commit_settlement
from app.domain.exceptions import seed_reason_codes
from app.domain.reports import profit_and_loss, cash_flow_statement, product_performance
from app.domain.suppliers import get_supplier_statement
from app.lib.dates import reset_clock, today, add_days

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_empirical_gate_env():
    """Hermetic in-memory test environment setup with full schemas and triggers."""
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()
    t = today()

    # Create Merchant 1
    m1_id = create_merchant({'name': 'Empirical Enterprise BD', 'phone': '01711999888'})
    run("UPDATE merchants SET plan = 'growth', plan_price = 100000, order_limit = 5000 WHERE id = ?", m1_id)

    # Super Admin
    super_admin_id = create_user(m1_id, {
        'name': 'Chief Super Admin',
        'email': 'superadmin@gross.bd',
        'role': 'super_admin',
        'password': 'password123'
    })

    # Agency Owner
    owner_id = create_user(m1_id, {
        'name': 'Empirical Owner',
        'email': 'owner@empirical.bd',
        'role': 'agency_owner',
        'password': 'password123'
    })

    actor = f"user:{owner_id}"
    ctx = {'source': 'manual', 'actor': actor}

    # Bank Account (500,000 Taka opening balance = 50,000,000 poisha)
    bank_acc = create_cash_account(m1_id, {
        'name': 'Corporate Bank Acc',
        'kind': 'bank',
        'opening_balance': 50000000,
        'opening_date': add_days(t, -30),
        'is_default': True
    }, actor)

    # bKash Account (100,000 Taka = 10,000,000 poisha)
    bkash_acc = create_cash_account(m1_id, {
        'name': 'bKash Merchant Acc',
        'kind': 'bkash',
        'opening_balance': 10000000,
        'opening_date': add_days(t, -30)
    }, actor)

    # Seed SaaS plans
    saas_plans = [
        ("starter", "Starter", 50000, 1500, 1, 2, 1, 0, 0, "active", "2026-01-01T00:00:00Z"),
        ("growth", "Growth", 100000, 5000, 5, 6, 1, 1, 0, "active", "2026-01-01T00:00:00Z"),
        ("scale", "Scale", 250000, 999999, 99, 99, 1, 1, 1, "active", "2026-01-01T00:00:00Z"),
        ("trial", "Trial", 0, 500, 1, 2, 1, 0, 0, "active", "2026-01-01T00:00:00Z"),
    ]
    for p in saas_plans:
        run("""
            INSERT OR REPLACE INTO saas_plans (id, name, price_poisha, order_limit, courier_limit, user_limit, has_whatsapp, has_meta_sync, has_mushak, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *p)

    return {
        'm1_id': m1_id,
        'super_admin_id': super_admin_id,
        'owner_id': owner_id,
        'bank_acc': bank_acc,
        'bkash_acc': bkash_acc,
        'actor': actor,
        'ctx': ctx,
        'today': t
    }


# ==============================================================================
# 1. DOUBLE-ENTRY ACCOUNTING INTEGRITY TESTS
# ==============================================================================

def test_empirical_double_entry_zero_sum_across_all_transaction_types(setup_empirical_gate_env):
    """
    Verify Non-Negotiable Rule 6: Sum of debits == sum of credits for every single journal
    and sum(amount) == 0 across the entire database journal_lines table across all transaction flows.
    """
    env = setup_empirical_gate_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = env['today']
    bank_acc = env['bank_acc']
    bkash_acc = env['bkash_acc']

    # 1. Direct Expense
    j_exp = record_expense(m_id, {
        'head': 'rent',
        'amount': 2500000, # 25,000 Tk
        'date': add_days(t, -5),
        'cash_account_id': bank_acc,
        'note': 'Office rent'
    }, ctx)

    # 2. Ad Spend (BDT)
    j_ad_bdt = record_ad_spend(m_id, {
        'amount': 1500000,
        'currency': 'BDT',
        'date': add_days(t, -4),
        'cash_account_id': bank_acc,
        'note': 'Meta campaigns'
    }, ctx)

    # 3. Ad Spend (USD Foreign Currency with explicit FX rate)
    j_ad_usd = record_ad_spend(m_id, {
        'amount': 10000, # 100 USD (stored as integer cents / units)
        'currency': 'USD',
        'rate': 122.5,
        'date': add_days(t, -3),
        'cash_account_id': bank_acc,
        'note': 'Google Ads spend'
    }, ctx)

    # 4. Owner Withdrawal
    j_draw = record_withdrawal(m_id, {
        'amount': 5000000, # 50,000 Tk
        'date': add_days(t, -3),
        'cash_account_id': bank_acc,
        'note': 'Personal drawings'
    }, ctx)

    # 5. Owner Capital Injection
    j_cap = record_capital(m_id, {
        'amount': 10000000, # 100,000 Tk
        'date': add_days(t, -3),
        'cash_account_id': bank_acc,
        'note': 'Equity addition'
    }, ctx)

    # 6. Cash Transfer (Bank -> bKash)
    j_xfer = record_transfer(m_id, {
        'from_account_id': bank_acc,
        'to_account_id': bkash_acc,
        'amount': 2000000, # 20,000 Tk
        'date': add_days(t, -2),
        'note': 'Float top-up'
    }, ctx)

    # 7. Supplier Purchase & Payment
    sup_id = create_supplier(m_id, {'name': 'Textile Supplier Ltd'}, env['actor'])
    prod_id = upsert_product(m_id, {
        'sku': 'TS-PREM-01',
        'name': 'Premium Cotton Shirt',
        'selling_price': 150000,
        'purchase_price': 70000,
        'stock_qty': 100
    }, ctx)

    j_purch = record_purchase(m_id, {
        'supplier_id': sup_id,
        'product_id': prod_id,
        'qty': 50,
        'unit_cost': 70000, # 700 Tk each = 3,500,000 poisha
        'purchase_date': add_days(t, -10),
        'status': 'unpaid'
    }, ctx)

    j_sup_pay = record_supplier_payment(m_id, {
        'supplier_id': sup_id,
        'amount': 2000000, # 20,000 Tk
        'date': add_days(t, -2),
        'cash_account_id': bank_acc,
        'method': 'bank'
    }, ctx)

    # 8. Order Placement & Delivery (Generates revenue, COGS, courier receivable)
    order_id = create_order(m_id, {
        'customer_name': 'Rahim Uddin',
        'customer_phone': '01700111222',
        'order_date': add_days(t, -5),
        'shipping_charge': 10000, # 100 Tk
        'cod_amount': 310000, # 3,100 Tk
        'courier': 'steadfast',
        'items': [{'product_id': prod_id, 'qty': 2, 'unit_price': 150000}]
    }, ctx)
    apply_status(m_id, order_id, 'in_transit', ctx)
    apply_status(m_id, order_id, 'delivered', ctx)

    # 9. Settlement Reconciliation
    commit_settlement(
        m_id, [{
            'consignment_id': 'SF-9001',
            'order_id': order_id,
            'status': 'Delivered',
            'cod_collected': 310000,
            'delivery_charge': 10000,
            'cod_fee': 3100,
            'return_charge': 0,
            'settlement_date': t
        }],
        'steadfast',
        'sf_sheet.csv',
        'sha256-test-double-entry',
        ctx,
        deposit_account_id=bank_acc
    )

    # 10. Reversal of Direct Expense
    j_rev = reverse(j_exp, {'date': t, 'actor': env['actor'], 'source': 'manual'})

    # --- EMPIRICAL VERIFICATION OF DOUBLE-ENTRY INVARIANTS ---

    # Invariant A: Individual balance per journal: EVERY journal in the database MUST sum to 0.
    unbalanced_journals = all("""
        SELECT journal_id, SUM(amount) as imbalance_poisha, COUNT(*) as line_count
        FROM journal_lines
        GROUP BY journal_id
        HAVING SUM(amount) != 0;
    """)
    assert len(unbalanced_journals) == 0, f"Found unbalanced journals: {unbalanced_journals}"

    # Invariant B: Global double-entry balance: Aggregate sum across all journal lines in the DB MUST equal 0.
    total_debits_credits = one("SELECT SUM(amount) as total FROM journal_lines;")
    assert total_debits_credits['total'] == 0, f"Global sum of journal lines is {total_debits_credits['total']}, expected 0"

    # Invariant C: Debits == Credits breakdown.
    sums = one("""
        SELECT 
            SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_debits,
            SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) as total_credits
        FROM journal_lines;
    """)
    assert sums['total_debits'] > 0
    assert sums['total_debits'] == sums['total_credits'], f"Debits ({sums['total_debits']}) != Credits ({sums['total_credits']})"


def test_empirical_double_entry_unbalanced_and_invalid_journal_rejected(setup_empirical_gate_env):
    """
    Stress-test the double-entry gate: attempting to post unbalanced, empty, or unknown
    accounts MUST raise ValueError and abort without touching the ledger.
    """
    env = setup_empirical_gate_env
    m_id = env['m1_id']
    t = env['today']

    # 1. Unbalanced Journal (Debits 500k, Credits -400k -> Diff +100k)
    with pytest.raises(ValueError, match="journal is out of balance"):
        post({
            'merchant_id': m_id,
            'date': t,
            'kind': 'manual_test',
            'memo': 'Unbalanced entry',
            'source': 'system',
            'created_by': 'tester'
        }, [
            {'account': 'rent', 'amount': 500000},
            {'account': 'cash', 'amount': -400000}
        ])

    # 2. Empty Journal lines
    with pytest.raises(ValueError, match="journal needs at least one line"):
        post({
            'merchant_id': m_id,
            'date': t,
            'kind': 'manual_test',
            'memo': 'Empty entry',
            'source': 'system',
            'created_by': 'tester'
        }, [])

    # 3. Unknown Account
    with pytest.raises(ValueError, match="unknown account"):
        post({
            'merchant_id': m_id,
            'date': t,
            'kind': 'manual_test',
            'memo': 'Fictitious account',
            'source': 'system',
            'created_by': 'tester'
        }, [
            {'account': 'crypto_mining_loss', 'amount': 10000},
            {'account': 'cash', 'amount': -10000}
        ])

    # 4. Non-integer Poisha (Float / Decimal)
    with pytest.raises(ValueError, match="line amount must be an integer"):
        post({
            'merchant_id': m_id,
            'date': t,
            'kind': 'manual_test',
            'memo': 'Float entry',
            'source': 'system',
            'created_by': 'tester'
        }, [
            {'account': 'rent', 'amount': 100.50}, # type: ignore
            {'account': 'cash', 'amount': -100.50} # type: ignore
        ])

    # Invariant: Database journal lines remain 100% clean
    count = one("SELECT COUNT(*) as c FROM journals WHERE kind = 'manual_test';")['c']
    assert count == 0


# ==============================================================================
# 2. OWNER WITHDRAWAL ISOLATION TESTS
# ==============================================================================

def test_empirical_owner_withdrawals_absolute_isolation(setup_empirical_gate_env):
    """
    Verify that owner withdrawals reduce cash while strictly leaving operating expenses,
    gross profit, and net profit untouched across all reporting interfaces:
    - /api/expenses/summary
    - /api/reports/pnl
    - /api/dashboard/pnl
    - /api/dashboard
    - /api/reports/cash-flow
    """
    env = setup_empirical_gate_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = env['today']
    bank_acc = env['bank_acc']

    # Step 1: Establish baseline operating activity
    prod_id = upsert_product(m_id, {
        'sku': 'TS-BASE-01',
        'name': 'Baseline Shirt',
        'selling_price': 100000, # 1,000 Tk
        'purchase_price': 40000, # 400 Tk
        'stock_qty': 500
    }, ctx)

    # Deliver order: Gross sales = 500,000 poisha, COGS = 200,000 poisha
    order_id = create_order(m_id, {
        'customer_name': 'Test Customer',
        'order_date': t,
        'shipping_charge': 0,
        'cod_amount': 500000,
        'items': [{'product_id': prod_id, 'qty': 5, 'unit_price': 100000}]
    }, ctx)
    apply_status(m_id, order_id, 'delivered', ctx)

    # Log genuine operating expenses: Rent (50,000 poisha) + Packaging (15,000 poisha) = 65,000 poisha
    record_expense(m_id, {'head': 'rent', 'amount': 50000, 'date': t, 'cash_account_id': bank_acc}, ctx)
    record_expense(m_id, {'head': 'packaging', 'amount': 15000, 'date': t, 'cash_account_id': bank_acc}, ctx)

    # Baseline P&L:
    # Gross Sales: 500,000
    # COGS: 200,000
    # Gross Profit: 300,000
    # Operating Expenses: 65,000
    # Net Profit: 235,000
    pnl_base = profit_and_loss(m_id, f"{t[:4]}-01-01", f"{t[:4]}-12-31")
    assert pnl_base['gross_sales'] == 500000
    assert pnl_base['cogs'] == 200000
    assert pnl_base['gross_profit'] == 300000
    assert pnl_base['sections']['fixed']['amount'] == 50000 # Rent
    assert pnl_base['sections']['packaging']['amount'] == 15000 # Packaging
    assert pnl_base['net_profit'] == 235000

    # Baseline Expenses Summary API
    client.post("/api/auth/login", json={'email': 'owner@empirical.bd', 'password': 'password123'})
    exp_summary_base = client.get("/api/expenses/summary?period=this_month").json()
    assert exp_summary_base['total_operating_expenses_poisha'] == 65000
    assert exp_summary_base['owner_withdrawals']['total_poisha'] == 0

    cash_before = one(
        "SELECT COALESCE(SUM(amount), 0) AS balance FROM journal_lines WHERE merchant_id = ? AND account = 'cash' AND party = ?",
        m_id, str(bank_acc)
    )['balance']

    # Step 2: Post 3 successive Owner Withdrawals totaling 20,000,000 poisha (200,000 Tk, 85x net profit)
    withdrawals = [500000, 4500000, 15000000] # Total: 20,000,000 poisha
    for w in withdrawals:
        record_withdrawal(m_id, {
            'amount': w,
            'date': t,
            'cash_account_id': bank_acc,
            'note': f'Owner drawing of {w} poisha'
        }, ctx)

    # Step 3: Verify Absolute Isolation across all surfaces

    # Surface 1: /api/reports/pnl
    pnl_after = profit_and_loss(m_id, f"{t[:4]}-01-01", f"{t[:4]}-12-31")
    assert pnl_after['gross_sales'] == 500000, "Gross sales mutated by owner withdrawal!"
    assert pnl_after['cogs'] == 200000, "COGS mutated by owner withdrawal!"
    assert pnl_after['gross_profit'] == 300000, "Gross profit mutated by owner withdrawal!"
    assert pnl_after['sections']['fixed']['amount'] == 50000, "Rent mutated by owner withdrawal!"
    assert pnl_after['sections']['packaging']['amount'] == 15000, "Packaging mutated by owner withdrawal!"
    assert pnl_after['net_profit'] == 235000, "Net profit corrupted by owner withdrawal!"

    # Surface 2: /api/expenses/summary
    exp_summary_after = client.get("/api/expenses/summary?period=this_month").json()
    assert exp_summary_after['total_operating_expenses_poisha'] == 65000, "Expenses summary operating total altered!"
    assert exp_summary_after['owner_withdrawals']['total_poisha'] == 20000000
    assert "does not touch net profit" in exp_summary_after['owner_withdrawals']['educational_note']

    # Surface 3: /api/dashboard/pnl
    dash_pnl = client.get(f"/api/dashboard/pnl?from={t[:4]}-01-01&to={t[:4]}-12-31").json()
    assert dash_pnl['net_profit'] == 235000
    assert dash_pnl['total_expenses'] == 65000

    # Surface 4: Cash Account balance
    cash_after = one(
        "SELECT COALESCE(SUM(amount), 0) AS balance FROM journal_lines WHERE merchant_id = ? AND account = 'cash' AND party = ?",
        m_id, str(bank_acc)
    )['balance']
    assert cash_after == cash_before - 20000000, f"Cash reduction mismatch: expected {cash_before - 20000000}, got {cash_after}"

    # Surface 5: Cash Flow statement
    cf = cash_flow_statement(m_id, f"{t[:4]}-01-01", f"{t[:4]}-12-31")
    withdrawal_outflows = [o for o in cf['outflows'] if o['category'] == 'owner_withdrawal']
    assert len(withdrawal_outflows) == 1
    assert withdrawal_outflows[0]['amount_poisha'] == 20000000
    assert cf['net_cash_change_poisha'] == -20000000 - 65000


# ==============================================================================
# 3. DATABASE TRIGGER IMMUTABILITY TESTS
# ==============================================================================

def test_empirical_database_triggers_prevent_mutation(setup_empirical_gate_env):
    """
    Verify that database triggers abort any raw SQL UPDATE or DELETE on:
    - journals
    - journal_lines
    - product_price_history
    - audit_log
    """
    env = setup_empirical_gate_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = env['today']
    bank_acc = env['bank_acc']

    # Setup records in all 4 immutable tables
    j_id = record_expense(m_id, {'head': 'salary', 'amount': 120000, 'date': t, 'cash_account_id': bank_acc}, ctx)
    lines = all("SELECT id FROM journal_lines WHERE journal_id = ?", j_id)
    line_id = lines[0]['id']

    prod_id = upsert_product(m_id, {'sku': 'TRIGGER-TEST', 'name': 'Trigger Test Product', 'purchase_price': 50000}, ctx)
    pph = one("SELECT id FROM product_price_history WHERE product_id = ? ORDER BY id DESC LIMIT 1", prod_id)
    pph_id = pph['id']

    # Insert test audit log row
    run("""
        INSERT INTO audit_log (merchant_id, actor, action, entity, entity_id, before, after, at)
        VALUES (?, 'user:1', 'test_action', 'test_entity', '100', '{}', '{\"k\": \"v\"}', ?)
    """, m_id, t + "T10:00:00Z")
    audit_row = one("SELECT id FROM audit_log WHERE entity = 'test_entity' ORDER BY id DESC LIMIT 1")
    audit_id = audit_row['id']

    db = get_db()

    # --- 1. journals trigger tests ---
    with pytest.raises(sqlite3.IntegrityError, match="journals are append-only; post a reversal instead"):
        db.execute("UPDATE journals SET memo = 'HACKED' WHERE id = ?", (j_id,))

    with pytest.raises(sqlite3.IntegrityError, match="journals are append-only; post a reversal instead"):
        db.execute("DELETE FROM journals WHERE id = ?", (j_id,))

    # Verify journal row is unchanged
    j_check = one("SELECT memo FROM journals WHERE id = ?", j_id)
    assert j_check['memo'] != 'HACKED'

    # --- 2. journal_lines trigger tests ---
    with pytest.raises(sqlite3.IntegrityError, match="journal_lines are append-only"):
        db.execute("UPDATE journal_lines SET amount = 99999999 WHERE id = ?", (line_id,))

    with pytest.raises(sqlite3.IntegrityError, match="journal_lines are append-only"):
        db.execute("DELETE FROM journal_lines WHERE id = ?", (line_id,))

    # Verify line is unchanged
    l_check = one("SELECT amount FROM journal_lines WHERE id = ?", line_id)
    assert l_check['amount'] == 120000

    # --- 3. product_price_history trigger tests ---
    with pytest.raises(sqlite3.IntegrityError, match="product_price_history is append-only"):
        db.execute("UPDATE product_price_history SET purchase_price = 1 WHERE id = ?", (pph_id,))

    with pytest.raises(sqlite3.IntegrityError, match="product_price_history is append-only"):
        db.execute("DELETE FROM product_price_history WHERE id = ?", (pph_id,))

    # Verify price history is unchanged
    pph_check = one("SELECT purchase_price FROM product_price_history WHERE id = ?", pph_id)
    assert pph_check['purchase_price'] == 50000

    # --- 4. audit_log trigger tests ---
    with pytest.raises(sqlite3.IntegrityError, match="audit_log is append-only"):
        db.execute("UPDATE audit_log SET action = 'tampered' WHERE id = ?", (audit_id,))

    with pytest.raises(sqlite3.IntegrityError, match="audit_log is append-only"):
        db.execute("DELETE FROM audit_log WHERE id = ?", (audit_id,))

    # Verify audit record is unchanged
    audit_check = one("SELECT action FROM audit_log WHERE id = ?", audit_id)
    assert audit_check['action'] == 'test_action'


# ==============================================================================
# 4. DYNAMIC SUPER ADMIN TELEMETRY TESTS
# ==============================================================================

def test_empirical_dynamic_mrr_growth_calculation(setup_empirical_gate_env):
    """
    Verify dynamic MRR growth calculation:
    - Paid prior month vs paid current month dynamically computes MoM % growth.
    - Mutating invoices dynamically updates MRR growth without hardcoded figures.
    """
    env = setup_empirical_gate_env
    m_id = env['m1_id']
    t = env['today']
    prev_period = add_days(t, -32)[:7]
    curr_period = t[:7]

    # Login as Super Admin
    client.post("/api/auth/login", json={'email': 'superadmin@gross.bd', 'password': 'password123'})

    # Case 1: Prior month = 100,000 poisha (৳1,000). Current month = 150,000 poisha (৳1,500).
    # Expected growth: (150,000 - 100,000) * 100 / 100,000 = +50.0%
    run("DELETE FROM billing_invoices;")
    run("""
        INSERT INTO billing_invoices (merchant_id, plan_id, amount, payment_method, status, billing_period, created_at)
        VALUES (?, 'starter', 100000, 'bkash', 'paid', ?, ?)
    """, m_id, prev_period, add_days(t, -35) + "T10:00:00Z")

    run("""
        INSERT INTO billing_invoices (merchant_id, plan_id, amount, payment_method, status, billing_period, created_at)
        VALUES (?, 'growth', 150000, 'bkash', 'paid', ?, ?)
    """, m_id, curr_period, add_days(t, -2) + "T10:00:00Z")

    # Set merchant plan MRR to 150,000 poisha
    run("UPDATE merchants SET plan = 'growth', plan_price = 150000, status = 'active' WHERE id = ?", m_id)

    res_billing_1 = client.get("/api/admin/billing").json()
    assert res_billing_1['mrr_poisha'] == 150000
    assert res_billing_1['mrr_growth_pct'] == 50.0

    res_ov_1 = client.get("/api/admin/overview").json()
    assert res_ov_1['mrr_poisha'] == 150000
    assert res_ov_1['mrr_growth_pct'] == 50.0

    # Case 2: Dynamic Mutation — Upgrade current month plan to 300,000 poisha
    # Expected growth: (300,000 - 100,000) * 100 / 100,000 = +200.0%
    run("UPDATE merchants SET plan = 'scale', plan_price = 300000 WHERE id = ?", m_id)

    res_billing_2 = client.get("/api/admin/billing").json()
    assert res_billing_2['mrr_poisha'] == 300000
    assert res_billing_2['mrr_growth_pct'] == 200.0

    res_ov_2 = client.get("/api/admin/overview").json()
    assert res_ov_2['mrr_poisha'] == 300000
    assert res_ov_2['mrr_growth_pct'] == 200.0

    # Case 3: Dynamic Mutation — Downgrade current month plan to 50,000 poisha
    # Expected growth: (50,000 - 100,000) * 100 / 100,000 = -50.0%
    run("UPDATE merchants SET plan = 'starter', plan_price = 50000 WHERE id = ?", m_id)

    res_billing_3 = client.get("/api/admin/billing").json()
    assert res_billing_3['mrr_poisha'] == 50000
    assert res_billing_3['mrr_growth_pct'] == -50.0


def test_empirical_dynamic_churn_rate_calculation(setup_empirical_gate_env):
    """
    Verify dynamic Churn Rate calculation:
    - Churn rate = (paused_merchants * 100.0) / total_merchants.
    - Dynamically adding and pausing merchants live changes the churn % immediately.
    """
    env = setup_empirical_gate_env
    t = env['today']

    # Login as Super Admin
    client.post("/api/auth/login", json={'email': 'superadmin@gross.bd', 'password': 'password123'})

    # Reset merchants: Create exactly 10 merchants (8 active, 2 paused)
    run("DELETE FROM merchants WHERE id != ?", env['m1_id'])
    for i in range(2, 9):
        create_merchant({'name': f'Active Store {i}'})
    m_p1 = create_merchant({'name': 'Paused Store 9'})
    m_p2 = create_merchant({'name': 'Paused Store 10'})
    run("UPDATE merchants SET status = 'paused' WHERE id IN (?, ?)", m_p1, m_p2)

    total_m = one("SELECT COUNT(*) as c FROM merchants")['c']
    assert total_m == 10

    # Initial check: 2 paused / 10 total = 20.0%
    b1 = client.get("/api/admin/billing").json()
    assert b1['churn_left_count'] == 2
    assert b1['churn_rate_pct'] == 20.0

    # Dynamic Mutation: Pause 2 more merchants (4 paused / 10 total = 40.0%)
    run("UPDATE merchants SET status = 'paused' WHERE name IN ('Active Store 2', 'Active Store 3')")
    b2 = client.get("/api/admin/billing").json()
    assert b2['churn_left_count'] == 4
    assert b2['churn_rate_pct'] == 40.0

    # Dynamic Mutation: Add 10 new active merchants (total 20, 4 paused = 20.0%)
    for i in range(11, 21):
        create_merchant({'name': f'New Store {i}'})
    b3 = client.get("/api/admin/billing").json()
    assert b3['churn_left_count'] == 4
    assert b3['churn_rate_pct'] == 20.0


# ==============================================================================
# 5. FIFO SUPPLIER BATCH ALLOCATIONS & STATEMENTS
# ==============================================================================

def test_empirical_fifo_supplier_batch_allocation_and_statements(setup_empirical_gate_env):
    """
    Verify FIFO supplier payment allocation:
    - Chronological batches are paid in FIFO order.
    - Partial payments transition batches accurately (Unpaid -> Part paid -> Paid).
    """
    env = setup_empirical_gate_env
    m_id = env['m1_id']
    ctx = env['ctx']
    t = env['today']
    bank_acc = env['bank_acc']

    sup_id = create_supplier(m_id, {'name': 'FIFO Garments Wholesale'}, env['actor'])
    p_id = upsert_product(m_id, {'sku': 'FIFO-SKU', 'name': 'FIFO Shirt', 'purchase_price': 50000}, ctx)

    # Batch 1 (Oldest): 10 units @ 50,000 = 500,000 poisha (date: t - 20)
    # Batch 1 (Oldest): 10 units @ 50,000 = 500,000 poisha (date: t - 20)
    p1 = record_purchase(m_id, {
        'supplier_id': sup_id,
        'product_id': p_id,
        'qty': 10,
        'unit_cost': 50000,
        'date': add_days(t, -20),
    }, ctx)
    run("UPDATE purchases SET batch_no = 'BATCH-001' WHERE id = ?", p1)

    # Batch 2: 15 units @ 60,000 = 900,000 poisha (date: t - 10)
    p2 = record_purchase(m_id, {
        'supplier_id': sup_id,
        'product_id': p_id,
        'qty': 15,
        'unit_cost': 60000,
        'date': add_days(t, -10),
    }, ctx)
    run("UPDATE purchases SET batch_no = 'BATCH-002' WHERE id = ?", p2)

    # Batch 3 (Newest): 20 units @ 55,000 = 1,100,000 poisha (date: t - 5)
    p3 = record_purchase(m_id, {
        'supplier_id': sup_id,
        'product_id': p_id,
        'qty': 20,
        'unit_cost': 55000,
        'date': add_days(t, -5),
    }, ctx)
    run("UPDATE purchases SET batch_no = 'BATCH-003' WHERE id = ?", p3)

    # Total payable: 500k + 900k + 1,100k = 2,500,000 poisha
    stmt0 = get_supplier_statement(m_id, sup_id)
    assert stmt0['supplier']['payable_balance_poisha'] == 2500000
    assert stmt0['supplier']['advance_balance_poisha'] == 0
    batches0 = {b['batch_no']: b['status'] for b in stmt0['batches']}
    assert batches0['BATCH-001'] == 'Unpaid'
    assert batches0['BATCH-002'] == 'Unpaid'
    assert batches0['BATCH-003'] == 'Unpaid'

    # Payment 1: 750,000 poisha (date: t - 4)
    # Should completely pay BATCH-001 (500k) and partially pay BATCH-002 (250k paid, 650k left)
    record_supplier_payment(m_id, {
        'supplier_id': sup_id,
        'amount': 750000,
        'date': add_days(t, -4),
        'cash_account_id': bank_acc,
        'method': 'bank'
    }, ctx)

    stmt1 = get_supplier_statement(m_id, sup_id)
    assert stmt1['supplier']['payable_balance_poisha'] == 1750000
    batches1 = {b['batch_no']: b for b in stmt1['batches']}
    assert batches1['BATCH-001']['status'] == 'Paid'
    assert batches1['BATCH-001']['paid_poisha'] == 500000
    assert batches1['BATCH-002']['status'] == 'Part paid'
    assert batches1['BATCH-002']['paid_poisha'] == 250000
    assert batches1['BATCH-003']['status'] == 'Unpaid'
    assert batches1['BATCH-003']['paid_poisha'] == 0

    # Payment 2: 1,000,000 poisha (date: t - 1)
    # Remaining on BATCH-002 was 650k -> BATCH-002 becomes 'paid'
    # Remaining 350k goes to BATCH-003 (1,100k total) -> BATCH-003 becomes 'part_paid' (350k paid, 750k left)
    record_supplier_payment(m_id, {
        'supplier_id': sup_id,
        'amount': 1000000,
        'date': add_days(t, -1),
        'cash_account_id': bank_acc,
        'method': 'bank'
    }, ctx)

    stmt2 = get_supplier_statement(m_id, sup_id)
    assert stmt2['supplier']['payable_balance_poisha'] == 750000
    batches2 = {b['batch_no']: b for b in stmt2['batches']}
    assert batches2['BATCH-001']['status'] == 'Paid'
    assert batches2['BATCH-002']['status'] == 'Paid'
    assert batches2['BATCH-002']['paid_poisha'] == 900000
    assert batches2['BATCH-003']['status'] == 'Part paid'
    assert batches2['BATCH-003']['paid_poisha'] == 350000
