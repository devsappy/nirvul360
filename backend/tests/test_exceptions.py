import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db, one, all
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product, cost_at
from app.domain.orders import create_order, apply_status
from app.domain.entries import record_purchase
from app.domain.exceptions import (
    raise_exception, resolve, resolve_short_settlement, seed_reason_codes,
    EXCEPTION_TYPES, list_exceptions, unresolved_totals,
)
from app.domain.settlements import commit_settlement
from app.domain.ledger import balance
from app.domain.reports import profit_and_loss
from app.lib.dates import reset_clock

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()


def _merchant(name='Exception Tests'):
    m_id = create_merchant({'name': name})
    u_id = create_user(m_id, {'name': 'Owner', 'email': 'x@y.bd', 'role': 'owner', 'password': 'pw123456'})
    return m_id, u_id


def _order_with_product(m_id, u_id, unit=100000, qty=2, cost=40000, consignment='SF-1', courier='steadfast'):
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'T-Shirt', 'selling_price': unit, 'purchase_price': cost}, ctx)
    oid = create_order(m_id, {
        'customer_phone': '01711223344',
        'courier': courier,
        'consignment_id': consignment,
        'items': [{'product_id': pid, 'qty': qty, 'unit_price': unit}],
    }, ctx)
    return pid, oid, ctx


def _short_sheet(m_id, u_id, oid, consignment='SF-1', cod=100000):
    """A courier sheet that settles half of the order's COD."""
    order = one("SELECT * FROM orders WHERE id = ?", oid)
    rows = [{
        'consignment_id': consignment,
        'status': 'Delivered',
        'cod_collected': cod,
        'delivery_charge': 3000,
        'cod_fee': 2000,
        'return_charge': 0,
    }]
    sha = 'test-short-sheet'
    return commit_settlement(
        m_id, rows, 'steadfast', 'sheet.csv', sha,
        {'source': 'courier_sheet_upload', 'actor': f'user:{u_id}'},
    )


def test_short_settlement_partial_delivery():
    m_id, u_id = _merchant()
    pid, oid, ctx = _order_with_product(m_id, u_id, unit=100000, qty=2, cost=40000)
    apply_status(m_id, oid, 'delivered', {'date': '2026-10-01', **ctx})

    result = _short_sheet(m_id, u_id, oid, cod=100000)  # settles half
    assert result['exceptions'] == 1

    exc = one("SELECT * FROM exception_queue WHERE type = 'short_settlement' AND order_id = ?", oid)
    assert exc and exc['status'] == 'open'
    assert exc['value'] == 100000  # 200000 order COD − 100000 settled

    # The unanswered shortfall is parked in suspense and OUT of profit (criterion 5)
    assert balance(m_id, 'settlement_suspense') == 100000

    out = resolve_short_settlement(m_id, exc['id'], 'partial_delivery', f'user:{u_id}')
    assert out['status'] == 'resolved'
    assert out['shortfall_poisha'] == 100000

    # Revenue reduced by the shortfall; refused stock back in inventory; suspense cleared.
    assert balance(m_id, 'settlement_suspense') == 0
    assert balance(m_id, 'courier_receivable', party='steadfast') == 0
    assert balance(m_id, 'sales') == -100000          # was −200000 at delivery
    assert balance(m_id, 'cogs') == 40000             # 2 units delivered, 1 returned
    assert balance(m_id, 'inventory') == -40000       # −80000 then one unit back +40000

    pnl = profit_and_loss(m_id, '2026-09-01', '2026-10-31')
    assert pnl['gross_sales'] == 100000
    assert pnl['cogs'] == 40000
    assert pnl['net_profit'] == 100000 - 40000 - 5000  # sales − cogs − courier fees


def test_short_settlement_delivery_discount():
    m_id, u_id = _merchant()
    pid, oid, ctx = _order_with_product(m_id, u_id)
    apply_status(m_id, oid, 'delivered', {'date': '2026-10-01', **ctx})
    _short_sheet(m_id, u_id, oid, cod=100000)

    exc = one("SELECT * FROM exception_queue WHERE type = 'short_settlement' AND order_id = ?", oid)
    resolve_short_settlement(m_id, exc['id'], 'delivery_discount', f'user:{u_id}')

    assert balance(m_id, 'settlement_suspense') == 0
    assert balance(m_id, 'sales_discounts') == 100000
    assert balance(m_id, 'sales') == -200000          # unchanged; discount nets it (full stock consumed)
    assert balance(m_id, 'cogs') == 80000             # nothing returned to inventory
    assert balance(m_id, 'inventory') == -80000

    pnl = profit_and_loss(m_id, '2026-09-01', '2026-10-31')
    assert pnl['net_sales'] == 100000


