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
  settings     TEXT NOT NULL DEFAULT '{"currency": "BDT", "timezone": "Asia/Dhaka", "stuck_parcel_threshold_days": 5, "unsettled_cod_window_days": 10, "duplicate_window_hours": 72, "daily_summary": {"enabled": true, "time": "21:00"}}',
  status       TEXT NOT NULL DEFAULT 'active',
  paused_reason TEXT,
  plan         TEXT NOT NULL DEFAULT 'starter',
  plan_price   INTEGER NOT NULL DEFAULT 100000,
  trial_ends_at TEXT,
  order_limit  INTEGER NOT NULL DEFAULT 5000,
  ai_token_cap INTEGER NOT NULL DEFAULT 50000,
  ai_tokens_used INTEGER NOT NULL DEFAULT 0,
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
  last_active_at TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  invited_at    TEXT,
  scope         TEXT NOT NULL DEFAULT 'current_store',
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token              TEXT PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  active_merchant_id INTEGER REFERENCES merchants(id),
  device_info        TEXT DEFAULT 'Browser',
  ip_address         TEXT DEFAULT '127.0.0.1',
  location           TEXT DEFAULT 'Dhaka',
  last_active_at     TEXT,
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL
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
  id                INTEGER PRIMARY KEY,
  merchant_id       INTEGER NOT NULL REFERENCES merchants(id),
  name              TEXT NOT NULL,
  phone             TEXT,
  address           TEXT,
  terms_days        INTEGER NOT NULL DEFAULT 30,
  credit_terms_days INTEGER DEFAULT 30,
  categories        TEXT,
  advance_balance   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL
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
  batch_no        TEXT,
  status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'part_paid', 'paid')),
  total_cost      INTEGER NOT NULL DEFAULT 0,
  paid_amount     INTEGER NOT NULL DEFAULT 0,
  memo_photo_url  TEXT,
  ocr_draft_id    INTEGER,
  notes           TEXT,
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
  date                 TEXT,
  kind                 TEXT NOT NULL,
  memo                 TEXT,
  description          TEXT,
  amount               INTEGER,
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

-- Seed (idempotent; the app also re-seeds at startup in case the DB predates it).
INSERT OR IGNORE INTO reason_codes (code, exception_type, label, effect, closes) VALUES
  ('partial_delivery', 'short_settlement', 'আংশিক ডেলিভারি',
   'Revenue reduced by the shortfall, refused goods go back into inventory (stock return entry), courier charges stay as booked.', 1),
  ('delivery_discount', 'short_settlement', 'ডেলিভারিতে ছাড়',
   'Revenue reduced by the shortfall booked as a door discount. Full stock consumed, nothing returned.', 1),
  ('courier_short', 'short_settlement', 'কুরিয়ার কম দিয়েছে',
   'Revenue unchanged. The difference posts as a firm receivable from the courier to be recovered.', 1);

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
CREATE UNIQUE INDEX exception_open_once ON exception_queue(merchant_id, type, dedupe_key) WHERE status = 'open';
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

-- ==============================================================================
-- MILESTONE 1 TABLES
-- ==============================================================================

-- 1. SaaS Subscription Plans Catalog
CREATE TABLE IF NOT EXISTS saas_plans (
  id                TEXT PRIMARY KEY, -- 'trial', 'starter', 'growth', 'scale'
  name              TEXT NOT NULL,
  price_poisha      INTEGER NOT NULL,
  billing_interval  TEXT NOT NULL DEFAULT 'monthly',
  order_limit       INTEGER NOT NULL,
  courier_limit     INTEGER NOT NULL,
  user_limit        INTEGER NOT NULL,
  has_whatsapp      INTEGER NOT NULL DEFAULT 1,
  has_meta_sync     INTEGER NOT NULL DEFAULT 0,
  has_mushak        INTEGER NOT NULL DEFAULT 0,
  has_multi_brand   INTEGER NOT NULL DEFAULT 0,
  features          TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'not_launched', 'deprecated')),
  created_at        TEXT NOT NULL
);

-- 2. Billing Invoices & Dunning
CREATE TABLE IF NOT EXISTS billing_invoices (
  id              INTEGER PRIMARY KEY,
  merchant_id     INTEGER NOT NULL REFERENCES merchants(id),
  plan_id         TEXT NOT NULL REFERENCES saas_plans(id),
  amount          INTEGER NOT NULL, -- poisha
  billing_period  TEXT NOT NULL, -- 'YYYY-MM'
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'failed', 'pending', 'cancelled')),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('bkash', 'card', 'nagad', 'bank')),
  payment_details TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  pauses_at       TEXT,
  last_attempt_at TEXT,
  paid_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON billing_invoices(merchant_id, status);

-- 3. Scheduled Jobs Telemetry (13 Background Crons)
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  job_key               TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  frequency             TEXT NOT NULL,
  last_run_at           TEXT,
  last_success_at       TEXT,
  duration_ms           INTEGER,
  status                TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed', 'failing', 'running', 'paused', 'partial')),
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,
  error_stack           TEXT,
  failing_batch         TEXT,
  next_run_at           TEXT,
  updated_at            TEXT NOT NULL DEFAULT ''
);

