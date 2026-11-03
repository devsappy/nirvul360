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
from app.lib.money import format_taka_bn

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
    return_rate = (returned / placed) if placed > 0 else None

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
            'return_rate': return_rate,
        }
    }

def product_performance(merchant_id: int, from_date: str, to_date: str) -> Dict[str, Any]:
    """
    One row per product that had orders in the period. Revenue counts delivered
    value only, COGS at the delivery-date cost, courier charges apportioned across
    the products in each order. Ad spend cannot be attributed to products (no
    campaign→product mapping in the schema), so it stays blank per row and is
    reported once at the top level as unattributed_ad_spend_total.
    """
    from app.domain.products import cost_at

    rows = all(
        "SELECT i.product_id, p.name, p.sku, o.id AS order_id, o.status, o.total, "
        "o.is_duplicate, o.order_date, o.delivered_date, i.qty, i.unit_price, i.line_total "
        "FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id "
        "WHERE o.merchant_id = ? AND o.order_date >= ? AND o.order_date <= ? AND o.is_duplicate = 0",
        merchant_id, from_date, to_date
    )

    prods: Dict[int, Dict[str, Any]] = {}
    for r in rows:
        pid = r['product_id']
        pr = prods.setdefault(pid, {
            'product_id': pid, 'name': r['name'], 'sku': r['sku'],
            '_orders': set(), '_delivered': set(), '_returned': set(),
        })
        pr['_orders'].add(r['order_id'])
        if r['status'] == 'delivered':
            pr['_delivered'].add(r['order_id'])
        elif r['status'] == 'returned':
            pr['_returned'].add(r['order_id'])

    # Delivered value per product (delivered_date inside the window)
    value_rows = all(
        "SELECT i.product_id, COALESCE(SUM(i.line_total), 0) AS v "
        "FROM orders o JOIN order_items i ON i.order_id = o.id "
        "WHERE o.merchant_id = ? AND o.status = 'delivered' AND o.is_duplicate = 0 "
        "AND o.delivered_date >= ? AND o.delivered_date <= ? "
        "GROUP BY i.product_id",
        merchant_id, from_date, to_date
    )
    revenue_by_pid = {r['product_id']: int(r['v']) for r in value_rows}

    # COGS and courier charges straight from the ledger (delivered postings)
    cogs_rows = all(
        "SELECT l.product_id, COALESCE(SUM(l.amount), 0) AS s "
        "FROM journal_lines l JOIN journals j ON j.id = l.journal_id "
        "WHERE l.merchant_id = ? AND l.account = 'cogs' AND l.entry_date >= ? AND l.entry_date <= ? "
        "GROUP BY l.product_id",
        merchant_id, from_date, to_date
    )
    cogs_by_pid = {r['product_id']: int(r['s']) for r in cogs_rows}

    fee_rows = all(
        "SELECT j.order_id, COALESCE(SUM(l.amount), 0) AS s "
        "FROM journals j JOIN journal_lines l ON l.journal_id = j.id "
        "WHERE j.merchant_id = ? AND l.account IN ('courier_delivery','courier_cod_fee','courier_return_fee') "
        "AND l.entry_date >= ? AND l.entry_date <= ? AND j.order_id IS NOT NULL "
        "GROUP BY j.order_id",
        merchant_id, from_date, to_date
    )
    fees_by_order = {r['order_id']: int(r['s']) for r in fee_rows}

    # Apportion per-order courier fees across products by line value
    line_rows = all(
        "SELECT i.order_id, i.product_id, i.line_total FROM order_items i "
        "JOIN orders o ON o.id = i.order_id WHERE o.merchant_id = ? AND o.is_duplicate = 0",
        merchant_id
    )
    courier_share: Dict[int, int] = {}
    fee_orders: Dict[int, List[Dict[str, Any]]] = {}
    for lr in line_rows:
        if lr['order_id'] in fees_by_order:
            fee_orders.setdefault(lr['order_id'], []).append(lr)
    for order_id, lines in fee_orders.items():
        total_fee = fees_by_order[order_id]
        total_val = sum(l['line_total'] for l in lines) or 1
        allocated = 0
        for l in lines:
            share = int(total_fee * l['line_total'] // total_val)
            courier_share[l['product_id']] = courier_share.get(l['product_id'], 0) + share
            allocated += share
        biggest = max(lines, key=lambda l: l['line_total'])
        courier_share[biggest['product_id']] += total_fee - allocated

    ad_total = all(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM journal_lines "
        "WHERE merchant_id = ? AND account = 'ad_spend' AND entry_date >= ? AND entry_date <= ?",
        merchant_id, from_date, to_date
    )
    unattributed_ads = int(ad_total[0]['s']) if ad_total else 0

    items = []
    for pid, pr in prods.items():
        placed = len(pr['_orders'])
        delivered = len(pr['_delivered'])
        returned = len(pr['_returned'])
        revenue = revenue_by_pid.get(pid, 0)
        cogs = cogs_by_pid.get(pid, 0)
        gross_profit = revenue - cogs
        courier_cost = courier_share.get(pid, 0)
        # Ad spend has no product attribution yet — left blank per spec.
        ad_spend = None
        net_profit = gross_profit - courier_cost
        net_margin = (net_profit / revenue) if revenue else None
        items.append({
            'product_id': pid,
            'name': pr['name'],
            'sku': pr['sku'],
            'orders_placed': placed,
            'delivered': delivered,
            'returned': returned,
            'delivered_pct': round(delivered / placed, 3) if placed else None,
            'returned_pct': round(returned / placed, 3) if placed else None,
            'revenue_poisha': revenue,
            'cogs_poisha': cogs,
            'gross_profit_poisha': gross_profit,
            'ad_spend_poisha': ad_spend,
            'courier_cost_poisha': courier_cost,
            'net_profit_poisha': net_profit,
            'net_margin': round(net_margin, 3) if net_margin is not None else None,
        })

    items.sort(key=lambda r: r['net_profit_poisha'], reverse=True)
    return {
        'from': from_date,
        'to': to_date,
        'unattributed_ad_spend_poisha': unattributed_ads,
        'rows': items,
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


def daily_summary_text(conn, merchant_id, for_date=None):
    from app.lib.dates import add_days
    d = for_date or today()
    y = add_days(d, -1)
    pnl = profit_and_loss(merchant_id, y, y)
    r = one('SELECT COUNT(*) c, COALESCE(SUM(CASE WHEN status=''delivered'' THEN 1 ELSE 0 END),0) del, COALESCE(SUM(CASE WHEN status=''returned'' THEN 1 ELSE 0 END),0) ret, COUNT(*) tot FROM orders WHERE merchant_id=? AND order_date=? AND is_duplicate=0', merchant_id, y) if False else None
    import sqlite3
    cur = conn.execute('SELECT COUNT(*) AS tot, COALESCE(SUM(CASE WHEN status=''delivered'' THEN 1 ELSE 0 END),0) AS del, COALESCE(SUM(CASE WHEN status=''returned'' THEN 1 ELSE 0 END),0) AS ret FROM orders WHERE merchant_id=? AND order_date=? AND is_duplicate=0', (merchant_id, y))
    row = cur.fetchone()
    delivered = int(row['del'] if hasattr(row,'keys') else row[1])
    returned = int(row['ret'] if hasattr(row,'keys') else row[2])
    placed = int(row['tot'] if hasattr(row,'keys') else row[0])
    rr = (returned/placed) if placed else 0
    exc = 0
    try:
        from app.domain.exceptions import unresolved_totals
        exc = unresolved_totals(merchant_id).get('total',0)
    except Exception:
        pass
    rev = format_taka_bn(pnl['gross_sales'])
    net = format_taka_bn(pnl['net_profit'])
    text = 'Daily Summary ' + y + ':\nDelivered: ' + str(delivered) + '\nRevenue: ' + rev + '\nNet Profit: ' + net + '\nReturn rate: ' + ('%.1f' % (rr*100)) + '%\nUnresolved exceptions: ' + str(exc)
    return text

