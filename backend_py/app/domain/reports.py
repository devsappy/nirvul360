"""
Financial & Operational Reporting engine.
P&L reads from the double-entry ledger only (Revenue recognised on delivery).
Profit and cash are computed separately and never added together.
"""
from typing import Dict, Any, List, Optional
from app.db.session import one, all
from app.domain.accounts import ACCOUNTS, PL_SECTIONS, accounts_in_section
from app.domain.ledger import balance, balances_by_party
from app.domain.exceptions import unresolved_totals
from app.domain.products import cost_at
from app.lib.dates import today, month_start, add_days

def account_totals(merchant_id: int, from_date: str, to_date: str) -> Dict[str, int]:
    rows = all(
        "SELECT account, SUM(amount) AS s FROM journal_lines WHERE merchant_id = ? AND entry_date >= ? AND entry_date <= ? GROUP BY account",
        merchant_id, from_date, to_date
    )
    return {r['account']: int(r['s']) for r in rows}

def profit_and_loss(merchant_id: int, from_date: str, to_date: str) -> Dict[str, Any]:
    t = account_totals(merchant_id, from_date, to_date)
    sections = {}
    for sec in PL_SECTIONS:
        lines = []
        for acct in accounts_in_section(sec['key']):
            amt = sec['sign'] * t.get(acct, 0)
            lines.append({'account': acct, 'label': ACCOUNTS[acct]['label'], 'amount': amt})
        sections[sec['key']] = {
            'label': sec['label'],
            'amount': sum(l['amount'] for l in lines),
            'lines': lines
        }

    gross = sections['gross_sales']['amount']
    net_sales = gross - sections['returns']['amount'] - sections['held']['amount']
    cogs = sections['cogs']['amount']
    gross_profit = net_sales - cogs
    net_profit = (
        gross_profit
        - sections['courier']['amount']
        - sections['ads']['amount']
        - sections['packaging']['amount']
        - sections['fixed']['amount']
        - sections['other']['amount']
    )

    return {
        'from': from_date,
        'to': to_date,
        'sections': sections,
        'gross_sales': gross,
        'net_sales': net_sales,
        'cogs': cogs,
        'gross_profit': gross_profit,
        'net_profit': net_profit,
        'margin': (net_profit / net_sales) if net_sales else None,
        'gross_margin': (gross_profit / net_sales) if net_sales else None,
        'owner_withdrawals': t.get('owner_drawings', 0),
    }

def stock_value(merchant_id: int, as_of: str) -> Dict[str, Any]:
    rows = all(
        "SELECT p.id, p.name, "
        "COALESCE((SELECT SUM(qty) FROM stock_movements s WHERE s.product_id = p.id AND s.movement_date <= ?), 0) AS on_hand, "
        "COALESCE((SELECT SUM(i.qty) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id = p.id AND o.status = 'in_transit' AND o.is_duplicate = 0), 0) AS in_transit "
        "FROM products p WHERE p.merchant_id = ?",
        as_of, merchant_id
    )
    on_hand = 0
    in_transit = 0
    unvalued_prods = 0
    unvalued_units = 0

    for r in rows:
        qty = max(0, int(r['on_hand']))
        transit = int(r['in_transit'])
        if not qty and not transit:
            continue
        c = cost_at(r['id'], as_of)
        if not c:
            unvalued_prods += 1
            unvalued_units += qty + transit
            continue
        price = c['purchase_price']
        on_hand += qty * price
        in_transit += transit * price

    return {
        'total': on_hand + in_transit,
        'on_hand': on_hand,
        'in_transit': in_transit,
        'unvalued_products': unvalued_prods,
        'unvalued_units': unvalued_units,
    }

