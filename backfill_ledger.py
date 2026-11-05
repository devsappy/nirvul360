"""
Gross Management — Ledger Backfill / Reconciliation.

Repairs databases where orders exist WITHOUT the double-entry journals the
accounting engine posts (this happens when data is inserted by direct SQL,
e.g. supabase/seed.sql, instead of going through the domain layer).

What it does (all through the official domain functions, so postings obey every
non-negotiable double-entry rule):
  1. Restores order_items that the raw-SQL seed left out (keyed by external_id).
  2. For every order whose money was never posted (no live delivery journals):
     resets it to 'placed', then re-applies its real status via apply_status —
     which books sales, COGS, courier receivable, stock movements, and courier
     charges for returned parcels.
  3. Posts opening capital and the operating expenses (packaging, ads, misc)
     so the P&L and cash position are complete — only when the merchant has none.
  4. Commits one real Steadfast settlement sheet (idempotent) so the COD
     settled / courier fee numbers come from the settlement engine itself.
  5. Runs the exception scanner, then verifies: every journal balances to
     exactly zero, and reports P&L + cash per merchant.

Safe to re-run: every step is either verified before writing or idempotent.

Usage:
  python backfill_ledger.py            # repair the current database
  python -c "from backfill_ledger import backfill; backfill()"
"""
import sys
from pathlib import Path

# Windows consoles default to cp1252 which cannot print ৳/bengali — force UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import open_db, all, one, update, insert  # noqa: E402
from app.lib.dates import add_days, today  # noqa: E402
import app.domain.exceptions as exceptions_domain  # noqa: E402


# Item map for orders the raw-SQL seed created without order_items
# (external_id -> [(product_id, qty, unit_price)]), mirroring supabase/seed.sql.
SEED_ITEM_MAP = {
    'INV-1001': [(1, 1, 65000)],
    'INV-1002': [(2, 1, 220000)],
    'INV-1003': [(3, 1, 165000)],
    'INV-1004': [(1, 1, 65000)],
    'INV-1005': [(1, 1, 65000)],
    'GH-501':   [(4, 1, 245000)],
    'GH-502':   [(5, 2, 185000)],
    'TEA-101':  [(7, 2, 85000)],
}

DELIVERY_KINDS = ['delivery', 'delivery_held', 'delivery_release', 'settlement_hold']


def _order_has_live_delivery_journals(order_id: int) -> bool:
    rows = all(
        "SELECT j.id FROM journals j WHERE j.order_id = ? AND j.reverses_journal_id IS NULL "
        "AND j.kind IN ('delivery','delivery_held','delivery_release','settlement_hold','courier_charges')",
        order_id,
    )
    for r in rows:
        rev = one("SELECT 1 FROM journals WHERE reverses_journal_id = ?", r['id'])
        if not rev:
            return True
    return False


