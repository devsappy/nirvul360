import csv
import io
import json
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from app.api.auth import get_current_user
from app.domain.entries import (
    record_expense, record_purchase, record_supplier_payment,
    record_transfer, record_withdrawal, record_capital, recent_entries
)
from app.domain.reports import cash_position
from app.domain.exceptions import scan_merchant
from app.domain.roles import can_view_cash_flow, can_view_supplier_prices, can_view_cost_prices
from app.domain.merchants import get_settings, update_settings, create_cash_account
from app.lib.money import to_poisha
from app.lib.dates import today, now_iso
from app.db.session import all, one, update, insert

router = APIRouter(prefix="/api", tags=["Money"])

class ExpenseInput(BaseModel):
    head: Optional[str] = None
    expense_head: Optional[str] = None
    amount: float = Field(..., gt=0, description="Amount must be greater than zero")
    date: Optional[str] = None
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

class PurchaseInput(BaseModel):
    product_id: int = Field(..., gt=0)
    qty: int = Field(..., gt=0, description="Quantity must be greater than zero")
    unit_cost: float = Field(..., ge=0, description="Unit cost must be non-negative")
    supplier_id: Optional[int] = None
    date: Optional[str] = None
    paid_amount: Optional[float] = Field(0, ge=0)
    cash_account_id: Optional[int] = None

class SupplierPaymentInput(BaseModel):
    supplier_id: int = Field(..., gt=0)
    amount: float = Field(..., gt=0, description="Amount must be greater than zero")
    date: Optional[str] = None
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

class TransferInput(BaseModel):
    amount: float = Field(..., gt=0)
    fee: Optional[float] = Field(0, ge=0)
    from_account_id: int = Field(..., gt=0)
    to_account_id: int = Field(..., gt=0)
    date: Optional[str] = None
    note: Optional[str] = None

class WithdrawalInput(BaseModel):
    amount: float = Field(..., gt=0, description="Amount must be greater than zero")
    date: Optional[str] = None
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

