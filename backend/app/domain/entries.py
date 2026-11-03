"""
Direct money entries: expenses, ad spend (foreign currency fixed), owner withdrawals (never touch profit),
transfers, supplier purchases (moving average cost), and supplier payments.
"""
from typing import Dict, Any, Optional, List
from app.db.session import insert, one, all, tx
from app.lib.dates import now_iso, today, is_iso_date
from app.domain.accounts import ACCOUNTS, EXPENSE_HEADS
from app.domain.ledger import post
from app.domain.merchants import resolve_cash_account
from app.domain.products import get_product, cost_at, stock_qty, set_price

def _check_date(d: Optional[str]) -> str:
    date = d or today()
    if not is_iso_date(date):
        raise ValueError(f"invalid date {d}")
    return date

def _positive(amount: int, what: str = 'amount'):
    if not isinstance(amount, int) or amount <= 0:
        raise ValueError(f"{what} must be an integer greater than zero")

def record_expense(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    head = data['head']
    if head not in EXPENSE_HEADS:
        raise ValueError(f"unknown expense head {head}")
    if head == 'ad_spend':
        return record_ad_spend(merchant_id, {**data, 'currency': 'BDT'}, ctx)

    amount = data['amount']
    _positive(amount)
    d = _check_date(data.get('date'))
    cash = resolve_cash_account(merchant_id, data.get('cashAccountId') or data.get('cash_account_id'))
    memo = f"{ACCOUNTS[head]['label']}: {data['note']}" if data.get('note') else ACCOUNTS[head]['label']

    return post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'expense',
        'memo': memo,
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
        'draft_id': ctx.get('draftId') or ctx.get('draft_id'),
    }, [
        {'account': head, 'amount': amount},
        {'account': 'cash', 'party': cash, 'amount': -amount},
    ])

def record_ad_spend(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    amount = data['amount']
    _positive(amount)
    d = _check_date(data.get('date'))
    cash = resolve_cash_account(merchant_id, data.get('cashAccountId') or data.get('cash_account_id'))
    currency = (data.get('currency') or 'BDT').upper()
    platform = data.get('platform') or 'Meta'

    bdt = amount
    fx = None
    if currency != 'BDT':
        rate = float(data.get('rate')) if data.get('rate') is not None else None
        if rate is None:
            latest = latest_rate(merchant_id, currency, d)
            if latest:
                rate = float(latest['rate'])
        if rate is None or rate <= 0:
            raise ValueError(f"no {currency} exchange rate for {d} — enter the rate used")

        rate_date = data.get('rateDate') or data.get('rate_date') or d
        if not is_iso_date(rate_date):
            raise ValueError("invalid rate date")

        bdt = int(round(amount * float(rate)))
        fx = {
            'orig_amount': amount,
            'currency': currency,
            'rate': str(rate),
            'rate_date': rate_date,
        }
        if data.get('rate'):
            save_rate(merchant_id, currency, rate_date, str(rate), ctx)

    memo = f"{platform} ads: {data['note']}" if data.get('note') else f"{platform} ads"
    return post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'ad_spend',
        'memo': memo,
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
        'draft_id': ctx.get('draftId') or ctx.get('draft_id'),
        'fx': fx,
    }, [
        {'account': 'ad_spend', 'amount': bdt},
        {'account': 'cash', 'party': cash, 'amount': -bdt},
    ])

def latest_rate(merchant_id: int, currency: str, on_or_before: str) -> Optional[Dict[str, Any]]:
    return one(
        "SELECT * FROM fx_rates WHERE merchant_id = ? AND currency = ? AND rate_date <= ? ORDER BY rate_date DESC, id DESC LIMIT 1",
        merchant_id, currency, on_or_before
    )

def save_rate(merchant_id: int, currency: str, rate_date: str, rate: str, ctx: Dict[str, Any]):
    existing = one(
        "SELECT rate FROM fx_rates WHERE merchant_id = ? AND currency = ? AND rate_date = ? ORDER BY id DESC LIMIT 1",
        merchant_id, currency, rate_date
    )
    if existing and existing['rate'] == rate:
        return
    insert('fx_rates', {
        'merchant_id': merchant_id,
        'currency': currency,
        'rate_date': rate_date,
        'rate': rate,
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
        'created_at': now_iso(),
    })

def record_withdrawal(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    amount = data['amount']
    _positive(amount)
    d = _check_date(data.get('date'))
    cash = resolve_cash_account(merchant_id, data.get('cashAccountId') or data.get('cash_account_id'))
    memo = f"Owner withdrawal: {data['note']}" if data.get('note') else "Owner withdrawal"

    return post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'owner_withdrawal',
        'memo': memo,
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
    }, [
        {'account': 'owner_drawings', 'amount': amount},
        {'account': 'cash', 'party': cash, 'amount': -amount},
    ])

def record_capital(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    amount = data['amount']
    _positive(amount)
    d = _check_date(data.get('date'))
    cash = resolve_cash_account(merchant_id, data.get('cashAccountId') or data.get('cash_account_id'))
    memo = f"Owner put money in: {data['note']}" if data.get('note') else "Owner put money in"

    return post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'owner_capital',
        'memo': memo,
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
    }, [
        {'account': 'cash', 'party': cash, 'amount': amount},
        {'account': 'opening_equity', 'amount': -amount},
    ])

