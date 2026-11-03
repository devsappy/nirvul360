"""
Chart of accounts for Bangladeshi E-commerce & F-commerce.
Double-entry ledger rules:
- Asset: debit positive (debit increases asset, credit decreases)
- Liability: credit negative
- Equity: credit negative
- Revenue: credit negative (sales is credit, returns is debit)
- Expense: debit positive
"""

ACCOUNTS = {
    'cash':                {'type': 'asset',     'pl': None,        'label': 'Cash, bank and wallets'},
    'courier_receivable':  {'type': 'asset',     'pl': None,        'label': 'Money held at couriers'},
    'courier_claims':      {'type': 'asset',     'pl': None,        'label': 'Claims against couriers'},
    'inventory':           {'type': 'asset',     'pl': None,        'label': 'Inventory (ledger)'},
    'supplier_payable':    {'type': 'liability', 'pl': None,        'label': 'Payable to suppliers'},
    'customer_advances':   {'type': 'liability', 'pl': None,        'label': 'Customer advances'},
    'settlement_suspense': {'type': 'liability', 'pl': None,        'label': 'Courier over-settlement suspense'},
    'revenue_suspense':    {'type': 'liability', 'pl': None,        'label': 'Delivered sales held until purchase price is known'},
    'bank_suspense':       {'type': 'liability', 'pl': None,        'label': 'Unattributed bank/wallet debits'},
    'opening_equity':      {'type': 'equity',    'pl': None,        'label': 'Opening balances'},
    'owner_drawings':      {'type': 'equity',    'pl': None,        'label': 'Owner withdrawals'},
    'sales':               {'type': 'revenue',   'pl': 'gross_sales', 'label': 'Gross sales (delivered orders)'},
    'sales_returns':       {'type': 'revenue',   'pl': 'returns',     'label': 'Returns and exchanges'},
    'sales_discounts':     {'type': 'revenue',   'pl': 'returns',     'label': 'Discounts given at the door'},
    'sales_held':          {'type': 'revenue',   'pl': 'held',        'label': 'Held for review (exception queue)'},
    'cogs':                {'type': 'expense',   'pl': 'cogs',      'label': 'Cost of goods sold'},
    'courier_delivery':    {'type': 'expense',   'pl': 'courier',   'label': 'Delivery charges'},
    'courier_cod_fee':     {'type': 'expense',   'pl': 'courier',   'label': 'COD fees'},
    'courier_return_fee':  {'type': 'expense',   'pl': 'courier',   'label': 'Return charges'},
    'courier_recovery':    {'type': 'expense',   'pl': 'courier',   'label': 'Delivery advance kept on returns'},
    'ad_spend':            {'type': 'expense',   'pl': 'ads',       'label': 'Ad spend'},
    'packaging':           {'type': 'expense',   'pl': 'packaging', 'label': 'Packaging and fulfilment'},
    'salary':              {'type': 'expense',   'pl': 'fixed',     'label': 'Salary'},
    'rent':                {'type': 'expense',   'pl': 'fixed',     'label': 'Rent'},
    'utilities':           {'type': 'expense',   'pl': 'fixed',     'label': 'Utilities'},
    'software':            {'type': 'expense',   'pl': 'fixed',     'label': 'Software'},
    'transport':           {'type': 'expense',   'pl': 'fixed',     'label': 'Transport'},
    'stock_loss':          {'type': 'expense',   'pl': 'other',     'label': 'Lost parcels (stock write-off, net of claims)'},
    'bad_debt':            {'type': 'expense',   'pl': 'other',     'label': 'Courier money written off'},
    'other_expense':       {'type': 'expense',   'pl': 'other',     'label': 'Other expenses'},
}

EXPENSE_HEADS = [
    'packaging', 'salary', 'rent', 'utilities', 'software', 'transport', 'ad_spend', 'other_expense'
]

SOURCES = [
    'courier_api', 'courier_sheet_upload', 'meta_api', 'whatsapp_confirmed',
    'manual', 'bank_statement_parse', 'store_api', 'system'
]

PL_SECTIONS = [
    {'key': 'gross_sales', 'label': 'Gross sales (delivered)', 'sign': -1},
    {'key': 'returns',     'label': 'Returns and refunds',     'sign': 1},
    {'key': 'held',        'label': 'Held for review',         'sign': -1},
    {'key': 'cogs',        'label': 'Cost of goods sold',      'sign': 1},
    {'key': 'courier',     'label': 'Courier costs',           'sign': 1},
    {'key': 'ads',         'label': 'Ad spend',                'sign': 1},
    {'key': 'packaging',   'label': 'Packaging & fulfilment',  'sign': 1},
    {'key': 'fixed',       'label': 'Fixed operating costs',   'sign': 1},
    {'key': 'other',       'label': 'Other expenses',          'sign': 1},
]

def accounts_in_section(sec_key: str):
    return [name for name, info in ACCOUNTS.items() if info['pl'] == sec_key]
