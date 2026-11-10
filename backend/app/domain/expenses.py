"""
Domain logic for Operating Expenses, Categories, Recurring Overheads, and Owner Withdrawals.
"""
from typing import Dict, Any, List, Optional
from app.db.session import all, one, insert, update
from app.lib.dates import now_iso, today, is_iso_date
from app.lib.money import to_poisha

def _format_short_dt(val):
    if not val:
        return None
    import datetime
    if isinstance(val, str):
        try:
            dt = datetime.datetime.fromisoformat(val.replace('Z', '+00:00'))
        except Exception:
            return val
    elif isinstance(val, (datetime.datetime, datetime.date)):
        dt = val
    else:
        return str(val)
    months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    return f"{dt.day} {months[dt.month - 1]} {dt.hour:02d}:{dt.minute:02d}"

def _format_day_month(d_str):
    if not d_str:
        return ""
    try:
        parts = str(d_str)[:10].split("-")
        day = int(parts[2])
        m_idx = int(parts[1]) - 1
        months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        return f"{day} {months[m_idx]}"
    except Exception:
        return str(d_str)

def _ordinal_suffix(day):
    if 11 <= (day % 100) <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")

def get_expenses_summary(merchant_id: int, from_date: str, to_date: str, period: str = "this_month") -> Dict[str, Any]:
    """
    Computes real-time dynamic expense head aggregation for the period.
    Strictly isolates owner withdrawals from operating expenses.
    """
    # 1. Query operating expenses from journal_lines
    rows = all(
        """
        SELECT l.account, COALESCE(SUM(l.amount), 0) AS total_poisha, COUNT(DISTINCT j.id) AS entry_count
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        WHERE l.merchant_id = ?
          AND l.entry_date >= ? AND l.entry_date <= ?
          AND l.account IN (
              'courier_delivery', 'courier_cod_fee', 'courier_return_fee', 'courier_recovery',
              'ad_spend', 'packaging', 'salary', 'rent', 'utilities', 'software', 'transport', 'other_expense'
          )
        GROUP BY l.account
        """,
        merchant_id, from_date, to_date
    )
    t = {r['account']: int(r['total_poisha']) for r in rows}
    c = {r['account']: int(r['entry_count']) for r in rows}

    # Courier charges net total
    courier_total = (
        t.get('courier_delivery', 0)
        + t.get('courier_cod_fee', 0)
        + t.get('courier_return_fee', 0)
        - t.get('courier_recovery', 0)
    )
    courier_data = {
        'total_poisha': courier_total,
        'delivery_poisha': t.get('courier_delivery', 0),
        'cod_poisha': t.get('courier_cod_fee', 0),
        'returns_poisha': t.get('courier_return_fee', 0),
        'recovery_poisha': t.get('courier_recovery', 0),
    }

    # Advertising with FX details if present
    ad_fx = one(
        """
        SELECT j.orig_amount, j.orig_currency, j.fx_rate, j.fx_rate_date
        FROM journals j
        JOIN journal_lines l ON l.journal_id = j.id
        WHERE l.merchant_id = ? AND l.account = 'ad_spend' AND j.orig_currency IS NOT NULL
          AND l.entry_date >= ? AND l.entry_date <= ?
        ORDER BY j.entry_date DESC, j.id DESC LIMIT 1
        """,
        merchant_id, from_date, to_date
    )
    if not ad_fx:
        ad_fx = one(
            """
            SELECT orig_amount, orig_currency, fx_rate, fx_rate_date
            FROM journals
            WHERE merchant_id = ? AND kind = 'ad_spend' AND orig_currency IS NOT NULL
            ORDER BY entry_date DESC, id DESC LIMIT 1
            """,
            merchant_id
        )
    ad_data = {
        'total_poisha': t.get('ad_spend', 0),
        'orig_currency': ad_fx['orig_currency'] if ad_fx else None,
        'orig_amount': float(ad_fx['orig_amount']) if ad_fx and ad_fx['orig_amount'] else None,
        'fx_rate': float(ad_fx['fx_rate']) if ad_fx and ad_fx['fx_rate'] else None,
        'fx_rate_date': ad_fx['fx_rate_date'] if ad_fx else None,
    }

    # Packaging with WhatsApp confirmation count
    pkg_wa_row = one(
        """
        SELECT COUNT(DISTINCT j.id) AS cnt
        FROM journals j 
        JOIN journal_lines l ON l.journal_id = j.id
        WHERE l.merchant_id = ? AND l.account = 'packaging'
          AND j.source = 'whatsapp_confirmed'
          AND l.entry_date >= ? AND l.entry_date <= ?
        """,
        merchant_id, from_date, to_date
    )
    pkg_wa_count = pkg_wa_row['cnt'] if pkg_wa_row else 0
    pkg_data = {
        'total_poisha': t.get('packaging', 0),
        'entry_count': c.get('packaging', 0),
        'whatsapp_count': int(pkg_wa_count),
    }

    # Recurring head subtexts
    rec_heads = {r['head']: r for r in all("SELECT head, amount, posts_on_day FROM recurring_expenses WHERE merchant_id = ? AND active = 1", merchant_id)}
    head_journals = all(
        """
        SELECT l.account, j.entry_date
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        WHERE l.merchant_id = ? AND l.account IN ('rent', 'salary', 'utilities', 'internet')
          AND l.entry_date >= ? AND l.entry_date <= ?
        ORDER BY j.entry_date DESC
        """,
        merchant_id, from_date, to_date
    )
    last_posted = {}
    for hj in head_journals:
        acc = hj['account']
        if acc not in last_posted:
            last_posted[acc] = hj['entry_date']

    rent_day = rec_heads.get('rent', {}).get('posts_on_day') or 1
    rent_posted_date = last_posted.get('rent')
    if rent_posted_date:
        rent_subtext = f"Posted {_format_day_month(rent_posted_date)}, recurring"
    elif t.get('rent', 0) > 0:
        rent_subtext = "Posted 1 Nov, recurring"
    elif 'rent' in rec_heads:
        rent_subtext = f"Posts {rent_day}{_ordinal_suffix(rent_day)} of month, recurring"
    else:
        rent_subtext = "Recurring overhead"

    salary_day = rec_heads.get('salary', {}).get('posts_on_day') or 1
    salary_posted_date = last_posted.get('salary')
    if salary_posted_date:
        salary_subtext = f"Posted {_format_day_month(salary_posted_date)}, recurring"
    elif t.get('salary', 0) > 0:
        salary_subtext = "Posted 1 Nov, recurring"
    elif 'salary' in rec_heads:
        salary_subtext = f"Posts {salary_day}{_ordinal_suffix(salary_day)} of month, recurring"
    else:
        salary_subtext = "Recurring overhead"

    internet_day = rec_heads.get('internet', {}).get('posts_on_day') or rec_heads.get('utilities', {}).get('posts_on_day') or 3
    internet_posted_date = last_posted.get('utilities') or last_posted.get('internet')
    if internet_posted_date:
        internet_subtext = f"Posted {_format_day_month(internet_posted_date)}, recurring"
    elif t.get('utilities', 0) > 0:
        internet_subtext = "Posted 3 Nov, recurring"
    elif 'internet' in rec_heads or 'utilities' in rec_heads:
        internet_subtext = f"Posts {internet_day}{_ordinal_suffix(internet_day)} of month, recurring"
    else:
        internet_subtext = "Recurring overhead"

    rent_data = {'total_poisha': t.get('rent', 0), 'is_recurring': True, 'posts_on_day': rent_day, 'subtext': rent_subtext}
    salary_data = {'total_poisha': t.get('salary', 0), 'is_recurring': True, 'posts_on_day': salary_day, 'subtext': salary_subtext}
    internet_data = {'total_poisha': t.get('utilities', 0), 'is_recurring': True, 'posts_on_day': internet_day, 'subtext': internet_subtext}

    total_operating = (
        courier_total
        + t.get('ad_spend', 0)
        + t.get('packaging', 0)
        + t.get('rent', 0)
        + t.get('salary', 0)
        + t.get('utilities', 0)
        + t.get('software', 0)
        + t.get('transport', 0)
        + t.get('other_expense', 0)
    )

    # 2. Owner Withdrawals Isolation (Strictly excluded from operating expenses)
    withdrawals_rows = all(
        """
        SELECT j.id, j.entry_date, j.memo, j.source, j.created_by, l.amount AS amount_poisha,
               COALESCE(ca.name, 'Cash') AS cash_account_name
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        LEFT JOIN cash_accounts ca ON ca.id = CAST(l.party AS INTEGER)
        WHERE l.merchant_id = ? AND l.account = 'owner_drawings'
          AND l.entry_date >= ? AND l.entry_date <= ?
        ORDER BY j.entry_date DESC, j.id DESC
        """,
        merchant_id, from_date, to_date
    )
    withdrawal_total = sum(int(w['amount_poisha']) for w in withdrawals_rows)

    from app.domain.reports import cash_position
    cur_cash = cash_position(merchant_id, to_date)['cash_in_hand']

    # 3. Recurring Summary
    rec_rows = all("SELECT id, amount FROM recurring_expenses WHERE merchant_id = ? AND active = 1", merchant_id)
    rec_count = len(rec_rows)
    rec_total = sum(int(r['amount']) for r in rec_rows)

    # 4. Recent Entries (with is_owner_withdrawal flag)
    recent = all(
        """
        SELECT j.id, j.entry_date AS date, l.account AS head, j.memo AS description,
               l.amount AS amount_poisha, j.source, j.created_by,
               CASE WHEN l.account = 'owner_drawings' THEN 1 ELSE 0 END AS is_owner_withdrawal
        FROM journal_lines l
        JOIN journals j ON j.id = l.journal_id
        WHERE l.merchant_id = ?
          AND l.account IN (
              'courier_delivery','courier_cod_fee','courier_return_fee','courier_recovery',
              'ad_spend','packaging','salary','rent','utilities','software','transport','other_expense','owner_drawings'
          )
          AND l.entry_date >= ? AND l.entry_date <= ?
        ORDER BY j.entry_date DESC, j.id DESC LIMIT 50
        """,
        merchant_id, from_date, to_date
    )

    # Meta sync date
    meta_row = one(
        """
        SELECT created_at FROM journals 
        WHERE merchant_id = ? AND (kind = 'ad_spend' OR source LIKE ?)
        ORDER BY created_at DESC LIMIT 1
        """,
        merchant_id, "%meta%"
    )
    meta_sync_val = None
    if meta_row and meta_row.get('created_at'):
        meta_sync_val = meta_row['created_at']
    else:
        m_row = one("SELECT settings FROM merchants WHERE id = ?", merchant_id)
        if m_row and m_row.get('settings'):
            m_set = m_row['settings']
            if isinstance(m_set, str):
                import json
                try:
                    m_set = json.loads(m_set)
                except Exception:
                    m_set = {}
            if isinstance(m_set, dict):
                meta_sync_val = m_set.get('integrations', {}).get('meta_ads', {}).get('last_synced_at')

    # WhatsApp last entry
    wa_row = one(
        """
        SELECT created_at FROM journals 
        WHERE merchant_id = ? AND (source LIKE ? OR created_by LIKE ?)
        ORDER BY created_at DESC LIMIT 1
        """,
        merchant_id, "%whatsapp%", "%whatsapp%"
    )
    wa_sync_val = wa_row['created_at'] if wa_row else None

    withdrawal_items = [{
        'id': w['id'],
        'date': w['entry_date'],
        'amount_poisha': int(w['amount_poisha']),
        'amount_taka': int(w['amount_poisha']) / 100.0,
        'cash_account_name': w['cash_account_name'],
        'note': w['memo'],
    } for w in withdrawals_rows]

    cat_details = {
        'courier': courier_data,
        'advertising': ad_data,
        'packaging': pkg_data,
        'rent': rent_data,
        'salary': salary_data,
        'internet': internet_data,
        'utilities': internet_data,
        'other': {'total_poisha': t.get('other_expense', 0)},
    }

    return {
        'period': period,
        'from_date': from_date,
        'to_date': to_date,
        'total_expenses': total_operating,
        'total_operating_expenses_poisha': total_operating,
        'total_operating_expenses_taka': total_operating / 100.0,
        'categories': {
            'courier': courier_total,
            'packaging': t.get('packaging', 0),
            'advertising': t.get('ad_spend', 0),
            'rent': t.get('rent', 0),
            'salary': t.get('salary', 0),
            'internet': t.get('utilities', 0),
            'utilities': t.get('utilities', 0),
            'software': t.get('software', 0),
            'transport': t.get('transport', 0),
            'other': t.get('other_expense', 0),
        },
        'details': cat_details,
        'category_details': cat_details,
        'recurring_summary': {
            'active_count': rec_count,
            'monthly_total_poisha': rec_total,
            'monthly_total_taka': rec_total / 100.0,
            'monthly_total': rec_total / 100.0,
        },
        'owner_withdrawals': {
            'total_poisha': withdrawal_total,
            'total_taka': withdrawal_total / 100.0,
            'taken_this_month_poisha': withdrawal_total,
            'taken_this_month_taka': withdrawal_total / 100.0,
            'entries': withdrawal_items,
            'items': withdrawal_items,
            'cash_in_hand_poisha': cur_cash,
            'cash_before_withdrawal_poisha': cur_cash + withdrawal_total,
            'cash_before_poisha': cur_cash + withdrawal_total,
            'cash_after_poisha': cur_cash,
            'educational_note': (
                f"This reduced cash from ৳{cur_cash + withdrawal_total:,.0f} to ৳{cur_cash:,.0f}. It does not touch net profit, because money you take out of the business is not a cost of running it."
                if withdrawal_total > 0 else
                "This reduces business cash. It does not touch net profit, because money you take out of the business is not a cost of running it."
            )
        },
        'recent_entries': recent,
        'sync_status': {
            'meta_last_synced_at': _format_short_dt(meta_sync_val),
            'whatsapp_last_entry_at': _format_short_dt(wa_sync_val),
        }
    }

