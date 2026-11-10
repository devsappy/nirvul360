from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field, field_validator
from app.api.auth import get_current_user
from app.domain.suppliers import list_suppliers, get_supplier_statement, create_supplier
from app.domain.roles import can_view_supplier_prices

router = APIRouter(prefix="/api/suppliers", tags=["Suppliers"])

class SupplierCreateInput(BaseModel):
    name: str = Field(..., min_length=1, description="Supplier name cannot be blank")
    phone: Optional[str] = None
    address: Optional[str] = None
    terms_days: Optional[int] = 30
    credit_terms_days: Optional[int] = 30
    categories: Optional[str] = None
    advance_balance: Optional[float] = 0.0

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Supplier name is required")
        return v.strip()

@router.get("")
async def get_suppliers_list(current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    role = current["user"]["role"]
    data = list_suppliers(m_id)
    
    # If manager, mask purchase prices & payable balances
    if not can_view_supplier_prices(role):
        data['total_payable'] = None
        data['total_payable_poisha'] = None
        data['total_payable_taka'] = None
        for s in data['suppliers']:
            s['payable_balance'] = None
            s['payable_balance_poisha'] = None
            s['payable_balance_taka'] = None
            
    return data

@router.get("/{supplier_id}/statement")
async def get_supplier_statement_endpoint(supplier_id: int, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    role = current["user"]["role"]
    if not can_view_supplier_prices(role):
        raise HTTPException(status_code=403, detail="Permission denied: Supplier statements are restricted.")
    return get_supplier_statement(m_id, supplier_id)

@router.post("")
async def create_supplier_endpoint(data: SupplierCreateInput, current: Dict[str, Any] = Depends(get_current_user)):
    m_id = current["merchantId"]
    sup_id = create_supplier(m_id, data.model_dump())
    return {"id": sup_id, "status": "created"}
