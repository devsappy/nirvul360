import pytest
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product, set_price, cost_at
from app.domain.orders import create_order, apply_status
from app.domain.reports import profit_and_loss
from app.domain.entries import record_ad_spend, record_withdrawal

from app.lib.dates import set_clock, reset_clock
from datetime import datetime, timezone

@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()

def test_historical_profit_does_not_move_when_purchase_price_changes():
    # Freeze clock in September
    set_clock(lambda: datetime(2026, 9, 1, 6, 0, 0, tzinfo=timezone.utc))

    m_id = create_merchant({'name': 'Fashion Shop'})
    ctx = {'source': 'manual', 'actor': 'test'}
    pid = upsert_product(m_id, {'name': 'Panjabi', 'selling_price': 150000, 'purchase_price': 50000}, ctx)

    oid = create_order(m_id, {
        'order_date': '2026-09-05',
        'customer_phone': '01711000000',
        'courier': 'steadfast',
        'items': [{'product_id': pid, 'qty': 2, 'unit_price': 150000}],
    }, ctx)

    apply_status(m_id, oid, 'delivered', {'date': '2026-09-10', **ctx})

    pnl_sep = profit_and_loss(m_id, '2026-09-01', '2026-09-30')
    assert pnl_sep['gross_sales'] == 300000
    assert pnl_sep['cogs'] == 100000  # 2 x 50000
    assert pnl_sep['net_profit'] == 200000

    # Increase purchase price in October
    set_clock(lambda: datetime(2026, 10, 15, 6, 0, 0, tzinfo=timezone.utc))
    set_price(m_id, pid, 80000, {'effective_from': '2026-10-15', **ctx})

    # Historical September profit MUST NOT move!
    pnl_sep_after = profit_and_loss(m_id, '2026-09-01', '2026-09-30')
    assert pnl_sep_after['cogs'] == pnl_sep['cogs']
    assert pnl_sep_after['net_profit'] == pnl_sep['net_profit']

def test_placed_orders_are_not_revenue():
    m_id = create_merchant({'name': 'Fashion Shop'})
    ctx = {'source': 'manual', 'actor': 'test'}
    pid = upsert_product(m_id, {'name': 'Shirt', 'selling_price': 80000, 'purchase_price': 40000}, ctx)

    create_order(m_id, {
        'order_date': '2026-09-05',
        'customer_phone': '01711000001',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 80000}],
    }, ctx)

    pnl = profit_and_loss(m_id, '2026-09-01', '2026-09-30')
    assert pnl['gross_sales'] == 0
    assert pnl['net_profit'] == 0

def test_owner_withdrawals_are_not_expenses():
    m_id = create_merchant({'name': 'Fashion Shop'})
    ctx = {'source': 'manual', 'actor': 'test'}

    record_withdrawal(m_id, {'amount': 1000000, 'date': '2026-09-15', 'note': 'Personal'}, ctx)

    pnl = profit_and_loss(m_id, '2026-09-01', '2026-09-30')
    assert pnl['net_profit'] == 0
    assert pnl['owner_withdrawals'] == 1000000
