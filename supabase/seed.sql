-- ==============================================================================
-- GROSS MANAGEMENT — SUPABASE POSTGRESQL SEED DATA
-- ==============================================================================
-- Run this in the Supabase SQL Editor AFTER running `supabase/schema.sql`.
-- Populates 3 Multi-Tenant Stores, 4-Tier Hierarchy Users, Products, Cash Accounts,
-- Orders, and Double-Entry Journals.
-- Password for all accounts: password123
-- ==============================================================================

-- 1. MERCHANTS (MULTI-TENANT SAAS STORES)
INSERT INTO merchants (id, name, api_key, settings, created_at)
VALUES 
  (1, 'Artisan Wear Bangladesh', 'gm_live_artisan_wear_01', '{"currency": "BDT"}'::jsonb, NOW() - INTERVAL '60 days'),
  (2, 'Dhaka Gadget Hub', 'gm_live_gadget_hub_02', '{"currency": "BDT"}'::jsonb, NOW() - INTERVAL '45 days'),
  (3, 'Chittagong Organic Teas', 'gm_live_organic_teas_03', '{"currency": "BDT"}'::jsonb, NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

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

  -- Tenant 2: Dhaka Gadget Hub
  (5, 2, 'Tanvir Hasan', 'tanvir@gadgethub.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801819000001', 'agency_owner', NOW() - INTERVAL '45 days'),
  (6, 2, 'Rafiq Accountant', 'rafiq@gadgethub.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801819000002', 'accountant', NOW() - INTERVAL '40 days'),

  -- Tenant 3: Chittagong Organic Teas
  (7, 3, 'Nusrat Jahan', 'nusrat@organictea.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801612000001', 'agency_owner', NOW() - INTERVAL '30 days'),
  (8, 3, 'Sultana Begum', 'sultana@organictea.bd', 'a9bf2211248e50df4acc8b1068f45761:e067a735ce766948e28df0de0ff0fe5c5e89279d9467b4b289a0c6e14ab238e0ec5043e94273a1b7ac419d8febac54ab50e678e84c6d68a1c5e94308caf828b8', '8801612000002', 'accountant', NOW() - INTERVAL '25 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- 3. CASH ACCOUNTS
INSERT INTO cash_accounts (id, merchant_id, name, kind, is_default, created_at)
VALUES
  (1, 1, 'City Bank - Corporate', 'bank', TRUE, NOW() - INTERVAL '60 days'),
  (2, 1, 'bKash Merchant Account', 'bkash', FALSE, NOW() - INTERVAL '60 days'),
  (3, 1, 'Nagad Merchant Account', 'nagad', FALSE, NOW() - INTERVAL '60 days'),
  (4, 2, 'Dutch-Bangla Bank (Corporate)', 'bank', TRUE, NOW() - INTERVAL '45 days'),
  (5, 2, 'bKash Merchant (Gadget Hub)', 'bkash', FALSE, NOW() - INTERVAL '45 days'),
  (6, 3, 'BRAC Bank SME Account', 'bank', TRUE, NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO NOTHING;

SELECT setval('cash_accounts_id_seq', (SELECT MAX(id) FROM cash_accounts));

-- 4. PRODUCTS
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

-- 5. PRODUCT PRICE HISTORY (Versioned purchase cost)
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

-- 6. ORDERS
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

-- 6b. ORDER ITEMS (every order must have line items so COGS and product matching work)
INSERT INTO order_items (order_id, product_id, qty, unit_price, line_total)
VALUES
  -- Tenant 1: Artisan Wear
  (1, 1, 1, 65000, 65000),   -- Premium Cotton T-Shirt
  (2, 2, 1, 220000, 220000), -- Traditional Silk Panjabi
  (3, 3, 1, 165000, 165000), -- Fleece Winter Hoodie
  (4, 1, 1, 65000, 65000),
  (5, 1, 1, 65000, 65000),
  -- Tenant 2: Dhaka Gadget Hub
  (6, 4, 1, 245000, 245000), -- Noise-Cancelling Earbuds Pro
  (7, 5, 2, 185000, 370000), -- PowerBank x2
  -- Tenant 3: Chittagong Organic Teas
  (8, 7, 2, 85000, 170000)   -- Black Tea 500g x2
ON CONFLICT DO NOTHING;

-- 7. AUDIT LOG (PLATFORM ACTIVITY FEED)
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

SELECT 'Gross Management Supabase database seeded successfully!' AS status;
