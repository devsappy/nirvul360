"""
Milestone 2 Round 2 Adversarial Verification: Backend Defect Remediations & Stress Test Suite.

Authoritative challenger tests for:
1. Defect 1: POST /api/products/{id}/stock-adjustment
   - Verifies SQLite CHECK (reason IN ('opening','purchase','dispatch','return','partial_return','exchange_return','cancel','adjustment'))
   - Tests diverse reason strings: 'Physical shrinkage count', 'Damaged packaging', 'Routine cycle adjustment', 'Theft', empty reason '', Bengali unicode, CJK & emoji unicode, SQL injection payloads.
   - Verifies that stock_movements.reason is ALWAYS exactly 'adjustment'.
   - Verifies user-provided reason is faithfully stored in audit log and returned in response.
   - Verifies shrinkage loss accounting and journal lines for negative delta.
   - Verifies positive delta, zero delta, and 404 for invalid product.
   - Verifies zero SQLite3 IntegrityError or unhandled 500 crashes.

2. Defect 2: WhatsApp is_no and Bengali Expense Parsing
   - Tests is_no() on Bengali words containing 'না': 'নাস্তা ৫০ টাকা', 'নাবিল ৫০০ টাকা', 'নানা খরচ ২০০ টাকা', 'জানালার পর্দা ২০০০ টাকা'.
   - Tests is_no() on legitimate denial phrases: 'না', 'na', 'no', 'হবে না', 'না ভাই', 'cancel', 'বাতিল', 'ভুল'.
   - Tests is_no() on 'অন্য কোনো কিছু না থাকলে' and 'অন্য কোনো কিছু নাথাকলে'.
   - Tests expense parser extract_amount() and detect_head().
   - Tests end-to-end conversation flow in handle_incoming() with pending and non-pending draft states.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, run, one, all, insert
from app.domain.merchants import create_merchant, create_user, create_cash_account
from app.domain.products import upsert_product, stock_qty, get_product
from app.whatsapp.parser import is_no, is_yes, parse_message, extract_amount, detect_head
from app.whatsapp.assistant import handle_incoming
from app.lib.dates import reset_clock, today, now_iso

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_adversarial_backend():
    """Initializes a fresh isolated in-memory test database for each test."""
    open_db(":memory:")
    reset_clock()

    m_id = create_merchant({'name': 'Adversarial Test Merchant', 'currency': 'BDT', 'phone': '01700000000'})
    
    owner_id = create_user(m_id, {
        'name': 'Test Owner',
        'email': 'owner@test.bd',
        'phone': '01711000000',
        'whatsapp': '01711000000',
        'role': 'agency_owner',
        'password': 'StrongPassword123!'
    })

    actor = f"user:{owner_id}"

    cash_id = create_cash_account(m_id, {
        'name': 'Main Cash Box',
        'kind': 'cash',
        'opening_balance': 50000000, # ৳500,000
        'opening_date': today(),
        'is_default': True
    }, actor)

    # Setup 4 distinct products with different price tiers
    # Product 1: High-value priced product (৳2,500 sell, ৳1,200 cost)
    p1 = upsert_product(m_id, {
        'name': 'Silk Sherwani',
        'sku': 'SHER-01',
        'selling_price': 250000,
        'purchase_price': 120000,
        'stock_qty': 50,
    }, {'source': 'manual', 'actor': actor})

    # Product 2: Medium-value product (৳800 sell, ৳450 cost)
    p2 = upsert_product(m_id, {
        'name': 'Casual Cotton Polo',
        'sku': 'POLO-02',
        'selling_price': 80000,
        'purchase_price': 45000,
        'stock_qty': 100,
    }, {'source': 'manual', 'actor': actor})

    # Product 3: Low-cost accessory (৳150 sell, ৳60 cost)
    p3 = upsert_product(m_id, {
        'name': 'Leather Keyring',
        'sku': 'KEY-03',
        'selling_price': 15000,
        'purchase_price': 6000,
        'stock_qty': 200,
    }, {'source': 'manual', 'actor': actor})

    # Product 4: Zero purchase price / uncosted item
    p4 = upsert_product(m_id, {
        'name': 'Promotional Tote Bag',
        'sku': 'TOTE-04',
        'selling_price': 5000,
        'purchase_price': 0,
        'stock_qty': 30,
    }, {'source': 'manual', 'actor': actor})

    return {
        'merchant_id': m_id,
        'owner_id': owner_id,
        'cash_id': cash_id,
        'p1': p1,
        'p2': p2,
        'p3': p3,
        'p4': p4,
        'actor': actor,
    }


def login_client(email: str = "owner@test.bd", password: str = "StrongPassword123!"):
    res = client.post("/api/auth/login", json={'email': email, 'password': password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()


# ==============================================================================
# DEFECT 1: STOCK ADJUSTMENT STRESS TESTING & SQLite CHECK CONSTRAINT
# ==============================================================================

def test_stock_adjustment_varied_reasons_and_check_constraint(setup_adversarial_backend):
    """
    Stress-tests POST /api/products/{id}/stock-adjustment across multiple products
    and varied reason strings.
    Verifies:
    1. Zero SQLite3 IntegrityError or unhandled 500 errors.
    2. stock_movements.reason is ALWAYS 'adjustment' satisfying schema CHECK.
    3. User reason string is faithfully returned in JSON response.
    4. User reason string is faithfully recorded in audit_log details.
    """
    env = setup_adversarial_backend
    m_id = env['merchant_id']
    login_client()

    test_cases = [
        # Assignment-specified reason strings
        ('p1', 45, 'routine cycle count', -5),
        ('p2', 95, 'physical shrinkage Q3 audit', -5),
        ('p3', 190, 'Damaged goods written off', -10),
        # Additional stress-testing reasons
        ('p1', 40, "Damaged packaging", -5),
        ('p2', 85, "Theft", -10),
        ('p3', 180, "", -10),
        ('p3', 170, "পণ্য নষ্ট হয়ে গেছে এবং মেয়াদোত্তীর্ণ", -10),
        ('p3', 160, "⚠️ Spoilage / 破損 - 5 units water damage 🌧️", -10),
        ('p4', 25, "Unaccounted sample giveaway", -5),
        ('p1', 40, "Count unchanged: verified again", 0),  # Zero delta
        ('p2', 95, "Found misplaced batch in back room", 10), # Positive delta
        ('p3', 0, "Complete inventory write-off", -160),    # Full write-off to 0
        ('p4', 25, "Reason with SQL chars: '; DROP TABLE products; --", 0),
        ('p1', 35, "Very long audit explanation " * 20, -5), # Long string
    ]

    for p_key, counted_qty, reason, expected_delta in test_cases:
        p_id = env[p_key]
        pre_stock = stock_qty(p_id)

        res = client.post(f"/api/products/{p_id}/stock-adjustment", json={
            'counted_qty': counted_qty,
            'reason': reason
        })

        assert res.status_code == 200, f"Failed for {p_key} with reason '{reason}': {res.status_code} {res.text}"
        body = res.json()

        # Check response fidelity
        assert body['ok'] is True
        assert body['product_id'] == p_id
        assert body['counted_qty'] == counted_qty
        assert body['delta'] == expected_delta
        assert body['new_stock'] == counted_qty
        assert body['reason'] == reason, f"Reason not faithfully returned: expected '{reason}', got '{body.get('reason')}'"

        # Check stock quantity in DB
        assert stock_qty(p_id) == counted_qty

        # Verify SQLite stock_movements table constraint & value
        sm = one("SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT 1", p_id)
        assert sm is not None
        assert sm['reason'] == 'adjustment', f"Expected stock_movements.reason='adjustment', found '{sm['reason']}'"
        assert sm['qty'] == expected_delta
        assert sm['merchant_id'] == m_id

        # Verify audit log details
        audit = one(
            "SELECT * FROM audit_log WHERE merchant_id = ? AND entity = 'products' AND entity_id = ? ORDER BY id DESC LIMIT 1",
            m_id, str(p_id)
        )
        assert audit is not None
        import json
        details = json.loads(audit['after'])
        assert details['reason'] == reason
        assert details['counted_qty'] == counted_qty
        assert details['delta'] == expected_delta


def test_stock_adjustment_shrinkage_accounting_and_ledger(setup_adversarial_backend):
    """
    Verifies that shrinkage loss poisha is accurately calculated and posted
    to balanced double-entry journals with debit: stock_loss and credit: inventory.
    """
    env = setup_adversarial_backend
    m_id = env['merchant_id']
    p1 = env['p1'] # cost = 120,000 poisha (৳1,200), initial stock = 50
    login_client()

    res = client.post(f"/api/products/{p1}/stock-adjustment", json={
        'counted_qty': 46, # 4 units shrinkage
        'reason': 'Water damage in warehouse'
    })
    assert res.status_code == 200
    body = res.json()
    assert body['shrinkage_units'] == 4
    assert body['shrinkage_loss_poisha'] == 480000 # 4 * 120,000 poisha
    assert body['shrinkage_loss_taka'] == 4800.0

    # Verify journal entry in ledger
    j = one("SELECT * FROM journals WHERE merchant_id = ? AND kind = 'stock_adjustment' ORDER BY id DESC LIMIT 1", m_id)
    assert j is not None
    assert "Water damage in warehouse" in j['memo']
    assert "Silk Sherwani" in j['memo']

    # Verify balanced journal lines
    lines = all("SELECT * FROM journal_lines WHERE journal_id = ?", j['id'])
    assert len(lines) == 2
    loss = [l for l in lines if l['account'] == 'stock_loss'][0]
    inv = [l for l in lines if l['account'] == 'inventory'][0]
    assert loss['amount'] == 480000
    assert inv['amount'] == -480000
    assert loss['amount'] + inv['amount'] == 0


def test_stock_adjustment_zero_and_positive_delta_do_not_post_shrinkage_loss(setup_adversarial_backend):
    """
    Verifies that positive delta (found stock) or zero delta (matching count)
    does NOT post a shrinkage loss to P&L journals.
    """
    env = setup_adversarial_backend
    m_id = env['merchant_id']
    p2 = env['p2'] # stock = 100
    login_client()

    journals_before = len(all("SELECT * FROM journals WHERE merchant_id = ?", m_id))

    # Zero delta
    res_zero = client.post(f"/api/products/{p2}/stock-adjustment", json={
        'counted_qty': 100,
        'reason': 'Zero delta audit'
    })
    assert res_zero.status_code == 200
    assert res_zero.json()['shrinkage_loss_poisha'] == 0
    assert len(all("SELECT * FROM journals WHERE merchant_id = ?", m_id)) == journals_before

    # Positive delta (+10 units)
    res_pos = client.post(f"/api/products/{p2}/stock-adjustment", json={
        'counted_qty': 110,
        'reason': 'Found 10 extra units'
    })
    assert res_pos.status_code == 200
    assert res_pos.json()['shrinkage_loss_poisha'] == 0
    assert len(all("SELECT * FROM journals WHERE merchant_id = ?", m_id)) == journals_before


def test_stock_adjustment_invalid_product_returns_404(setup_adversarial_backend):
    """Verifies that non-existent product ID returns 404 cleanly, not 500."""
    login_client()
    res = client.post("/api/products/999999/stock-adjustment", json={
        'counted_qty': 10,
        'reason': 'Phantom product'
    })
    assert res.status_code == 404


# ==============================================================================
# DEFECT 2: WHATSAPP ASSISTANT 'is_no' AND BENGALI EXPENSE PARSING
# ==============================================================================

def test_whatsapp_is_no_on_bengali_words_containing_na():
    """
    Verifies that is_no() does NOT evaluate to True when 'না' is part of
    legitimate Bengali words (e.g. 'নাস্তা', 'নাবিল', 'নানা', 'জানালার').
    """
    # Expressions where 'না' is part of a word (including assignment cases):
    assert is_no("নাস্তা ৫০ টাকা") is False
    assert is_no("নাবালক") is False
    assert is_no("জানালা মেরামত ৫০০") is False
    assert is_no("রান্নাঘর ১০০০") is False
    assert is_no("নাসরিন") is False
    assert is_no("নাবিল ৫০০ টাকা") is False
    assert is_no("নানা খরচ ২০০ টাকা") is False
    assert is_no("জানালার পর্দা ২০০০ টাকা") is False
    assert is_no("দোকানের চাবি নাস্তা ২০০") is False
    assert is_no("নাবিলের বেতন ৫০০০") is False
    assert is_no("অন্য কোনো কিছু নাথাকলে") is False


def test_whatsapp_is_no_on_legitimate_denial_phrases():
    """
    Verifies that is_no() evaluates to True for legitimate denial phrases:
    'না', 'na', 'no', 'হবে না', 'না ভাই', 'cancel', 'বাতিল', 'ভুল'.
    """
    assert is_no("না") is True
    assert is_no("na") is True
    assert is_no("no") is True
    assert is_no("হবে না") is True
    assert is_no("না ভাই") is True
    assert is_no("cancel") is True
    assert is_no("Cancel") is True
    assert is_no("বাতিল") is True
    assert is_no("ভুল") is True
    assert is_no("থাক") is True


def test_whatsapp_expense_amount_and_head_extraction():
    """
    Verifies that extract_amount() and detect_head() correctly parse
    amounts and heads from Bengali expressions containing 'না' in words.
    """
    # 1. 'নাস্তা ৫০ টাকা' -> 50 taka = 5000 poisha, head: other_expense
    parsed1 = parse_message("নাস্তা ৫০ টাকা")
    assert parsed1['amount'] == 5000
    assert parsed1['head'] == 'other_expense'
    assert parsed1['intent'] == 'expense'

    # 2. 'নাবিল ৫০০ টাকা' -> 500 taka = 50000 poisha, head: utilities (matched 'বিল')
    parsed2 = parse_message("নাবিল ৫০০ টাকা")
    assert parsed2['amount'] == 50000
    assert parsed2['intent'] == 'expense'

    # 3. 'নানা খরচ ২০০ টাকা' -> 200 taka = 20000 poisha, head: other_expense
    parsed3 = parse_message("নানা খরচ ২০০ টাকা")
    assert parsed3['amount'] == 20000
    assert parsed3['head'] == 'other_expense'
    assert parsed3['intent'] == 'expense'

    # 4. 'জানালার পর্দা ২০০০ টাকা' -> 2000 taka = 200000 poisha, head: other_expense
    parsed4 = parse_message("জানালার পর্দা ২০০০ টাকা")
    assert parsed4['amount'] == 200000
    assert parsed4['head'] == 'other_expense'
    assert parsed4['intent'] == 'expense'

    # 5. Assignment Bengali cases:
    # 'জানালা মেরামত ৫০০' -> 500 taka = 50000 poisha
    parsed5 = parse_message("জানালা মেরামত ৫০০")
    assert parsed5['amount'] == 50000
    assert parsed5['head'] == 'other_expense'
    assert parsed5['intent'] == 'expense'

    # 'রান্নাঘর ১০০০' -> 1000 taka = 100000 poisha
    parsed6 = parse_message("রান্নাঘর ১০০০")
    assert parsed6['amount'] == 100000
    assert parsed6['head'] == 'other_expense'
    assert parsed6['intent'] == 'expense'

    # 6. Non-expense phrases have amount=None
    assert extract_amount("নাবালক") is None
    assert extract_amount("নাসরিন") is None
    assert extract_amount("অন্য কোনো কিছু না থাকলে") is None
    assert extract_amount("না") is None
    assert extract_amount("হবে না") is None
    assert extract_amount("না ভাই") is None
    assert extract_amount("cancel") is None


@pytest.mark.asyncio
async def test_whatsapp_assistant_end_to_end_expense_flow_not_aborted(setup_adversarial_backend):
    """
    Verifies that when a draft is already pending in the conversation:
    1. Legitimate denials ('না', 'na', 'no', 'হবে না', 'না ভাই', 'cancel') correctly reject the pending draft.
    2. Bengali words containing 'না' ('নাস্তা ৫০ টাকা', 'জানালা মেরামত ৫০০', 'রান্নাঘর ১০০০', 'নাবিল ৫০০ টাকা')
       do NOT trigger false rejection and successfully create a new draft.
    """
    env = setup_adversarial_backend
    m_id = env['merchant_id']
    u_id = env['owner_id']
    phone = "01711000000"

    # --- Step 1: Legitimate Denial Stress Test ---
    denials = ['না', 'na', 'no', 'হবে না', 'না ভাই', 'cancel', 'বাতিল']
    for phrase in denials:
        # Create a pending draft
        d_id = insert('whatsapp_drafts', {
            'merchant_id': m_id,
            'user_id': u_id,
            'status': 'pending',
            'stage': 'confirm',
            'intent': 'expense',
            'draft': '{"head": "packaging", "amount": 40000}',
            'raw_text': 'প্যাকেজিং ৪০০ টাকা',
            'parser': 'regex',
            'created_at': now_iso()
        })

        resp = await handle_incoming(phone, phrase)
        assert len(resp) == 1
        assert "❌ এন্ট্রি বাতিল করা হয়েছে" in resp[0], f"Denial phrase '{phrase}' failed to reject draft: {resp[0]}"

        # Verify DB state
        draft = one("SELECT * FROM whatsapp_drafts WHERE id = ?", d_id)
        assert draft['status'] == 'rejected'

    # --- Step 2: Legitimate Bengali Expense Stress Test (must NOT be rejected) ---
    bengali_expenses = [
        ('নাস্তা ৫০ টাকা', 5000),
        ('জানালা মেরামত ৫০০', 50000),
        ('রান্নাঘর ১০০০', 100000),
        ('নাবিল ৫০০ টাকা', 50000),
        ('নানা খরচ ২০০ টাকা', 20000),
        ('জানালার পর্দা ২০০০ টাকা', 200000),
    ]

    for expense_text, expected_poisha in bengali_expenses:
        # Create a pending draft first to stress-test the pending branch
        d_id = insert('whatsapp_drafts', {
            'merchant_id': m_id,
            'user_id': u_id,
            'status': 'pending',
            'stage': 'confirm',
            'intent': 'expense',
            'draft': '{"head": "packaging", "amount": 40000}',
            'raw_text': 'প্যাকেজিং ৪০০ টাকা',
            'parser': 'regex',
            'created_at': now_iso()
        })

        # Send new expense message containing 'না' in word
        resp = await handle_incoming(phone, expense_text)
        assert len(resp) == 1
        # Response must NOT be a rejection
        assert "❌ এন্ট্রি বাতিল করা হয়েছে" not in resp[0], f"Expense '{expense_text}' was falsely rejected!"
        # Response must be a new draft confirmation prompt
        assert "📝 এই এন্ট্রিটি ড্রাফট করা হয়েছে" in resp[0]

        # Verify a new draft was created with the correct parsed amount
        latest_draft = one("SELECT * FROM whatsapp_drafts WHERE user_id = ? ORDER BY id DESC LIMIT 1", u_id)
        assert latest_draft['id'] != d_id
        assert latest_draft['status'] == 'pending'
        assert latest_draft['raw_text'] == expense_text
        import json
        payload = json.loads(latest_draft['draft'])
        assert payload['amount'] == expected_poisha
