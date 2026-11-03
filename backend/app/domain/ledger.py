"""
Double-entry ledger core.
Every transaction posts balanced debits and credits that sum to zero (Non-negotiable rule 6).
Journals and journal_lines are strictly append-only; changes post reversal journals.
"""
from typing import List, Dict, Any, Optional
from app.db.session import insert, all, one, tx
from app.lib.dates import now_iso, today, is_iso_date
from app.domain.accounts import ACCOUNTS
from app.lib.events import event_bus

def post(header: Dict[str, Any], lines: List[Dict[str, Any]]) -> int:
    """Post a balanced journal entry."""
    if not lines:
        raise ValueError("journal needs at least one line")

    total = sum(l['amount'] for l in lines)
    if total != 0:
        raise ValueError(f"journal is out of balance by {total} poisha — sum of lines must be 0")

    merchant_id = header['merchant_id']
    date = header.get('date') or today()
    if not is_iso_date(date):
        raise ValueError(f"invalid entry date {date}")

    for l in lines:
        if l['account'] not in ACCOUNTS:
            raise ValueError(f"unknown account {l['account']}")
        if not isinstance(l['amount'], int):
            raise ValueError(f"line amount must be an integer (poisha), got {type(l['amount'])}")

    fx = header.get('fx') or {}

    with tx():
        journal_id = insert('journals', {
            'merchant_id': merchant_id,
            'entry_date': date,
            'kind': header['kind'],
            'memo': header.get('memo'),
            'source': header['source'],
            'created_by': header['created_by'],
            'created_at': now_iso(),
            'order_id': header.get('order_id'),
            'product_id': header.get('product_id'),
            'exception_id': header.get('exception_id'),
            'upload_id': header.get('upload_id'),
            'settlement_row_id': header.get('settlement_row_id'),
            'supplier_id': header.get('supplier_id'),
            'purchase_id': header.get('purchase_id'),
            'draft_id': header.get('draft_id'),
            'orig_amount': fx.get('orig_amount'),
            'orig_currency': fx.get('currency'),
            'fx_rate': fx.get('rate'),
            'fx_rate_date': fx.get('rate_date'),
            'reverses_journal_id': header.get('reverses_journal_id'),
        })

        for l in lines:
            insert('journal_lines', {
                'journal_id': journal_id,
                'merchant_id': merchant_id,
                'entry_date': date,
                'account': l['account'],
                'party': str(l['party']) if l.get('party') is not None else None,
                'amount': l['amount'],
                'order_id': l.get('order_id') or header.get('order_id'),
                'product_id': l.get('product_id') or header.get('product_id'),
                'qty': l.get('qty'),
            })

    event_bus.broadcast('journal_posted', {'journalId': journal_id, 'kind': header['kind']}, merchant_id)
    return journal_id

def reverse(journal_id: int, ctx: Dict[str, Any]) -> int:
    """Post an exact inverse of a previous journal entry."""
    with tx():
        j = one("SELECT * FROM journals WHERE id = ?", journal_id)
        if not j:
            raise ValueError(f"journal {journal_id} not found")
        if j.get('reverses_journal_id'):
            raise ValueError("cannot reverse a reversal")

        existing_reversal = one("SELECT id FROM journals WHERE reverses_journal_id = ?", journal_id)
        if existing_reversal:
            raise ValueError(f"journal {journal_id} has already been reversed by #{existing_reversal['id']}")

        original_lines = all("SELECT * FROM journal_lines WHERE journal_id = ? ORDER BY id", journal_id)
        reversed_lines = [{
            'account': l['account'],
            'party': l['party'],
            'amount': -l['amount'],
            'order_id': l['order_id'],
            'product_id': l['product_id'],
            'qty': -l['qty'] if l.get('qty') is not None else None,
        } for l in original_lines]

        return post({
            'merchant_id': j['merchant_id'],
            'date': ctx.get('date') or today(),
            'kind': f"reversal_{j['kind']}",
            'memo': ctx.get('memo') or f"Reversal of #{journal_id}: {j.get('memo') or ''}".strip(),
            'source': ctx['source'],
            'created_by': ctx.get('actor') or ctx.get('created_by'),
            'order_id': j.get('order_id'),
            'product_id': j.get('product_id'),
            'reverses_journal_id': journal_id,
        }, reversed_lines)

def balance(merchant_id: int, account: str, party: Optional[str] = None, on_or_before: Optional[str] = None) -> int:
    """Calculate ledger balance for an account."""
    sql = "SELECT COALESCE(SUM(amount), 0) AS b FROM journal_lines WHERE merchant_id = ? AND account = ?"
    params = [merchant_id, account]
    if party is not None:
        sql += " AND party = ?"
        params.append(str(party))
    if on_or_before:
        sql += " AND entry_date <= ?"
        params.append(on_or_before)
    row = one(sql, *params)
    return int(row['b']) if row else 0

def balances_by_party(merchant_id: int, account: str, on_or_before: Optional[str] = None) -> Dict[str, int]:
    sql = "SELECT party, SUM(amount) AS b FROM journal_lines WHERE merchant_id = ? AND account = ?"
    params = [merchant_id, account]
    if on_or_before:
        sql += " AND entry_date <= ?"
        params.append(on_or_before)
    sql += " GROUP BY party HAVING SUM(amount) != 0"
    rows = all(sql, *params)
    return {r['party']: int(r['b']) for r in rows if r['party']}

def live_journals_for_order(order_id: int, kinds: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM journals WHERE order_id = ? AND reverses_journal_id IS NULL"
    params = [order_id]
    if kinds:
        placeholders = ", ".join(["?"] * len(kinds))
        sql += f" AND kind IN ({placeholders})"
        params.extend(kinds)
    rows = all(sql, *params)
    
    # Exclude those that have been reversed
    out = []
    for r in rows:
        rev = one("SELECT 1 FROM journals WHERE reverses_journal_id = ?", r['id'])
        if not rev:
            out.append(r)
    return out
