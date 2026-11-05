"""
High-performance Orders & Deliveries CSV bulk import engine.
Parses Pathao, Steadfast, and RedX delivery exports, creates orders,
versioned products, order items, and posts double-entry ledger journals.
"""
import io
import re
import csv
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from app.db.session import get_db, is_postgres, tx, all as db_all, one as db_one
from app.lib.dates import now_iso, today


def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    # Strip quotes (e.g. '""1621""' -> '1621')
    s = str(val).strip()
    return re.sub(r'^["\']+|["\']+$', '', s).strip()


def _parse_poisha(val: Any) -> int:
    if val is None:
        return 0
    s = str(val).replace(',', '').strip()
    if not s or s.lower() in ('n/a', 'na', 'none', '-'):
        return 0
    try:
        return int(round(float(s) * 100))
    except (ValueError, TypeError):
        return 0


def parse_courier_csv(file_bytes: bytes, filename: str, courier: str = 'pathao') -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parses a courier CSV file and extracts normalized order records.
    """
    # Detect encoding
    for enc in ('utf-8-sig', 'utf-8', 'cp1252', 'latin1'):
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = file_bytes.decode('utf-8', errors='replace')

    f = io.StringIO(text)
    reader = csv.reader(f)
    try:
        raw_headers = next(reader)
    except StopIteration:
        return [], ["File is empty"]

    # Match headers case-insensitively
    headers_clean = [h.strip().lower() for h in raw_headers]

    def find_col(*candidates: str) -> Optional[int]:
        for c in candidates:
            c_low = c.lower()
            for idx, h in enumerate(headers_clean):
                if h == c_low or c_low in h:
                    return idx
        return None

    idx_consignment = find_col('order consignment id', 'consignment id', 'consignment', 'tracking id', 'tracking code', 'parcel id')
    idx_created_at = find_col('order created at', 'created at', 'date', 'order date')
    idx_merchant_ref = find_col('merchant order id', 'order id', 'order code', 'reference', 'merchant ref')
    idx_name = find_col('recipient name', 'customer name', 'customer', 'name', 'receiver name')
    idx_address = find_col('recipient address', 'address', 'customer address')
    idx_phone = find_col('recipient phone', 'phone', 'customer phone', 'mobile')
    idx_collectable = find_col('collectable amount', 'collected amount', 'cod amount', 'cod', 'amount')
    idx_collected = find_col('collected amount', 'cod collected')
    idx_delivery_fee = find_col('delivery fee', 'delivery charge', 'total fee')
    idx_cod_fee = find_col('cod fee', 'cod charge')
    idx_status = find_col('order status', 'status', 'delivery status')
    idx_status_updated = find_col('order status updated at', 'updated at', 'status updated at')
    idx_desc = find_col('order description', 'description', 'items', 'item description')
    idx_sorted_at = find_col('sorted at', 'dispatched at', 'dispatch date')

    warnings = []
    if idx_consignment is None:
        warnings.append("Consignment ID column not found in sheet")
        return [], warnings

    records: List[Dict[str, Any]] = []
    seen_ext = set()
    for row_no, row in enumerate(reader, start=2):
        if not row or not any(row):
            continue

        def get_val(idx: Optional[int]) -> str:
            if idx is not None and idx < len(row):
                return _clean_str(row[idx])
            return ""

        consignment = get_val(idx_consignment)
        if not consignment:
            continue

        merchant_ref = get_val(idx_merchant_ref)
        if not merchant_ref or merchant_ref.upper() == 'N/A' or merchant_ref in seen_ext:
            ext_id = f"{merchant_ref}_{consignment}" if (merchant_ref and merchant_ref.upper() != 'N/A') else consignment
        else:
            ext_id = merchant_ref
        seen_ext.add(ext_id)

        created_at_raw = get_val(idx_created_at)
        order_date = created_at_raw[:10] if (created_at_raw and len(created_at_raw) >= 10) else today()
        placed_at = created_at_raw if created_at_raw else f"{order_date} 00:00:00"

        status_raw = get_val(idx_status) or 'Placed'
        status_low = status_raw.lower()

        # Map to canonical order status
        if any(w in status_low for w in ('delivered', 'exchange', 'partial delivery', 'successful')):
            status = 'delivered'
        elif any(w in status_low for w in ('return pending', 'returned to merchant', 'paid return', 'return', 'returned')):
            status = 'returned'
        elif any(w in status_low for w in ('waiting for pickup', 'on the way', 'in transit', 'pickup')):
            status = 'in_transit'
        elif any(w in status_low for w in ('failed', 'cancel', 'cancelled')):
            status = 'cancelled'
        else:
            status = 'placed'

        status_updated_raw = get_val(idx_status_updated)
        status_date = status_updated_raw[:10] if (status_updated_raw and len(status_updated_raw) >= 10) else order_date
        sorted_date = get_val(idx_sorted_at)[:10] if get_val(idx_sorted_at) else order_date

        total_poisha = _parse_poisha(get_val(idx_collectable))
        collected_poisha = _parse_poisha(get_val(idx_collected))
        delivery_fee_poisha = _parse_poisha(get_val(idx_delivery_fee))
        cod_fee_poisha = _parse_poisha(get_val(idx_cod_fee))

        desc = get_val(idx_desc)
        clean_desc = re.sub(r'\s+', ' ', desc).strip() if desc else ""
        product_name = clean_desc[:80] if clean_desc else "DropX Standard Parcel"

        records.append({
            'row_no': row_no,
            'consignment_id': consignment,
            'external_id': ext_id,
            'order_date': order_date,
            'placed_at': placed_at,
            'customer_name': get_val(idx_name) or "Guest Customer",
            'customer_phone': get_val(idx_phone) or None,
            'address': get_val(idx_address) or None,
            'total': total_poisha,
            'collected': collected_poisha,
            'delivery_fee': delivery_fee_poisha,
            'cod_fee': cod_fee_poisha,
            'status': status,
            'status_raw': status_raw,
            'delivered_date': status_date if status == 'delivered' else None,
            'returned_date': status_date if status == 'returned' else None,
            'dispatched_date': sorted_date,
            'product_name': product_name,
            'courier': courier,
        })

    return records, warnings


def import_courier_orders(
    merchant_id: int,
    records: List[Dict[str, Any]],
    courier: str = 'pathao',
    actor: str = 'system'
) -> Dict[str, Any]:
    """
    High-speed bulk ingestion into PostgreSQL/SQLite.
    Inserts missing products, orders, items, and double-entry journals.
    """
    if not records:
        return {'ok': True, 'imported': 0, 'delivered': 0, 'returned': 0, 'in_transit': 0, 'total_sales_poisha': 0}

    conn = get_db()
    is_pg = is_postgres()
    now_ts = now_iso()

    # 1. Deduplication check: check existing consignment IDs
    existing = set(
        r['consignment_id']
        for r in db_all("SELECT consignment_id FROM orders WHERE merchant_id = ? AND consignment_id IS NOT NULL", merchant_id)
    )

    new_records = [r for r in records if r['consignment_id'] not in existing]
    if not new_records:
        return {
            'ok': True,
            'total_rows': len(records),
            'skipped_existing': len(records),
            'imported': 0,
            'delivered': 0,
            'returned': 0,
            'in_transit': 0,
            'total_sales_poisha': 0,
        }

    # 2. Extract and upsert distinct products in a single batch
    prod_names = list(set(r['product_name'] for r in new_records))
    existing_prods = {
        p['name']: p['id']
        for p in db_all("SELECT id, name FROM products WHERE merchant_id = ?", merchant_id)
    }

    prods_to_insert = [name for name in prod_names if name not in existing_prods]
    if prods_to_insert:
        if is_pg:
            from psycopg2.extras import execute_values
            prod_tuples = [
                (merchant_id, f"SKU-{len(existing_prods) + idx + 1:04d}", p_name, 0, True, 'courier_sheet_upload', actor, now_ts, now_ts)
                for idx, p_name in enumerate(prods_to_insert)
            ]
            with conn.cursor() as cur:
                inserted_p = execute_values(
                    cur,
                    "INSERT INTO products (merchant_id, sku, name, selling_price, active, source, created_by, created_at, updated_at) "
                    "VALUES %s RETURNING id, name",
                    prod_tuples,
                    fetch=True
                )
                cost_tuples = []
                for p_row in inserted_p:
                    existing_prods[p_row['name']] = p_row['id']
                    cost_tuples.append((
                        merchant_id, p_row['id'], 25000, '2026-01-01', 'stated', 'courier_sheet_upload', actor, now_ts
                    ))
                execute_values(
                    cur,
                    "INSERT INTO product_price_history (merchant_id, product_id, purchase_price, effective_from, method, source, created_by, created_at) "
                    "VALUES %s",
                    cost_tuples
                )
        else:
            for idx, p_name in enumerate(prods_to_insert):
                sku = f"SKU-{len(existing_prods) + 1:04d}"
                cur = conn.execute(
                    "INSERT INTO products (merchant_id, sku, name, selling_price, active, source, created_by, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (merchant_id, sku, p_name, 0, 1, 'courier_sheet_upload', actor, now_ts, now_ts)
                )
                p_id = cur.lastrowid
                conn.execute(
                    "INSERT INTO product_price_history (merchant_id, product_id, purchase_price, effective_from, method, source, created_by, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (merchant_id, p_id, 25000, '2026-01-01', 'stated', 'courier_sheet_upload', actor, now_ts)
                )
                existing_prods[p_name] = p_id

    # 3. Batch insert orders
    # To keep network payload reasonable, chunk by 500
    chunk_size = 500
    all_inserted_orders: List[Dict[str, Any]] = []

    for i in range(0, len(new_records), chunk_size):
        chunk = new_records[i:i + chunk_size]
        if is_pg:
            from psycopg2.extras import execute_values
            sql_orders = (
                "INSERT INTO orders ("
                "  merchant_id, external_id, order_date, placed_at, customer_name, customer_phone, "
                "  address, subtotal, discount, shipping_charge, total, advance_paid, cod_amount, "
                "  courier, consignment_id, status, status_changed_at, delivered_date, returned_date, "
                "  dispatched_date, posting_state, is_duplicate, source, created_by, created_at, updated_at"
                ") VALUES %s "
                "RETURNING id, consignment_id, status, total, delivery_fee, cod_fee, order_date, delivered_date, returned_date"
            )
            # Create a lookup for fees per consignment in this chunk
            fee_lookup = {r['consignment_id']: r for r in chunk}
            order_tuples = []
            for r in chunk:
                order_tuples.append((
                    merchant_id,
                    r['external_id'],
                    r['order_date'],
                    r['placed_at'],
                    r['customer_name'],
                    r['customer_phone'],
                    r['address'],
                    r['total'],  # subtotal
                    0,           # discount
                    r['delivery_fee'],
                    r['total'],  # total
                    0,           # advance_paid
                    r['total'],  # cod_amount
                    courier,
                    r['consignment_id'],
                    r['status'],
                    now_ts,
                    r['delivered_date'],
                    r['returned_date'],
                    r['dispatched_date'],
                    'none',
                    False,
                    'courier_sheet_upload',
                    actor,
                    now_ts,
                    now_ts,
                ))

            with conn.cursor() as cur:
                # We need RETURNING delivery_fee from input data, so we reconstruct
                cur_res = execute_values(
                    cur,
                    "INSERT INTO orders ("
                    "  merchant_id, external_id, order_date, placed_at, customer_name, customer_phone, "
                    "  address, subtotal, discount, shipping_charge, total, advance_paid, cod_amount, "
                    "  courier, consignment_id, status, status_changed_at, delivered_date, returned_date, "
                    "  dispatched_date, posting_state, is_duplicate, source, created_by, created_at, updated_at"
                    ") VALUES %s "
                    "RETURNING id, consignment_id, status, total, order_date, delivered_date, returned_date",
                    order_tuples,
                    fetch=True
                )
                for row_dict in cur_res:
                    rec_ref = fee_lookup.get(row_dict['consignment_id'], {})
                    all_inserted_orders.append({
                        **dict(row_dict),
                        'product_name': rec_ref.get('product_name'),
                        'delivery_fee': rec_ref.get('delivery_fee', 0),
                        'cod_fee': rec_ref.get('cod_fee', 0),
                    })
        else:
            for r in chunk:
                cur = conn.execute(
                    "INSERT INTO orders ("
                    "  merchant_id, external_id, order_date, placed_at, customer_name, customer_phone, "
                    "  address, subtotal, discount, shipping_charge, total, advance_paid, cod_amount, "
                    "  courier, consignment_id, status, status_changed_at, delivered_date, returned_date, "
                    "  dispatched_date, posting_state, is_duplicate, source, created_by, created_at, updated_at"
                    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        merchant_id, r['external_id'], r['order_date'], r['placed_at'],
                        r['customer_name'], r['customer_phone'], r['address'],
                        r['total'], 0, r['delivery_fee'], r['total'], 0, r['total'],
                        courier, r['consignment_id'], r['status'], now_ts,
                        r['delivered_date'], r['returned_date'], r['dispatched_date'],
                        'none', 0, 'courier_sheet_upload', actor, now_ts, now_ts
                    )
                )
                all_inserted_orders.append({
                    'id': cur.lastrowid,
                    'consignment_id': r['consignment_id'],
                    'status': r['status'],
                    'total': r['total'],
                    'order_date': r['order_date'],
                    'delivered_date': r['delivered_date'],
                    'returned_date': r['returned_date'],
                    'product_name': r['product_name'],
                    'delivery_fee': r['delivery_fee'],
                    'cod_fee': r['cod_fee'],
                })

    # 4. Batch insert order items
    item_tuples = []
    for o in all_inserted_orders:
        p_id = existing_prods.get(o['product_name']) or list(existing_prods.values())[0]
        item_tuples.append((o['id'], p_id, 1, o['total'], o['total']))

    if is_pg:
        from psycopg2.extras import execute_values
        with conn.cursor() as cur:
            execute_values(
                cur,
                "INSERT INTO order_items (order_id, product_id, qty, unit_price, line_total) VALUES %s",
                item_tuples
            )
    else:
        conn.executemany(
            "INSERT INTO order_items (order_id, product_id, qty, unit_price, line_total) VALUES (?, ?, ?, ?, ?)",
            item_tuples
        )

    # 5. Batch insert Double-Entry Ledger Journals
    delivered_orders = [o for o in all_inserted_orders if o['status'] == 'delivered' and o['total'] > 0]
    returned_orders = [o for o in all_inserted_orders if o['status'] == 'returned']

    # For delivered orders: 1 delivery journal (sales + courier receivable + COGS + inventory)
    #                      1 courier charges journal (delivery fee expense + courier payable)
    # For returned orders:  1 courier charges journal (delivery fee expense + courier payable)

    journal_tuples = []
    # (merchant_id, entry_date, kind, memo, source, created_by, created_at, order_id)
    for o in delivered_orders:
        d_date = o['delivered_date'] or o['order_date'] or today()
        journal_tuples.append((
            merchant_id, d_date, 'delivery',
            f"Delivered order #{o['id']} ({o['consignment_id']}) — revenue recognised",
            'courier_sheet_upload', actor, now_ts, o['id'], 'delivery'
        ))
        if o['delivery_fee'] > 0:
            journal_tuples.append((
                merchant_id, d_date, 'courier_charges',
                f"Courier delivery charges #{o['id']}",
                'courier_sheet_upload', actor, now_ts, o['id'], 'courier_charges'
            ))

    for o in returned_orders:
        r_date = o['returned_date'] or o['order_date'] or today()
        if o['delivery_fee'] > 0:
            journal_tuples.append((
                merchant_id, r_date, 'courier_charges',
                f"Courier return charges #{o['id']}",
                'courier_sheet_upload', actor, now_ts, o['id'], 'courier_charges'
            ))

    # Insert journals and get their IDs
    if is_pg and journal_tuples:
        from psycopg2.extras import execute_values
        # Strip the tag column when inserting
        insertable_j = [j[:8] for j in journal_tuples]
        with conn.cursor() as cur:
            inserted_j = execute_values(
                cur,
                "INSERT INTO journals (merchant_id, entry_date, kind, memo, source, created_by, created_at, order_id) "
                "VALUES %s RETURNING id, order_id, kind, entry_date",
                insertable_j,
                fetch=True
            )

        # Build order_id + kind -> journal_id map
        # Note: an order might have both 'delivery' and 'courier_charges'
        j_by_order_kind = {}
        for r_j in inserted_j:
            j_by_order_kind[(r_j['order_id'], r_j['kind'])] = r_j['id']

        # Now build journal_lines
        lines_tuples = []
        # (journal_id, merchant_id, entry_date, account, party, amount, order_id, product_id, qty)
        for o in delivered_orders:
            d_date = o['delivered_date'] or o['order_date'] or today()
            j_id = j_by_order_kind.get((o['id'], 'delivery'))
            if j_id:
                p_id = existing_prods.get(o['product_name']) or list(existing_prods.values())[0]
                cost = int(round(o['total'] * 0.5))  # 50% cost rule
                # Debit Courier Receivable (+total)
                lines_tuples.append((j_id, merchant_id, d_date, 'courier_receivable', courier, o['total'], o['id'], None, None))
                # Credit Sales Revenue (-total)
                lines_tuples.append((j_id, merchant_id, d_date, 'sales', None, -o['total'], o['id'], None, None))
                # Debit COGS (+cost)
                lines_tuples.append((j_id, merchant_id, d_date, 'cogs', None, cost, o['id'], p_id, 1))
                # Credit Inventory (-cost)
                lines_tuples.append((j_id, merchant_id, d_date, 'inventory', None, -cost, o['id'], p_id, 1))

            c_jid = j_by_order_kind.get((o['id'], 'courier_charges'))
            if c_jid and o['delivery_fee'] > 0:
                # Debit Courier Delivery Expense (+fee)
                lines_tuples.append((c_jid, merchant_id, d_date, 'courier_delivery', None, o['delivery_fee'], o['id'], None, None))
                # Credit Courier Receivable / Payable (-fee)
                lines_tuples.append((c_jid, merchant_id, d_date, 'courier_receivable', courier, -o['delivery_fee'], o['id'], None, None))

        for o in returned_orders:
            r_date = o['returned_date'] or o['order_date'] or today()
            c_jid = j_by_order_kind.get((o['id'], 'courier_charges'))
            if c_jid and o['delivery_fee'] > 0:
                lines_tuples.append((c_jid, merchant_id, r_date, 'courier_delivery', None, o['delivery_fee'], o['id'], None, None))
                lines_tuples.append((c_jid, merchant_id, r_date, 'courier_receivable', courier, -o['delivery_fee'], o['id'], None, None))

        if lines_tuples:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    "INSERT INTO journal_lines (journal_id, merchant_id, entry_date, account, party, amount, order_id, product_id, qty) "
                    "VALUES %s",
                    lines_tuples
                )

    conn.commit()

    # Calculate return stats
    d_count = sum(1 for o in all_inserted_orders if o['status'] == 'delivered')
    r_count = sum(1 for o in all_inserted_orders if o['status'] == 'returned')
    t_count = sum(1 for o in all_inserted_orders if o['status'] == 'in_transit')
    tot_sales = sum(o['total'] for o in all_inserted_orders if o['status'] == 'delivered')

    return {
        'ok': True,
        'total_rows': len(records),
        'imported': len(all_inserted_orders),
        'delivered': d_count,
        'returned': r_count,
        'in_transit': t_count,
        'total_sales_poisha': tot_sales,
    }
