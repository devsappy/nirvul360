"""
Reports API: daily summary, P&L, product performance, and cash flow statement.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Dict, Any, Optional, List
from app.api.auth import get_current_user
from app.domain.reports import daily_summary_text, profit_and_loss, product_performance, cash_flow_statement
from app.domain.roles import can_view_margins, can_view_cash_flow
from app.domain.exceptions import unresolved_totals
from app.lib.dates import today, add_days, month_start, month_end

router = APIRouter(prefix="/api/reports", tags=["Reports"])

def _resolve_period_dates(period: Optional[str], from_date: Optional[str], to_date: Optional[str]):
    t = today()
    if from_date and to_date:
        return from_date, to_date
    if period == "today":
        return t, t
    elif period == "last_month":
        cur_year = int(t[:4])
        cur_month = int(t[5:7])
        lm = cur_month - 1 if cur_month > 1 else 12
        ly = cur_year if cur_month > 1 else cur_year - 1
        import calendar
        _, last_day = calendar.monthrange(ly, lm)
        return f"{ly}-{lm:02d}-01", f"{ly}-{lm:02d}-{last_day:02d}"
    elif period in ("quarter", "this_quarter"):
        cur_year = int(t[:4])
        cur_month = int(t[5:7])
        q_start_m = ((cur_month - 1) // 3) * 3 + 1
        return f"{cur_year}-{q_start_m:02d}-01", t
    elif period in ("year", "this_year"):
        return f"{t[:4]}-01-01", t
    else:
        return f"{t[:7]}-01", t

@router.get("/daily-summary")
async def daily_summary(current=Depends(get_current_user)):
    merchant_id = current.get('merchantId') or current['user']['merchant_id']
    role = current["user"]["role"]
    hide_margins = not can_view_margins(role)
    text = daily_summary_text(merchant_id, hide_margins=hide_margins)
    y = add_days(today(), -1)
    pnl = profit_and_loss(merchant_id, y, y)
    return {
        "text": text,
        "metadata": {
            "date": y,
            "revenue": pnl['gross_sales'],
            "net_profit": None if hide_margins else pnl['net_profit']
        }
    }

@router.get("/product-performance")
async def get_product_performance_report(
    period: Optional[str] = "this_month",
    from_date: Optional[str] = Query(None, alias="from_date"),
    to_date: Optional[str] = Query(None, alias="to_date"),
    from_param: Optional[str] = Query(None, alias="from"),
    to_param: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    role = current["user"]["role"]
    f_d, t_d = _resolve_period_dates(period, from_date or from_param, to_date or to_param)
    raw = product_performance(m_id, f_d, t_d)

    hide_margins = not can_view_margins(role)

    rows = []
    tot_rev = 0
    tot_cogs = 0
    tot_courier = 0
    tot_net = 0

    for r in raw.get('rows', []):
        rev = r.get('revenue_poisha', 0)
        cogs = r.get('cogs_poisha', 0)
        courier = r.get('courier_cost_poisha', 0)
        delivered = r.get('delivered', 0)

        tot_rev += rev
        tot_courier += courier

        # If delivered > 0 but cogs is 0, cost price is missing
        missing_cost = (cogs == 0 and delivered > 0)
        if not missing_cost and cogs is not None:
            tot_cogs += cogs
            tot_net += r.get('net_profit_poisha', 0)

        rows.append({
            'product_id': r.get('product_id'),
            'sku': r.get('sku') or '',
            'name': r.get('name', ''),
            'orders_placed': r.get('orders_placed', 0),
            'delivered': delivered,
            'returned': r.get('returned', 0),
            'delivered_pct': r.get('delivered_pct'),
            'returned_pct': r.get('returned_pct'),
            'revenue_poisha': rev,
            'cogs_poisha': None if (hide_margins or missing_cost) else cogs,
            'gross_profit_poisha': None if (hide_margins or missing_cost) else r.get('gross_profit_poisha'),
            'courier_cost_poisha': courier,
            'ad_spend_poisha': r.get('ad_spend_poisha'),
            'net_profit_poisha': None if (hide_margins or missing_cost) else r.get('net_profit_poisha'),
            'net_margin': None if (hide_margins or missing_cost) else r.get('net_margin'),
            'missing_cost_price': missing_cost,
            'unmapped_campaign': True,
        })

    pnl = profit_and_loss(m_id, f_d, t_d)
    exc = 0
    try:
        exc = unresolved_totals(m_id).get('total', 0)
    except Exception:
        pass

    footnote = {
        'sku_net_profit_sum_poisha': None if hide_margins else tot_net,
        'unallocated_packaging_poisha': pnl['sections']['packaging']['amount'],
        'unallocated_fixed_costs_poisha': pnl['sections']['fixed']['amount'],
        'unmapped_ad_spend_poisha': pnl['sections']['ads']['amount'],
        'dashboard_pnl_net_profit_poisha': None if hide_margins else pnl['net_profit'],
        'unresolved_exceptions_poisha': exc,
        'reconciliation_formula': "Dashboard Net Profit = SKU Net Profit Sum - Unallocated Packaging - Unallocated Fixed Costs - Unmapped Ad Spend"
    }

    return {
        'from': f_d,
        'to': t_d,
        'from_date': f_d,
        'to_date': t_d,
        'period': period,
        'rows': rows,
        'products': rows,
        'items': rows,
        'summary_totals': {
            'total_revenue_poisha': tot_rev,
            'total_cogs_poisha': None if hide_margins else tot_cogs,
            'total_courier_fees_poisha': tot_courier,
            'total_ad_spend_poisha': pnl['sections']['ads']['amount'],
            'total_sku_net_profit_poisha': None if hide_margins else tot_net,
        },
        'footnote_reconciliation': footnote
    }

@router.get("/pnl")
async def get_pnl_report(
    period: Optional[str] = "this_month",
    from_date: Optional[str] = Query(None, alias="from_date"),
    to_date: Optional[str] = Query(None, alias="to_date"),
    from_param: Optional[str] = Query(None, alias="from"),
    to_param: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    role = current["user"]["role"]
    if not can_view_margins(role):
        raise HTTPException(status_code=403, detail="Permission denied: Profit and Loss reports are owner-only.")

    m_id = current["merchantId"]
    f_d, t_d = _resolve_period_dates(period, from_date or from_param, to_date or to_param)
    return profit_and_loss(m_id, f_d, t_d)

@router.get("/cash-flow")
async def get_cash_flow_report(
    period: Optional[str] = "this_month",
    from_date: Optional[str] = Query(None, alias="from_date"),
    to_date: Optional[str] = Query(None, alias="to_date"),
    from_param: Optional[str] = Query(None, alias="from"),
    to_param: Optional[str] = Query(None, alias="to"),
    current: Dict[str, Any] = Depends(get_current_user)
):
    role = current["user"]["role"]
    if not can_view_cash_flow(role):
        raise HTTPException(status_code=403, detail="Permission denied: Cash flow reports are restricted to Owners and Accountants.")

    m_id = current["merchantId"]
    f_d, t_d = _resolve_period_dates(period, from_date or from_param, to_date or to_param)
    return cash_flow_statement(m_id, f_d, t_d)