-- 4. Dead-Letter Queue (DLQ)
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id            INTEGER PRIMARY KEY,
  job_key       TEXT NOT NULL REFERENCES scheduled_jobs(job_key),
  merchant_id   INTEGER REFERENCES merchants(id),
  payload       TEXT NOT NULL DEFAULT '{}',
  failed_at     TEXT NOT NULL,
  retry_count   INTEGER NOT NULL DEFAULT 3,
  error         TEXT,
  error_code    TEXT,
  error_detail  TEXT,
  status        TEXT NOT NULL DEFAULT 'waiting_human' CHECK (status IN ('waiting_human', 'requeued', 'discarded')),
  resolved_at   TEXT,
  resolved_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_jobs(status, job_key);

-- 5. Integration Connection Status
CREATE TABLE IF NOT EXISTS integration_connections (
  id                    INTEGER PRIMARY KEY,
  merchant_id           INTEGER NOT NULL REFERENCES merchants(id),
  connector_type        TEXT NOT NULL CHECK (connector_type IN ('courier', 'store', 'meta_ads', 'whatsapp', 'mfs', 'bkash')),
  provider              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'failing', 'never_connected', 'suspended', 'sheet_upload')),
  last_success_at       TEXT,
  last_sync_at          TEXT,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  failure_reason        TEXT,
  token_expires_at      TEXT,
  account_identifier    TEXT,
  config                TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  UNIQUE (merchant_id, connector_type, provider)
);
CREATE INDEX IF NOT EXISTS idx_integ_status ON integration_connections(merchant_id, status);

-- 6. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id                INTEGER PRIMARY KEY,
  merchant_id       INTEGER NOT NULL REFERENCES merchants(id),
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_admin', 'waiting_merchant', 'resolved', 'closed')),
  waiting_hours     INTEGER NOT NULL DEFAULT 0,
  assigned_to       INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL,
  first_replied_at  TEXT,
  resolved_at       TEXT,
  resolved_by       TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, priority);

-- 7. Broadcast Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  send_whatsapp   INTEGER NOT NULL DEFAULT 0,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  published_at    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at      TEXT NOT NULL
);

-- 8. AI Prompt Versions & Canary Rollouts
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id                  INTEGER PRIMARY KEY,
  task_key            TEXT NOT NULL,
  version_label       TEXT NOT NULL,
  description         TEXT,
  prompt_template     TEXT NOT NULL,
  rollout_status      TEXT NOT NULL CHECK (rollout_status IN ('live', 'canary', 'retired', 'draft')),
  rollout_percentage  INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  confirmation_rate   REAL NOT NULL DEFAULT 0.0,
  drafts_count        INTEGER NOT NULL DEFAULT 0,
  created_by          TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  retired_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_prompts_task ON ai_prompt_versions(task_key, rollout_status);

-- 9. AI Training Corrections (Rejected Drafts Few-Shot Bank)
CREATE TABLE IF NOT EXISTS ai_training_corrections (
  id                INTEGER PRIMARY KEY,
  merchant_id       INTEGER REFERENCES merchants(id),
  task_key          TEXT NOT NULL DEFAULT 'bengali_expense_extraction',
  raw_input         TEXT NOT NULL,
  ai_understood     TEXT NOT NULL,
  rejection_reason  TEXT NOT NULL,
  corrected_output  TEXT,
  corrected_data    TEXT,
  is_few_shot       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'corrected', 'few_shot_added', 'discarded')),
  created_at        TEXT NOT NULL,
  corrected_at      TEXT,
  corrected_by      TEXT
);

-- 10. AI Safety Guardrails & Model Routing
CREATE TABLE IF NOT EXISTS ai_guardrails (
  guardrail_key TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  is_immutable  INTEGER NOT NULL DEFAULT 0,
  parameters    TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_model_routes (
  task_key    TEXT PRIMARY KEY,
  model_name  TEXT NOT NULL,
  description TEXT,
  updated_at  TEXT NOT NULL
);

-- 11. Feature Flags & Courier Adapters
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key            TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  description         TEXT,
  rollout_percentage  INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  target_plan         TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  updated_at          TEXT NOT NULL,
  updated_by          TEXT
);

CREATE TABLE IF NOT EXISTS courier_adapters (
  id              INTEGER PRIMARY KEY,
  courier_code    TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  adapter_type    TEXT NOT NULL CHECK (adapter_type IN ('api', 'sheet')),
  mapping_version TEXT NOT NULL,
  tenants_count   INTEGER NOT NULL DEFAULT 0,
  column_mapping  TEXT NOT NULL DEFAULT '{}',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_config (
  config_key  TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

-- 12. Recurring Expenses Engine
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                INTEGER PRIMARY KEY,
  merchant_id       INTEGER NOT NULL REFERENCES merchants(id),
  head              TEXT NOT NULL CHECK (head IN ('rent', 'salary', 'utilities', 'software', 'transport', 'packaging', 'other_expense', 'internet')),
  name              TEXT NOT NULL,
  amount            INTEGER NOT NULL CHECK (amount > 0),
  posts_on_day      INTEGER NOT NULL CHECK (posts_on_day BETWEEN 1 AND 28),
  cash_account_id   INTEGER REFERENCES cash_accounts(id),
  note              TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  last_posted_date  TEXT,
  next_date         TEXT,
  created_by        TEXT NOT NULL DEFAULT 'system',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recurring_merchant ON recurring_expenses(merchant_id, active);

-- 13. Purchase Memo Photo OCR Drafts
CREATE TABLE IF NOT EXISTS memo_drafts (
  id          INTEGER PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  image_url   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  ocr_data    TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'discarded')),
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  applied_at  TEXT
);

