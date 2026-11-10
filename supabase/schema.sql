-- ==============================================================================
-- GROSS MANAGEMENT — SUPABASE POSTGRESQL SCHEMA (PHASE 1)
-- ==============================================================================
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- to create all tables, indexes, append-only triggers, and realtime publication.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. APPEND-ONLY FUNCTION (Preserves Non-Negotiable Rules in PostgreSQL)
CREATE OR REPLACE FUNCTION prevent_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; updates and deletes are strictly prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- 3. TABLES

CREATE TABLE IF NOT EXISTS merchants (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  api_key      TEXT NOT NULL UNIQUE,
  settings     JSONB NOT NULL DEFAULT '{"currency": "BDT", "timezone": "Asia/Dhaka", "stuck_parcel_threshold_days": 5, "unsettled_cod_window_days": 10, "duplicate_window_hours": 72, "daily_summary": {"enabled": true, "time": "21:00"}}'::jsonb,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'trial')),
  paused_reason TEXT,
  plan         TEXT NOT NULL DEFAULT 'starter',
  plan_price   BIGINT NOT NULL DEFAULT 100000,
  trial_ends_at TIMESTAMPTZ,
  order_limit  INTEGER NOT NULL DEFAULT 5000,
  ai_token_cap INTEGER NOT NULL DEFAULT 50000,
  ai_tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  merchant_id   BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT,
  whatsapp      TEXT UNIQUE,
  role          TEXT NOT NULL DEFAULT 'agency_owner' CHECK (role IN ('super_admin','admin','agency_owner','owner','manager','accountant')),
  last_active_at TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'active',
  invited_at    TIMESTAMPTZ,
  scope         TEXT NOT NULL DEFAULT 'current_store',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token              TEXT PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_merchant_id BIGINT REFERENCES merchants(id) ON DELETE SET NULL,
  device_info        TEXT DEFAULT 'Browser',
  ip_address         TEXT DEFAULT '127.0.0.1',
  location           TEXT DEFAULT 'Dhaka',
  last_active_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id           BIGSERIAL PRIMARY KEY,
  merchant_id  BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('bank','bkash','nagad','rocket','cash')),
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  phone             TEXT,
  address           TEXT,
  terms_days        INTEGER NOT NULL DEFAULT 30,
  credit_terms_days INTEGER DEFAULT 30,
  categories        TEXT,
  advance_balance   BIGINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id            BIGSERIAL PRIMARY KEY,
  merchant_id   BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  external_id   TEXT,
  sku           TEXT,
  name          TEXT NOT NULL,
  selling_price BIGINT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  source        TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(merchant_id, sku);

CREATE TABLE IF NOT EXISTS product_price_history (
  id              BIGSERIAL PRIMARY KEY,
  merchant_id     BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  purchase_price  BIGINT NOT NULL CHECK (purchase_price >= 0),
  effective_from  TEXT NOT NULL,
  method          TEXT NOT NULL DEFAULT 'stated' CHECK (method IN ('stated','moving_average')),
  purchase_id     BIGINT,
  source          TEXT NOT NULL,
  note            TEXT,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pph_lookup ON product_price_history(product_id, effective_from, id);

DROP TRIGGER IF EXISTS pph_no_mutation ON product_price_history;
CREATE TRIGGER pph_no_mutation
BEFORE UPDATE OR DELETE ON product_price_history
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE TABLE IF NOT EXISTS purchases (
  id              BIGSERIAL PRIMARY KEY,
  merchant_id     BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_id     BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty             INTEGER NOT NULL CHECK (qty > 0),
  unit_cost       BIGINT NOT NULL CHECK (unit_cost >= 0),
  purchase_date   TEXT NOT NULL,
  batch_no        TEXT,
  status          TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'part_paid', 'paid')),
  total_cost      BIGINT NOT NULL DEFAULT 0,
  paid_amount     BIGINT NOT NULL DEFAULT 0,
  memo_photo_url  TEXT,
  ocr_draft_id    BIGINT,
  notes           TEXT,
  source          TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id             BIGSERIAL PRIMARY KEY,
  merchant_id    BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  product_id     BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty            INTEGER NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN ('opening','purchase','dispatch','return','partial_return','exchange_return','cancel','adjustment')),
  movement_date  TEXT NOT NULL,
  order_id       BIGINT,
  purchase_id    BIGINT,
  source         TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_order ON stock_movements(order_id);