def record_transfer(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    amount = data['amount']
    _positive(amount)
    fee = data.get('fee', 0) or 0
    if fee < 0:
        raise ValueError("fee cannot be negative")

    d = _check_date(data.get('date'))
    from_acct = resolve_cash_account(merchant_id, data.get('fromAccountId') or data.get('from_account_id'))
    to_acct = resolve_cash_account(merchant_id, data.get('toAccountId') or data.get('to_account_id'))
    if from_acct == to_acct:
        raise ValueError("choose two different accounts")

    lines = [
        {'account': 'cash', 'party': to_acct, 'amount': amount},
        {'account': 'cash', 'party': from_acct, 'amount': -(amount + fee)},
    ]
    if fee > 0:
        lines.append({'account': 'other_expense', 'amount': fee})

    return post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'transfer',
        'memo': data.get('note') or 'Transfer between accounts',
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
    }, lines)

def record_purchase(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    qty = data['qty']
    unit_cost = data['unitCost'] if 'unitCost' in data else data.get('unit_cost')
    if not isinstance(qty, int) or qty <= 0:
        raise ValueError("quantity must be a positive whole number")
    if not isinstance(unit_cost, int) or unit_cost < 0:
        raise ValueError("unit cost must be a non-negative amount")

    d = _check_date(data.get('date'))
    product_id = data['productId'] if 'productId' in data else data.get('product_id')
    get_product(merchant_id, product_id)
    supplier_id = data.get('supplierId') or data.get('supplier_id')

    if supplier_id and not one("SELECT 1 FROM suppliers WHERE id = ? AND merchant_id = ?", supplier_id, merchant_id):
        raise ValueError("supplier not found")

    with tx():
        on_hand = max(0, stock_qty(product_id))
        cur_cost = cost_at(product_id, d)
        if cur_cost and on_hand > 0:
            avg_cost = int(round((on_hand * cur_cost['purchase_price'] + qty * unit_cost) / (on_hand + qty)))
            method = 'moving_average'
        else:
            avg_cost = unit_cost
            method = 'stated'

        purchase_id = insert('purchases', {
            'merchant_id': merchant_id,
            'supplier_id': supplier_id or None,
            'product_id': product_id,
            'qty': qty,
            'unit_cost': unit_cost,
            'purchase_date': d,
            'source': ctx.get('source', 'manual'),
            'created_by': ctx.get('actor', 'system'),
            'created_at': now_iso(),
        })

        insert('stock_movements', {
            'merchant_id': merchant_id,
            'product_id': product_id,
            'qty': qty,
            'reason': 'purchase',
            'movement_date': d,
            'purchase_id': purchase_id,
            'source': ctx.get('source', 'manual'),
            'created_by': ctx.get('actor', 'system'),
            'created_at': now_iso(),
        })

        set_price(merchant_id, product_id, avg_cost, {
            'effective_from': d,
            'source': ctx.get('source', 'manual'),
            'actor': ctx.get('actor', 'system'),
            'method': method,
            'purchaseId': purchase_id,
        })

        total = qty * unit_cost
        creditor = (
            {'account': 'supplier_payable', 'party': str(supplier_id), 'amount': -total}
            if supplier_id else
            {'account': 'cash', 'party': resolve_cash_account(merchant_id, data.get('cashAccountId') or data.get('cash_account_id')), 'amount': -total}
        )

        post({
            'merchant_id': merchant_id,
            'date': d,
            'kind': 'purchase',
            'memo': f"Purchase: {qty} units",
            'source': ctx.get('source', 'manual'),
            'created_by': ctx.get('actor', 'system'),
            'supplier_id': supplier_id,
            'purchase_id': purchase_id,
        }, [
            {'account': 'inventory', 'amount': total, 'product_id': product_id, 'qty': qty},
            creditor,
        ])

        paid_amount = data.get('paidAmount') or data.get('paid_amount') or 0
        if supplier_id and paid_amount > 0:
            record_supplier_payment(merchant_id, {
                'supplier_id': supplier_id,
                'amount': paid_amount,
                'date': d,
                'cashAccountId': data.get('cashAccountId') or data.get('cash_account_id'),
                'note': 'paid with purchase'
            }, ctx)

        return purchase_id

def record_supplier_payment(merchant_id: int, data: Dict[str, Any], ctx: Dict[str, Any]) -> int:
    amount = data['amount']
    _positive(amount)
    d = _check_date(data.get('date'))
    supplier_id = data.get('supplierId') or data.get('supplier_id')
    s = one("SELECT * FROM suppliers WHERE id = ? AND merchant_id = ?", supplier_id, merchant_id)
    if not s:
        raise ValueError("supplier not found")

    cash = resolve_cash_account(merchant_id, data.get('cashAccountId') or data.get('cash_account_id'))
    memo = f"Paid {s['name']}: {data['note']}" if data.get('note') else f"Paid {s['name']}"

    return post({
        'merchant_id': merchant_id,
        'date': d,
        'kind': 'supplier_payment',
        'memo': memo,
        'source': ctx.get('source', 'manual'),
        'created_by': ctx.get('actor', 'system'),
        'supplier_id': supplier_id,
    }, [
        {'account': 'supplier_payable', 'party': str(supplier_id), 'amount': amount},
        {'account': 'cash', 'party': cash, 'amount': -amount},
    ])

def recent_entries(merchant_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    journals = all(
        "SELECT * FROM journals WHERE merchant_id = ? ORDER BY entry_date DESC, id DESC LIMIT ?",
        merchant_id, limit
    )
    if not journals:
        return []
    for j in journals:
        lines = all(
            "SELECT account, party, amount, order_id, product_id, qty FROM journal_lines WHERE journal_id = ?",
            j['id']
        )
        j['lines'] = lines
    return journals
