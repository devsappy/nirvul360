-- Gross Management — Phase 1 schema.
--
-- Conventions
--   * Money is stored as INTEGER poisha (1 taka = 100 poisha). Never REAL.
--   * Accounting dates are TEXT 'YYYY-MM-DD' in Asia/Dhaka. Timestamps are ISO-8601 UTC.
--   * Ledger tables (journals, journal_lines) and product_price_history are append-only:
--     triggers below reject UPDATE and DELETE. Corrections are posted as reversal journals.
--   * Every ledger row carries `source` and `created_by` (Non-negotiable rule 6).

CREATE TABLE merchants (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key      TEXT NOT NULL UNIQUE,
  settings     TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  merchant_id   INTEGER NOT NULL REFERENCES merchants(id),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT,
  whatsapp      TEXT UNIQUE,              -- digits only, e.g. 8801711000000
  role          TEXT NOT NULL DEFAULT 'owner',
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  active_merchant_id INTEGER REFERENCES merchants(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

-- Bank accounts, mobile wallets and physical cash. Balances live in the ledger (account 'cash').
CREATE TABLE cash_accounts (
  id           INTEGER PRIMARY KEY,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id),
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('bank','bkash','nagad','rocket','cash')),
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

CREATE TABLE suppliers (
  id           INTEGER PRIMARY KEY,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id),
  name         TEXT NOT NULL,
  phone        TEXT,
  created_at   TEXT NOT NULL
);

-- Deliberately no purchase-price column: cost lives only in product_price_history.
CREATE TABLE products (
  id            INTEGER PRIMARY KEY,
  merchant_id   INTEGER NOT NULL REFERENCES merchants(id),
  external_id   TEXT,
  sku           TEXT,
  name          TEXT NOT NULL,
  selling_price INTEGER,
  active        INTEGER NOT NULL DEFAULT 1,
  source        TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (merchant_id, external_id)
);
CREATE INDEX products_sku ON products(merchant_id, sku);

