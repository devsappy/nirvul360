"""
Per-courier settlement sheet mapping layer.

Every courier's settlement sheet has different column names and different words for
"delivered". This module owns the aliases and the status vocabulary so the rest of
the system sees one normalised shape:
    {'consignment_id', 'customer_name', 'order_id', 'cod_collected', 'status',
     'delivery_charge', 'cod_fee', 'return_charge', 'settlement_date',
     'consignment_total'}

Two couriers, one set of books (criterion 12): normalisation guarantees it.
"""
import csv
import io
import re
from typing import Dict, Any, List, Optional, Tuple

CANONICAL_COLUMNS = [
    'consignment_id',
    'customer_name',
    'order_id',
    'cod_collected',
    'status',
    'delivery_charge',
    'cod_fee',
    'return_charge',
    'settlement_date',
    'consignment_total',
]

COURIERS: Dict[str, Dict[str, Any]] = {
    'steadfast': {
        'display_name': 'Steadfast',
        'aliases': {
            'consignment_id': ['consignment id', 'consignment', 'tracking id', 'tracking code', 'tracking', 'consignmentid', 'sl', 'sl no'],
            'customer_name': ['customer name', 'customer', 'name', 'client name', 'customername'],
            'order_id': ['order id', 'order', 'invoice id', 'invoice', 'reference', 'merchant ref', 'merchant order id', 'orderid'],
            'cod_collected': ['cod amount', 'cod collected', 'collected amount', 'amount collected', 'cash on delivery amount', 'cod', 'payable amount', 'collected cod'],
            'status': ['status', 'delivery status', 'consignment status', 'parcel status', 'current status'],
            'delivery_charge': ['delivery charge', 'delivery fee', 'delivary charge', 'courier charge', 'delivery charges'],
            'cod_fee': ['cod fee', 'cod charges', 'cash on delivery fee', 'c.o.d fee', 'cod charge', 'processing fee', 'service charge'],
            'return_charge': ['return charge', 'return fee', 'return cost', 'returning charge'],
            'settlement_date': ['settlement date', 'paid date', 'payment date', 'deposited date', 'delivery date', 'delivered date'],
            'consignment_total': ['consignment total', 'total', 'total bill', 'total amount', 'grand total'],
        },
        'status_words': {
            'delivered': ['delivered', 'delivered & paid'],
            'returned': ['returned', 'partial return'],
            'partial': ['partial delivery'],
            'cancelled': ['cancelled', 'canceled', 'box returned'],
        },
    },
    'pathao': {
        'display_name': 'Pathao Courier',
        'aliases': {
            'consignment_id': ['consignment id', 'consignment', 'tracking code', 'tracking id', 'parcel id', 'parcel tracking id'],
            'customer_name': ['customer name', 'customer', 'name', 'recipient name', 'receiver name'],
            'order_id': ['order id', 'order code', 'invoice id', 'merchant order id', 'reference'],
            'cod_collected': ['cod', 'cod amount', 'collected amount', 'amount collected', 'cash collection'],
            'status': ['status', 'delivery status', 'parcel status', 'order status'],
            'delivery_charge': ['delivery charge', 'delivery fee', 'delivery charges'],
            'cod_fee': ['cod fee', 'cod charge', 'cash collection fee', 'processing fee'],
            'return_charge': ['return charge', 'return fee'],
            'settlement_date': ['delivered date', 'settlement date', 'paid date', 'payment date', 'date', 'delivery date'],
            'consignment_total': ['total', 'consignment total', 'total amount'],
        },
        'status_words': {
            'delivered': ['delivered', 'delivered & paid', 'successful delivery'],
            'returned': ['return', 'returned', 'return picked up'],
            'partial': ['partial delivery', 'partial return'],
            'cancelled': ['cancelled', 'canceled'],
        },
    },
    'redx': {
        'display_name': 'RedX',
        'aliases': {
            'consignment_id': ['tracking id', 'tracking number', 'consignment id', 'parcel id', 'tracking code'],
            'customer_name': ['customer name', 'customer', 'name', 'receiver name'],
            'order_id': ['merchant invoice id', 'invoice id', 'order id', 'reference', 'merchant order id'],
            'cod_collected': ['cash collected', 'cod amount', 'amount collected', 'cod', 'payable amount'],
            'status': ['delivery status', 'status', 'parcel status'],
            'delivery_charge': ['delivery fee', 'delivery charge', 'delivery charge bdt', 'shipping fee'],
            'cod_fee': ['cod fee', 'cod charges', 'cash handling fee'],
            'return_charge': ['return charge', 'return fee', 'reverse parcel charge'],
            'settlement_date': ['payment date', 'settled date', 'settlement date', 'delivery date'],
            'consignment_total': ['total', 'total amount', 'net payable'],
        },
        'status_words': {
            'delivered': ['delivered', 'delivered & paid'],
            'returned': ['returned', 'return received', 'returned to hub'],
            'partial': ['partial return', 'partial delivery'],
            'cancelled': ['cancelled', 'canceled'],
        },
    },
    'sa_paribahan': {
        'display_name': 'SA Paribahan',
        'aliases': {
            'consignment_id': ['consignment no', 'consignment number', 'consignment id', 'tracking no', 'tracking id', 'parcel no'],
            'customer_name': ['customer name', 'receiver name', 'customer', 'name'],
            'order_id': ['order number', 'order no', 'order id', 'invoice no', 'reference'],
            'cod_collected': ['cod', 'collected amount', 'cod amount', 'amount collected', 'payable'],
            'status': ['status', 'delivery status', 'parcel status', 'remarks'],
            'delivery_charge': ['delivery charge', 'delivery cost', 'carrying charge'],
            'cod_fee': ['cod charge', 'cod fee', 'service charge'],
            'return_charge': ['return charge', 'return cost'],
            'settlement_date': ['delivery date', 'settlement date', 'paid date', 'date'],
            'consignment_total': ['total bill', 'total', 'net amount'],
        },
        'status_words': {
            'delivered': ['delivered', 'delivered & paid'],
            'returned': ['returned', 'box returned'],
            'partial': ['partial return', 'partial delivery'],
            'cancelled': ['cancelled', 'canceled'],
        },
    },
}