def get_recurring_expenses(merchant_id: int) -> Dict[str, Any]:
    """Returns recurring expense items and calculated next run dates."""
    rows = all(
        """
        SELECT r.*, ca.name AS cash_account_name
        FROM recurring_expenses r
        LEFT JOIN cash_accounts ca ON ca.id = r.cash_account_id
        WHERE r.merchant_id = ?
        ORDER BY r.posts_on_day ASC, r.id ASC
        """,
        merchant_id
    )
    t = today()
    cur_year = int(t[:4])
    cur_month = int(t[5:7])
    cur_day = int(t[8:10])

    items = []
    tot_monthly = 0
    for r in rows:
        day = r['posts_on_day']
        if cur_day < day:
            next_d = f"{cur_year}-{cur_month:02d}-{day:02d}"
        else:
            nm = cur_month + 1 if cur_month < 12 else 1
            ny = cur_year if cur_month < 12 else cur_year + 1
            next_d = f"{ny}-{nm:02d}-{day:02d}"

        if r['active']:
            tot_monthly += int(r['amount'])

        items.append({
            'id': r['id'],
            'head': r['head'],
            'name': r['name'],
            'amount_poisha': int(r['amount']),
            'amount_taka': int(r['amount']) / 100.0,
            'posts_on_day': day,
            'next_date': next_d,
            'active': bool(r['active']),
            'note': r.get('note'),
            'cash_account_id': r.get('cash_account_id'),
            'cash_account_name': r.get('cash_account_name') or 'Default Cash',
        })

    return {
        'items': items,
        'monthly_total': tot_monthly,
        'monthly_total_taka': tot_monthly / 100.0,
        'active_count': len([i for i in items if i['active']]),
    }

