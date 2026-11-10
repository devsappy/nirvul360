"""
Milestone 3 Iteration 2 Adversarial Edge-Case & Mockup Verification Suite.

Tests empty/edge states:
- Empty database (0 orders, 0 products, 0 settlements, 0 ad spend)
- Order detail API with zero fees / missing journal lines (verifies no fallback to mockup values)
- Product performance API with zero orders / missing costs
- Settlements receivables summary with no sheets uploaded
- Static code inspection asserting absence of mockup demo constants (specifically flag `|| 70` in OrdersView.tsx)
"""
import re
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.db.session import open_db
from app.domain.merchants import create_merchant, create_user, create_cash_account
from app.domain.orders import apply_status
from app.lib.dates import reset_clock, today

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_clean_db():
    """Initializes an isolated in-memory test database."""
    open_db(":memory:")
    reset_clock()


def create_base_merchant():
    m_id = create_merchant({'name': 'Challenger Edge Test Merchant', 'currency': 'BDT', 'phone': '01700000000'})
    owner_id = create_user(m_id, {
        'name': 'Edge Owner',
        'email': 'edge@test.bd',
        'phone': '01711000000',
        'whatsapp': '01711000000',
        'role': 'agency_owner',
        'password': 'StrongPassword123!'
    })
    actor = f"user:{owner_id}"
    cash_id = create_cash_account(m_id, {
        'name': 'Main Cash Box',
        'kind': 'cash',
        'opening_balance': 10000000,
        'opening_date': today(),
        'is_default': True
    }, actor)

    login_resp = client.post("/api/auth/login", json={'email': 'edge@test.bd', 'password': 'StrongPassword123!'})
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"

    return m_id, owner_id


def test_empty_database_orders_api():
    """Verifies orders API on an empty database returns neutral empty responses without 500 or NaN."""
    m_id, owner_id = create_base_merchant()
    
    resp = client.get("/api/orders")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert isinstance(data, dict)
    
    rows = data.get("rows", [])
    assert len(rows) == 0, f"Expected 0 orders in empty DB, got {len(rows)}"
    pagination = data.get("pagination", {})
    assert pagination.get("total") == 0


def test_empty_database_reports_api():
    """Verifies reports endpoints on empty DB return neutral zero values without division by zero."""
    m_id, owner_id = create_base_merchant()

    # Product performance
    resp = client.get("/api/reports/product-performance?range=this_month")
    assert resp.status_code == 200, f"Product performance failed on empty DB: {resp.text}"
    data = resp.json()
    assert data.get("rows") == []
    summary = data.get("summary_totals", {})
    assert summary.get("total_delivered_units", 0) == 0
    assert summary.get("total_revenue_poisha", 0) == 0
    assert summary.get("total_cogs_poisha", 0) == 0
    assert summary.get("total_courier_fees_poisha", 0) == 0
    assert summary.get("total_ad_spend_poisha", 0) == 0
    assert summary.get("total_sku_net_profit_poisha", 0) == 0

    # Footnote reconciliation
    footnote = data.get("footnote", {})
    assert footnote.get("highest_loss_sku") is None
    assert footnote.get("missing_cost_sku") is None
    assert footnote.get("unmapped_ad_spend_poisha", 0) == 0
    assert footnote.get("unresolved_exceptions_poisha", 0) == 0

    # P&L
    pnl_resp = client.get("/api/reports/pnl?range=this_month")
    assert pnl_resp.status_code == 200
    pnl = pnl_resp.json()
    assert pnl.get("gross_sales", 0) == 0
    assert pnl.get("net_profit", 0) == 0

    # Cash flow
    cf_resp = client.get("/api/reports/cash-flow?range=this_month")
    assert cf_resp.status_code == 200


def test_empty_database_settlements_receivables_summary():
    """Verifies settlements receivables summary on empty DB returns neutral 0 values."""
    m_id, owner_id = create_base_merchant()

    resp = client.get("/api/settlements/receivables-summary")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data.get("total_held_taka", 0) == 0
    assert data.get("disputed_count", 0) == 0
    # Outstanding parcels for all couriers should be 0
    outstanding = data.get("outstanding_by_courier", [])
    assert all(c.get("parcels") == 0 for c in outstanding)
    assert all(c.get("held_poisha") == 0 for c in outstanding)


