from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Dict, Any, Optional
from app.api.auth import get_current_user
from app.domain.reports import dashboard, drilldown, profit_and_loss, cash_position
from app.domain.roles import can_view_margins, can_view_cash_flow
from app.domain.exceptions import unresolved_totals
from app.domain.ledger import balances_by_party
from app.db.session import all, one
from app.lib.dates import today, month_start, month_end, add_days
import time

router = APIRouter(prefix="/api", tags=["Dashboard"])

_DASHBOARD_CACHE: Dict[str, Any] = {}
CACHE_TTL = 10.0  # 10-second fast TTL

def invalidate_dashboard_cache(merchant_id: Optional[int] = None):
    global _DASHBOARD_CACHE
    if merchant_id is None:
        _DASHBOARD_CACHE.clear()
    else:
        prefix = f"{merchant_id}:"
        for k in [k for k in _DASHBOARD_CACHE if k.startswith(prefix)]:
            _DASHBOARD_CACHE.pop(k, None)

@router.get("/dashboard")
async def get_dashboard(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    """
    Returns complete financial & operational dashboard adhering to Next.js DashboardData contract.
    All figures originate strictly from balanced double-entry journals.
    """
    m_id = current["merchantId"]
    # If no from_date given, default to last 30 days rolling to encompass demo orders
    if not from_date:
        f = add_days(today(), -30)
    else:
        f = from_date
    t = to_date or today()

    user_info = current.get("user") or {}
    role = user_info.get("role") or current.get("role") or "owner"

    cache_key = f"{m_id}:{f}:{t}:{role}"
    now = time.time()
    if cache_key in _DASHBOARD_CACHE:
        c_time, c_data = _DASHBOARD_CACHE[cache_key]
        if now - c_time < CACHE_TTL:
            return c_data

    dash = dashboard(m_id, f, t)
    pnl = dash.get("profit") or profit_and_loss(m_id, f, t)
    today_pnl = profit_and_loss(m_id, today(), today())
    cash_info = dash.get("cash") or cash_position(m_id, t)
    ops = dash.get("operations") or {}
    exc = dash.get("attention") or unresolved_totals(m_id)

    gross_sales = pnl.get("gross_sales", 0)
    net_sales = pnl.get("net_sales", 0)
    gross_profit = pnl.get("gross_profit", 0)
    net_profit = pnl.get("net_profit", 0)

    placed = int(ops.get("placed", 0))
    delivered = int(ops.get("delivered", 0))
    in_transit = int(ops.get("in_transit", 0))
    returned = int(ops.get("returned", 0))
    delivery_rate = ops.get("delivery_rate")
    if delivery_rate is None:
        delivery_rate = (delivered / placed) if placed > 0 else 0.0

    # Margins are computed on NET sales (gross minus returns/held) so the KPI card
    # and the P&L statement can never disagree.
    net_margin_pct = (net_profit / net_sales * 100) if net_sales > 0 else 0.0
    gross_margin_pct = (gross_profit / net_sales * 100) if net_sales > 0 else 0.0

    held_at_couriers = cash_info.get("held_at_couriers", 0)
    # Real couriers currently holding COD money (non-zero courier_receivable balance).
    courier_accounts_count = len(balances_by_party(m_id, "courier_receivable", on_or_before=t))

    # --- Courier settlement truth (batched in 1 query) -----------------
    settlement_counts = one(
        "SELECT "
        "  COUNT(DISTINCT o.id) AS settled, "
        "  COUNT(DISTINCT CASE WHEN NOT EXISTS ("
        "    SELECT 1 FROM exception_queue e WHERE e.order_id = o.id AND e.status = 'open' "
        "    AND e.type IN ('short_settlement', 'zero_settlement', 'unsettled_cod', 'stuck_parcel')"
        "  ) THEN o.id END) AS reconciled "
        "FROM orders o "
        "WHERE o.merchant_id = ? AND o.order_date >= ? AND o.order_date <= ? AND o.is_duplicate = FALSE "
        "AND o.status IN ('delivered', 'returned') "
        "AND EXISTS ("
        "  SELECT 1 FROM journals j WHERE j.order_id = o.id AND j.kind = 'settlement' "
        "  AND j.reverses_journal_id IS NULL "
        "  AND NOT EXISTS (SELECT 1 FROM journals r WHERE r.reverses_journal_id = j.id)"
        ")",
        m_id, f, t
    )
    settled = int(settlement_counts["settled"]) if settlement_counts and settlement_counts.get("settled") else 0
    reconciled = int(settlement_counts["reconciled"]) if settlement_counts and settlement_counts.get("reconciled") else 0

    kpis = {
        "delivered_sales": gross_sales,
        "gross_profit": gross_profit,
        "net_profit": net_profit,
        "orders_placed": placed,
        "delivery_rate": round(delivery_rate, 3),
        "held_at_couriers": held_at_couriers,
        "net_margin_pct": round(net_margin_pct, 1),
        "orders_in_transit": in_transit,
        "returned_orders": returned,
        "courier_accounts_count": courier_accounts_count,
        "delivered_orders": delivered,
        "gross_margin_pct": round(gross_margin_pct, 1),
        "settled_orders": settled,
        "reconciled_orders": reconciled,
        "misc_expenses": pnl.get("sections", {}).get("other", {}).get("amount", 0),
    }

    def _pct(n: int) -> str:
        return f"{int((n / placed * 100))}%" if placed > 0 else "0%"

    pipeline = [
        {"key": "placed", "label": "Placed", "count": placed, "pct": "100%"},
        {"key": "in_transit", "label": "In Transit", "count": in_transit, "pct": _pct(in_transit)},
        {"key": "delivered", "label": "Delivered", "count": delivered, "pct": _pct(delivered)},
        {"key": "settled", "label": "COD Settled", "count": settled, "pct": _pct(settled)},
        {"key": "reconciled", "label": "Reconciled", "count": reconciled, "pct": _pct(reconciled)},
    ]

    by_type = exc.get("by_type", {})
    stock_info = cash_info.get("stock", {})
    alerts = {
        "stuck_parcels": by_type.get("stuck_parcel", {}).get("count", 0),
        "short_settlements": by_type.get("short_settlement", {}).get("count", 0),
        "missing_costs": stock_info.get("unvalued_products", 0) or by_type.get("missing_cost", {}).get("count", 0),
        "courier_settlements_pending": by_type.get("unsettled_cod", {}).get("count", 0) or (1 if held_at_couriers > 0 else 0)
    }

    today_deliveries = all(
        "SELECT * FROM orders WHERE merchant_id = ? AND status = 'delivered' ORDER BY delivered_date DESC, id DESC LIMIT 5",
        m_id
    )

    from app.domain.merchants import get_settings
    s = get_settings(m_id)
    integ = s.get('integrations', {}) if isinstance(s, dict) else {}
    integrations = {
        "courier": bool(integ.get('courier_website', {}).get('connected')),
        "meta": bool(integ.get('meta_ads', {}).get('connected')),
        "whatsapp": bool(integ.get('whatsapp_business', {}).get('connected')),
        "supabase": bool(__import__('os').getenv('SUPABASE_URL')),
    }

    role = current["user"]["role"]
    hide_margins = not can_view_margins(role)
    hide_cash = not can_view_cash_flow(role)

    if hide_margins:
        kpis["gross_profit"] = None
        kpis["net_profit"] = None
        kpis["net_margin_pct"] = None
        kpis["gross_margin_pct"] = None

    result = {
        "range": {
            "from": f,
            "to": t,
            "label": "Last 30 Days" if not from_date else f"{f} to {t}"
        },
        "pnl": None if hide_margins else pnl,
        "today_pnl": None if hide_margins else today_pnl,
        "kpis": kpis,
        "pipeline": pipeline,
        "today_deliveries": today_deliveries,
        "alerts": alerts,
        "integrations": integrations,
        # Legacy backward-compatibility
        "profit": None if hide_margins else pnl,
        "today_profit": None if hide_margins else today_pnl.get("net_profit", 0),
        "cash": None if hide_cash else cash_info,
        "attention": exc,
        "operations": ops,
    }
    _DASHBOARD_CACHE[cache_key] = (now, result)
    return result

@router.get("/trace")
async def trace(
    metric: str = Query("net_profit"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    role = current["user"]["role"]
    if not can_view_margins(role) and (metric in ("net_profit", "gross_profit") or metric.startswith("section:cogs")):
        raise HTTPException(
            status_code=403,
            detail="Permission denied: Trace for net profit and margins is restricted to store owners."
        )
    m_id = current["merchantId"]
    f = from_date or month_start(today())
    t = to_date or month_end(today())
    return drilldown(m_id, metric, f, t)
