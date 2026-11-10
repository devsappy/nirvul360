"""
FastAPI Main Application entry point for nirvul360.
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any
from fastapi import FastAPI, Depends, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Automatically load .env from project root if present
root_dir = Path(__file__).resolve().parent.parent.parent
env_file = root_dir / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file, override=True)
else:
    load_dotenv(override=True)

from app.db.session import open_db
from app.domain.exceptions import seed_reason_codes
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.orders import router as orders_router
from app.api.money import router as money_router
from app.api.integrations import router as integrations_router
from app.api.events import router as events_router
from app.api.webhooks import router as webhooks_router
from app.api.admin import router as admin_router
from app.api.products import router as products_router
from app.api.exceptions import router as exceptions_router
from app.api.settlements import router as settlements_router
from app.api.reports import router as reports_router
from app.api.pos import router as pos_router
from app.api.suppliers import router as suppliers_router
from app.api.team import router as team_router
from app.api.whatsapp import router as whatsapp_router
from app.api.auth import get_current_user

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Determine DB path / connection (Direct Supabase PostgreSQL vs local SQLite)
    pg_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL")
    if pg_url:
        print(f"Initializing connection to Supabase PostgreSQL...")
        open_db(pg_url)
        seed_reason_codes()
    else:
        if os.getenv("REQUIRE_SUPABASE", "false").lower() in ("true", "1", "yes"):
            raise RuntimeError("CRITICAL: Only Supabase PostgreSQL is permitted. DATABASE_URL must be configured.")
        db_file = os.getenv("DB_FILE")
        if not db_file:
            db_file = str(Path(__file__).resolve().parent.parent / "data" / "gross.db")
        needs_seed = not os.path.exists(db_file)
        open_db(db_file)
        if needs_seed:
            try:
                from seed import seed
                seed()
            except Exception as e:
                print(f"Auto-seed warning: {e}")
        seed_reason_codes()

    print(f"nirvul360 (FastAPI) active — Engine ready.")
    yield

app = FastAPI(
    title="nirvul360 API",
    description="Automated accounting engine for Bangladeshi E-commerce & F-commerce",
    version="2.0.0",
    lifespan=lifespan
)

_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ValueError)
async def value_error_exception_handler(request: Request, exc: ValueError):
    detail = str(exc)
    status_code = 404 if "not found" in detail.lower() else 400
    return JSONResponse(status_code=status_code, content={"detail": detail})

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(orders_router)
app.include_router(money_router)
app.include_router(integrations_router)
app.include_router(events_router)
app.include_router(webhooks_router)
app.include_router(admin_router)
app.include_router(products_router)
app.include_router(exceptions_router)
app.include_router(settlements_router)
app.include_router(reports_router)
app.include_router(pos_router)
app.include_router(suppliers_router)
app.include_router(team_router)
app.include_router(whatsapp_router)

@app.get("/api/dashboard/pnl")
async def dashboard_pnl(
    from_date: Optional[str] = Query(None, alias="from_date"),
    to_date: Optional[str] = Query(None, alias="to_date"),
    from_param: Optional[str] = Query(None, alias="from"),
    to_param: Optional[str] = Query(None, alias="to"),
    period: Optional[str] = Query(None),
    current: dict = Depends(get_current_user)
):
    from app.domain.reports import profit_and_loss
    from app.lib.dates import today
    m_id = current.get("merchantId") or (current.get("user") or {}).get("merchant_id")
    t = today()
    f = from_param or from_date
    t_val = to_param or to_date or t
    if not f:
        if period:
            from app.api.reports import _resolve_period_dates
            f, t_val = _resolve_period_dates(period, None, None)
        else:
            f = f"{t_val[:7]}-01"

    res = profit_and_loss(m_id, f, t_val)

    # Calculate total operating expenses across operating sections
    expense_section_keys = {"courier", "ads", "packaging", "fixed", "other"}
    total_expenses = sum(
        res.get("sections", {}).get(k, {}).get("amount", 0)
        or res.get("sections", {}).get(k, {}).get("total_poisha", 0)
        for k in expense_section_keys
    )

    # Ensure total_poisha is populated on each section for consistency
    for s in res.get("sections", {}).values():
        if "total_poisha" not in s:
            s["total_poisha"] = s.get("amount", 0)

    res["total_expenses"] = total_expenses
    res["expenses"] = total_expenses
    res["total_operating_expenses_poisha"] = total_expenses
    return res

@app.get("/health")
def health_check():
    return {"status": "ok", "framework": "FastAPI", "engine": "Python 3.11"}


# Ensure cash_flow_statement classifies opening balances to opening cash rather than operating inflows
import app.domain.reports as _domain_reports

_orig_cash_flow_statement = _domain_reports.cash_flow_statement

def _enhanced_cash_flow_statement(merchant_id: int, from_date: str, to_date: str):
    res = _orig_cash_flow_statement(merchant_id, from_date, to_date)
    from app.db.session import all as _db_all
    open_lines = _db_all(
        """
        SELECT COALESCE(SUM(l.amount), 0) AS s
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        WHERE l.merchant_id = ? AND l.account = 'cash'
          AND j.kind IN ('opening_balance', 'opening')
          AND l.entry_date >= ? AND l.entry_date <= ?
        """,
        merchant_id, from_date, to_date
    )
    open_in_period = int(open_lines[0]['s']) if open_lines else 0

    delivery_lines = _db_all(
        """
        SELECT COALESCE(SUM(l.amount), 0) AS s
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        WHERE l.merchant_id = ? AND l.account = 'cash'
          AND j.kind = 'delivery'
          AND l.entry_date >= ? AND l.entry_date <= ?
        """,
        merchant_id, from_date, to_date
    )
    delivery_in_period = int(delivery_lines[0]['s']) if delivery_lines else 0

    deduct_from_inflows = open_in_period + delivery_in_period
    if open_in_period > 0:
        res['opening_cash_poisha'] += open_in_period
        res['opening_cash_taka'] = res['opening_cash_poisha'] / 100.0

    if deduct_from_inflows > 0:
        new_inflows = []
        for inf in res.get('inflows', []):
            if inf.get('category') == 'other_inflow':
                rem = inf['amount_poisha'] - deduct_from_inflows
                if rem > 0:
                    inf['amount_poisha'] = rem
                    inf['amount_taka'] = rem / 100.0
                    new_inflows.append(inf)
            else:
                new_inflows.append(inf)
        res['inflows'] = new_inflows
        res['total_inflows_poisha'] = max(0, res['total_inflows_poisha'] - deduct_from_inflows)
        res['total_inflows_taka'] = res['total_inflows_poisha'] / 100.0
        res['net_cash_change_poisha'] = res['total_inflows_poisha'] - res['total_outflows_poisha']
        res['net_cash_change_taka'] = res['net_cash_change_poisha'] / 100.0
        res['closing_cash_poisha'] = res['opening_cash_poisha'] + res['net_cash_change_poisha']
        res['closing_cash_taka'] = res['closing_cash_poisha'] / 100.0
    return res

_domain_reports.cash_flow_statement = _enhanced_cash_flow_statement

