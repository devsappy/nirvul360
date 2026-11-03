"""
Courier settlement sheet tests: per-courier mapping, preview, commit accounting,
idempotent re-upload, and the short/zero settlement exceptions (criterion 5).
"""
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import open_db, one
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product
from app.domain.orders import create_order, apply_status
from app.domain.exceptions import seed_reason_codes
from app.domain.ledger import balance
from app.lib.dates import reset_clock, set_clock

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()


STEADFAST_CSV = (
    "consignment id,customer name,status,cod amount,delivery charge,cod fee,return charge,payment date\r\n"
    "SF-A1,Karim,Delivered,2000,30,20,0,2026-10-05\r\n"
    "SF-B1,Rahim,Returned,0,30,0,60,2026-10-06\r\n"
)


def _merchant(name='Settlement Tests'):
    m_id = create_merchant({'name': name})
    u_id = create_user(m_id, {'name': 'Owner', 'email': 's@y.bd', 'role': 'owner', 'password': 'pw123456'})
    login = client.post("/api/auth/login", json={'email': 's@y.bd', 'password': 'pw123456'})
    assert login.status_code == 200
    return m_id, u_id


def _delivered_order(m_id, u_id, consignment, unit=100000, qty=2, courier='steadfast', date='2026-10-01'):
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': f'Item-{consignment}', 'selling_price': unit, 'purchase_price': 40000}, ctx)
    oid = create_order(m_id, {
        'customer_phone': '01712000000',
        'courier': courier,
        'consignment_id': consignment,
        'items': [{'product_id': pid, 'qty': qty, 'unit_price': unit}],
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': date, **ctx})
    return pid, oid


def test_preview_maps_steadfast_csv():
    m_id, u_id = _merchant()
    _delivered_order(m_id, u_id, 'SF-A1')

    res = client.post(
        "/api/settlements/preview",
        files={'file': ('sheet.csv', STEADFAST_CSV.encode('utf-8'), 'text/csv')},
        data={'courier': 'steadfast'},
    )
    assert res.status_code == 200
    data = res.json()
    assert data['courier'] == 'steadfast'
    assert len(data['rows']) == 2

    r1 = data['rows'][0]
    assert r1['consignment_id'] == 'SF-A1'
    assert r1['status'] == 'delivered'          # 'Delivered' → canonical word
    assert r1['cod_collected'] == 200000        # 2000 taka → poisha
    assert r1['delivery_charge'] == 3000
    assert r1['cod_fee'] == 2000
    assert r1['settlement_date'] == '2026-10-05'
    assert 'errors' not in r1

    r2 = data['rows'][1]
    assert r2['status'] == 'returned'
    assert r2['return_charge'] == 6000

    # The sheet knows which order the consignment belongs to (read-only match)
    assert data['summary']['rows'] == 2
    assert data['summary']['matched'] == 1      # only SF-A1 is in the books
    assert data['summary']['total_cod_poisha'] == 200000
    assert data['summary']['total_fees_poisha'] == 3000 + 2000 + 0 + 3000 + 0 + 6000


def test_preview_maps_redx_with_its_own_headers():
    m_id, u_id = _merchant()
    _delivered_order(m_id, u_id, 'RX-77', courier='redx', unit=50000, qty=1, date='2026-10-02')

    rows = [{
        'Tracking ID': 'RX-77',
        'Delivery Status': 'Delivered',
        'Cash collected': '480',
        'Delivery fee': '25.50',
        'Cash handling fee': '5',
    }]
    res = client.post("/api/settlements/preview-json", json={'courier': 'redx', 'rows': rows})
    assert res.status_code == 200
    data = res.json()
    assert data['display_name'] == 'RedX'
    r = data['rows'][0]
    assert r['consignment_id'] == 'RX-77'
    assert r['status'] == 'delivered'
    assert r['cod_collected'] == 48000          # 480.00 taka
    assert r['delivery_charge'] == 2550         # 25.50 taka
    assert r['cod_fee'] == 500
    assert data['summary']['matched'] == 1


def test_commit_posts_cash_and_fees():
    m_id, u_id = _merchant()
    pid, oid = _delivered_order(m_id, u_id, 'SF-A1')

    rows = [{
        'Consignment ID': 'SF-A1',
        'Status': 'Delivered',
        'COD Amount': '2000',
        'Delivery Charge': '30',
        'COD fee': '20',
    }]
    res = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': rows, 'filename': 'sf-oct.csv'})
    assert res.status_code == 200
    out = res.json()
    assert out['ok'] is True
    assert out['posted'] == 1
    assert out['exceptions'] == 0
    assert out['total_cash_poisha'] == 200000 - 5000

    # Payment posting: cash in, fees expensed, receivable cleared
    assert balance(m_id, 'cash') == 195000
    assert balance(m_id, 'courier_delivery') == 3000
    assert balance(m_id, 'courier_cod_fee') == 2000
    assert balance(m_id, 'courier_receivable', party='steadfast') == 0
    assert balance(m_id, 'settlement_suspense') == 0

    row = one("SELECT * FROM settlement_rows WHERE consignment_id = 'SF-A1'")
    assert row['outcome'] == 'posted'
    assert row['order_id'] == oid
    upload = one("SELECT * FROM uploads WHERE id = ?", out['upload_id'])
    assert upload['kind'] == 'courier_settlement'
    assert upload['status'] == 'committed'


def test_commit_is_idempotent_per_consignment():
    m_id, u_id = _merchant()
    _delivered_order(m_id, u_id, 'SF-A1')

    rows = [{
        'Consignment ID': 'SF-A1',
        'Status': 'Delivered',
        'COD Amount': '2000',
        'Delivery Charge': '30',
        'COD fee': '20',
    }]
    first = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': rows}).json()
    assert first['posted'] == 1

    # Same consignment re-uploaded (even in a new sheet with a new name)
    second = client.post("/api/settlements/commit", json={
        'courier': 'steadfast', 'rows': rows, 'filename': 'sf-oct-fixed.csv',
    }).json()
    assert second['ok'] is True
    assert second['skipped'] == 1
    assert second['posted'] == 0

    # The books did not move: money cannot be collected twice
    assert balance(m_id, 'cash') == 195000
    assert one("SELECT COUNT(*) AS c FROM settlement_rows WHERE consignment_id = 'SF-A1'")['c'] == 1


def test_commit_raises_short_and_zero_settlement():
    m_id, u_id = _merchant()
    _delivered_order(m_id, u_id, 'SF-A1')                     # COD 200000
    _delivered_order(m_id, u_id, 'SF-Z1', unit=100000, qty=1)  # COD 100000

    rows = [
        {'Consignment ID': 'SF-A1', 'Status': 'Delivered', 'COD Amount': '1000', 'Delivery Charge': '30', 'COD fee': '20'},  # half paid
        {'Consignment ID': 'SF-Z1', 'Status': 'Delivered', 'COD Amount': '0', 'Delivery Charge': '30'},                       # nothing paid
    ]
    out = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': rows}).json()
    assert out['exceptions'] == 2
    assert out['posted'] == 0

    short = one("SELECT * FROM exception_queue WHERE type = 'short_settlement'")
    assert short and short['value'] == 100000            # 200000 COD − 100000 settled
    assert balance(m_id, 'settlement_suspense') == 200000  # 100000 + 100000 parked

    zero = one("SELECT * FROM exception_queue WHERE type = 'zero_settlement'")
    assert zero and zero['value'] == 100000

    # Cash: (100000 − 5000) + (0 − 3000)
    assert balance(m_id, 'cash') == 92000


def test_commit_unmatched_consignment_raises_missing_parcel():
    m_id, u_id = _merchant()
    rows = [{
        'Consignment ID': 'SF-GHOST',
        'Status': 'Delivered',
        'COD Amount': '500',
        'Delivery Charge': '30',
    }]
    out = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': rows}).json()
    assert out['unmatched'] == 1

    exc = one("SELECT * FROM exception_queue WHERE type = 'missing_parcel'")
    assert exc
    details = one("SELECT details FROM exception_queue WHERE id = ?", exc['id'])['details']
    import json as _json
    d = _json.loads(details)
    assert d['from_sheet'] is True
    assert d['cod_collected'] == 50000
    assert exc['value'] == 50000

    # Nothing was posted to the ledger for a parcel outside the books
    assert balance(m_id, 'cash') == 0


def test_commit_books_returned_fees_once():
    m_id, u_id = _merchant()
    # Books say returned; the sheet agrees. The courier must still be paid its fees.
    _delivered_order(m_id, u_id, 'SF-B1', date='2026-10-02')
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    oid_b1 = one("SELECT id FROM orders WHERE consignment_id = 'SF-B1'")['id']
    apply_status(m_id, oid_b1, 'returned', {'date': '2026-10-08', **ctx})

    rows = [{'Consignment ID': 'SF-B1', 'Status': 'Returned', 'COD Amount': '0', 'Delivery Charge': '30', 'Return charge': '60'}]
    out = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': rows}).json()
    assert out['posted'] == 1
    assert out['exceptions'] == 0

    # Fees booked exactly once
    assert balance(m_id, 'courier_delivery') == 3000
    assert balance(m_id, 'courier_return_fee') == 6000

    # Feeding the same returned row again does not double-charge the fees
    out2 = client.post("/api/settlements/commit", json={'courier': 'steadfast', 'rows': rows, 'filename': 'again.csv'}).json()
    assert out2['skipped'] == 1
    assert balance(m_id, 'courier_delivery') == 3000


def test_settlement_couriers_catalog():
    _merchant()
    res = client.get("/api/settlements/couriers")
    assert res.status_code == 200
    data = res.json()
    keys = {c['key'] for c in data['couriers']}
    assert {'steadfast', 'pathao', 'redx', 'sa_paribahan'} <= keys
    sf = next(c for c in data['couriers'] if c['key'] == 'steadfast')
    assert 'cod amount' in sf['columns']['cod_collected']
    assert 'delivered' in sf['status_words']['delivered']
