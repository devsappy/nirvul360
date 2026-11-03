"""
Purchase price tests: the missing-prices queue, bulk price upload, and the
non-negotiable rule that adding a NEW price record never rewrites historical
profit (versioned cost, newest effective_from wins only from its date onward).
"""
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import open_db, one, all
from app.domain.merchants import create_merchant, create_user
from app.domain.products import upsert_product, cost_at
from app.domain.orders import create_order, apply_status
from app.domain.exceptions import resolve, seed_reason_codes
from app.domain.reports import profit_and_loss
from app.lib.dates import reset_clock, set_clock

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    open_db(":memory:")
    reset_clock()
    seed_reason_codes()


def _merchant(name='Price Tests'):
    m_id = create_merchant({'name': name})
    u_id = create_user(m_id, {'name': 'Owner', 'email': 'p@y.bd', 'role': 'owner', 'password': 'pw123456'})
    login = client.post("/api/auth/login", json={'email': 'p@y.bd', 'password': 'pw123456'})
    assert login.status_code == 200
    return m_id, u_id


def test_missing_prices_list_and_download_csv():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    pid = upsert_product(m_id, {'name': 'Hoodie', 'sku': 'HD-1', 'selling_price': 165000}, ctx)  # no cost
    upsert_product(m_id, {'name': 'Shirt', 'selling_price': 100000, 'purchase_price': 40000}, ctx)

    res = client.get("/api/products/missing-prices")
    assert res.status_code == 200
    data = res.json()
    assert data['count'] == 1
    assert data['products'][0]['id'] == pid
    assert data['products'][0]['name'] == 'Hoodie'

    res = client.get("/api/products/missing-prices/download")
    assert res.status_code == 200
    assert res.headers['content-type'].startswith('text/csv')
    body = res.text
    lines = [l for l in body.strip().splitlines() if l]
    assert lines[0] == 'id,name,sku,purchase_price'
    assert lines[1] == f'{pid},Hoodie,HD-1,'
    assert len(lines) == 2

    # Resolving through the exception queue clears the missing list
    exc = one("SELECT * FROM exception_queue WHERE type = 'product_without_price'")
    assert exc and exc['product_id'] == pid
    resolve(m_id, exc['id'], 'add_purchase_price', {'purchase_price': 90.0}, f'user:{u_id}')
    after = client.get("/api/products/missing-prices").json()
    assert after['count'] == 0


def test_bulk_price_commit_creates_new_effective_records():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}

    set_clock(lambda: datetime(2026, 9, 1, 6, 0, 0, tzinfo=timezone.utc))
    pid_a = upsert_product(m_id, {'name': 'Panjabi', 'selling_price': 150000, 'purchase_price': 50000}, ctx)
    pid_b = upsert_product(m_id, {'name': 'Saree', 'selling_price': 250000}, ctx)  # no cost yet

    # Delivered order for A in September at the September cost
    oid = create_order(m_id, {
        'order_date': '2026-09-05',
        'customer_phone': '01713000000',
        'courier': 'steadfast',
        'items': [{'product_id': pid_a, 'qty': 2, 'unit_price': 150000}],
    }, ctx)
    apply_status(m_id, oid, 'delivered', {'date': '2026-09-10', **ctx})
    pnl_sep_before = profit_and_loss(m_id, '2026-09-01', '2026-09-30')
    assert pnl_sep_before['cogs'] == 100000  # 2 × 50000

    # Later, prices are re-entered in bulk (taka floats from the sheet)
    set_clock(lambda: datetime(2026, 10, 15, 6, 0, 0, tzinfo=timezone.utc))
    rows = [{'product_id': pid_a, 'purchase_price': 80.0}, {'product_id': pid_b, 'purchase_price': 90.0}]

    preview = client.post("/api/products/prices/bulk-preview", json={'rows': rows}).json()
    assert [v['product_id'] for v in preview['valid']] == [pid_a, pid_b]
    assert preview['valid'][0]['old_cost'] == 50000
    assert preview['valid'][0]['new_cost'] == 8000
    assert preview['skipped'] == []

    res = client.post("/api/products/prices/bulk-commit", json={'rows': rows})
    assert res.status_code == 200
    out = res.json()
    assert out['ok'] is True
    assert out['applied'] == 2
    recs = out['records']
    assert recs[0]['effective_from'] == '2026-10-15'   # A: brand-new record from today

    # Version history: never overwritten, only appended
    history = all(
        "SELECT * FROM product_price_history WHERE product_id = ? ORDER BY effective_from, id", pid_a
    )
    assert [h['purchase_price'] for h in history] == [50000, 8000]
    assert [h['effective_from'] for h in history] == ['2026-09-01', '2026-10-15']

    assert cost_at(pid_a, '2026-09-30')['purchase_price'] == 50000
    assert cost_at(pid_a, '2026-10-15')['purchase_price'] == 8000

    # HISTORICAL PROFIT MUST NOT MOVE — the September books still say 100000
    pnl_sep_after = profit_and_loss(m_id, '2026-09-01', '2026-09-30')
    assert pnl_sep_after['cogs'] == pnl_sep_before['cogs']
    assert pnl_sep_after['net_profit'] == pnl_sep_before['net_profit']

    # The missing-prices list is now empty
    assert client.get("/api/products/missing-prices").json()['count'] == 0


def test_bulk_price_commit_skips_unknown_and_negative_rows():
    m_id, u_id = _merchant()
    ctx = {'source': 'manual', 'actor': f'user:{u_id}'}
    upsert_product(m_id, {'name': 'Bad Price Test', 'selling_price': 100000}, ctx)
    pid = one("SELECT id FROM products WHERE merchant_id = ?", m_id)['id']
    res = client.post("/api/products/prices/bulk-commit", json={'rows': [
        {'product_id': 999, 'purchase_price': 10.0},   # not in this merchant's books
        {'product_id': pid, 'purchase_price': -5.0},   # exists, but invalid price
    ]})
    assert res.status_code == 200
    out = res.json()
    assert out['ok'] is True
    assert out['applied'] == 0
    assert len(out['skipped']) == 2
    reasons = {s['reason'] for s in out['skipped']}
    assert any('not found' in r for r in reasons)
    assert any('cannot be negative' in r for r in reasons)