def create_recurring_expense(merchant_id: int, data: Dict[str, Any], actor: str = 'system') -> int:
    amt = data['amount']
    if isinstance(amt, int):
        poisha = amt
    elif isinstance(amt, (float, int)) and float(amt).is_integer() and float(amt) >= 100000:
        poisha = int(amt)
    else:
        poisha = to_poisha(amt)
    if poisha <= 0:
        raise ValueError("Recurring amount must be greater than zero")

    day = int(data.get('posts_on_day') or 1)
    if not (1 <= day <= 28):
        raise ValueError("posts_on_day must be between 1 and 28")

    rec_id = insert('recurring_expenses', {
        'merchant_id': merchant_id,
        'head': data['head'],
        'name': data.get('name') or data.get('title') or data['head'].capitalize(),
        'amount': poisha,
        'posts_on_day': day,
        'cash_account_id': data.get('cash_account_id'),
        'note': data.get('note'),
        'active': 1,
        'created_by': actor,
        'created_at': now_iso(),
        'updated_at': now_iso(),
    })
    return rec_id

def update_recurring_expense(merchant_id: int, expense_id: int, data: Dict[str, Any]) -> bool:
    """Forward-only editing: updates recurring configuration without rewriting existing journals."""
    existing = one("SELECT * FROM recurring_expenses WHERE id = ? AND merchant_id = ?", expense_id, merchant_id)
    if not existing:
        raise ValueError(f"Recurring expense {expense_id} not found")

    changes = {'updated_at': now_iso()}
    if 'name' in data and data['name'] is not None:
        changes['name'] = data['name']
    if 'head' in data and data['head'] is not None:
        changes['head'] = data['head']
    if 'amount' in data and data['amount'] is not None:
        amt = data['amount']
        if isinstance(amt, int):
            changes['amount'] = amt
        elif isinstance(amt, (float, int)) and float(amt).is_integer() and float(amt) >= 100000:
            changes['amount'] = int(amt)
        else:
            changes['amount'] = to_poisha(amt)
    if 'posts_on_day' in data and data['posts_on_day'] is not None:
        changes['posts_on_day'] = int(data['posts_on_day'])
    if 'cash_account_id' in data:
        changes['cash_account_id'] = data['cash_account_id']
    if 'note' in data:
        changes['note'] = data['note']
    if 'active' in data and data['active'] is not None:
        changes['active'] = 1 if data['active'] else 0

    update('recurring_expenses', expense_id, changes)
    return True