-- Non-negotiable rule 1: purchase prices are versioned, never overwritten.
CREATE TABLE product_price_history (
  id              INTEGER PRIMARY KEY,
  merchant_id     INTEGER NOT NULL REFERENCES merchants(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  purchase_price  INTEGER NOT NULL CHECK (purchase_price >= 0),
  effective_from  TEXT NOT NULL,
  method          TEXT NOT NULL DEFAULT 'stated' CHECK (method IN ('stated','moving_average')),
  purchase_id     INTEGER,
  source          TEXT NOT NULL,
  note            TEXT,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX pph_lookup ON product_price_history(product_id, effective_from, id);
CREATE TRIGGER pph_no_update BEFORE UPDATE ON product_price_history
BEGIN SELECT RAISE(ABORT, 'product_price_history is append-only'); END;
CREATE TRIGGER pph_no_delete BEFORE DELETE ON product_price_history
BEGIN SELECT RAISE(ABORT, 'product_price_history is append-only'); END;

CREATE TABLE purchases (
  id              INTEGER PRIMARY KEY,
  merchant_id     INTEGER NOT NULL REFERENCES merchants(id),
  supplier_id     INTEGER REFERENCES suppliers(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  qty             INTEGER NOT NULL CHECK (qty > 0),
  unit_cost       INTEGER NOT NULL CHECK (unit_cost >= 0),
  purchase_date   TEXT NOT NULL,
  source          TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE stock_movements (
  id             INTEGER PRIMARY KEY,
  merchant_id    INTEGER NOT NULL REFERENCES merchants(id),
  product_id     INTEGER NOT NULL REFERENCES products(id),
  qty            INTEGER NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('opening','purchase','dispatch','return','partial_return','exchange_return','cancel','adjustment')),
  movement_date  TEXT NOT NULL,
  order_id       INTEGER,
  purchase_id    INTEGER,
  source         TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX stock_product ON stock_movements(product_id);
CREATE INDEX stock_order ON stock_movements(order_id);

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY,
  merchant_id        INTEGER NOT NULL REFERENCES merchants(id),
  external_id        TEXT,
  order_date         TEXT NOT NULL,
  placed_at          TEXT NOT NULL,
  customer_name      TEXT,
  customer_phone     TEXT,
  address            TEXT,
  subtotal           INTEGER NOT NULL,
  discount           INTEGER NOT NULL DEFAULT 0,
  shipping_charge    INTEGER NOT NULL DEFAULT 0,
  total              INTEGER NOT NULL,
  advance_paid       INTEGER NOT NULL DEFAULT 0,
  cod_amount         INTEGER NOT NULL,
  courier            TEXT,
  consignment_id     TEXT,
  status             TEXT NOT NULL CHECK (status IN ('placed','in_transit','delivered','returned','cancelled','lost')),
  status_changed_at  TEXT NOT NULL,
  dispatched_date    TEXT,
  delivered_date     TEXT,
  returned_date      TEXT,
  -- 'posted': revenue/COGS are in the ledger. 'held': delivered but held out of P&L (e.g. missing cost).
  posting_state      TEXT NOT NULL DEFAULT 'none' CHECK (posting_state IN ('none','posted','held')),
  is_duplicate       INTEGER NOT NULL DEFAULT 0,
  overdue            INTEGER NOT NULL DEFAULT 0,
  courier_seen_at    TEXT,
  source             TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (merchant_id, external_id)
);
CREATE INDEX orders_status ON orders(merchant_id, status);
CREATE INDEX orders_consignment ON orders(merchant_id, courier, consignment_id);
CREATE INDEX orders_phone ON orders(merchant_id, customer_phone);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL CHECK (qty > 0),
  unit_price  INTEGER NOT NULL,
  line_total  INTEGER NOT NULL
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE INDEX order_items_product ON order_items(product_id);

-- Non-negotiable rules 5 and 6 live on this table: orig_amount/currency/fx_rate/fx_rate_date
-- for foreign-currency spend, and source/created_by on every entry.
CREATE TABLE journals (
  id                   INTEGER PRIMARY KEY,
  merchant_id          INTEGER NOT NULL REFERENCES merchants(id),
  entry_date           TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  memo                 TEXT,
  source               TEXT NOT NULL CHECK (source IN ('courier_api','courier_sheet_upload','meta_api','whatsapp_confirmed','manual','bank_statement_parse','store_api','system')),
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  order_id             INTEGER,
  product_id           INTEGER,
  exception_id         INTEGER,
  upload_id            INTEGER,
  settlement_row_id    INTEGER,
  supplier_id          INTEGER,
  purchase_id          INTEGER,
  draft_id             INTEGER,
  orig_amount          INTEGER,
  orig_currency        TEXT,
  fx_rate              TEXT,
  fx_rate_date         TEXT,
  reverses_journal_id  INTEGER REFERENCES journals(id),
  CHECK ((orig_currency IS NULL) = (fx_rate IS NULL) AND (fx_rate IS NULL) = (fx_rate_date IS NULL))
);
CREATE INDEX journals_date ON journals(merchant_id, entry_date);
CREATE INDEX journals_order ON journals(order_id);
CREATE UNIQUE INDEX journals_one_reversal ON journals(reverses_journal_id) WHERE reverses_journal_id IS NOT NULL;

CREATE TABLE journal_lines (
  id           INTEGER PRIMARY KEY,
  journal_id   INTEGER NOT NULL REFERENCES journals(id),
  merchant_id  INTEGER NOT NULL,
  entry_date   TEXT NOT NULL,
  account      TEXT NOT NULL,
  party        TEXT,              -- cash account id, courier code or supplier id
  amount       INTEGER NOT NULL,  -- debit positive, credit negative; each journal sums to 0
  order_id     INTEGER,
  product_id   INTEGER,
  qty          INTEGER
);
CREATE INDEX lines_account ON journal_lines(merchant_id, account, entry_date);
CREATE INDEX lines_order ON journal_lines(order_id, account);
CREATE INDEX lines_journal ON journal_lines(journal_id);

CREATE TRIGGER journals_no_update BEFORE UPDATE ON journals
BEGIN SELECT RAISE(ABORT, 'journals are append-only; post a reversal instead'); END;
CREATE TRIGGER journals_no_delete BEFORE DELETE ON journals
BEGIN SELECT RAISE(ABORT, 'journals are append-only; post a reversal instead'); END;
CREATE TRIGGER lines_no_update BEFORE UPDATE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'journal_lines are append-only'); END;
CREATE TRIGGER lines_no_delete BEFORE DELETE ON journal_lines
BEGIN SELECT RAISE(ABORT, 'journal_lines are append-only'); END;

-- Rate table used to pre-fill the rate on foreign-currency spend. The rate actually used
-- is copied onto the journal row and never looked up again.
CREATE TABLE fx_rates (
  id           INTEGER PRIMARY KEY,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id),
  currency     TEXT NOT NULL,
  rate_date    TEXT NOT NULL,
  rate         TEXT NOT NULL,
  source       TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX fx_lookup ON fx_rates(merchant_id, currency, rate_date);

CREATE TABLE reason_codes (
  code            TEXT NOT NULL,
  exception_type  TEXT NOT NULL,
  label           TEXT NOT NULL,
  effect          TEXT NOT NULL,
  closes          INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (exception_type, code)
);

-- Non-negotiable rule 2: whatever does not reconcile lands here and stays out of profit.
CREATE TABLE exception_queue (
  id               INTEGER PRIMARY KEY,
  merchant_id      INTEGER NOT NULL REFERENCES merchants(id),
  type             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  dedupe_key       TEXT NOT NULL,
  value            INTEGER NOT NULL DEFAULT 0,
  order_id         INTEGER,
  product_id       INTEGER,
  courier          TEXT,
  settlement_row_id INTEGER,
  details          TEXT NOT NULL DEFAULT '{}',
  raised_at        TEXT NOT NULL,
  raised_by        TEXT NOT NULL,
  snoozed_until    TEXT,
  resolution       TEXT,
  resolution_data  TEXT,
  resolved_at      TEXT,
  resolved_by      TEXT
);
CREATE UNIQUE INDEX exception_open_once ON exception_queue(merchant_id, dedupe_key) WHERE status = 'open';
CREATE INDEX exception_status ON exception_queue(merchant_id, status, type);

CREATE TABLE uploads (
  id                  INTEGER PRIMARY KEY,
  merchant_id         INTEGER NOT NULL REFERENCES merchants(id),
  kind                TEXT NOT NULL CHECK (kind IN ('courier_settlement','prices','products','orders')),
  courier             TEXT,
  filename            TEXT NOT NULL,
  sha256              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed','discarded')),
  row_count           INTEGER NOT NULL DEFAULT 0,
  summary             TEXT NOT NULL DEFAULT '{}',
  payload             TEXT,
  deposit_account_id  INTEGER,
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  committed_at        TEXT
);

CREATE TABLE settlement_rows (
  id               INTEGER PRIMARY KEY,
  merchant_id      INTEGER NOT NULL REFERENCES merchants(id),
  upload_id        INTEGER NOT NULL REFERENCES uploads(id),
  courier          TEXT NOT NULL,
  row_no           INTEGER NOT NULL,
  raw              TEXT NOT NULL,
  consignment_id   TEXT,
  merchant_ref     TEXT,
  status_raw       TEXT,
  status           TEXT,
  cod_collected    INTEGER NOT NULL DEFAULT 0,
  delivery_charge  INTEGER NOT NULL DEFAULT 0,
  cod_fee          INTEGER NOT NULL DEFAULT 0,
  return_fee       INTEGER NOT NULL DEFAULT 0,
  sheet_payout     INTEGER,
  delivery_date    TEXT,
  settlement_date  TEXT,
  settlement_ref   TEXT,
  order_id         INTEGER,
  outcome          TEXT,
  outcome_detail   TEXT,
  dedupe_key       TEXT
);
CREATE UNIQUE INDEX settlement_once ON settlement_rows(merchant_id, dedupe_key)
  WHERE outcome IN ('posted','exception','unmatched');

CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  merchant_id  INTEGER,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    INTEGER,
  before       TEXT,
  after        TEXT
);
CREATE INDEX audit_entity ON audit_log(entity, entity_id);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE whatsapp_messages (
  id           INTEGER PRIMARY KEY,
  merchant_id  INTEGER,
  user_id      INTEGER,
  direction    TEXT NOT NULL CHECK (direction IN ('in','out')),
  phone        TEXT NOT NULL,
  msg_type     TEXT NOT NULL DEFAULT 'text',
  body         TEXT,
  delivery     TEXT NOT NULL,
  error        TEXT,
  wa_message_id TEXT,
  created_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX wa_inbound_once ON whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Non-negotiable rule 4: a WhatsApp entry is a draft until the merchant confirms it.
CREATE TABLE whatsapp_drafts (
  id           INTEGER PRIMARY KEY,
  merchant_id  INTEGER NOT NULL REFERENCES merchants(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL CHECK (status IN ('pending','confirmed','rejected','expired','superseded')),
  stage        TEXT NOT NULL CHECK (stage IN ('confirm','choose_product','choose_supplier')),
  intent       TEXT NOT NULL,
  draft        TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  parser       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  decided_at   TEXT,
  result_ref   TEXT
);
CREATE INDEX drafts_pending ON whatsapp_drafts(user_id, status);

CREATE TABLE scheduler_runs (
  merchant_id  INTEGER NOT NULL,
  job          TEXT NOT NULL,
  run_key      TEXT NOT NULL,
  ran_at       TEXT NOT NULL,
  PRIMARY KEY (merchant_id, job, run_key)
);
