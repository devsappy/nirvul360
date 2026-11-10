"""
Domain logic for Supplier Master-Detail Ledger, Purchase Batches FIFO Payment Allocation, and Statements.
"""
from typing import Dict, Any, List, Optional
from app.db.session import all, one, insert, update
from app.lib.dates import now_iso, today
from app.lib.money import to_poisha

def list_suppliers(merchant_id: int) -> Dict[str, Any]:
    """
    Returns supplier directory with dynamic payable balances and advance totals.
    """
    suppliers_raw = all("SELECT * FROM suppliers WHERE merchant_id = ? ORDER BY id ASC", merchant_id)
    items = []
    tot_pay = 0
    tot_adv = 0

    for s in suppliers_raw:
        s_id = s['id']
        bal_row = one(
            """
            SELECT COALESCE(SUM(amount), 0) AS net_bal 
            FROM journal_lines 
            WHERE merchant_id = ? AND account = 'supplier_payable' AND party = ?
            """,
            merchant_id, str(s_id)
        )
        # Credit to supplier_payable has negative amount in double entry; positive amount represents payment debit
        net_bal = int(bal_row['net_bal']) if bal_row else 0
        pay_bal = -net_bal if net_bal < 0 else 0
        adv_bal = int(s.get('advance_balance') or 0)

        # Categories summary from purchases
        p_rows = all(
            """
            SELECT DISTINCT p.name 
            FROM purchases pur 
            JOIN products p ON p.id = pur.product_id 
            WHERE pur.merchant_id = ? AND pur.supplier_id = ? 
            LIMIT 3
            """,
            merchant_id, s_id
        )
        cats = ", ".join([p['name'] for p in p_rows]) if p_rows else (s.get('categories') or "")

        terms = s.get('terms_days') or s.get('credit_terms_days') or 30

        tot_pay += pay_bal
        tot_adv += adv_bal

        items.append({
            'id': s_id,
            'name': s['name'],
            'phone': s.get('phone'),
            'address': s.get('address'),
            'terms_days': terms,
            'credit_terms_days': terms,
            'payable_balance': pay_bal,
            'payable_balance_poisha': pay_bal,
            'payable_balance_taka': pay_bal / 100.0,
            'advance_balance': adv_bal,
            'advance_balance_poisha': adv_bal,
            'advance_balance_taka': adv_bal / 100.0,
            'categories_summary': cats,
            'created_at': s.get('created_at'),
        })

    return {
        'total_payable': tot_pay,
        'total_payable_poisha': tot_pay,
        'total_payable_taka': tot_pay / 100.0,
        'total_advances': tot_adv,
        'total_advances_poisha': tot_adv,
        'total_advances_taka': tot_adv / 100.0,
        'suppliers_count': len(items),
        'suppliers': items
    }