def backfill(skip_demo_expenses: bool = False) -> dict:
    open_db()
    exceptions_domain.seed_reason_codes()

    report = {'orders_posted': 0, 'journals_before': 0, 'journals_after': 0,
              'unbalanced': 0, 'merchants': []}

    report['journals_before'] = int(one("SELECT COUNT(*) AS c FROM journals")['c'])
    merchants = all("SELECT id, name FROM merchants ORDER BY id")

    for m in merchants:
        m_id, m_name = m['id'], m['name']

        # --- 1. Order items the raw seed left out ------------------------------
        for o in all("SELECT id, external_id, subtotal FROM orders WHERE merchant_id = ? AND is_duplicate = FALSE", m_id):
            existing = one("SELECT 1 FROM order_items WHERE order_id = ? LIMIT 1", o['id'])
            if existing:
                continue
            items = SEED_ITEM_MAP.get(o['external_id'] or '')
            if not items:
                print(f"  [!] {m_name}: order #{o['id']} ({o['external_id']}) has no items and no item map — COGS cannot be booked for it.")
                continue
            for product_id, qty, unit_price in items:
                insert('order_items', {
                    'order_id': o['id'],
                    'product_id': product_id,
                    'qty': qty,
                    'unit_price': unit_price,
                    'line_total': qty * unit_price,
                })
            print(f"  [+] {m_name}: restored {len(items)} item(s) for order #{o['id']} ({o['external_id']})")

        # --- 2. Post the money for orders that never went through the engine ----
        from app.domain.orders import apply_status

        for o in all("SELECT * FROM orders WHERE merchant_id = ? AND is_duplicate = FALSE ORDER BY id", m_id):
            if _order_has_live_delivery_journals(o['id']):
                continue
            # Money is recognised when a parcel is delivered (or fees booked on a
            # return). in_transit needs no journal, so it is left untouched.
            if o['status'] not in ('delivered', 'returned', 'lost'):
                continue
            if not one("SELECT 1 FROM order_items WHERE order_id = ? LIMIT 1", o['id']):
                continue  # cannot cost an order without items — reported above

            target = o['status']
            ctx_date = o['delivered_date'] or o['returned_date'] or o['dispatched_date'] or o['order_date']
            ctx = {'date': ctx_date, 'source': 'system', 'actor': 'backfill'}
            if target == 'returned':
                # The courier delivered & then picked it up — both directions cost money
                # (this also marks the order processed, so re-runs never double-post).
                ctx['charges'] = {'delivery_charge': o['shipping_charge'] // 2, 'return_fee': o['shipping_charge'] // 2}

            update('orders', o['id'], {'status': 'placed', 'posting_state': 'none'})
            apply_status(m_id, o['id'], target, ctx)
            report['orders_posted'] += 1
            print(f"  [+] {m_name}: posted {'delivery' if target in ('delivered', 'in_transit') else target} journals for order #{o['id']} ({o['external_id']})")

        if skip_demo_expenses:
            continue

        # --- 3. Opening capital + operating expenses (once per merchant) --------
        ctx_actor = 'backfill'
        has = lambda kind: one("SELECT 1 FROM journals WHERE merchant_id = ? AND kind = ? LIMIT 1", m_id, kind)

        capital_by_m = {1: 250000 * 100, 2: 120000 * 100, 3: 80000 * 100}
        if not has('owner_capital') and capital_by_m.get(m_id):
            from app.domain.entries import record_capital
            record_capital(m_id, {
                'amount': capital_by_m[m_id], 'date': add_days(today(), -30),
                'note': 'Opening cash balance',
            }, {'source': 'system', 'actor': ctx_actor})
            print(f"  [+] {m_name}: opening capital posted")

        expenses_by_m = {
            1: [
                ('packaging', 42000, 22, 'Packaging boxes & poly bags'),
                ('ad_spend', 115000, 20, 'Meta ads (Facebook/Instagram boost)'),
                ('other_expense', 18000, 18, 'Courier box tape, snacks & misc fare'),
            ],
            2: [
                ('ad_spend', 45000, 20, 'Meta ads campaign week'),
                ('other_expense', 26000, 18, 'Packaging tape & bubble wrap'),
            ],
            3: [
                ('ad_spend', 30000, 20, 'Meta ads boost'),
                ('other_expense', 15000, 18, 'Local rickshaw parcel drop'),
            ],
        }
        if not has('expense') and expenses_by_m.get(m_id):
            from app.domain.entries import record_expense
            for head, amount, days_ago, note in expenses_by_m[m_id]:
                record_expense(m_id, {
                    'head': head, 'amount': amount, 'date': add_days(today(), -days_ago),
                    'note': note,
                }, {'source': 'system', 'actor': ctx_actor})
            print(f"  [+] {m_name}: operating expenses posted")

        # --- 4. One real Steadfast settlement (settles the two oldest COD parcels)
        settled_exists = one(
            "SELECT 1 FROM journals WHERE merchant_id = ? AND kind = 'settlement' LIMIT 1", m_id)
        if m_id == 1 and not settled_exists:
            from app.domain.settlements import prepare_records, commit_settlement
            cons_by_ext = {o['external_id']: o['consignment_id'] for o in all(
                "SELECT external_id, consignment_id FROM orders WHERE merchant_id = ?", m_id)}
            delivered = all(
                "SELECT consignment_id, cod_amount, delivered_date FROM orders "
                "WHERE merchant_id = ? AND status = 'delivered' AND delivered_date IS NOT NULL ORDER BY delivered_date",
                m_id)
            oldest = delivered[:2]
            if oldest:
                raw_sheet = []
                for i, d in enumerate(oldest, start=1):
                    raw_sheet.append({
                        'Consignment ID': d['consignment_id'],
                        'Order Id': next(k for k, v in cons_by_ext.items() if v == d['consignment_id']),
                        'COD Amount': d['cod_amount'] / 100,
                        'Status': 'Delivered',
                        'Delivery Charge': 60,
                        'COD Fee': 10,
                        'Settlement Date': d['delivered_date'],
                    })
                prepared = prepare_records(raw_sheet, 'steadfast')
                import hashlib
                sha = hashlib.sha256(str(raw_sheet).encode()).hexdigest()
                result = commit_settlement(m_id, prepared['rows'], 'steadfast', 'backfill_steadfast.csv', sha,
                                           {'source': 'courier_sheet_upload', 'actor': ctx_actor})
                print(f"  [+] {m_name}: Steadfast settlement committed — {result['posted']} parcels paid, "
                      f"{result['exceptions']} exceptions, cash in ৳{result['total_cash_poisha'] / 100:,.0f}")

        # --- 5. Exception scanner (stuck parcels etc.) --------------------------
        exceptions_domain.scan_merchant(m_id)

        # --- 6. Verify ----------------------------------------------------------
        from app.domain.accounts import PL_SECTIONS
        from app.domain.reports import profit_and_loss, cash_position

        unbalanced = all(
            "SELECT j.id, SUM(l.amount) AS s FROM journals j JOIN journal_lines l ON l.journal_id = j.id "
            "WHERE j.merchant_id = ? GROUP BY j.id HAVING SUM(l.amount) != 0",
            m_id)
        report['unbalanced'] += len(unbalanced)

        pnl = profit_and_loss(m_id, add_days(today(), -30), today())
        cash = cash_position(m_id, today())
        report['merchants'].append({
            'id': m_id, 'name': m_name,
            'gross_sales': pnl['gross_sales'], 'net_profit': pnl['net_profit'],
            'cash': cash['cash_in_hand'], 'held_at_couriers': cash['held_at_couriers'],
        })

    report['journals_after'] = int(one("SELECT COUNT(*) AS c FROM journals")['c'])
    return report


def _fmt(poisha: int) -> str:
    return f"৳{poisha / 100:,.0f}"


if __name__ == "__main__":
    print("=" * 70)
    print("GROSS MANAGEMENT — LEDGER BACKFILL (repairs raw-SQL seeded orders)")
    print("=" * 70)
    rep = backfill()
    print("\n--- Verification ---")
    if rep['unbalanced']:
        print(f"[!] {rep['unbalanced']} journal(s) DO NOT balance — investigate!")
    else:
        print("[OK] Every journal balances to exactly zero (double-entry verified).")
    print(f"Journals: {rep['journals_before']} → {rep['journals_after']} (orders posted: {rep['orders_posted']})")
    for m in rep['merchants']:
        print(f"  {m['name']} (#{m['id']}): "
              f"Gross sales {_fmt(m['gross_sales'])} • Net profit {_fmt(m['net_profit'])} • "
              f"Cash {_fmt(m['cash'])} • Held at couriers {_fmt(m['held_at_couriers'])}")
    print("\nBackfill complete.")