SUPPORTED_COURIERS = list(COURIERS.keys())


def get_courier(courier: str) -> Dict[str, Any]:
    key = (courier or '').strip().lower().replace(' ', '_')
    if key not in COURIERS:
        raise ValueError(f"unsupported courier '{courier}' — supported: {', '.join(SUPPORTED_COURIERS)}")
    return COURIERS[key]


def display_name(courier: str) -> str:
    return get_courier(courier)['display_name']


def required_columns(courier: str) -> Dict[str, List[str]]:
    """The canonical columns and the aliases accepted for each (for UI help)."""
    cfg = get_courier(courier)
    return {col: cfg['aliases'][col] for col in CANONICAL_COLUMNS if col in cfg['aliases']}


def status_words(courier: str) -> Dict[str, List[str]]:
    return get_courier(courier)['status_words']


def courier_catalog() -> List[Dict[str, Any]]:
    """Available couriers + required columns + status words (for the UI help panel)."""
    out = []
    for key, cfg in COURIERS.items():
        out.append({
            'key': key,
            'display_name': cfg['display_name'],
            'columns': required_columns(key),
            'status_words': cfg['status_words'],
        })
    return out


def _clean_header(h: str) -> str:
    return re.sub(r'\s+', ' ', str(h or '').replace('_', ' ').strip().lower())


def map_columns(headers: List[str], courier: str) -> Tuple[Dict[str, int], List[str]]:
    """Map sheet headers to canonical columns. Returns (mapping, warnings)."""
    cfg = get_courier(courier)
    cleaned = [_clean_header(h) for h in headers]
    mapping: Dict[str, int] = {}
    warnings: List[str] = []
    # First pass: exact alias match
    for col in CANONICAL_COLUMNS:
        for alias in cfg['aliases'][col]:
            if alias in cleaned:
                mapping[col] = cleaned.index(alias)
                break
    # Second pass: prefix match (e.g. 'cod amount (bdt)')
    for col in CANONICAL_COLUMNS:
        if col in mapping:
            continue
        for alias in cfg['aliases'][col]:
            for idx, h in enumerate(cleaned):
                if idx in mapping.values():
                    continue
                if h.startswith(alias):
                    mapping[col] = idx
                    break
            if col in mapping:
                break
    for col in CANONICAL_COLUMNS:
        if col not in cfg['aliases']:
            continue
        if col not in mapping:
            warnings.append(
                f"column not found for '{col}' — accepted names: {', '.join(cfg['aliases'][col])}"
            )
    return mapping, warnings


def normalize_status(courier: str, raw: Optional[str]) -> Optional[str]:
    """Map a sheet's free-text status to delivered|returned|partial|cancelled."""
    s = (raw or '').strip().lower()
    if not s:
        return None
    for canonical, words in status_words(courier).items():
        for w in words:
            if s == w or w in s:
                return canonical
    return None


def describe_fallback() -> str:
    """Friendly error listing what each courier sheet should contain."""
    lines = ["No usable columns found in this sheet. Acceptable headers per courier:"]
    for key in SUPPORTED_COURIERS:
        cols = required_columns(key)
        lines.append(f"  {COURIERS[key]['display_name']} ({key}):")
        for col, aliases in cols.items():
            lines.append(f"    {col}: {', '.join(aliases[:4])}, …")
    return "\n".join(lines)


def _parse_amount(raw: Any) -> Optional[int]:
    """Sheet amounts to integer poisha. Returns None when blank/unparseable."""
    if raw is None:
        return None
    s = str(raw).strip()
    if s == '' or s.lower() in ('n/a', 'na', '-', '—', 'none'):
        return None
    from app.lib.money import to_poisha
    try:
        return to_poisha(s)
    except Exception:
        return None