def get_supplier_statement(merchant_id: int, supplier_id: int) -> Dict[str, Any]:
    """
    Computes vendor running ledger and FIFO purchase batch payment statuses.
    """
    s = one("SELECT * FROM suppliers WHERE id = ? AND merchant_id = ?", supplier_id, merchant_id)
    if not s:
        raise ValueError("Supplier not found")

    # 1. Calculate net payable balance: -SUM(amount) on supplier_payable
    bal_row = one(
        """
        SELECT COALESCE(SUM(amount), 0) AS net_bal 
        FROM journal_lines 
        WHERE merchant_id = ? AND account = 'supplier_payable' AND party = ?
        """,
        merchant_id, str(supplier_id)
    )
    net_bal = int(bal_row['net_bal']) if bal_row else 0
    net_payable = -net_bal if net_bal < 0 else 0

    # 2. Group purchase batches by batch_no
    purchases = all(
        """
        SELECT COALESCE(pur.batch_no, 'PB-' || printf('%04d', pur.id)) AS batch_no,
               pur.purchase_date,
               COUNT(pur.id) AS items_count,
               SUM(pur.qty * pur.unit_cost) AS total_value_poisha,
               GROUP_CONCAT(p.name || ' ×' || pur.qty, ', ') AS items_summary
        FROM purchases pur
        JOIN products p ON p.id = pur.product_id
        WHERE pur.merchant_id = ? AND pur.supplier_id = ?
        GROUP BY COALESCE(pur.batch_no, 'PB-' || printf('%04d', pur.id)), pur.purchase_date
        ORDER BY pur.purchase_date ASC, pur.id ASC
        """,
        merchant_id, supplier_id
    )

    # 3. Total payments made to this supplier
    paid_row = one(
        """
        SELECT COALESCE(SUM(amount), 0) AS total_paid 
        FROM journal_lines 
        WHERE merchant_id = ? AND account = 'supplier_payable' AND party = ? AND amount > 0
        """,
        merchant_id, str(supplier_id)
    )
    rem_paid = int(paid_row['total_paid']) if paid_row else 0

    batches_output = []
    for b in purchases:
        val = int(b['total_value_poisha'] or 0)
        if rem_paid >= val:
            status = "Paid"
            paid_val = val
            rem_paid -= val
        elif rem_paid > 0:
            status = "Part paid"
            paid_val = rem_paid
            rem_paid = 0
        else:
            status = "Unpaid"
            paid_val = 0
        batches_output.append({
            'batch_no': b['batch_no'],
            'date': b['purchase_date'],
            'items_summary': b['items_summary'],
            'items_count': int(b['items_count']),
            'total_value_poisha': val,
            'total_value_taka': val / 100.0,
            'paid_poisha': paid_val,
            'paid_taka': paid_val / 100.0,
            'status': status
        })
    batches_output.reverse() # Most recent batch first

    # 4. Chronological Running Ledger
    j_rows = all(
        """
        SELECT j.id, j.entry_date, j.kind, j.memo, l.amount AS line_amount,
               COALESCE(ca.kind, 'cash') AS cash_kind,
               COALESCE(ca.name, 'Cash') AS cash_name,
               pur.batch_no
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        LEFT JOIN cash_accounts ca ON ca.id = CAST(l.party AS INTEGER)
        LEFT JOIN purchases pur ON pur.id = j.purchase_id
        WHERE l.merchant_id = ? AND l.account = 'supplier_payable' AND l.party = ?
        ORDER BY j.entry_date ASC, j.id ASC
        """,
        merchant_id, str(supplier_id)
    )

    ledger_rows = []
    running_bal = 0
    for r in j_rows:
        # Credit to payable (negative line_amount) increases amount owed to vendor
        amt = -int(r['line_amount'])
        running_bal += amt
        if r['kind'] == 'purchase':
            entry_label = f"Purchase {r.get('batch_no') or 'batch'}"
            method = "—"
        else:
            entry_label = "Payment"
            method = "Bank transfer" if r['cash_kind'] == 'bank' else r['cash_kind'].capitalize()

        ledger_rows.append({
            'id': r['id'],
            'date': r['entry_date'],
            'entry': entry_label,
            'method': method,
            'amount_poisha': amt,
            'amount_taka': amt / 100.0,
            'running_balance_poisha': running_bal,
            'running_balance_taka': running_bal / 100.0
        })

    terms = s.get('terms_days') or s.get('credit_terms_days') or 30
    adv = int(s.get('advance_balance') or 0)

    advance_note = None
    if adv > 0:
        advance_note = f"A further ৳{adv / 100.0:,.0f} advance was paid against a batch not yet received. It sits as an asset, not against this balance."

    return {
        'supplier': {
            'id': s['id'],
            'name': s['name'],
            'phone': s.get('phone'),
            'address': s.get('address'),
            'terms_days': terms,
            'credit_terms_days': terms,
            'payable_balance': net_payable,
            'payable_balance_poisha': net_payable,
            'payable_balance_taka': net_payable / 100.0,
            'advance_balance': adv,
            'advance_balance_poisha': adv,
            'advance_balance_taka': adv / 100.0,
            'categories_summary': s.get('categories') or ""
        },
        'batches': batches_output,
        'running_ledger': ledger_rows,
        'advance_note': advance_note
    }

def create_supplier(merchant_id: int, data: Dict[str, Any]) -> int:
    name = data['name'].strip()
    if not name:
        raise ValueError("Supplier name is required")

    adv = data.get('advance_balance') or 0
    adv_poisha = adv if isinstance(adv, int) else to_poisha(adv)
    terms = data.get('terms_days') or data.get('credit_terms_days') or 30

    sup_id = insert('suppliers', {
        'merchant_id': merchant_id,
        'name': name,
        'phone': data.get('phone'),
        'address': data.get('address'),
        'terms_days': int(terms),
        'credit_terms_days': int(terms),
        'categories': data.get('categories'),
        'advance_balance': adv_poisha,
        'created_at': now_iso(),
    })
    return sup_id
