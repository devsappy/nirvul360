"""
Reports API: daily summary and high-level financial excerpts.
"""
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
from app.domain.reports import daily_summary_text, profit_and_loss
from app.lib.dates import today, add_days

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/daily-summary")
async def daily_summary(current=Depends(get_current_user)):
    merchant_id = current.get('merchantId') or current['user']['merchant_id']
    text = daily_summary_text(merchant_id)
    y = add_days(today(), -1)
    pnl = profit_and_loss(merchant_id, y, y)
    return {
        "text": text,
        "metadata": {
            "date": y,
            "revenue": pnl['gross_sales'],
            "net_profit": pnl['net_profit']
        }
    }