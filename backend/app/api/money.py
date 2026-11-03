from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional
from pydantic import BaseModel
from app.api.auth import get_current_user
from app.domain.entries import (
    record_expense, record_purchase, record_supplier_payment,
    record_transfer, record_withdrawal, record_capital, recent_entries
)
from app.domain.reports import cash_position
from app.domain.exceptions import scan_merchant
from app.lib.money import to_poisha
from app.lib.dates import today
from app.db.session import all

router = APIRouter(prefix="/api", tags=["Money"])

class ExpenseInput(BaseModel):
    head: Optional[str] = None
    expense_head: Optional[str] = None
    amount: float
    date: Optional[str] = None
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

class PurchaseInput(BaseModel):
    product_id: int
    qty: int
    unit_cost: float
    supplier_id: Optional[int] = None
    date: Optional[str] = None
    paid_amount: Optional[float] = 0
    cash_account_id: Optional[int] = None

class SupplierPaymentInput(BaseModel):
    supplier_id: int
    amount: float
    date: Optional[str] = None
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

class TransferInput(BaseModel):
    amount: float
    fee: Optional[float] = 0
    from_account_id: int
    to_account_id: int
    date: Optional[str] = None
    note: Optional[str] = None

class WithdrawalInput(BaseModel):
    amount: float
    date: Optional[str] = None
    cash_account_id: Optional[int] = None
    note: Optional[str] = None

@router.get("/money")
async def get_money_overview(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    return {
        "entries": recent_entries(m_id),
        "cash": cash_position(m_id, today()),
        "suppliers": all("SELECT * FROM suppliers WHERE merchant_id = ?", m_id)
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