def test_short_settlement_courier_short_keeps_revenue_and_claims_receivable():
    m_id, u_id = _merchant()
    pid, oid, ctx = _order_with_product(m_id, u_id)
    apply_status(m_id, oid, 'delivered', {'date': '2026-10-01', **ctx})
    _short_sheet(m_id, u_id, oid, cod=100000)

    exc = one("SELECT * FROM exception_queue WHERE type = 'short_settlement' AND order_id = ?", oid)
    resolve_short_settlement(m_id, exc['id'], 'courier_short', f'user:{u_id}')

    # Revenue unchanged; the difference is a firm receivable from the courier.
    assert balance(m_id, 'sales') == -200000
    assert balance(m_id, 'settlement_suspense') == 0
    assert balance(m_id, 'courier_receivable', party='steadfast') == 100000


def test_duplicate_order_raise_and_resolve():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'Shirt', 'selling_price': 100000, 'purchase_price': 40000}, ctx)

    o1 = create_order(m_id, {
        'customer_phone': '01711000000',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 100000}],
    }, ctx)
    o2 = create_order(m_id, {
        'customer_phone': '01711000000',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 100000}],
    }, ctx)

    exc = one("SELECT * FROM exception_queue WHERE type = 'duplicate_order'")
    assert exc and exc['order_id'] == o2
    assert exc['value'] == 100000

    flagged = one("SELECT is_duplicate FROM orders WHERE id = ?", o2)
    assert flagged['is_duplicate'] == 1

    # A different product at the same phone is not a duplicate
    create_order(m_id, {
        'customer_phone': '01711000000',
        'items': [{'product_id': pid, 'qty': 2, 'unit_price': 100000}],
    }, ctx)
    assert one("SELECT COUNT(*) AS c FROM exception_queue WHERE type = 'duplicate_order'")['c'] == 1

    # Resolving genuine clears the flag and the exception
    out = resolve(m_id, exc['id'], 'confirm_genuine', {}, f'user:{u_id}')
    assert out['status'] == 'resolved'
    assert one("SELECT is_duplicate AS v FROM orders WHERE id = ?", o2)['v'] == 0


def test_duplicate_with_advance_reverses_posting():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'Shirt', 'selling_price': 100000, 'purchase_price': 40000}, ctx)
    payload = {
        'customer_phone': '01711000001',
        'advance_paid': 50000,
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 100000}],
    }
    create_order(m_id, payload, ctx)
    o2 = create_order(m_id, payload, ctx)
    assert one("SELECT is_duplicate AS v FROM orders WHERE id = ?", o2)['v'] == 1
    assert balance(m_id, 'customer_advances') == -100000  # both orders' advances posted (flagging happens after normal creation)

    exc = one("SELECT * FROM exception_queue WHERE type = 'duplicate_order'")
    out = resolve(m_id, exc['id'], 'confirm_duplicate', {}, f'user:{u_id}')
    assert out['status'] == 'resolved'
    assert balance(m_id, 'customer_advances') == -50000  # the duplicate's advance posting is reversed; the genuine order's remains


def test_product_without_price_resolve_posts_price_and_releases():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'Hoodie', 'selling_price': 165000}, ctx)  # no price
    oid = create_order(m_id, {
        'customer_phone': '01711223355',
        'courier': 'steadfast',
        'consignment_id': 'SF-H1',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 165000}],
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': '2026-10-05', **ctx})

    exc = one("SELECT * FROM exception_queue WHERE type = 'product_without_price'")
    assert exc and exc['product_id'] == pid
    order = one("SELECT posting_state FROM orders WHERE id = ?", oid)
    assert order['posting_state'] == 'held'  # held out of profit
    assert balance(m_id, 'revenue_suspense') == -165000

    out = resolve(m_id, exc['id'], 'add_purchase_price', {'purchase_price': 90.50}, f'user:{u_id}')
    assert out['status'] == 'resolved'

    # New price record effective at the delivery date, nothing overwritten
    rec = one("SELECT * FROM product_price_history WHERE product_id = ? ORDER BY id DESC LIMIT 1", pid)
    assert rec['purchase_price'] == 9050
    assert rec['effective_from'] == '2026-10-05'

    # Held delivery released: profit now real
    order = one("SELECT posting_state FROM orders WHERE id = ?", oid)
    assert order['posting_state'] == 'posted'
    assert balance(m_id, 'revenue_suspense') == 0
    assert balance(m_id, 'sales') == -165000
    assert balance(m_id, 'cogs') == 9050


