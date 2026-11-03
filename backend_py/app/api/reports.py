from fastapi import APIRouter, Depends, Query
from app.api.auth import get_current_user
from app.db.session import one
from app.domain.reports import daily_summary_text, profit_and_loss
from app.lib.dates import today, add_days
from app.lib.money import format_taka_bn

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/daily-summary")
async def daily_summary(user=Depends(get_current_user)):
    merchant_id = user['merchant_id']
    from app.db.session import one as _one
    # find conn? session module uses global; daily_summary_text needs conn. Pass None? rework: call with sqlite connection from session
    import sqlite3
    conn = None
    try:
        from app.db.session import _conn
        conn = _conn
    except Exception:
        pass
    text = daily_summary_text(conn, merchant_id)
    y = add_days(today(), -1)
    pnl = profit_and_loss(merchant_id, y, y)
    return {"text": text, "metadata": {"date": y, "revenue": pnl['gross_sales'], "net_profit": pnl['net_profit']}}