def test_order_detail_dynamic_breakdown_zero_fees():
    """
    Verifies that when an order has NO courier fees or ad spend recorded,
    the API returns genuine 0.0 values rather than mockup numbers (70, 25, 52, 10, 53).
    """
    m_id, owner_id = create_base_merchant()
    actor = f"user:{owner_id}"

    # Create an order via API
    create_resp = client.post("/api/orders", json={
        "customer_name": "Test Customer",
        "customer_phone": "01711112233",
        "address": "Dhaka",
        "courier": "Pathao",
        "items": [
            {"name": "Test Item", "qty": 1, "unit_price": 1200.0}
        ]
    })
    assert create_resp.status_code == 200, f"Order creation failed: {create_resp.text}"
    order_id = create_resp.json()["id"]

    # Mark as delivered
    apply_status(m_id, order_id, "delivered", {'date': today(), 'actor': actor})

    resp = client.get(f"/api/orders/{order_id}")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    detail = resp.json()

    breakdown = detail.get("courier_charges_breakdown", {})
    assert breakdown.get("delivery_charge") == 0.0, f"Expected 0.0 delivery fee, got {breakdown.get('delivery_charge')}"
    assert breakdown.get("cod_fee") == 0.0, f"Expected 0.0 cod fee, got {breakdown.get('cod_fee')}"
    assert breakdown.get("return_fee") == 0.0, f"Expected 0.0 return fee, got {breakdown.get('return_fee')}"
    assert breakdown.get("total") == 0.0, f"Expected 0.0 total courier fee, got {breakdown.get('total')}"

    waterfall = detail.get("waterfall", {})
    assert waterfall.get("delivered_value") == 1200.0
    assert waterfall.get("cogs") == 0.0
    assert waterfall.get("courier_charges") == 0.0
    assert waterfall.get("packaging") == 0.0
    assert waterfall.get("ad_spend") == 0.0
    assert waterfall.get("net_profit") == 1200.0


def test_adversarial_static_mockup_leakage_in_frontend():
    """
    Adversarially scans frontend component source code to detect any remaining
    hardcoded mockup demo constants from Improvements/7.jpeg through 12.jpeg.
    """
    repo_root = Path(__file__).resolve().parents[2]
    orders_view = repo_root / "frontend" / "src" / "components" / "OrdersView.tsx"
    reports_view = repo_root / "frontend" / "src" / "components" / "ReportsView.tsx"
    settlements_view = repo_root / "frontend" / "src" / "components" / "SettlementsView.tsx"

    assert orders_view.exists(), f"OrdersView.tsx not found at {orders_view}"
    assert reports_view.exists(), f"ReportsView.tsx not found at {reports_view}"
    assert settlements_view.exists(), f"SettlementsView.tsx not found at {settlements_view}"

    orders_content = orders_view.read_text(encoding="utf-8")
    reports_content = reports_view.read_text(encoding="utf-8")
    settlements_content = settlements_view.read_text(encoding="utf-8")

    violations = []

    # Check OrdersView for hardcoded delivery_charge fallback 70
    if "|| 70" in orders_content or "?? 70" in orders_content:
        violations.append("OrdersView.tsx line 498 still contains hardcoded delivery charge fallback '70' (mockup 10.jpeg leakage).")

    # Check for hardcoded 52 return fee
    if "|| 52" in orders_content or "?? 52" in orders_content:
        violations.append("OrdersView.tsx still contains hardcoded return fee fallback '52'.")

    # Check ReportsView for 9686200, 274800, KRT-BLUE-L, BAG-JUTE
    for banned in ["9686200", "274800", "KRT-BLUE-L", "BAG-JUTE", "1693800"]:
        if banned in reports_content:
            violations.append(f"ReportsView.tsx contains banned mockup constant: '{banned}'")

    # Check SettlementsView for courier breakdown mockups
    for banned in ["54800", "43600", "14200", "11800", "28600", "22400", "15800"]:
        if banned in settlements_content:
            violations.append(f"SettlementsView.tsx contains banned mockup constant: '{banned}'")

    # Assert that zero violations were found
    assert len(violations) == 0, f"Adversarial static scan failed with {len(violations)} violations:\n" + "\n".join(f"- {v}" for v in violations)
