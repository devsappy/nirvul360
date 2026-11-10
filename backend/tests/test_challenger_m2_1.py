"""
Milestone 2 Iteration 1 Gate Verification: Empirical Challenger Test Suite.
Authoritative test suite to empirically challenge and stress-test:
1. WhatsApp Assistant:
   - Intent & amount parsing in Bengali ("প্যাকেজিং ৪০০ টাকা", "নাস্তা ৫০ টাকা", "salary 12000", Bengali digits)
   - Ambiguous/unparseable messages handling
   - 2-Step confirmation state machine & double-entry ledger isolation (drafts NEVER post to journals until confirmed)
   - Rejection and double-confirmation prevention
2. FIFO Supplier Batches & Purchase Costing:
   - Purchase batch entry opening new dated cost prices
   - Dated cost price history ordering, date ranges, and supplier tagging
   - Supplier statement running balances and FIFO payment allocation
3. Stock Count Adjustment & Shrinkage Loss:
   - Physical count adjustment with negative delta computing shrinkage loss
   - Double-entry ledger posting (Debit: stock_loss, Credit: inventory)
   - Zero and positive delta edge cases
   - Unpriced product adjustment resilience
   - Schema CHECK constraint violation when human-readable reasons (e.g. "Damaged in storage") are sent to stock_movements
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, run, one, all, insert
from app.domain.merchants import create_merchant, create_user, create_cash_account, create_supplier
from app.domain.products import upsert_product, stock_qty, get_product
from app.domain.reports import profit_and_loss
from app.whatsapp.parser import parse_message, extract_amount, detect_head
from app.whatsapp.assistant import handle_incoming
from app.lib.dates import reset_clock, today, now_iso

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_empirical_env():
    """Initializes a fresh isolated in-memory test database for each test."""
    open_db(":memory:")
    reset_clock()

    m_id = create_merchant({'name': 'Challenger Boutique', 'currency': 'BDT', 'phone': '01799999999'})
    
    # Create Owner with WhatsApp phone
    owner_id = create_user(m_id, {
        'name': 'Farhan Owner',
        'email': 'farhan@boutique.bd',
        'phone': '01711223344',
        'whatsapp': '01711223344',
        'role': 'agency_owner',
        'password': 'ChallengerPassword123!'
    })

    # Create Accountant
    acct_id = create_user(m_id, {
        'name': 'Anis Accountant',
        'email': 'anis@boutique.bd',
        'phone': '01755667788',
        'whatsapp': '01755667788',
        'role': 'accountant',
        'password': 'ChallengerPassword123!'
    })

    actor = f"user:{owner_id}"

    # Default Cash Account
    cash_id = create_cash_account(m_id, {
        'name': 'Main Cash Box',
        'kind': 'cash',
        'opening_balance': 10000000, # ৳100,000
        'opening_date': today(),
        'is_default': True
    }, actor)

    # Initial Product
    p_id = upsert_product(m_id, {
        'name': 'Premium Cotton Panjabi',
        'sku': 'PANJABI-01',
        'selling_price': 250000, # ৳2,500
        'purchase_price': 120000, # ৳1,200
        'stock_qty': 30,
    }, {'source': 'manual', 'actor': actor})

    return {
        'merchant_id': m_id,
        'owner_id': owner_id,
        'acct_id': acct_id,
        'cash_id': cash_id,
        'product_id': p_id,
        'actor': actor,
    }

def login(email: str = "farhan@boutique.bd", password: str = "ChallengerPassword123!"):
    res = client.post("/api/auth/login", json={'email': email, 'password': password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()


# ==============================================================================
# SECTION 1: WHATSAPP ASSISTANT & BENGALI INTENT STATE MACHINE
# ==============================================================================

def test_whatsapp_bengali_intent_and_amount_parsing():
    """Verify parsing of various Bengali expense strings, Bengali digits, and edge cases."""
    # 1. "প্যাকেজিং ৪০০ টাকা"
    p1 = parse_message("প্যাকেজিং ৪০০ টাকা")
    assert p1['intent'] == 'expense'
    assert p1['amount'] == 40000 # 400 Taka in poisha
    assert p1['head'] == 'packaging'

    # 2. "নাস্তা ৫০ টাকা"
    p2 = parse_message("নাস্তা ৫০ টাকা")
    assert p2['intent'] == 'expense'
    assert p2['amount'] == 5000 # 50 Taka in poisha
    assert p2['head'] == 'other_expense'

    # 3. "salary 12000"
    p3 = parse_message("salary 12000")
    assert p3['intent'] == 'expense'
    assert p3['amount'] == 1200000 # 12,000 Taka in poisha
    assert p3['head'] == 'salary'

    # 4. Mixed Bengali digits and English words: "rent ১৫০০০ টাকা"
    p4 = parse_message("rent ১৫০০০ টাকা")
    assert p4['intent'] == 'expense'
    assert p4['amount'] == 1500000
    assert p4['head'] == 'rent'

    # 5. Owner withdrawal: "দোকান থেকে ৫০০০ টাকা তুললাম"
    p5 = parse_message("দোকান থেকে ৫০০০ টাকা তুললাম")
    assert p5['intent'] == 'withdrawal'
    assert p5['amount'] == 500000

    # 6. Ambiguous / no amount: "আজকে অনেক খরচ হলো"
    p6 = parse_message("আজকে অনেক খরচ হলো")
    assert p6['amount'] is None

    # 7. Multiple amounts: "৫০০ টাকা এবং ২০০ টাকা"
    p7 = parse_message("৫০০ টাকা এবং ২০০ টাকা")
    assert p7['amount'] is None  # Ambiguous multiple amounts must NOT be guessed

def test_whatsapp_confirmation_state_machine_and_ledger_isolation(setup_empirical_env):
    """
    Empirically verify that draft NEVER writes to journals until explicitly confirmed.
    Verify rejection clears draft without writing to journals.
    Verify double confirmation is strictly blocked.
    """
    env = setup_empirical_env
    m_id = env['merchant_id']
    login("farhan@boutique.bd")

    # Initial state: verify 0 expense journals exist
    initial_expense_journals = all("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'expense'", m_id)
    assert len(initial_expense_journals) == 0

    # Step 1: Simulate "প্যাকেজিং ৪০০ টাকা"
    sim_res = client.post("/api/whatsapp/simulate", json={'text': 'প্যাকেজিং ৪০০ টাকা'})
    assert sim_res.status_code == 200
    sim_data = sim_res.json()
    assert sim_data['ok'] is True
    assert sim_data['pending_draft'] is not None
    assert sim_data['pending_draft']['amount_taka'] == 400.0
    assert sim_data['pending_draft']['head'] == 'packaging'
    draft_id = sim_data['pending_draft']['id']

    # CRITICAL CHECK: Expense journals MUST STILL BE ZERO
    expense_journals_after_sim = all("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'expense'", m_id)
    assert len(expense_journals_after_sim) == 0, "Security violation: Draft posted to journals prior to confirmation!"

    # CRITICAL CHECK: PnL report must show 0 packaging expense
    cur_date = today()
    pnl = profit_and_loss(m_id, cur_date[:7] + "-01", cur_date)
    assert pnl['sections']['packaging']['amount'] == 0

    # Step 2: Reject this draft via /api/whatsapp/reject
    rej_res = client.post("/api/whatsapp/reject")
    assert rej_res.status_code == 200
    assert "বাতিল" in rej_res.json()['reply']

    # Verify draft in DB is rejected
    draft_row = one("SELECT * FROM whatsapp_drafts WHERE id = ?", draft_id)
    assert draft_row['status'] == 'rejected'

    # Journals must STILL be 0 expense
    assert len(all("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'expense'", m_id)) == 0

    # Calling reject again must return 400 (no pending draft)
    rej_again = client.post("/api/whatsapp/reject")
    assert rej_again.status_code == 400

    # Step 3: Now simulate "নাস্তা ৫০ টাকা"
    sim2_res = client.post("/api/whatsapp/simulate", json={'text': 'নাস্তা ৫০ টাকা'})
    assert sim2_res.status_code == 200
    sim2_data = sim2_res.json()
    assert sim2_data['pending_draft']['amount_taka'] == 50.0
    assert sim2_data['pending_draft']['head'] == 'other_expense'
    draft2_id = sim2_data['pending_draft']['id']

    # Check overview endpoint returns pending draft
    overview_res = client.get("/api/whatsapp/overview")
    assert overview_res.status_code == 200
    assert overview_res.json()['pending_draft']['id'] == draft2_id

    # Step 4: Confirm this draft via /api/whatsapp/confirm
    conf_res = client.post("/api/whatsapp/confirm")
    assert conf_res.status_code == 200
    assert "লিখে রাখা হয়েছে" in conf_res.json()['reply']

    # Verify draft status is now confirmed
    draft2_row = one("SELECT * FROM whatsapp_drafts WHERE id = ?", draft2_id)
    assert draft2_row['status'] == 'confirmed'
    assert draft2_row['result_ref'] is not None

    # CRITICAL CHECK: Journals now has exactly 1 expense entry with source whatsapp_confirmed
    journals = all("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'expense'", m_id)
    assert len(journals) == 1
    j = journals[0]
    assert j['source'] == 'whatsapp_confirmed'
    assert j['kind'] == 'expense'

    # Verify journal lines balance (debit other_expense, credit cash)
    lines = all("SELECT * FROM journal_lines WHERE journal_id = ?", j['id'])
    assert len(lines) == 2
    expense_line = [l for l in lines if l['account'] == 'other_expense'][0]
    cash_line = [l for l in lines if l['account'] == 'cash'][0]
    assert expense_line['amount'] == 5000
    assert cash_line['amount'] == -5000

    # PnL now reflects the ৳50 expense
    pnl2 = profit_and_loss(m_id, cur_date[:7] + "-01", cur_date)
    assert pnl2['sections']['other']['amount'] == 5000

    # CRITICAL CHECK: Double confirmation must return 400
    conf_again = client.post("/api/whatsapp/confirm")
    assert conf_again.status_code == 400
    assert "No pending draft" in conf_again.json()['detail']


# ==============================================================================
# SECTION 2: FIFO SUPPLIER BATCHES & PURCHASE COSTING
# ==============================================================================

def test_purchase_batch_opens_dated_cost_and_updates_supplier_statement(setup_empirical_env):
    """
    Verify POST /api/purchases:
    1. Creates purchase batch
    2. Opens new dated cost price in product_price_history
    3. Reflects in GET /api/products/{id}/history with correct date range & batch info
    4. Appears in GET /api/suppliers/{id}/statement with accurate balance
    """
    env = setup_empirical_env
    m_id = env['merchant_id']
    login("farhan@boutique.bd")

    # Create Supplier
    s_res = client.post("/api/suppliers", json={
        'name': 'Bengal Textile Mills',
        'phone': '01811223344',
        'address': 'Narayanganj, Dhaka',
        'terms': 'Net 15'
    })
    assert s_res.status_code == 200
    s_id = s_res.json()['id']

    # Initial history for Panjabi (initial stated price = 120,000 poisha / ৳1,200)
    hist0 = client.get(f"/api/products/{env['product_id']}/history").json()
    assert len(hist0['history']) >= 1
    assert hist0['history'][0]['purchase_price'] == 120000

    # Record Purchase Batch 1: 20 units @ ৳1,300 (130,000 poisha)
    # Total = ৳26,000 (2,600,000 poisha), unpaid
    p1_res = client.post("/api/purchases", json={
        'product_id': env['product_id'],
        'supplier_id': s_id,
        'qty': 20,
        'unit_cost': 1300.0,
        'paid_amount': 0.0,
        'date': today()
    })
    assert p1_res.status_code == 200
    pur1_id = p1_res.json()['id']

    # Update batch_no for reference if needed
    run("UPDATE purchases SET batch_no = 'BATCH-PANJABI-01' WHERE id = ?", pur1_id)

    # 1. Verify Dated Cost Price History
    hist1 = client.get(f"/api/products/{env['product_id']}/history").json()
    history_rows = hist1['history']
    assert len(history_rows) >= 2
    latest = history_rows[0]
    assert latest['is_current'] is True
    assert latest['supplier_name'] == 'Bengal Textile Mills'
    assert latest['batch_no'] == 'BATCH-PANJABI-01'
    assert latest['effective_from'] == today()

    # 2. Verify Supplier Statement
    stmt1 = client.get(f"/api/suppliers/{s_id}/statement").json()
    assert stmt1['supplier']['payable_balance'] == 2600000 # ৳26,000 in poisha
    batches = stmt1['batches']
    assert len(batches) == 1
    b1 = batches[0]
    assert b1['batch_no'] == 'BATCH-PANJABI-01'
    assert b1['total_value_poisha'] == 2600000
    assert b1['paid_poisha'] == 0
    assert b1['status'] == 'Unpaid'

    # Record partial payment of ৳10,000 to supplier
    pay_res = client.post("/api/supplier-payments", json={
        'supplier_id': s_id,
        'amount': 10000.0,
        'date': today(),
        'note': 'Partial payment for BATCH-PANJABI-01'
    })
    assert pay_res.status_code == 200

    # 3. Verify Supplier Statement after payment
    stmt2 = client.get(f"/api/suppliers/{s_id}/statement").json()
    assert stmt2['supplier']['payable_balance'] == 1600000 # ৳16,000 remaining
    b1_after = stmt2['batches'][0]
    assert b1_after['status'] == 'Part paid'
    assert b1_after['paid_poisha'] == 1000000


# ==============================================================================
# SECTION 3: STOCK COUNT ADJUSTMENT & SHRINKAGE LOSS
# ==============================================================================

def test_stock_adjustment_shrinkage_calculation_and_ledger_posting(setup_empirical_env):
    """
    Empirically verify POST /api/products/{id}/stock-adjustment:
    - Initial stock: 30 units, unit cost: ৳1,200 (120,000 poisha).
    - Physical count: 26 units (delta = -4 units).
    - Expected shrinkage loss: 4 * 120,000 = 480,000 poisha (৳4,800).
    - Verify:
      1. Stock qty updated to 26.
      2. Double-entry ledger posts: Debit stock_loss (+480,000), Credit inventory (-480,000).
      3. Zero delta leaves ledger untouched.
      4. Positive delta increases stock without posting stock_loss.
    """
    env = setup_empirical_env
    m_id = env['merchant_id']
    p_id = env['product_id']
    login("farhan@boutique.bd")

    assert stock_qty(p_id) == 30

    # --- Test Case 3.1: Negative Delta (Shrinkage Loss) with reason='adjustment' ---
    adj1 = client.post(f"/api/products/{p_id}/stock-adjustment", json={
        'counted_qty': 26,
        'reason': 'adjustment'
    })
    assert adj1.status_code == 200
    res1 = adj1.json()
    assert res1['ok'] is True
    assert res1['product_id'] == p_id
    assert res1['delta'] == -4
    assert res1['shrinkage_units'] == 4
    assert res1['shrinkage_loss_poisha'] == 480000 # 4 * 120,000 poisha

    # Verify inventory stock quantity is updated
    assert stock_qty(p_id) == 26

    # Verify journal entry in ledger
    j = one("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'stock_adjustment' ORDER BY id DESC LIMIT 1", m_id)
    assert j is not None
    assert "Stock shrinkage adjustment" in j['memo']

    # Verify balanced journal lines
    lines = all("SELECT * FROM journal_lines WHERE journal_id = ?", j['id'])
    assert len(lines) == 2
    loss_line = [l for l in lines if l['account'] == 'stock_loss'][0]
    inv_line = [l for l in lines if l['account'] == 'inventory'][0]
    assert loss_line['amount'] == 480000
    assert inv_line['amount'] == -480000

    # --- Test Case 3.2: Zero Delta (Count matches system) ---
    adj2 = client.post(f"/api/products/{p_id}/stock-adjustment", json={
        'counted_qty': 26,
        'reason': 'adjustment'
    })
    assert adj2.status_code == 200
    res2 = adj2.json()
    assert res2['delta'] == 0
    assert res2['shrinkage_units'] == 0
    assert res2['shrinkage_loss_poisha'] == 0
    assert stock_qty(p_id) == 26

    # Verify no additional journal posted for zero delta
    all_adj_journals = all("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'stock_adjustment'", m_id)
    assert len(all_adj_journals) == 1

    # --- Test Case 3.3: Positive Delta (Found extra units) ---
    adj3 = client.post(f"/api/products/{p_id}/stock-adjustment", json={
        'counted_qty': 30,
        'reason': 'adjustment'
    })
    assert adj3.status_code == 200
    res3 = adj3.json()
    assert res3['delta'] == 4
    assert res3['shrinkage_units'] == 0
    assert res3['shrinkage_loss_poisha'] == 0
    assert stock_qty(p_id) == 30

    # Still no extra shrinkage journal
    assert len(all("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'stock_adjustment'", m_id)) == 1

def test_stock_adjustment_check_constraint_failure_on_human_reason(setup_empirical_env):
    """
    Verify stock adjustment accepts human-readable reasons (e.g. 'Damaged in storage')
    without crashing on SQLite CHECK constraint. It records 'adjustment' to the movements table
    and preserves the human reason in the ledger memo and audit details.
    """
    env = setup_empirical_env
    p_id = env['product_id']
    login("farhan@boutique.bd")

    resp = client.post(f"/api/products/{p_id}/stock-adjustment", json={
        'counted_qty': 25,
        'reason': 'Damaged in storage'
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data['counted_qty'] == 25
    assert data['reason'] == 'Damaged in storage'

    # Verify stock_movements has reason 'adjustment' satisfying the CHECK constraint
    mv = one("SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 1", p_id)
    assert mv['reason'] == 'adjustment'

def test_whatsapp_is_no_false_positive_on_bengali_words():
    """
    Verify WhatsApp is_no intent parser does not false-positive on Bengali words
    containing 'না' (such as 'নাস্তা ৫০ টাকা').
    """
    from app.whatsapp.parser import is_no
    # 'না' itself is No
    assert is_no("না") is True
    assert is_no(" cancel ") is True
    assert is_no("বাতিল") is True

    # Expense words containing 'না' must NOT evaluate to True
    assert is_no("নাস্তা ৫০ টাকা") is False

