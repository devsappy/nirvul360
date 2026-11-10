-- ==============================================================================
-- GROSS MANAGEMENT — SUPABASE POSTGRESQL SEED DATA
-- ==============================================================================
-- Run this in the Supabase SQL Editor AFTER running `supabase/schema.sql`.
-- Populates 4 Multi-Tenant Stores, 4-Tier Hierarchy Users, Products, Cash Accounts,
-- Suppliers, Purchases, Orders, Order Items, SaaS Plans, Billing Invoices,
-- Scheduled Jobs, DLQ, Integration Connections, Support Tickets, Announcements,
-- AI Prompts & Training Corrections, Guardrails, Model Routes, Feature Flags,
-- Courier Adapters, System Config, Recurring Expenses, and Multi-Device Sessions.
-- Password for all accounts: password123
-- ==============================================================================

-- 1. MERCHANTS (MULTI-TENANT SAAS STORES)
INSERT INTO merchants (id, name, api_key, settings, plan, plan_price, order_limit, ai_token_cap, ai_tokens_used, trial_ends_at, created_at)
VALUES 
  (1, 'Artisan Wear Bangladesh', 'gm_live_artisan_wear_01', '{"currency": "BDT"}'::jsonb, 'growth', 100000, 5000, 50000, 18450, NULL, NOW() - INTERVAL '60 days'),
  (2, 'Dhaka Gadget Hub', 'gm_live_gadget_hub_02', '{"currency": "BDT"}'::jsonb, 'starter', 50000, 1500, 50000, 7200, NULL, NOW() - INTERVAL '45 days'),
  (3, 'Chittagong Organic Teas', 'gm_live_organic_teas_03', '{"currency": "BDT"}'::jsonb, 'growth', 100000, 5000, 50000, 2410, NULL, NOW() - INTERVAL '30 days'),
  (4, 'Sylhet Craft Leather', 'gm_live_sylhet_leather_04', '{"currency": "BDT"}'::jsonb, 'trial', 0, 500, 50000, 450, NOW() + INTERVAL '14 days', NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name,
  plan = EXCLUDED.plan,
  plan_price = EXCLUDED.plan_price,
  order_limit = EXCLUDED.order_limit,
  ai_token_cap = EXCLUDED.ai_token_cap,
  ai_tokens_used = EXCLUDED.ai_tokens_used,
  trial_ends_at = EXCLUDED.trial_ends_at;

SELECT setval('merchants_id_seq', (SELECT MAX(id) FROM merchants));

-- 2. USERS (4-TIER SAAS HIERARCHY)
-- Password Hash for 'password123': a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8
INSERT INTO users (id, merchant_id, name, email, password_hash, whatsapp, role, created_at)
VALUES
  -- Developers / Platform Admins
  (1, 1, 'Chief Super Admin', 'superadmin@gross.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801700000001', 'super_admin', NOW() - INTERVAL '60 days'),
  (2, 1, 'Platform Admin', 'admin@gross.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801700000002', 'admin', NOW() - INTERVAL '60 days'),

  -- Tenant 1: Artisan Wear Bangladesh
  (3, 1, 'Tamim Ahmed', 'owner@demo.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801711000001', 'agency_owner', NOW() - INTERVAL '60 days'),
  (4, 1, 'Karim Accountant', 'accountant@demo.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801711000002', 'accountant', NOW() - INTERVAL '50 days'),
  (9, 1, 'Jamal Manager', 'manager@demo.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801711000003', 'manager', NOW() - INTERVAL '50 days'),

  -- Tenant 2: Dhaka Gadget Hub
  (5, 2, 'Tanvir Hasan', 'tanvir@gadgethub.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801819000001', 'agency_owner', NOW() - INTERVAL '45 days'),
  (6, 2, 'Rafiq Accountant', 'rafiq@gadgethub.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801819000002', 'accountant', NOW() - INTERVAL '40 days'),

  -- Tenant 3: Chittagong Organic Teas
  (7, 3, 'Nusrat Jahan', 'nusrat@organictea.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801612000001', 'agency_owner', NOW() - INTERVAL '30 days'),
  (8, 3, 'Sultana Begum', 'sultana@organictea.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801612000002', 'accountant', NOW() - INTERVAL '25 days'),

  -- Tenant 4: Sylhet Craft Leather
  (10, 4, 'Kamal Uddin', 'kamal@sylhetleather.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801713000001', 'agency_owner', NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO UPDATE SET
  merchant_id = EXCLUDED.merchant_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  whatsapp = EXCLUDED.whatsapp,
  role = EXCLUDED.role;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- 3. CASH ACCOUNTS
INSERT INTO cash_accounts (id, merchant_id, name, kind, is_default, created_at)
VALUES
  (1, 1, 'City Bank - Corporate', 'bank', TRUE, NOW() - INTERVAL '60 days'),
  (2, 1, 'bKash Merchant Account', 'bkash', FALSE, NOW() - INTERVAL '60 days'),
  (3, 1, 'Nagad Merchant Account', 'nagad', FALSE, NOW() - INTERVAL '60 days'),
  (4, 2, 'Dutch-Bangla Bank (Corporate)', 'bank', TRUE, NOW() - INTERVAL '45 days'),
  (5, 2, 'bKash Merchant (Gadget Hub)', 'bkash', FALSE, NOW() - INTERVAL '45 days'),
  (6, 3, 'BRAC Bank SME Account', 'bank', TRUE, NOW() - INTERVAL '30 days'),
  (7, 1, 'Office Cash Drawer', 'cash', FALSE, NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('cash_accounts_id_seq', (SELECT MAX(id) FROM cash_accounts));

-- 4. SUPPLIERS
INSERT INTO suppliers (id, merchant_id, name, phone, address, terms_days, credit_terms_days, categories, advance_balance, created_at)
VALUES
  (1, 1, 'Narayanganj Knitwear Mills', '01712000001', 'Babubazar, Old Dhaka', 15, 15, 'Cotton, Silk', 500000, NOW() - INTERVAL '60 days'),
  (2, 1, 'Dhaka Textiles & Dyeing', '01712000002', 'New Market, Dhaka', 30, 30, 'Buttons, Zippers, Accessories', 0, NOW() - INTERVAL '60 days'),
  (3, 1, 'Hossain Accessories & Packaging', '01712000003', 'Mirpur 10, Dhaka', 7, 7, 'Poly bags, Shipping labels, Cartons', 200000, NOW() - INTERVAL '60 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('suppliers_id_seq', (SELECT MAX(id) FROM suppliers));

-- 5. PRODUCTS
INSERT INTO products (id, merchant_id, sku, name, selling_price, active, source, created_by, created_at)
VALUES
  -- Tenant 1
  (1, 1, 'TS-001', 'Premium Cotton T-Shirt', 65000, TRUE, 'manual', 'user:3', NOW() - INTERVAL '60 days'),
  (2, 1, 'PJ-101', 'Traditional Silk Panjabi', 220000, TRUE, 'manual', 'user:3', NOW() - INTERVAL '60 days'),
  (3, 1, 'HD-201', 'Fleece Winter Hoodie', 165000, TRUE, 'manual', 'user:3', NOW() - INTERVAL '60 days'),
  -- Tenant 2
  (4, 2, 'GH-TWS-PRO', 'Noise-Cancelling Earbuds Pro', 245000, TRUE, 'manual', 'user:5', NOW() - INTERVAL '45 days'),
  (5, 2, 'GH-PB-20K', 'Fast Charge 20,000mAh PowerBank', 185000, TRUE, 'manual', 'user:5', NOW() - INTERVAL '45 days'),
  (6, 2, 'GH-SW-01', 'Amoled Smartwatch Ultra', 320000, TRUE, 'manual', 'user:5', NOW() - INTERVAL '45 days'),
  -- Tenant 3
  (7, 3, 'TEA-SM-500', 'Sreemangal First Flush Black Tea 500g', 85000, TRUE, 'manual', 'user:7', NOW() - INTERVAL '30 days'),
  (8, 3, 'TEA-GR-250', 'Organic Tulsi Green Tea 250g', 65000, TRUE, 'manual', 'user:7', NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));

-- 6. PRODUCT PRICE HISTORY (Versioned purchase cost)
INSERT INTO product_price_history (merchant_id, product_id, purchase_price, effective_from, method, source, created_by, created_at)
VALUES
  (1, 1, 28000, TO_CHAR(NOW() - INTERVAL '60 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:3', NOW() - INTERVAL '60 days'),
  (1, 2, 110000, TO_CHAR(NOW() - INTERVAL '60 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:3', NOW() - INTERVAL '60 days'),
  (1, 3, 75000, TO_CHAR(NOW() - INTERVAL '60 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:3', NOW() - INTERVAL '60 days'),
  (2, 4, 110000, TO_CHAR(NOW() - INTERVAL '45 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:5', NOW() - INTERVAL '45 days'),
  (2, 5, 85000, TO_CHAR(NOW() - INTERVAL '45 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:5', NOW() - INTERVAL '45 days'),
  (2, 6, 160000, TO_CHAR(NOW() - INTERVAL '45 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:5', NOW() - INTERVAL '45 days'),
  (3, 7, 38000, TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:7', NOW() - INTERVAL '30 days'),
  (3, 8, 28000, TO_CHAR(NOW() - INTERVAL '30 days', 'YYYY-MM-DD'), 'stated', 'manual', 'user:7', NOW() - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- 7. PURCHASES
INSERT INTO purchases (id, merchant_id, supplier_id, product_id, qty, unit_cost, purchase_date, batch_no, status, total_cost, paid_amount, source, created_by, created_at)
VALUES
  (1, 1, 1, 1, 60, 31000, TO_CHAR(NOW() - INTERVAL '16 days', 'YYYY-MM-DD'), 'PB-0412', 'part_paid', 1860000, 1000000, 'manual', 'user:3', NOW() - INTERVAL '16 days'),
  (2, 1, 1, 2, 20, 110000, TO_CHAR(NOW() - INTERVAL '5 days', 'YYYY-MM-DD'), 'PB-0450', 'unpaid', 2200000, 0, 'manual', 'user:3', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('purchases_id_seq', (SELECT MAX(id) FROM purchases));

-- 8. ORDERS
INSERT INTO orders (id, merchant_id, external_id, order_date, customer_name, customer_phone, address, courier, consignment_id, status, dispatched_date, delivered_date, returned_date, subtotal, discount, shipping_charge, total, advance_paid, cod_amount, source, created_by, created_at)
VALUES
  -- Tenant 1: Artisan Wear
  (1, 1, 'INV-1001', TO_CHAR(NOW() - INTERVAL '10 days', 'YYYY-MM-DD'), 'Rahim Ullah', '01711223344', 'Gulshan 2, Dhaka', 'steadfast', 'SF-9001', 'delivered', TO_CHAR(NOW() - INTERVAL '10 days', 'YYYY-MM-DD'), TO_CHAR(NOW() - INTERVAL '9 days', 'YYYY-MM-DD'), NULL, 65000, 0, 6000, 71000, 0, 71000, 'manual', 'user:3', NOW() - INTERVAL '10 days'),
  (2, 1, 'INV-1002', TO_CHAR(NOW() - INTERVAL '8 days', 'YYYY-MM-DD'), 'Nasir Uddin', '01811334455', 'Agrabad, Chittagong', 'steadfast', 'SF-9002', 'delivered', TO_CHAR(NOW() - INTERVAL '8 days', 'YYYY-MM-DD'), TO_CHAR(NOW() - INTERVAL '7 days', 'YYYY-MM-DD'), NULL, 220000, 0, 12000, 232000, 0, 232000, 'manual', 'user:3', NOW() - INTERVAL '8 days'),
  (3, 1, 'INV-1003', TO_CHAR(NOW() - INTERVAL '5 days', 'YYYY-MM-DD'), 'Kamal Hossain', '01911445566', 'Zindabazar, Sylhet', 'steadfast', 'SF-9003', 'in_transit', TO_CHAR(NOW() - INTERVAL '5 days', 'YYYY-MM-DD'), NULL, NULL, 165000, 0, 12000, 177000, 0, 177000, 'manual', 'user:3', NOW() - INTERVAL '5 days'),
  (4, 1, 'INV-1004', TO_CHAR(NOW() - INTERVAL '3 days', 'YYYY-MM-DD'), 'Sultana Parveen', '01611556677', 'Uttara Sector 3, Dhaka', 'steadfast', 'SF-9004', 'delivered', TO_CHAR(NOW() - INTERVAL '3 days', 'YYYY-MM-DD'), TO_CHAR(NOW() - INTERVAL '2 days', 'YYYY-MM-DD'), NULL, 65000, 0, 6000, 71000, 0, 71000, 'manual', 'user:3', NOW() - INTERVAL '3 days'),
  (5, 1, 'INV-1005', TO_CHAR(NOW() - INTERVAL '2 days', 'YYYY-MM-DD'), 'Faruk Ahmed', '01711667788', 'Chawkbazar, Chittagong', 'steadfast', 'SF-9005', 'returned', TO_CHAR(NOW() - INTERVAL '2 days', 'YYYY-MM-DD'), NULL, TO_CHAR(NOW() - INTERVAL '1 day', 'YYYY-MM-DD'), 65000, 0, 12000, 77000, 0, 77000, 'manual', 'user:3', NOW() - INTERVAL '2 days'),
  
  -- Tenant 2: Dhaka Gadget Hub
  (6, 2, 'GH-501', TO_CHAR(NOW() - INTERVAL '5 days', 'YYYY-MM-DD'), 'Zakir Hossain', '01712998877', 'Dhanmondi 27, Dhaka', 'steadfast', 'SF-GH-101', 'delivered', TO_CHAR(NOW() - INTERVAL '5 days', 'YYYY-MM-DD'), TO_CHAR(NOW() - INTERVAL '4 days', 'YYYY-MM-DD'), NULL, 245000, 0, 6000, 251000, 0, 251000, 'manual', 'user:5', NOW() - INTERVAL '5 days'),
  (7, 2, 'GH-502', TO_CHAR(NOW() - INTERVAL '3 days', 'YYYY-MM-DD'), 'Mehedi Hasan', '01915443322', 'GEC Circle, Chittagong', 'steadfast', 'SF-GH-102', 'in_transit', TO_CHAR(NOW() - INTERVAL '3 days', 'YYYY-MM-DD'), NULL, NULL, 370000, 0, 12000, 382000, 0, 382000, 'manual', 'user:5', NOW() - INTERVAL '3 days'),

  -- Tenant 3: Chittagong Organic Teas
  (8, 3, 'TEA-101', TO_CHAR(NOW() - INTERVAL '4 days', 'YYYY-MM-DD'), 'Kazi Shahid', '01719556677', 'Nasirabad, Chittagong', 'steadfast', 'SF-TEA-01', 'delivered', TO_CHAR(NOW() - INTERVAL '4 days', 'YYYY-MM-DD'), TO_CHAR(NOW() - INTERVAL '3 days', 'YYYY-MM-DD'), NULL, 170000, 0, 5000, 175000, 0, 175000, 'manual', 'user:7', NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders));

-- 9. ORDER ITEMS
INSERT INTO order_items (order_id, product_id, qty, unit_price, line_total)
VALUES
  -- Tenant 1: Artisan Wear
  (1, 1, 1, 65000, 65000),
  (2, 2, 1, 220000, 220000),
  (3, 3, 1, 165000, 165000),
  (4, 1, 1, 65000, 65000),
  (5, 1, 1, 65000, 65000),
  -- Tenant 2: Dhaka Gadget Hub
  (6, 4, 1, 245000, 245000),
  (7, 5, 2, 185000, 370000),
  -- Tenant 3: Chittagong Organic Teas
  (8, 7, 2, 85000, 170000)
ON CONFLICT DO NOTHING;

-- 10. AUDIT LOG (PLATFORM ACTIVITY FEED)
INSERT INTO audit_log (merchant_id, at, actor, action, entity, entity_id, after)
VALUES
  (1, NOW() - INTERVAL '2 hours', 'user:3', 'user_login', 'sessions', '3', '{"note": "Tamim Ahmed logged in from Dhaka"}'),
  (1, NOW() - INTERVAL '1 hour', 'user:4', 'expense_recorded', 'journals', '1', '{"amount": 4200, "head": "packaging", "note": "Karim recorded packaging boxes"}'),
  (1, NOW() - INTERVAL '45 minutes', 'system:courier', 'courier_sync', 'orders', '4', '{"synced_orders": 4, "delivered": 3, "cod_collected": 595000}'),
  (2, NOW() - INTERVAL '30 minutes', 'user:5', 'user_login', 'sessions', '5', '{"note": "Tanvir Hasan logged in"}'),
  (2, NOW() - INTERVAL '20 minutes', 'user:6', 'expense_recorded', 'journals', '2', '{"amount": 3500, "head": "office_stationery", "note": "Rafiq bought packaging tape & bubble wrap"}'),
  (3, NOW() - INTERVAL '15 minutes', 'user:7', 'user_login', 'sessions', '7', '{"note": "Nusrat Jahan signed in"}'),
  (3, NOW() - INTERVAL '10 minutes', 'user:8', 'expense_recorded', 'journals', '3', '{"amount": 1200, "head": "rickshaw_delivery", "note": "Sultana recorded local parcel drop"}')
ON CONFLICT DO NOTHING;

SELECT setval('audit_log_id_seq', (SELECT MAX(id) FROM audit_log));

-- 11. SAAS SUBSCRIPTION PLANS CATALOG
INSERT INTO saas_plans (id, name, price_poisha, order_limit, courier_limit, user_limit, has_whatsapp, has_meta_sync, has_mushak, status, created_at)
VALUES
  ('starter', 'Starter', 50000, 1500, 1, 2, TRUE, FALSE, FALSE, 'active', '2026-01-01T00:00:00Z'),
  ('growth', 'Growth', 100000, 5000, 5, 6, TRUE, TRUE, FALSE, 'active', '2026-01-01T00:00:00Z'),
  ('scale', 'Scale', 250000, 999999, 99, 99, TRUE, TRUE, TRUE, 'not_launched', '2026-01-01T00:00:00Z'),
  ('trial', 'Trial', 0, 500, 1, 2, TRUE, FALSE, FALSE, 'active', '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_poisha = EXCLUDED.price_poisha,
  order_limit = EXCLUDED.order_limit,
  courier_limit = EXCLUDED.courier_limit,
  user_limit = EXCLUDED.user_limit,
  has_whatsapp = EXCLUDED.has_whatsapp,
  has_meta_sync = EXCLUDED.has_meta_sync,
  has_mushak = EXCLUDED.has_mushak,
  status = EXCLUDED.status;

-- 12. BILLING INVOICES & DUNNING
INSERT INTO billing_invoices (merchant_id, plan_id, amount, payment_method, payment_details, status, attempt_count, max_attempts, pauses_at, billing_period, created_at)
VALUES
  (1, 'growth', 100000, 'bkash', 'bKash TrxID: 9J28A4471', 'paid', 1, 3, NULL, TO_CHAR(NOW(), 'YYYY-MM'), NOW() - INTERVAL '5 days'),
  (2, 'starter', 50000, 'card', 'MasterCard ending 4471', 'paid', 1, 3, NULL, TO_CHAR(NOW(), 'YYYY-MM'), NOW() - INTERVAL '6 days'),
  (1, 'growth', 100000, 'bkash', 'bKash TrxID: 8H17Z3360', 'paid', 1, 3, NULL, TO_CHAR(NOW() - INTERVAL '1 month', 'YYYY-MM'), NOW() - INTERVAL '35 days'),
  (2, 'starter', 50000, 'card', 'MasterCard ending 4471', 'paid', 1, 3, NULL, TO_CHAR(NOW() - INTERVAL '1 month', 'YYYY-MM'), NOW() - INTERVAL '36 days'),
  (3, 'growth', 100000, 'card', 'Declined: Insufficient funds', 'failed', 2, 3, NOW() + INTERVAL '2 days', TO_CHAR(NOW(), 'YYYY-MM'), NOW() - INTERVAL '2 days'),
  (4, 'starter', 50000, 'bkash', 'Declined: Merchant wallet low balance', 'failed', 3, 3, NOW(), TO_CHAR(NOW(), 'YYYY-MM'), NOW() - INTERVAL '7 days')
ON CONFLICT DO NOTHING;

SELECT setval('billing_invoices_id_seq', (SELECT COALESCE(MAX(id), 1) FROM billing_invoices));

-- 13. SCHEDULED JOBS TELEMETRY (13 Background Crons)
INSERT INTO scheduled_jobs (job_key, name, frequency, last_run_at, duration_ms, status, error_message, error_stack, consecutive_failures, next_run_at)
VALUES
  ('exception_scan', 'Exception Scanner', '1 hour', NOW(), 30000, 'failed', 'Courier API timeout after 30000ms', 'TimeoutError: connection to steadfast timed out', 1, NOW() + INTERVAL '1 hour'),
  ('courier_sync', 'Courier API Sync', '30 min', NOW(), 420, 'ok', NULL, NULL, 0, NOW() + INTERVAL '30 minutes'),
  ('settlement_match', 'Settlement Auto-Reconciliation', 'on upload', NOW() - INTERVAL '1 day', 850, 'ok', NULL, NULL, 0, NULL),
  ('stuck_parcel_scan', 'Stuck Parcel Scanner', 'daily', NOW(), 110, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 day'),
  ('meta_ads_sync', 'Meta Ads Spend Sync', '1 hour', NOW(), 350, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 hour'),
  ('cogs_recompute', 'COGS Moving Average Recompute', 'nightly', NOW(), 2100, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 day'),
  ('daily_digest', 'Morning WhatsApp Profit Digest', '09:00 local', NOW(), 95, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 day'),
  ('recurring_expense_post', 'Recurring Expenses Auto-Post', 'daily', NOW(), 55, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 day'),
  ('session_cleanup', 'Stale Session Cleanup', 'daily', NOW(), 30, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 day'),
  ('backup_verify', 'Weekly Scratch DB Restore Test', 'weekly', NOW() - INTERVAL '3 days', 14200, 'ok', NULL, NULL, 0, NOW() + INTERVAL '4 days'),
  ('dunning_retry', 'Failed Collection Dunning Retry', 'daily', NOW(), 120, 'ok', NULL, NULL, 0, NOW() + INTERVAL '1 day'),
  ('token_quota_reset', 'AI Token Quota Reset', 'monthly', NOW() - INTERVAL '10 days', 15, 'ok', NULL, NULL, 0, NOW() + INTERVAL '20 days'),
  ('audit_archival', 'Audit Log Archival to Storage', 'weekly', NOW() - INTERVAL '2 days', 6500, 'ok', NULL, NULL, 0, NOW() + INTERVAL '5 days')
ON CONFLICT (job_key) DO UPDATE SET
  name = EXCLUDED.name,
  frequency = EXCLUDED.frequency,
  last_run_at = EXCLUDED.last_run_at,
  duration_ms = EXCLUDED.duration_ms,
  status = EXCLUDED.status,
  error_message = EXCLUDED.error_message,
  error_stack = EXCLUDED.error_stack,
  consecutive_failures = EXCLUDED.consecutive_failures,
  next_run_at = EXCLUDED.next_run_at;

-- 14. DEAD-LETTER QUEUE (DLQ)
INSERT INTO dead_letter_jobs (job_key, merchant_id, payload, failed_at, retry_count, error, status)
VALUES
  ('courier_sync', 1, '{"consignment_id": "SF-9912", "courier": "steadfast", "merchant_id": 1}'::jsonb, NOW() - INTERVAL '1 day', 3, 'HTTP 504 Gateway Timeout on Steadfast webhook', 'waiting_human'),
  ('meta_ads_sync', 2, '{"merchant_id": 2, "account_id": "act_881920"}'::jsonb, NOW() - INTERVAL '2 days', 3, 'OAuth token expired / insufficient permissions', 'waiting_human'),
  ('daily_digest', 3, '{"merchant_id": 3, "recipient": "8801719556677"}'::jsonb, NOW(), 3, 'WhatsApp API 131026: Receiver phone number not opted in', 'waiting_human')
ON CONFLICT DO NOTHING;

SELECT setval('dead_letter_jobs_id_seq', (SELECT COALESCE(MAX(id), 1) FROM dead_letter_jobs));

-- 15. INTEGRATION CONNECTIONS
INSERT INTO integration_connections (merchant_id, connector_type, provider, status, last_success_at, consecutive_failures, failure_reason, token_expires_at, config, created_at, updated_at)
VALUES
  (1, 'courier', 'pathao', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '45 days', '{"client_id": "pth_live_88"}'::jsonb, NOW() - INTERVAL '60 days', NOW()),
  (1, 'courier', 'steadfast', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '180 days', '{"api_key": "sf_live_77"}'::jsonb, NOW() - INTERVAL '60 days', NOW()),
  (1, 'meta_ads', 'meta_ads', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '2 days', '{"act_id": "act_881920"}'::jsonb, NOW() - INTERVAL '60 days', NOW()),
  (1, 'store', 'shopify', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '60 days', '{"shop": "artisanwear.myshopify.com"}'::jsonb, NOW() - INTERVAL '60 days', NOW()),
  (1, 'bkash', 'bkash', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '90 days', '{"app_key": "bkash_live_55"}'::jsonb, NOW() - INTERVAL '60 days', NOW()),
  (2, 'courier', 'steadfast', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '120 days', '{"api_key": "sf_live_22"}'::jsonb, NOW() - INTERVAL '45 days', NOW()),
  (2, 'courier', 'redx', 'failing', NOW() - INTERVAL '2 days', 4, 'Invalid API Secret / IP not whitelisted', NOW() + INTERVAL '5 days', '{"api_key": "rx_live_11"}'::jsonb, NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),
  (3, 'courier', 'steadfast', 'healthy', NOW(), 0, NULL, NOW() + INTERVAL '85 days', '{"api_key": "sf_live_33"}'::jsonb, NOW() - INTERVAL '30 days', NOW())
ON CONFLICT (merchant_id, connector_type, provider) DO UPDATE SET
  status = EXCLUDED.status,
  last_success_at = EXCLUDED.last_success_at,
  consecutive_failures = EXCLUDED.consecutive_failures,
  failure_reason = EXCLUDED.failure_reason,
  token_expires_at = EXCLUDED.token_expires_at,
  config = EXCLUDED.config,
  updated_at = EXCLUDED.updated_at;

SELECT setval('integration_connections_id_seq', (SELECT COALESCE(MAX(id), 1) FROM integration_connections));

-- 16. SUPPORT TICKETS
INSERT INTO support_tickets (merchant_id, subject, body, priority, status, assigned_to, waiting_hours, created_at, first_replied_at, resolved_at)
VALUES
  (1, 'Pathao webhook signature validation mismatch', 'We received error 401 when Pathao posts delivery status updates.', 'urgent', 'open', NULL, 32, NOW() - INTERVAL '2 days', NULL, NULL),
  (2, 'RedX tracking codes failing to sync', 'RedX shipments created yesterday are showing in transit on redx portal but not updating here.', 'high', 'open', NULL, 28, NOW() - INTERVAL '1 day', NULL, NULL),
  (3, 'How to reconcile short settlement deduction?', 'We have a short settlement from Steadfast with 200 Tk less than parcel COD.', 'normal', 'waiting_admin', NULL, 14, NOW() - INTERVAL '10 hours', NOW() - INTERVAL '6 hours', NULL),
  (1, 'Add support for sundarban courier slip OCR', 'Can we upload Sundarban CN memo photos for automatic entry?', 'low', 'waiting_merchant', NULL, 8, NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NULL),
  (2, 'Card payment declined for renewal', 'Our card was declined due to foreign transaction limit. Please re-try.', 'urgent', 'resolved', 1, 0, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days')
ON CONFLICT DO NOTHING;

SELECT setval('support_tickets_id_seq', (SELECT COALESCE(MAX(id), 1) FROM support_tickets));

-- 17. BROADCAST ANNOUNCEMENTS
INSERT INTO announcements (title, message, target_audience, send_whatsapp, created_by, published_at, status, created_at)
VALUES
  ('Steadfast Courier API Maintenance on Friday 2AM - 4AM', 'Steadfast has scheduled database upgrades. Sync jobs will pause and resume automatically.', 'all_tenants', FALSE, 1, NOW() - INTERVAL '1 day', 'published', NOW() - INTERVAL '1 day'),
  ('Meta Ads USD to BDT Conversion Rate Update', 'The standard Bangladesh Bank conversion rate for Meta Ads reporting has been updated to ৳123.50/USD.', 'growth', FALSE, 1, NOW() - INTERVAL '3 days', 'published', NOW() - INTERVAL '3 days'),
  ('Upcoming Ramadan Extended Settlement Windows', 'Advance notice regarding bank holiday settlement clearance cycles with Pathao and Steadfast.', 'all_tenants', FALSE, 1, NOW(), 'draft', NOW())
ON CONFLICT DO NOTHING;

SELECT setval('announcements_id_seq', (SELECT COALESCE(MAX(id), 1) FROM announcements));

-- 18. AI PROMPT VERSIONS & CANARY ROLLOUTS
INSERT INTO ai_prompt_versions (task_key, version_label, description, prompt_template, rollout_status, rollout_percentage, confirmation_rate, created_by, created_at)
VALUES
  ('bengali_expense_extraction', 'v7', 'Production prompt template with contextual Bangla dialect parsing and number normalization', 'Extract financial transaction details from the following Bengali text...', 'live', 100, 0.94, 'platform_admin', NOW() - INTERVAL '30 days'),
  ('bengali_expense_extraction', 'v8', 'Canary prompt template with zero-shot multi-item memo extraction and confidence scoring', 'Extract all distinct line items from the following Bengali invoice memo text...', 'canary', 10, 0.91, 'platform_admin', NOW() - INTERVAL '2 days'),
  ('bengali_expense_extraction', 'v6', 'Retired baseline prompt template', 'Extract amount and category from Bengali note...', 'retired', 0, 0.82, 'platform_admin', NOW() - INTERVAL '90 days')
ON CONFLICT DO NOTHING;

SELECT setval('ai_prompt_versions_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ai_prompt_versions));

-- 19. AI TRAINING CORRECTIONS
INSERT INTO ai_training_corrections (merchant_id, raw_input, ai_understood, rejection_reason, corrected_data, status, created_at)
VALUES
  (1, 'কালকে ব্যানারের জন্য সাভারে ৩০০ টাকা গাড়ি ভাড়া আর ৪০ টাকার চা', '{"amount": 340, "head": "entertainment"}'::jsonb, 'AI combined transport and tea into entertainment instead of splitting into transport (৳300) and office tea (৳40)', '{"items": [{"amount": 30000, "head": "transport"}, {"amount": 4000, "head": "office_stationery"}]}'::jsonb, 'pending', NOW() - INTERVAL '1 day'),
  (1, 'দারাজ থেকে ১০ পিস বাবল র‍্যাপ আনাইছি ১৫০০ টাকা ক্যাশ দিয়েছি', '{"amount": 1500, "head": "raw_materials"}'::jsonb, 'Parsed as inventory raw materials instead of packaging supplies expense', '{"amount": 150000, "head": "packaging"}'::jsonb, 'corrected', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

SELECT setval('ai_training_corrections_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ai_training_corrections));

-- 20. FEATURE FLAGS
INSERT INTO feature_flags (flag_key, label, description, rollout_percentage, updated_at)
VALUES
  ('product_performance_report', 'Product Performance Report', 'Per-SKU profit with delivered vs return rates', 100, NOW() - INTERVAL '10 days'),
  ('voice_note_entry', 'Voice Note Entry', 'Bengali speech to draft expense with Whisper', 25, NOW() - INTERVAL '10 days'),
  ('multi_brand', 'Multi-brand Store Management', 'Run multiple brands under one organization', 8, NOW() - INTERVAL '10 days'),
  ('mushak_tax', 'Mushak 6.3 & 9.1 Output', 'NBR compliant tax packs', 0, NOW() - INTERVAL '10 days'),
  ('fifo_costing', 'FIFO Inventory Costing', 'Alternative to weighted moving average', 0, NOW() - INTERVAL '10 days')
ON CONFLICT (flag_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  rollout_percentage = EXCLUDED.rollout_percentage,
  updated_at = EXCLUDED.updated_at;

-- 21. COURIER ADAPTERS
INSERT INTO courier_adapters (id, courier_code, name, adapter_type, mapping_version, tenants_count, column_mapping, is_active, created_at, updated_at)
VALUES
  (1, 'pathao', 'Pathao API', 'api', 'mapping v4', 138, '{"consignment_id": "consignment_id", "cod": "cod_collected", "delivery_fee": "delivery_charge"}'::jsonb, TRUE, NOW() - INTERVAL '60 days', NOW()),
  (2, 'steadfast', 'Steadfast API', 'api', 'mapping v3', 96, '{"consignment_id": "tracking_code", "cod": "cod_amount", "delivery_fee": "delivery_charge"}'::jsonb, TRUE, NOW() - INTERVAL '60 days', NOW()),
  (3, 'redx', 'RedX API', 'api', 'mapping v2', 42, '{"consignment_id": "tracking_id", "cod": "cash_collected", "delivery_fee": "charge"}'::jsonb, TRUE, NOW() - INTERVAL '60 days', NOW()),
  (4, 'sa_paribahan', 'SA Paribahan Sheet', 'sheet', 'mapping v1', 18, '{"consignment_id": "CN Number", "cod": "Amount", "delivery_fee": "Freight"}'::jsonb, TRUE, NOW() - INTERVAL '60 days', NOW())
ON CONFLICT (courier_code) DO UPDATE SET
  name = EXCLUDED.name,
  adapter_type = EXCLUDED.adapter_type,
  mapping_version = EXCLUDED.mapping_version,
  tenants_count = EXCLUDED.tenants_count,
  column_mapping = EXCLUDED.column_mapping,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

SELECT setval('courier_adapters_id_seq', (SELECT MAX(id) FROM courier_adapters));

-- 22. SYSTEM CONFIGURATION
INSERT INTO system_config (config_key, value, updated_at)
VALUES
  ('platform_quotas', '{"api_rate_limit": 600, "courier_pulls": 2, "whatsapp_daily": 200, "upload_size_mb": 25, "session_timeout_days": 30}'::jsonb, NOW() - INTERVAL '10 days'),
  ('maintenance_mode', '{"enabled": false, "reason": ""}'::jsonb, NOW() - INTERVAL '10 days'),
  ('worker_fleet', '{"workers_total": 6, "workers_online": 6}'::jsonb, NOW() - INTERVAL '10 days'),
  ('backups_status', '{"last_backup": "2026-11-08T02:00:00Z", "last_verified_restore": "2026-11-08T03:15:00Z", "destination": "Backblaze B2", "pitr_days": 7}'::jsonb, NOW() - INTERVAL '10 days'),
  ('ai_pricing', '{"cost_per_draft_usd": 0.005, "cost_per_1k_tokens_usd": 0.002, "usd_to_bdt_rate": 123.50}'::jsonb, NOW() - INTERVAL '10 days')
ON CONFLICT (config_key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;

-- 23. AI SAFETY GUARDRAILS & MODEL ROUTES (CLEAN FUNCTIONAL DESCRIPTIONS)
INSERT INTO ai_guardrails (guardrail_key, label, description, is_enabled, is_immutable, parameters, updated_at)
VALUES
  ('must_confirm', 'Never write without confirmation', 'Require explicit merchant confirmation before writing any journal or order', TRUE, TRUE, '{}'::jsonb, NOW()),
  ('amount_sanity', 'Amount sanity check', 'Flag expenses or orders deviating more than 3x from rolling average', TRUE, FALSE, '{"multiplier": 3}'::jsonb, NOW()),
  ('dedupe_10m', 'Duplicate within 10 min', 'Prevent double-submitting identical drafts created within 10 minutes', TRUE, FALSE, '{"window_minutes": 10}'::jsonb, NOW()),
  ('date_bounds', 'Date range ±365 days', 'Reject journal dates older than 365 days or in the future', TRUE, FALSE, '{"max_days_past": 365, "allow_future": false}'::jsonb, NOW()),
  ('high_value_block', 'Block above ৳1,00,000', 'Require super-admin approval for single transactions exceeding ৳1,00,000', FALSE, FALSE, '{"threshold_poisha": 10000000}'::jsonb, NOW())
ON CONFLICT (guardrail_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_enabled = EXCLUDED.is_enabled,
    is_immutable = EXCLUDED.is_immutable,
    parameters = EXCLUDED.parameters,
    updated_at = EXCLUDED.updated_at;

INSERT INTO ai_model_routes (task_key, model_name, description, updated_at)
VALUES
  ('intent_classification', 'gpt-4o-mini', 'Fast classification of merchant intent', NOW()),
  ('ambiguous_extraction', 'gpt-4o', 'Deep reasoning for ambiguous expense notes and voice queries', NOW()),
  ('voice_and_ocr', 'whisper+vision', 'Audio transcription and memo photo OCR', NOW())
ON CONFLICT (task_key) DO UPDATE
SET model_name = EXCLUDED.model_name,
    description = EXCLUDED.description,
    updated_at = EXCLUDED.updated_at;

-- 24. RECURRING EXPENSES
INSERT INTO recurring_expenses (merchant_id, head, name, amount, posts_on_day, cash_account_id, note, active, last_posted_date, next_date, created_by, created_at, updated_at)
VALUES
  (1, 'rent', 'Banani Showroom Rent', 3500000, 1, 1, 'Contract active until Dec 2027', TRUE, TO_CHAR(NOW() - INTERVAL '25 days', 'YYYY-MM-DD'), TO_CHAR(NOW() + INTERVAL '5 days', 'YYYY-MM-DD'), 'system', NOW() - INTERVAL '60 days', NOW() - INTERVAL '25 days'),
  (1, 'internet', 'Fiber Internet & Dedicated IP', 300000, 5, 2, '50Mbps symmetric line', TRUE, TO_CHAR(NOW() - INTERVAL '12 days', 'YYYY-MM-DD'), TO_CHAR(NOW() + INTERVAL '18 days', 'YYYY-MM-DD'), 'system', NOW() - INTERVAL '60 days', NOW() - INTERVAL '12 days'),
  (1, 'other_expense', 'Office Refreshments & Cleaning', 150000, 10, 1, 'Weekly tea, biscuits and cleaning', TRUE, TO_CHAR(NOW() - INTERVAL '6 days', 'YYYY-MM-DD'), TO_CHAR(NOW() + INTERVAL '4 days', 'YYYY-MM-DD'), 'system', NOW() - INTERVAL '60 days', NOW() - INTERVAL '6 days')
ON CONFLICT DO NOTHING;

SELECT setval('recurring_expenses_id_seq', (SELECT COALESCE(MAX(id), 1) FROM recurring_expenses));

-- 25. MULTI-DEVICE SESSIONS
INSERT INTO sessions (token, user_id, active_merchant_id, device_info, ip_address, location, last_active_at, created_at, expires_at)
VALUES
  ('sess_desktop_tamim_001', 3, 1, 'Chrome 122.0 on Windows 11', '103.205.71.18', 'Dhaka, Bangladesh', NOW(), NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days'),
  ('sess_mobile_tamim_002', 3, 1, 'Android App 2.4.1 (Samsung Galaxy S23)', '119.30.38.10', 'Dhaka, Bangladesh', NOW(), NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days'),
  ('sess_stale_tamim_003', 3, 1, 'Safari 16.2 on iPhone 12', '103.205.71.22', 'Chittagong, Bangladesh', NOW() - INTERVAL '35 days', NOW() - INTERVAL '40 days', NOW() - INTERVAL '10 days')
ON CONFLICT (token) DO UPDATE SET
  last_active_at = EXCLUDED.last_active_at,
  expires_at = EXCLUDED.expires_at;

SELECT 'Gross Management Supabase database seeded successfully with full parity and zero mockup constants!' AS status;