def cash_position(merchant_id: int, as_of: str) -> Dict[str, Any]:
    accounts = all("SELECT * FROM cash_accounts WHERE merchant_id = ?", merchant_id)
    cash_accts = [{
        'id': a['id'],
        'name': a['name'],
        'kind': a['kind'],
        'balance': balance(merchant_id, 'cash', party=str(a['id']), on_or_before=as_of)
    } for a in accounts]

    cash_total = sum(a['balance'] for a in cash_accts)
    couriers_held = balance(merchant_id, 'courier_receivable', on_or_before=as_of)
    courier_claims = balance(merchant_id, 'courier_claims', on_or_before=as_of)
    supplier_payables = balance(merchant_id, 'supplier_payable', on_or_before=as_of)
    stock = stock_value(merchant_id, as_of)

    return {
        'as_of': as_of,
        'cash_in_hand': cash_total,
        'cash_accounts': cash_accts,
        'held_at_couriers': couriers_held,
        'claims_against_couriers': courier_claims,
        'owed_to_suppliers': -supplier_payables,
        'stock': stock,
        'net_liquid': cash_total + couriers_held + supplier_payables,
    }

def dashboard(merchant_id: int, from_date: str, to_date: str) -> Dict[str, Any]:
    pnl = profit_and_loss(merchant_id, from_date, to_date)
    cash = cash_position(merchant_id, to_date)
    attention = unresolved_totals(merchant_id)

    # Operations metrics
    orders_row = one(
        "SELECT COUNT(*) AS placed, "
        "COALESCE(SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END), 0) AS in_transit, "
        "COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) AS delivered, "
        "COALESCE(SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END), 0) AS returned "
        "FROM orders WHERE merchant_id = ? AND order_date >= ? AND order_date <= ? AND is_duplicate = 0",
        merchant_id, from_date, to_date
    )

    placed = int(orders_row['placed']) if orders_row else 0
    delivered = int(orders_row['delivered']) if orders_row else 0
    returned = int(orders_row['returned']) if orders_row else 0
    in_transit = int(orders_row['in_transit']) if orders_row else 0
    delivery_rate = (delivered / placed) if placed > 0 else None

    # Today's profit
    today_pnl = profit_and_loss(merchant_id, today(), today())

    return {
        'profit': pnl,
        'today_profit': today_pnl['net_profit'],
        'cash': cash,
        'attention': attention,
        'operations': {
            'placed': placed,
            'in_transit': in_transit,
            'delivered': delivered,
            'returned': returned,
            'delivery_rate': delivery_rate,
        }
    }

def drilldown(merchant_id: int, metric: str, from_date: str, to_date: str) -> Dict[str, Any]:
    """Trace every number to underlying double-entry journal rows (Non-negotiable rule 10)."""
    sql = (
        "SELECT l.id AS line_id, l.entry_date, l.account, l.party, l.amount, "
        "j.id AS journal_id, j.kind, j.memo, j.source, j.created_by, j.order_id, j.product_id "
        "FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE l.merchant_id = ? AND l.entry_date >= ? AND l.entry_date <= ?"
    )
    params = [merchant_id, from_date, to_date]

    if metric == 'net_profit':
        # Sum of revenue (negative) and expenses (positive)
        sql += " AND l.account IN ('sales', 'sales_returns', 'cogs', 'courier_delivery', 'courier_cod_fee', 'courier_return_fee', 'courier_recovery', 'ad_spend', 'packaging', 'salary', 'rent', 'utilities', 'software', 'transport', 'stock_loss', 'bad_debt', 'other_expense')"
    elif metric.startswith('section:'):
        sec_key = metric.split(':')[1]
        accts = accounts_in_section(sec_key)
        placeholders = ", ".join(["?"] * len(accts))
        sql += f" AND l.account IN ({placeholders})"
        params.extend(accts)
    elif metric == 'gross_profit':
        sql += " AND l.account IN ('sales', 'sales_returns', 'cogs')"

    sql += " ORDER BY l.entry_date DESC, l.id DESC"
    rows = all(sql, *params)
    total = sum(r['amount'] for r in rows)
    return {'metric': metric, 'total': total, 'rows': rows}
