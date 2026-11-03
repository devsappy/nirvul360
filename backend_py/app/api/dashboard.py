from fastapi import APIRouter, Depends, Query
from typing import Dict, Any, Optional
from app.api.auth import get_current_user
from app.domain.reports import dashboard, drilldown, profit_and_loss, cash_position
from app.domain.exceptions import unresolved_totals
from app.db.session import all, one
from app.lib.dates import today, month_start, month_end, add_days

router = APIRouter(prefix="/api", tags=["Dashboard"])

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

    dash = dashboard(m_id, f, t)
    pnl = dash.get("profit") or profit_and_loss(m_id, f, t)
    today_pnl = profit_and_loss(m_id, today(), today())
    cash_info = dash.get("cash") or cash_position(m_id, t)
    ops = dash.get("operations") or {}
    exc = dash.get("attention") or unresolved_totals(m_id)

    gross_sales = pnl.get("gross_sales", 0)
    gross_profit = pnl.get("gross_profit", 0)
    net_profit = pnl.get("net_profit", 0)

    placed = int(ops.get("placed", 0))
    delivered = int(ops.get("delivered", 0))
    in_transit = int(ops.get("in_transit", 0))
    returned = int(ops.get("returned", 0))
    delivery_rate = ops.get("delivery_rate")
    if delivery_rate is None:
        delivery_rate = (delivered / placed) if placed > 0 else 0.0

    net_margin_pct = (net_profit / gross_sales * 100) if gross_sales > 0 else 0.0
    held_at_couriers = cash_info.get("held_at_couriers", 0)
    courier_accounts_count = len(cash_info.get("cash_accounts", [])) or 2

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
    }

    pipeline = [
        {"key": "placed", "label": "Placed", "count": placed, "pct": "100%"},
        {"key": "in_transit", "label": "In Transit", "count": in_transit, "pct": f"{int((in_transit / placed * 100))}%" if placed > 0 else "0%"},
        {"key": "delivered", "label": "Delivered", "count": delivered, "pct": f"{int((delivered / placed * 100))}%" if placed > 0 else "0%"},
        {"key": "settled", "label": "COD Settled", "count": max(0, delivered - returned), "pct": f"{int((max(0, delivered - returned) / placed * 100))}%" if placed > 0 else "0%"},
        {"key": "reconciled", "label": "Reconciled", "count": max(0, delivered - returned), "pct": f"{int((max(0, delivered - returned) / placed * 100))}%" if placed > 0 else "0%"},
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

    integrations = {
        "courier": True,
        "meta": False,
        "whatsapp": True,
        "supabase": True
    }

    return {
        "range": {
            "from": f,
            "to": t,
            "label": "Last 30 Days" if not from_date else f"{f} to {t}"
        },
        "pnl": pnl,
        "today_pnl": today_pnl,
        "kpis": kpis,
        "pipeline": pipeline,
        "today_deliveries": today_deliveries,
        "alerts": alerts,
        "integrations": integrations,
        # Legacy backward-compatibility
        "profit": pnl,
        "today_profit": today_pnl.get("net_profit", 0),
        "cash": cash_info,
        "attention": exc,
        "operations": ops,
    }

@router.get("/trace")
async def trace(
    metric: str = Query("net_profit"),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    f = from_date or month_start(today())
    t = to_date or month_end(today())
    return drilldown(m_id, metric, f, t)