@router.get("/money")
async def get_money_overview(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    role = current["user"]["role"]
    hide_cash = not can_view_cash_flow(role)
    hide_supplier = not can_view_supplier_prices(role)
    hide_cost = not can_view_cost_prices(role)

    entries = recent_entries(m_id)
    if hide_supplier:
        entries = [j for j in entries if j.get('kind') != 'purchase']
    if hide_cost:
        for j in entries:
            for l in j.get('lines', []):
                if l.get('account') == 'cogs':
                    l['amount'] = None

    suppliers = all("SELECT * FROM suppliers WHERE merchant_id = ?", m_id)
    if hide_supplier:
        for s in suppliers:
            s['payable_balance'] = None
            s['payable_balance_poisha'] = None
            s['payable_balance_taka'] = None

    return {
        "entries": entries,
        "cash": None if hide_cash else cash_position(m_id, today()),
        "suppliers": suppliers
    }

@router.post("/expenses")
async def add_expense(data: ExpenseInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]
    head = data.head or data.expense_head or 'other_expense'
    jid = record_expense(m_id, {
        'head': head,
        'amount': to_poisha(data.amount),
        'date': data.date,
        'cash_account_id': data.cash_account_id,
        'note': data.note,
    }, {'source': 'manual', 'actor': actor})
    return {"id": jid, "status": "posted"}

@router.post("/purchases")
async def add_purchase(data: PurchaseInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]
    pid = record_purchase(m_id, {
        'productId': data.product_id,
        'qty': data.qty,
        'unitCost': to_poisha(data.unit_cost),
        'supplierId': data.supplier_id,
        'date': data.date,
        'paidAmount': to_poisha(data.paid_amount) if data.paid_amount else 0,
        'cashAccountId': data.cash_account_id,
    }, {'source': 'manual', 'actor': actor})
    scan_merchant(m_id)
    return {"id": pid}

@router.post("/supplier-payments")
async def pay_supplier(data: SupplierPaymentInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]
    jid = record_supplier_payment(m_id, {
        'supplierId': data.supplier_id,
        'amount': to_poisha(data.amount),
        'date': data.date,
        'cashAccountId': data.cash_account_id,
        'note': data.note,
    }, {'source': 'manual', 'actor': actor})
    return {"id": jid}

@router.post("/transfers")
async def transfer_money(data: TransferInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]
    jid = record_transfer(m_id, {
        'amount': to_poisha(data.amount),
        'fee': to_poisha(data.fee) if data.fee else 0,
        'fromAccountId': data.from_account_id,
        'toAccountId': data.to_account_id,
        'date': data.date,
        'note': data.note,
    }, {'source': 'manual', 'actor': actor})
    return {"id": jid}

@router.post("/withdrawals")
async def owner_withdrawal(data: WithdrawalInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    actor = current["actor"]
    jid = record_withdrawal(m_id, {
        'amount': to_poisha(data.amount),
        'date': data.date,
        'cashAccountId': data.cash_account_id,
        'note': data.note,
    }, {'source': 'manual', 'actor': actor})
    return {"id": jid}

# --- Milestone 1: Operating Expenses Summary & Recurring Overheads ---

class RecurringExpenseInput(BaseModel):
    head: str
    name: Optional[str] = None
    title: Optional[str] = None
    amount: float = Field(..., gt=0, description="Recurring amount must be greater than zero")
    posts_on_day: int = Field(..., ge=1, le=28, description="Day of month must be between 1 and 28")
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

class RecurringExpenseUpdateInput(BaseModel):
    head: Optional[str] = None
    name: Optional[str] = None
    title: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    posts_on_day: Optional[int] = Field(None, ge=1, le=28)
    cash_account_id: Optional[int] = None
    note: Optional[str] = None
    active: Optional[bool] = None

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

@router.get("/expenses/summary")
async def get_expenses_summary_endpoint(
    period: Optional[str] = "this_month",
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current: Dict[str, Any] = Depends(get_current_user)
):
    from app.domain.expenses import get_expenses_summary
    m_id = current["merchantId"]
    f_d, t_d = _resolve_period_dates(period, from_date, to_date)
    return get_expenses_summary(m_id, f_d, t_d, period or "this_month")

@router.get("/expenses/recurring")
async def get_recurring_expenses_endpoint(current: Dict[str, Any] = Depends(get_current_user)):
    from app.domain.expenses import get_recurring_expenses
    m_id = current["merchantId"]
    return get_recurring_expenses(m_id)

@router.post("/expenses/recurring")
async def create_recurring_expense_endpoint(
    data: RecurringExpenseInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    from app.domain.expenses import create_recurring_expense
    m_id = current["merchantId"]
    actor = current["actor"]
    rec_id = create_recurring_expense(m_id, data.model_dump(), actor)
    return {"id": rec_id, "status": "created"}

@router.put("/expenses/recurring/{expense_id}")
async def update_recurring_expense_endpoint(
    expense_id: int,
    data: RecurringExpenseUpdateInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    from app.domain.expenses import update_recurring_expense
    m_id = current["merchantId"]
    update_recurring_expense(m_id, expense_id, data.model_dump(exclude_unset=True))
    return {"ok": True}


# --- Milestone 2: Merchant Settings & Cash Accounts ---

class UpdateMerchantSettingsInput(BaseModel):
    business_profile: Optional[Dict[str, Any]] = None
    vat_tax: Optional[Dict[str, Any]] = None
    fiscal: Optional[Dict[str, Any]] = None

class CloseAccountInput(BaseModel):
    confirmation_name: str

class CreateCashAccountInput(BaseModel):
    name: str
    kind: str = "cash"
    opening_balance: Optional[float] = 0
    is_default: Optional[bool] = False

@router.get("/merchants/settings")
async def get_merchant_settings_endpoint(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    merchant = one("SELECT * FROM merchants WHERE id = ?", m_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    settings = get_settings(m_id)
    profile = settings.get("business_profile") or {}
    vat_tax = settings.get("vat_tax") or {}
    fiscal = settings.get("fiscal") or {}

    stores_row = one("SELECT COUNT(*) as c FROM merchants")
    stores_count = int(stores_row["c"]) if stores_row else 1

    cur_m = today()[:7]
    orders_row = one("SELECT COUNT(*) as c FROM orders WHERE merchant_id = ? AND order_date >= ?", m_id, f"{cur_m}-01")
    orders_this_month = int(orders_row["c"]) if orders_row else 0

    # Dynamic Subscription Resolution from tenant DB records
    subscription_cfg = settings.get("subscription") or {}
    plan_id = subscription_cfg.get("plan") or merchant.get("plan") or "starter"
    plan_info = one("SELECT * FROM saas_plans WHERE id = ?", str(plan_id).lower())
    plan_name = plan_info["name"] if plan_info else str(plan_id).capitalize()
    store_suffix = f"{stores_count} store" if stores_count == 1 else f"{stores_count} stores"
    plan_label = subscription_cfg.get("plan_label") or f"{plan_name} — {store_suffix}"

    plan_price_poisha = merchant.get("plan_price") if merchant.get("plan_price") is not None else (plan_info["price_poisha"] if plan_info else 0)
    price_taka_month = subscription_cfg.get("price_taka_month") if subscription_cfg.get("price_taka_month") is not None else (plan_price_poisha // 100)
    orders_limit = subscription_cfg.get("orders_limit") or merchant.get("order_limit") or (plan_info["order_limit"] if plan_info else 1500)
    subscription_status = subscription_cfg.get("status") or merchant.get("status") or "active"

    # Compute next charge date dynamically: 1st of next month, or trial_ends_at
    if subscription_cfg.get("next_charge_date"):
        next_charge_date = subscription_cfg["next_charge_date"]
    elif merchant.get("plan") == "trial" and merchant.get("trial_ends_at"):
        try:
            trial_dt = datetime.strptime(merchant["trial_ends_at"][:10], "%Y-%m-%d")
            next_charge_date = f"{trial_dt.day} {trial_dt.strftime('%b %Y')}"
        except Exception:
            next_charge_date = merchant["trial_ends_at"][:10]
    else:
        t_now = today()
        yr = int(t_now[:4])
        mo = int(t_now[5:7])
        next_mo = date(yr + 1, 1, 1) if mo == 12 else date(yr, mo + 1, 1)
        next_charge_date = f"1 {next_mo.strftime('%b %Y')}"

    # Default payment method: dynamically resolved from merchant default cash account
    default_acct = one("SELECT * FROM cash_accounts WHERE merchant_id = ? AND is_default = 1 LIMIT 1", m_id)
    if not default_acct:
        default_acct = one("SELECT * FROM cash_accounts WHERE merchant_id = ? ORDER BY id ASC LIMIT 1", m_id)

    if subscription_cfg.get("payment_method"):
        payment_method = subscription_cfg["payment_method"]
    elif default_acct:
        kind = default_acct.get("kind", "cash")
        kind_label = "bKash" if kind.lower() == "bkash" else kind.capitalize()
        acct_name = str(default_acct.get("name") or "")
        suffix = acct_name[-4:] if len(acct_name) >= 4 else acct_name
        payment_method = f"{kind_label} · ending {suffix}" if suffix else kind_label
    else:
        last_inv = one("SELECT * FROM billing_invoices WHERE merchant_id = ? ORDER BY id DESC LIMIT 1", m_id)
        if last_inv and last_inv.get("payment_details"):
            payment_method = last_inv["payment_details"]
        else:
            payment_method = "No payment method on file"

    return {
        "business_profile": {
            "business_name": merchant.get("name") or "",
            "legal_entity": profile.get("legal_entity") or "",
            "trade_license": profile.get("trade_license") or "",
            "bin": profile.get("bin") or "",
            "address": profile.get("address") or "",
            "phone": profile.get("phone") or "",
            "email": profile.get("email") or current["user"].get("email") or "",
        },
        "vat_tax": {
            "registration_number": vat_tax.get("registration_number", ""),
            "sales_rate": vat_tax.get("sales_rate", 0),
            "commissionerate": vat_tax.get("commissionerate", ""),
            "active": bool(vat_tax.get("active", False)),
        },
        "fiscal": {
            "year_start": fiscal.get("year_start", "1 July"),
            "timezone": fiscal.get("timezone", "Asia/Dhaka (UTC+06:00)"),
            "books_close": fiscal.get("books_close", "Last day of each month"),
        },
        "subscription": {
            "plan": plan_id,
            "plan_label": plan_label,
            "stores_count": stores_count,
            "price_taka_month": price_taka_month,
            "next_charge_date": next_charge_date,
            "payment_method": payment_method,
            "orders_used": orders_this_month,
            "orders_limit": orders_limit,
            "status": subscription_status,
        },
        "last_changed_at": merchant.get("updated_at") or "",
        "data_synced_at": now_iso()[:16].replace("T", ", "),
    }

@router.put("/merchants/settings")
async def update_merchant_settings_endpoint(
    data: UpdateMerchantSettingsInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    actor = current["actor"]
    patch = {}
    if data.business_profile:
        patch["business_profile"] = data.business_profile
        if data.business_profile.get("business_name"):
            update("merchants", m_id, {"name": data.business_profile["business_name"].strip()})
    if data.vat_tax:
        patch["vat_tax"] = data.vat_tax
    if data.fiscal:
        patch["fiscal"] = data.fiscal

    updated = update_settings(m_id, patch, actor)
    return {"ok": True, "settings": updated}

@router.post("/merchants/close")
async def close_merchant_account_endpoint(
    data: CloseAccountInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    merchant = one("SELECT * FROM merchants WHERE id = ?", m_id)
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")

    if data.confirmation_name.strip() != merchant["name"].strip():
        raise HTTPException(
            status_code=400,
            detail=f"Confirmation name '{data.confirmation_name}' does not match store name '{merchant['name']}'"
        )

    update("merchants", m_id, {"status": "closed"})
    return {"ok": True, "message": f"Store {merchant['name']} has been closed."}

@router.get("/cash-accounts")
async def get_cash_accounts_endpoint(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    pos = cash_position(m_id, today())
    accounts = pos.get("cash_accounts", [])
    raw_accts = all("SELECT * FROM cash_accounts WHERE merchant_id = ? ORDER BY id ASC", m_id)
    raw_map = {a["id"]: a for a in raw_accts}
    
    enriched = []
    for a in accounts:
        raw = raw_map.get(a["id"], {})
        balance_poisha = a.get("balance", 0)
        enriched.append({
            "id": a["id"],
            "name": a["name"],
            "kind": a["kind"],
            "is_default": bool(raw.get("is_default", False)),
            "balance_poisha": balance_poisha,
            "balance_taka": balance_poisha / 100,
        })
    return {"accounts": enriched, "total_cash_taka": (pos.get("cash_in_hand", 0) / 100)}

@router.post("/cash-accounts")
async def create_cash_account_endpoint(
    data: CreateCashAccountInput,
    current: Dict[str, Any] = Depends(get_current_user)
):
    m_id = current["merchantId"]
    actor = current["actor"]
    acct_id = create_cash_account(m_id, data.model_dump(), actor)
    return {"id": acct_id, "status": "created"}

@router.get("/integrations/overview")
async def get_integrations_overview(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    cur_m = today()[:7]

    store_orders_row = one(
        "SELECT COUNT(*) as c FROM orders WHERE merchant_id = ? AND source IN ('store_api', 'facebook_shop', 'woocommerce', 'shopify') AND order_date >= ?",
        m_id, f"{cur_m}-01"
    )
    store_orders_count = int(store_orders_row["c"]) if store_orders_row and int(store_orders_row["c"]) > 0 else 0

    ads_row = one(
        "SELECT COALESCE(SUM(jl.amount), 0) as total "
        "FROM journal_lines jl "
        "JOIN journals j ON jl.journal_id = j.id "
        "WHERE j.merchant_id = ? AND jl.account = 'ad_spend' AND j.entry_date >= ?",
        m_id, f"{cur_m}-01"
    )
    ads_poisha = int(ads_row["total"]) if ads_row else 0
    ads_taka = ads_poisha / 100 if ads_poisha > 0 else 0.0

    last_sync_log = one("SELECT at FROM audit_log WHERE merchant_id = ? ORDER BY id DESC LIMIT 1", m_id)
    if not last_sync_log or not last_sync_log.get("at"):
        last_sync_log = one("SELECT at FROM audit_log ORDER BY id DESC LIMIT 1")
    dynamic_sync_time = str(last_sync_log["at"])[:16].replace("T", " ") if last_sync_log and last_sync_log.get("at") else now_iso()[:16].replace("T", " ")

    conns = all("SELECT * FROM integration_connections WHERE merchant_id = ?", m_id)
    conn_map = {c["provider"].lower(): c for c in conns}

    s_settings = get_settings(m_id)
    integ = s_settings.get('integrations', {})
    store_s = integ.get('store_website', {})
    courier_s = integ.get('courier_website', {})
    meta_s = integ.get('meta_ads', {})

    sf_uploads = one("SELECT COUNT(*) as c, MAX(created_at) as last_up FROM uploads WHERE merchant_id = ? AND LOWER(courier) = ?", m_id, "steadfast")
    sf_has_upload = sf_uploads and int(sf_uploads["c"]) > 0
    sf_orders = one("SELECT COUNT(*) as c FROM orders WHERE merchant_id = ? AND LOWER(courier) = ?", m_id, "steadfast")
    sf_has_orders = sf_orders and int(sf_orders["c"]) > 0

    pathao_conn = conn_map.get('pathao')
    pathao_connected = bool(
        (pathao_conn and pathao_conn["status"] == "healthy") or
        (courier_s.get('provider') == 'pathao' and courier_s.get('connected') and courier_s.get('api_key'))
    )

    steadfast_conn = conn_map.get('steadfast')
    steadfast_is_connected = bool(
        (steadfast_conn and steadfast_conn["status"] == "healthy") or
        (courier_s.get('provider') == 'steadfast' and courier_s.get('connected') and courier_s.get('api_key'))
    )

    redx_conn = conn_map.get('redx')

    store_connected = bool(
        (store_s.get('connected') and store_s.get('api_key')) or
        store_orders_count > 0
    )

    # Strictly dynamic Meta Ads connection check: Only active if credentials exist in DB
    meta_conn = conn_map.get('meta_ads') or conn_map.get('meta')
    meta_connected = bool(
        (meta_conn and meta_conn["status"] == "healthy") or
        (meta_s.get('connected') and bool(meta_s.get('access_token') or meta_s.get('ad_account_id')))
    )

    mfs_accts = all("SELECT name, kind FROM cash_accounts WHERE merchant_id = ? AND (kind IN ('bkash','nagad','mfs') OR LOWER(name) LIKE ? OR LOWER(name) LIKE ?)", m_id, '%bkash%', '%nagad%')
    has_mfs = len(mfs_accts) > 0

    cards = [
        {
            "key": "pathao",
            "name": "Pathao",
            "category": "courier",
            "badge": "PT",
            "status": "connected" if pathao_connected else "not_connected",
            "status_label": "Connected" if pathao_connected else "Not connected",
            "last_sync": dynamic_sync_time if pathao_connected else None,
            "failures_count": pathao_conn.get("consecutive_failures", 0) if pathao_conn else 0,
            "failures_label": f"Failures, 7 days: {pathao_conn.get('consecutive_failures', 0)}" if pathao_conn else "Failures, 7 days: 0",
            "brings_in": "Statuses, COD, charges" if pathao_connected else "Not configured",
            "actions": [
                {"label": "Sync now", "action": "sync"} if pathao_connected else {"label": "Connect Pathao", "action": "connect_pathao", "primary": True},
                {"label": "Settings", "action": "settings"}
            ]
        },
        {
            "key": "steadfast",
            "name": "Steadfast",
            "category": "courier",
            "badge": "ST",
            "status": "connected" if steadfast_is_connected else ("sheet_upload" if (sf_has_upload or sf_has_orders) else "not_connected"),
            "status_label": "Connected" if steadfast_is_connected else ("Sheet upload" if (sf_has_upload or sf_has_orders) else "Not connected"),
            "last_sync": (str(sf_uploads["last_up"])[:16].replace("T", " ") if sf_uploads and sf_uploads.get("last_up") else dynamic_sync_time) if (steadfast_is_connected or sf_has_upload or sf_has_orders) else None,
            "failures_count": steadfast_conn.get("consecutive_failures", 0) if steadfast_conn else 0,
            "failures_label": "Failures, 7 days: 0",
            "brings_in": "Settlements only, by file" if (sf_has_upload or sf_has_orders) else "Not configured",
            "actions": [
                {"label": "Upload sheet", "action": "upload"},
                {"label": "Ask for API key", "action": "request_key"}
            ] if (steadfast_is_connected or sf_has_upload or sf_has_orders) else [
                {"label": "Connect Steadfast", "action": "connect_steadfast", "primary": True},
                {"label": "Upload sheet", "action": "upload"}
            ]
        },
        {
            "key": "redx",
            "name": "RedX",
            "category": "courier",
            "badge": "RX",
            "status": redx_conn["status"] if redx_conn else "not_connected",
            "status_label": "Connected" if (redx_conn and redx_conn["status"] == "healthy") else ("Failed" if (redx_conn and redx_conn["status"] == "failing") else "Not connected"),
            "last_sync": (str(redx_conn.get("last_sync_at", ""))[:16].replace("T", " ") or None) if redx_conn else None,
            "failures_count": redx_conn.get("consecutive_failures", 0) if redx_conn else 0,
            "failures_label": f"Failures: {redx_conn.get('consecutive_failures', 0)}" if redx_conn else "Failures: 0",
            "actions": [
                {"label": "Connect RedX", "action": "paste_token", "primary": True},
                {"label": "Open log", "action": "open_log"}
            ]
        },
        {
            "key": "facebook_shop",
            "name": "Facebook Shop",
            "category": "store_orders",
            "badge": "FB",
            "status": "connected" if store_connected else "not_connected",
            "status_label": "Connected" if store_connected else "Not connected",
            "last_sync": (str(store_s.get("last_pulled_at", ""))[:16].replace("T", " ") if store_s.get("last_pulled_at") else dynamic_sync_time) if store_connected else None,
            "failures_count": 0,
            "failures_label": "Failures, 7 days: 0",
            "orders_pulled_month": store_orders_count if store_connected else None,
            "page_name": (store_s.get("store_url") or "Store Orders") if store_connected else None,
            "actions": [
                {"label": "Sync now", "action": "sync"} if store_connected else {"label": "Connect Store", "action": "connect_store", "primary": True},
                {"label": "Settings", "action": "settings"}
            ]
        },
        {
            "key": "meta_ads",
            "name": "Meta Ads",
            "category": "advertising",
            "badge": "MA",
            "status": "connected" if meta_connected else "not_connected",
            "status_label": "Connected" if meta_connected else "Not connected",
            "last_sync": (str(meta_s.get("last_synced_at", ""))[:16].replace("T", " ") if meta_s.get("last_synced_at") else dynamic_sync_time) if meta_connected else None,
            "failures_count": 0,
            "failures_label": "Failures, 7 days: 0" if meta_connected else "Failures: 0",
            "spend_usd": (round(ads_taka / 122.5, 2) if ads_taka > 0 else 0.0) if meta_connected else None,
            "spend_taka": ads_taka if meta_connected else None,
            "rate_used": 122.5 if meta_connected else None,
            "rate_date": today()[:10] if meta_connected else None,
            "actions": [
                {"label": "Map campaigns", "action": "map_campaigns"} if meta_connected else {"label": "Connect Meta Ads", "action": "connect_meta", "primary": True},
                {"label": "Settings", "action": "settings"}
            ]
        },
        {
            "key": "daraz",
            "name": "Daraz Open Platform",
            "category": "store_orders",
            "badge": "DZ",
            "status": "not_connected",
            "status_label": "Not connected",
            "last_sync": None,
            "failures_count": 0,
            "failures_label": "Failures, 7 days: 0",
            "brings_in": "Daraz marketplace orders, returns & payouts",
            "actions": [
                {"label": "Connect Daraz", "action": "connect_daraz", "primary": True},
                {"label": "Settings", "action": "settings"}
            ]
        },
        {
            "key": "bkash_nagad",
            "name": "bKash & Nagad",
            "category": "payments",
            "badge": "bk",
            "status": "not_connected",
            "status_label": "Not connected",
            "last_sync": None,
            "failures_count": 0,
            "failures_label": "bKash merchant: Never connected",
            "secondary_label": "Nagad merchant: Never connected",
            "brings_in": "Supplier payments are typed in by hand",
            "actions": [
                {"label": "Connect bKash", "action": "connect_bkash", "primary": True},
                {"label": "Connect Nagad", "action": "connect_nagad"}
            ]
        }
    ]

    # Update cards with live DB connection states where available
    for card in cards:
        k = card["key"].lower()
        if k in conn_map:
            c = conn_map[k]
            if c["status"] == "healthy":
                card["status"] = "connected"
                card["status_label"] = "Connected"
            elif c["status"] == "failing":
                card["status"] = "failed"
                card["status_label"] = "Failed"
            elif c["status"] == "sheet_upload":
                card["status"] = "sheet_upload"
                card["status_label"] = "Sheet upload"
            elif c["status"] == "never_connected":
                card["status"] = "not_connected"
                card["status_label"] = "Not connected"
            if c.get("failure_reason"):
                card["error_reason"] = c["failure_reason"]
                card["fix_hint"] = f"Check connection settings for {card['name']}."
            card["failures_count"] = c.get("consecutive_failures", 0)
            if c.get("last_sync_at"):
                card["last_sync"] = c["last_sync_at"][:16].replace("T", " ")
            elif c.get("last_success_at"):
                card["last_sync"] = c["last_success_at"][:16].replace("T", " ")

    write_permissions = [
        {"source": "Pathao", "writes": "Parcel status, COD collected, delivery and return charges"},
        {"source": "Steadfast", "writes": "Settlement rows from an uploaded sheet, after you confirm the mapping"},
        {"source": "Facebook Shop", "writes": "Orders, customers and line items — placed, never delivered"},
        {"source": "Meta Ads", "writes": "Spend in USD with the rate and date used for conversion"},
        {"source": "WhatsApp", "writes": "Only entries the merchant has confirmed by replying"},
    ]

    connected_cards = [c for c in cards if c.get("status") in ("connected", "sheet_upload")]
    failed_cards = [c for c in cards if c.get("status") == "failed"]
    healthy_count = len(connected_cards)
    total_count = len(connected_cards) if len(connected_cards) > 0 else len(cards)
    has_critical = len(failed_cards) > 0
    alert_payload = None
    if has_critical:
        fc = failed_cards[0]
        alert_payload = {
            "source": fc["name"],
            "title": f"{fc['name']} sync issue detected",
            "description": fc.get("error_reason") or f"{fc['name']} connection requires attention.",
            "action_label": f"Fix {fc['name']} connection",
        }

    return {
        "healthy_count": healthy_count,
        "total_count": total_count,
        "full_sync_last_completed": dynamic_sync_time,
        "has_critical_error": has_critical,
        "alert": alert_payload,
        "cards": cards,
        "write_permissions": write_permissions,
    }

@router.get("/export/ledger")
async def export_ledger_csv(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    rows = all(
        "SELECT j.date, j.id as journal_id, j.kind, j.memo, j.source, "
        "jl.account, jl.party, jl.amount "
        "FROM journals j JOIN journal_lines jl ON j.id = jl.journal_id "
        "WHERE j.merchant_id = ? ORDER BY j.date ASC, j.id ASC",
        m_id
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["date", "journal_id", "kind", "memo", "source", "account", "party", "amount_poisha", "amount_taka"])
    for r in rows:
        writer.writerow([
            r["date"], r["journal_id"], r["kind"], r["memo"], r["source"],
            r["account"], r["party"] or "", r["amount"], r["amount"] / 100
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ledger_entries.csv"'}
    )

@router.get("/export/orders")
async def export_orders_csv(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    rows = all(
        "SELECT id, external_id, order_date, customer_name, customer_phone, "
        "status, delivery_status, total_amount "
        "FROM orders WHERE merchant_id = ? ORDER BY order_date DESC, id DESC",
        m_id
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "external_id", "order_date", "customer_name", "customer_phone", "status", "delivery_status", "total_taka"])
    for r in rows:
        writer.writerow([
            r["id"], r["external_id"] or "", r["order_date"], r["customer_name"] or "",
            r["customer_phone"] or "", r["status"], r["delivery_status"] or "",
            (r["total_amount"] or 0) / 100
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="orders_and_returns.csv"'}
    )

@router.get("/export/products")
async def export_products_csv(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    rows = all(
        "SELECT p.id, p.sku, p.name, p.selling_price, "
        "pph.purchase_price, pph.effective_from "
        "FROM products p "
        "LEFT JOIN product_price_history pph ON p.id = pph.product_id "
        "WHERE p.merchant_id = ? ORDER BY p.id ASC, pph.effective_from DESC",
        m_id
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "sku", "name", "selling_price_taka", "cost_price_taka", "effective_from"])
    for r in rows:
        sp = (r["selling_price"] / 100) if r.get("selling_price") is not None else ""
        cp = (r["purchase_price"] / 100) if r.get("purchase_price") is not None else ""
        writer.writerow([
            r["id"], r.get("sku") or "", r["name"], sp, cp, r.get("effective_from") or ""
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="products_cost_history.csv"'}
    )