CREATE TABLE IF NOT EXISTS orders (
  id                 BIGSERIAL PRIMARY KEY,
  merchant_id        BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  external_id        TEXT,
  order_date         TEXT NOT NULL,
  placed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_name      TEXT,
  customer_phone     TEXT,
  address            TEXT,
  subtotal           BIGINT NOT NULL,
  discount           BIGINT NOT NULL DEFAULT 0,
  shipping_charge    BIGINT NOT NULL DEFAULT 0,
  total              BIGINT NOT NULL,
  advance_paid       BIGINT NOT NULL DEFAULT 0,
  cod_amount         BIGINT NOT NULL,
  courier            TEXT,
  consignment_id     TEXT,
  status             TEXT NOT NULL CHECK (status IN ('placed','in_transit','delivered','returned','cancelled','lost')),
  status_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_date    TEXT,
  delivered_date     TEXT,
  returned_date      TEXT,
  posting_state      TEXT NOT NULL DEFAULT 'none' CHECK (posting_state IN ('none','posted','held')),
  is_duplicate       BOOLEAN NOT NULL DEFAULT FALSE,
  overdue            BOOLEAN NOT NULL DEFAULT FALSE,
  courier_seen_at    TIMESTAMPTZ,
  source             TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_consignment ON orders(merchant_id, courier, consignment_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(merchant_id, customer_phone);

CREATE TABLE IF NOT EXISTS order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  unit_price  BIGINT NOT NULL,
  line_total  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Double-Entry Ledger Journals (Append-Only)
CREATE TABLE IF NOT EXISTS journals (
  id                   BIGSERIAL PRIMARY KEY,
  merchant_id          BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  entry_date           TEXT NOT NULL,
  date                 TEXT,
  kind                 TEXT NOT NULL,
  memo                 TEXT,
  description          TEXT,
  amount               BIGINT,
  source               TEXT NOT NULL CHECK (source IN ('courier_api','courier_sheet_upload','meta_api','whatsapp_confirmed','manual','bank_statement_parse','store_api','system')),
  created_by           TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_id             BIGINT,
  product_id           BIGINT,
  exception_id         BIGINT,
  upload_id            BIGINT,
  settlement_row_id    BIGINT,
  supplier_id          BIGINT,
  purchase_id          BIGINT,
  draft_id             BIGINT,
  orig_amount          BIGINT,
  orig_currency        TEXT,
  fx_rate              TEXT,
  fx_rate_date         TEXT,
  reverses_journal_id  BIGINT REFERENCES journals(id),
  -- FX all-or-nothing (mirrors the SQLite schema): all three FX fields present or all absent
  CHECK ((orig_currency IS NULL) = (fx_rate IS NULL) AND (fx_rate IS NULL) = (fx_rate_date IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(merchant_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_journals_order ON journals(order_id);
-- One reversal per journal, ever
CREATE UNIQUE INDEX IF NOT EXISTS journals_one_reversal ON journals(reverses_journal_id) WHERE reverses_journal_id IS NOT NULL;

DROP TRIGGER IF EXISTS journals_no_mutation ON journals;
CREATE TRIGGER journals_no_mutation
BEFORE UPDATE OR DELETE ON journals
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE TABLE IF NOT EXISTS journal_lines (
  id           BIGSERIAL PRIMARY KEY,
  journal_id   BIGINT NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  merchant_id  BIGINT NOT NULL,
  entry_date   TEXT NOT NULL,
  account      TEXT NOT NULL,
  party        TEXT,
  amount       BIGINT NOT NULL,
  order_id     BIGINT,
  product_id   BIGINT,
  qty          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_lines_account ON journal_lines(merchant_id, account, entry_date);
CREATE INDEX IF NOT EXISTS idx_lines_order ON journal_lines(order_id, account);
CREATE INDEX IF NOT EXISTS idx_lines_journal ON journal_lines(journal_id);

DROP TRIGGER IF EXISTS lines_no_mutation ON journal_lines;
CREATE TRIGGER lines_no_mutation
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE TABLE IF NOT EXISTS fx_rates (
  id           BIGSERIAL PRIMARY KEY,
  merchant_id  BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  currency     TEXT NOT NULL,
  rate_date    TEXT NOT NULL,
  rate         TEXT NOT NULL,
  source       TEXT NOT NULL,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reason_codes (
  code            TEXT NOT NULL,
  exception_type  TEXT NOT NULL,
  label           TEXT NOT NULL,
  effect          TEXT NOT NULL,
  closes          BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (exception_type, code)
);

-- Seed (idempotent; the app also re-seeds at startup in case the DB predates it).
INSERT INTO reason_codes (code, exception_type, label, effect, closes) VALUES
  ('partial_delivery', 'short_settlement', 'আংশিক ডেলিভারি',
   'Revenue reduced by the shortfall, refused goods go back into inventory (stock return entry), courier charges stay as booked.', TRUE),
  ('delivery_discount', 'short_settlement', 'ডেলিভারিতে ছাড়',
   'Revenue reduced by the shortfall booked as a door discount. Full stock consumed, nothing returned.', TRUE),
  ('courier_short', 'short_settlement', 'কুরিয়ার কম দিয়েছে',
   'Revenue unchanged. The difference posts as a firm receivable from the courier to be recovered.', TRUE)
ON CONFLICT (exception_type, code) DO NOTHING;

CREATE TABLE IF NOT EXISTS exception_queue (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  dedupe_key        TEXT NOT NULL,
  value             BIGINT NOT NULL DEFAULT 0,
  order_id          BIGINT,
  product_id        BIGINT,
  courier           TEXT,
  settlement_row_id BIGINT,
  details           JSONB NOT NULL DEFAULT '{}'::jsonb,
  raised_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raised_by         TEXT NOT NULL,
  snoozed_until     TEXT,
  resolution        TEXT,
  resolution_data   TEXT,
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT
);
CREATE INDEX IF NOT EXISTS idx_exception_status ON exception_queue(merchant_id, status, type);
-- Only one OPEN exception per dedupe key (mirrors the SQLite schema)
CREATE UNIQUE INDEX IF NOT EXISTS exception_open_once ON exception_queue(merchant_id, type, dedupe_key) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS uploads (
  id                  BIGSERIAL PRIMARY KEY,
  merchant_id         BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('courier_settlement','prices','products','orders')),
  courier             TEXT,
  filename            TEXT NOT NULL,
  sha256              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','committed','discarded')),
  row_count           INTEGER NOT NULL DEFAULT 0,
  summary             JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload             TEXT,
  deposit_account_id  BIGINT,
  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settlement_rows (
  id               BIGSERIAL PRIMARY KEY,
  merchant_id      BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  upload_id        BIGINT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  courier          TEXT NOT NULL,
  row_no           INTEGER NOT NULL,
  raw              TEXT NOT NULL,
  consignment_id   TEXT,
  merchant_ref     TEXT,
  status_raw       TEXT,
  status           TEXT,
  cod_collected    BIGINT NOT NULL DEFAULT 0,
  delivery_charge  BIGINT NOT NULL DEFAULT 0,
  cod_fee          BIGINT NOT NULL DEFAULT 0,
  return_fee       BIGINT NOT NULL DEFAULT 0,
  sheet_payout     BIGINT,
  delivery_date    TEXT,
  settlement_date  TEXT,
  settlement_ref   TEXT,
  order_id         BIGINT,
  outcome          TEXT,
  outcome_detail   TEXT,
  dedupe_key       TEXT
);
-- A consignment may only be paid once per sheet outcome (mirrors the SQLite schema)
CREATE UNIQUE INDEX IF NOT EXISTS settlement_once ON settlement_rows(merchant_id, dedupe_key)
  WHERE outcome IN ('posted','exception','unmatched');

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  merchant_id  BIGINT,
  at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    TEXT,
  before       TEXT,
  after        TEXT
);
DROP TRIGGER IF EXISTS audit_no_mutation ON audit_log;
CREATE TRIGGER audit_no_mutation
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_mutation();

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            BIGSERIAL PRIMARY KEY,
  merchant_id   BIGINT,
  user_id       BIGINT,
  direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
  phone         TEXT NOT NULL,
  msg_type      TEXT NOT NULL DEFAULT 'text',
  body          TEXT,
  delivery      TEXT NOT NULL,
  error         TEXT,
  wa_message_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Never accept the same inbound WhatsApp webhook twice (mirrors the SQLite schema)
CREATE UNIQUE INDEX IF NOT EXISTS wa_inbound_once ON whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_drafts (
  id           BIGSERIAL PRIMARY KEY,
  merchant_id  BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('pending','confirmed','rejected','expired','superseded')),
  stage        TEXT NOT NULL CHECK (stage IN ('confirm','choose_product','choose_supplier')),
  intent       TEXT NOT NULL,
  draft        JSONB NOT NULL,
  raw_text     TEXT NOT NULL,
  parser       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at   TIMESTAMPTZ,
  result_ref   TEXT
);

CREATE TABLE IF NOT EXISTS scheduler_runs (
  merchant_id  BIGINT NOT NULL,
  job          TEXT NOT NULL,
  run_key      TEXT NOT NULL,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (merchant_id, job, run_key)
);

-- ==============================================================================
-- MILESTONE 1 TABLES (POSTGRESQL)
-- ==============================================================================

-- 1. SaaS Subscription Plans Catalog
CREATE TABLE IF NOT EXISTS saas_plans (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  price_poisha      BIGINT NOT NULL,
  billing_interval  TEXT NOT NULL DEFAULT 'monthly',
  order_limit       INTEGER NOT NULL,
  courier_limit     INTEGER NOT NULL,
  user_limit        INTEGER NOT NULL,
  has_whatsapp      BOOLEAN NOT NULL DEFAULT TRUE,
  has_meta_sync     BOOLEAN NOT NULL DEFAULT FALSE,
  has_mushak        BOOLEAN NOT NULL DEFAULT FALSE,
  has_multi_brand   BOOLEAN NOT NULL DEFAULT FALSE,
  features          JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'not_launched', 'deprecated')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Billing Invoices & Dunning
CREATE TABLE IF NOT EXISTS billing_invoices (
  id              BIGSERIAL PRIMARY KEY,
  merchant_id     BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_id         TEXT NOT NULL REFERENCES saas_plans(id),
  amount          BIGINT NOT NULL,
  billing_period  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'failed', 'pending', 'cancelled')),
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('bkash', 'card', 'nagad', 'bank')),
  payment_details TEXT,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  pauses_at       TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON billing_invoices(merchant_id, status);

-- 3. Scheduled Jobs Telemetry (13 Background Crons)
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  job_key               TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  frequency             TEXT NOT NULL,
  last_run_at           TIMESTAMPTZ,
  last_success_at       TIMESTAMPTZ,
  duration_ms           INTEGER,
  status                TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'failed', 'failing', 'running', 'paused', 'partial')),
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  error_message         TEXT,
  error_stack           TEXT,
  failing_batch         TEXT,
  next_run_at           TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Dead-Letter Queue (DLQ)
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id            BIGSERIAL PRIMARY KEY,
  job_key       TEXT NOT NULL REFERENCES scheduled_jobs(job_key),
  merchant_id   BIGINT REFERENCES merchants(id) ON DELETE CASCADE,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  failed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retry_count   INTEGER NOT NULL DEFAULT 3,
  error         TEXT,
  error_code    TEXT,
  error_detail  TEXT,
  status        TEXT NOT NULL DEFAULT 'waiting_human' CHECK (status IN ('waiting_human', 'requeued', 'discarded')),
  resolved_at   TIMESTAMPTZ,
  resolved_by   TEXT
);
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_jobs(status, job_key);

-- 5. Integration Connection Status
CREATE TABLE IF NOT EXISTS integration_connections (
  id                    BIGSERIAL PRIMARY KEY,
  merchant_id           BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  connector_type        TEXT NOT NULL CHECK (connector_type IN ('courier', 'store', 'meta_ads', 'whatsapp', 'mfs', 'bkash')),
  provider              TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'failing', 'never_connected', 'suspended', 'sheet_upload')),
  last_success_at       TIMESTAMPTZ,
  last_sync_at          TIMESTAMPTZ,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  failure_reason        TEXT,
  token_expires_at      TIMESTAMPTZ,
  account_identifier    TEXT,
  config                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, connector_type, provider)
);
CREATE INDEX IF NOT EXISTS idx_integ_status ON integration_connections(merchant_id, status);