def test_unsettled_cod_confirm_received_and_chase():
    m_id, u_id = _merchant()
    pid, oid, ctx = _order_with_product(m_id, u_id, consignment='SF-U1')
    apply_status(m_id, oid, 'delivered', {'date': '2026-09-01', **ctx})

    from app.domain.exceptions import scan_merchant
    from app.domain.merchants import create_cash_account
    scan_merchant(m_id)

    exc = one("SELECT * FROM exception_queue WHERE type = 'unsettled_cod' AND order_id = ?", oid)
    assert exc, 'scan should raise unsettled COD (delivery dates far in the past)'

    cash_account_id = create_cash_account(m_id, {'name': 'bKash', 'kind': 'bkash'})
    out = resolve(m_id, exc['id'], 'confirm_received', {'cash_account_id': cash_account_id}, f'user:{u_id}')
    assert out['status'] == 'resolved'
    assert balance(m_id, 'courier_receivable', party='steadfast') == 0
    assert balance(m_id, 'cash', party=str(cash_account_id)) == 200000


def test_zero_settlement_confirm_free_delivery():
    m_id, u_id = _merchant()
    pid, oid, ctx = _order_with_product(m_id, u_id, unit=100000, qty=1, cost=40000, consignment='SF-Z1')
    apply_status(m_id, oid, 'delivered', {'date': '2026-10-01', **ctx})

    rows = [{
        'consignment_id': 'SF-Z1',
        'status': 'Delivered',
        'cod_collected': 0,
        'delivery_charge': 3000,
        'cod_fee': 0,
        'return_charge': 0,
    }]
    result = commit_settlement(
        m_id, rows, 'steadfast', 'zero.csv', 'sha-zero',
        {'source': 'courier_sheet_upload', 'actor': f'user:{u_id}'},
    )
    assert result['exceptions'] == 1
    exc = one("SELECT * FROM exception_queue WHERE type = 'zero_settlement' AND order_id = ?", oid)
    assert exc['value'] == 100000

    out = resolve(m_id, exc['id'], 'confirm_free_delivery', {}, f'user:{u_id}')
    assert out['status'] == 'resolved'
    assert balance(m_id, 'sales') == 0            # revenue voided
    assert balance(m_id, 'cogs') == 0             # COGS voided
    assert balance(m_id, 'inventory') == -40000   # the goods physically left stock — consumed by the customer
    assert balance(m_id, 'other_expense') == 40000  # the gifted goods stay consumed
    assert balance(m_id, 'bad_debt') == 100000        # the parked courier claim is given up
    assert balance(m_id, 'courier_delivery') == 3000   # courier cost stays
    assert balance(m_id, 'settlement_suspense') == 0


def test_list_api_shape_and_totals():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'Shirt', 'selling_price': 100000, 'purchase_price': 40000}, ctx)
    oid = create_order(m_id, {
        'customer_phone': '01711000002',
        'courier': 'steadfast',
        'consignment_id': 'SF-L1',
        'items': [{'product_id': pid, 'qty': 1, 'unit_price': 100000}],
    }, ctx)
    apply_status(m_id, oid, 'in_transit', {'date': '2026-09-05', **ctx})

    from app.domain.exceptions import scan_merchant
    scan_merchant(m_id)

    raise_exception(m_id, {
        'type': 'duplicate_order', 'key': 'manual-dup', 'value': 660000, 'order_id': oid,
    })

    login = client.post("/api/auth/login", json={'email': 'x@y.bd', 'password': 'pw123456'})
    assert login.status_code == 200

    res = client.get("/api/exceptions?status=open")
    assert res.status_code == 200
    data = res.json()
    # unresolved totals exclude nothing while both are open
    assert data['count'] >= 2
    assert data['total_unresolved_poisha'] >= 760000
    item = next(i for i in data['items'] if i['type'] == 'duplicate_order')
    assert item['value_taka'] == 6600.0
    assert item['order_id'] == oid
    assert item['actions'] == ['confirm_duplicate', 'confirm_genuine']
    stuck = next(i for i in data['items'] if i['type'] == 'stuck_parcel')
    assert stuck['actions'] == EXCEPTION_TYPES['stuck_parcel']['actions']

    detail = client.get(f"/api/exceptions/{item['id']}")
    assert detail.status_code == 200
    assert detail.json()['type'] == 'duplicate_order'

    # resolve via the API, then it disappears from the open list
    res2 = client.post(f"/api/exceptions/{item['id']}/resolve", json={'action': 'confirm_genuine'})
    assert res2.status_code == 200
    assert res2.json()['status'] == 'resolved'
    after = client.get("/api/exceptions?status=open").json()
    assert not any(i['id'] == item['id'] for i in after['items'])

    # resolved filter returns it
    resolved = client.get("/api/exceptions?status=resolved").json()
    assert any(i['id'] == item['id'] for i in resolved['items'])
