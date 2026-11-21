import pytest
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.whatsapp.parser import parse_message
from app.whatsapp.assistant import handle_incoming
from app.domain.reports import profit_and_loss
from app.lib.dates import reset_clock, today

@pytest.fixture(autouse=True)
def setup():
    open_db(":memory:")
    reset_clock()

def test_whatsapp_bangla_parser():
    parsed = parse_message("৫০০ টাকা প্যাকেট খরচ")
    assert parsed['intent'] == 'expense'
    assert parsed['amount'] == 50000  # 500 Taka in poisha
    assert parsed['head'] == 'packaging'

    parsed2 = parse_message("salary 15000")
    assert parsed2['intent'] == 'expense'
    assert parsed2['amount'] == 1500000
    assert parsed2['head'] == 'salary'

@pytest.mark.asyncio
async def test_whatsapp_two_step_confirmation_machine():
    m_id = create_merchant({'name': 'Fashion Store', 'phone': '01700000000'})
    u_id = create_user(m_id, {
        'phone': '01712345678',
        'role': 'accountant',
        'full_name': 'Hasan Ali',
        'password': 'secret_password_123'
    })

    # Step 1: Accountant sends Bengali expense
    resp1 = await handle_incoming('01712345678', 'প্যাকেজিং ৪০০ টাকা')
    assert len(resp1) > 0
    assert 'ড্রাফট' in resp1[0] or 'Draft' in resp1[0]

    # Before confirmation, PnL has 0 expense
    d = today()
    pnl_before = profit_and_loss(m_id, d[:7] + '-01', d)
    assert pnl_before['sections']['packaging']['amount'] == 0

    # Step 2: Confirm draft with Bengali "হ্যাঁ"
    resp2 = await handle_incoming('01712345678', 'হ্যাঁ')
    assert len(resp2) > 0
    assert 'লিখে রাখা হয়েছে' in resp2[0] or 'লেজারে' in resp2[0]

    # After confirmation, double-entry posted into PnL!
    pnl_after = profit_and_loss(m_id, d[:7] + '-01', d)
    assert pnl_after['sections']['packaging']['amount'] == 40000

@pytest.mark.asyncio
async def test_whatsapp_llm_fallback_parsing():
    from app.whatsapp.parser import parse_message_llm
    # Test conversational Bengali message that regex might miss or under-parse
    res = await parse_message_llm("দোকান ভাড়ার জন্য 5k দিলাম")
    if res:  # Only asserts if API key is active and online
        assert res['intent'] == 'expense'
        assert res['head'] == 'rent'
        assert res['amount'] == 500000  # 5,000 Taka in poisha