-- 6. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting_admin', 'waiting_merchant', 'resolved', 'closed')),
  waiting_hours     INTEGER NOT NULL DEFAULT 0,
  assigned_to       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_replied_at  TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, priority);

-- 7. Broadcast Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  send_whatsapp   BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. AI Prompt Versions & Canary Rollouts
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id                  BIGSERIAL PRIMARY KEY,
  task_key            TEXT NOT NULL,
  version_label       TEXT NOT NULL,
  description         TEXT,
  prompt_template     TEXT NOT NULL,
  rollout_status      TEXT NOT NULL CHECK (rollout_status IN ('live', 'canary', 'retired', 'draft')),
  rollout_percentage  INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  confirmation_rate   DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  drafts_count        INTEGER NOT NULL DEFAULT 0,
  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_prompts_task ON ai_prompt_versions(task_key, rollout_status);

-- 9. AI Training Corrections (Rejected Drafts Few-Shot Bank)
CREATE TABLE IF NOT EXISTS ai_training_corrections (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       BIGINT REFERENCES merchants(id) ON DELETE CASCADE,
  task_key          TEXT NOT NULL DEFAULT 'bengali_expense_extraction',
  raw_input         TEXT NOT NULL,
  ai_understood     JSONB NOT NULL,
  rejection_reason  TEXT NOT NULL,
  corrected_output  JSONB,
  corrected_data    JSONB,
  is_few_shot       BOOLEAN NOT NULL DEFAULT FALSE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'corrected', 'few_shot_added', 'discarded')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  corrected_at      TIMESTAMPTZ,
  corrected_by      TEXT
);