def parse_file_bytes(data: bytes, filename: str) -> Tuple[List[Dict[str, str]], List[str]]:
    """
    CSV (utf-8-sig, cp1252 fallback) via stdlib csv; XLSX via openpyxl when installed.
    Returns (rows as [{header: value}], warnings).
    """
    name = (filename or '').lower()
    if name.endswith('.xlsx') or name.endswith('.xls'):
        try:
            import openpyxl
        except ImportError:
            raise ValueError(
                "excel upload requires openpyxl — install it (pip install openpyxl) "
                "or upload the sheet as CSV"
            )
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        headers = [str(h) if h is not None else '' for h in next(rows_iter, [])]
        rows = []
        for vals in rows_iter:
            if all(v is None or str(v).strip() == '' for v in vals):
                continue
            rows.append({
                str(headers[i]): ('' if v is None else str(v))
                for i, v in enumerate(vals)
            })
        return rows, []

    # CSV: try encodings in order
    text = None
    last_err = None
    for encoding in ('utf-8-sig', 'cp1252'):
        try:
            text = data.decode(encoding)
            break
        except (UnicodeDecodeError, UnicodeError) as e:
            last_err = e
            continue
    if text is None:
        raise ValueError(f"could not decode the CSV file ({last_err})")

    reader = csv.reader(io.StringIO(text))
    all_rows = [r for r in reader if any((c or '').strip() for c in r)]
    if not all_rows:
        return [], ['the file has no rows']
    headers, data_rows = all_rows[0], all_rows[1:]
    rows = []
    for r in data_rows:
        row = {}
        for i, h in enumerate(headers):
            row[h] = r[i] if i < len(r) else ''
        rows.append(row)
    return rows, []


def normalize_rows(raw_rows: List[Dict[str, Any]], courier: str) -> Dict[str, Any]:
    """
    Map raw sheet rows (dict of header → value) to canonical settlement records.
    Does NOT write anything. Returns per-row records, warnings, errors and a summary.
    """
    cfg = get_courier(courier)
    if not raw_rows:
        return {
            'courier': courier,
            'display_name': cfg['display_name'],
            'rows': [],
            'warnings': ['no rows in this sheet'],
            'errors': [],
            'summary': _summarize([], []),
        }

    headers = list(raw_rows[0].keys())
    mapping, warnings = map_columns(headers, courier)
    if not mapping:
        raise ValueError(describe_fallback())

    records: List[Dict[str, Any]] = []
    row_errors: List[Dict[str, Any]] = []

    for idx, raw in enumerate(raw_rows, start=1):
        rec: Dict[str, Any] = {'row_no': idx, 'courier': courier}
        values: Dict[str, Any] = {}
        for col, pos in mapping.items():
            key = headers[pos] if pos < len(headers) else None
            values[col] = raw.get(key)

        errs: List[str] = []
        consignment = str(values.get('consignment_id') or '').strip()
        status_raw = str(values.get('status') or '').strip()
        status = normalize_status(courier, status_raw)

        rec['consignment_id'] = consignment or None
        rec['customer_name'] = (str(values.get('customer_name') or '').strip()) or None
        rec['order_id'] = (str(values.get('order_id') or '').strip()) or None
        rec['status_raw'] = status_raw or None
        rec['status'] = status

        if not consignment:
            errs.append('missing consignment/tracking id')
        for col in ('cod_collected', 'delivery_charge', 'cod_fee', 'return_charge'):
            amt = _parse_amount(values.get(col))
            if values.get(col) is not None and str(values.get(col)).strip() != '' and amt is None:
                errs.append(f"unreadable amount in '{col}': {values.get(col)}")
            rec[col] = amt if amt is not None else 0
        rec['settlement_date'] = (str(values.get('settlement_date') or '').strip()) or None
        rec['consignment_total'] = _parse_amount(values.get('consignment_total'))
        if status is None and status_raw:
            errs.append(f"unknown delivery status '{status_raw}' for {cfg['display_name']}")
        if errs:
            rec['errors'] = errs
            row_errors.append({'row_no': idx, 'consignment_id': consignment or None, 'errors': errs})
        records.append(rec)

    return {
        'courier': courier,
        'display_name': cfg['display_name'],
        'rows': records,
        'warnings': warnings,
        'errors': row_errors,
        'summary': _summarize(records, row_errors),
    }


def _summarize(records: List[Dict[str, Any]], row_errors: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_status: Dict[str, Dict[str, Any]] = {}
    total_cod = 0
    total_fees = 0
    for r in records:
        stat = r.get('status') or 'unknown'
        slot = by_status.setdefault(stat, {'count': 0, 'cod_poisha': 0, 'fees_poisha': 0})
        slot['count'] += 1
        fees = (r.get('delivery_charge') or 0) + (r.get('cod_fee') or 0) + (r.get('return_charge') or 0)
        slot['cod_poisha'] += r.get('cod_collected') or 0
        slot['fees_poisha'] += fees
        if not r.get('errors'):
            total_cod += r.get('cod_collected') or 0
            total_fees += fees
    return {
        'rows': len(records),
        'errors': len(row_errors),
        'total_cod_poisha': total_cod,
        'total_fees_poisha': total_fees,
        'by_status': by_status,
    }