-- 10. AI Safety Guardrails & Model Routing
CREATE TABLE IF NOT EXISTS ai_guardrails (
  guardrail_key TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  description   TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  is_immutable  BOOLEAN NOT NULL DEFAULT FALSE,
  parameters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_model_routes (
  task_key    TEXT PRIMARY KEY,
  model_name  TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Feature Flags & Courier Adapters
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key            TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  description         TEXT,
  rollout_percentage  INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  target_plan         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          TEXT
);

CREATE TABLE IF NOT EXISTS courier_adapters (
  id              BIGSERIAL PRIMARY KEY,
  courier_code    TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  adapter_type    TEXT NOT NULL CHECK (adapter_type IN ('api', 'sheet')),
  mapping_version TEXT NOT NULL,
  tenants_count   INTEGER NOT NULL DEFAULT 0,
  column_mapping  JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_config (
  config_key  TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- 12. Recurring Expenses Engine
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  head              TEXT NOT NULL CHECK (head IN ('rent', 'salary', 'utilities', 'software', 'transport', 'packaging', 'other_expense', 'internet')),
  name              TEXT NOT NULL,
  amount            BIGINT NOT NULL CHECK (amount > 0),
  posts_on_day      INTEGER NOT NULL CHECK (posts_on_day BETWEEN 1 AND 28),
  cash_account_id   BIGINT REFERENCES cash_accounts(id) ON DELETE SET NULL,
  note              TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  last_posted_date  TEXT,
  next_date         TEXT,
  created_by        TEXT NOT NULL DEFAULT 'system',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recurring_merchant ON recurring_expenses(merchant_id, active);

-- 13. Purchase Memo Photo OCR Drafts
CREATE TABLE IF NOT EXISTS memo_drafts (
  id          BIGSERIAL PRIMARY KEY,
  merchant_id BIGINT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  image_url   TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  ocr_data    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'discarded')),
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at  TIMESTAMPTZ
);


DO $$
DECLARE
  tbl TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOR tbl IN SELECT unnest(ARRAY['orders', 'journals', 'exception_queue', 'whatsapp_messages', 'products'])
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
      END IF;
    END LOOP;
  END IF;
END $$;
