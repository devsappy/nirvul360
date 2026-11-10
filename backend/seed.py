"""
Seed realistic Bangladeshi E-Commerce demo data.
Populates merchants, 4-tier hierarchy users, cash accounts, suppliers,
versioned products, orders, expenses, and exceptions.
"""
import os
import sys
from pathlib import Path

# Add backend to sys.path
sys.path.insert(0, str(Path(__file__).parent))

from app.db.session import open_db, get_db, insert
from app.domain.merchants import create_merchant, create_user, create_cash_account, create_supplier
from app.domain.products import upsert_product, set_price
from app.domain.orders import create_order, apply_status
from app.domain.entries import record_expense, record_ad_spend, record_withdrawal, record_transfer, record_purchase
from app.domain.exceptions import scan_merchant
from app.lib.dates import today, add_days

def seed():
    force_local = "--local" in sys.argv or "--sqlite" in sys.argv or os.getenv("FORCE_LOCAL_SEED", "false").lower() in ("true", "1", "yes")
    if force_local:
        os.environ["REQUIRE_SUPABASE"] = "false"
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("SUPABASE_DB_URL", None)
        os.environ.pop("SUPABASE_POSTGRES_URL", None)
    pg_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL")
    if not force_local and (os.getenv("REQUIRE_SUPABASE", "false").lower() in ("true", "1", "yes") or (pg_url and (pg_url.startswith("postgres://") or pg_url.startswith("postgresql://")))):
        print("REQUIRE_SUPABASE is active. Executing Supabase PostgreSQL schema and seed...")
        root_dir = Path(__file__).resolve().parent.parent
        sys.path.insert(0, str(root_dir))
        import migrate_to_supabase
        migrate_to_supabase.run_migration()
        return

    data_dir = Path(__file__).parent / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_file = str(data_dir / "gross.db")
    
    db = open_db(db_file)
    schema_path = Path(__file__).parent / "app" / "db" / "schema.sql"
    if schema_path.exists():
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()
        db.execute("PRAGMA foreign_keys = OFF;")
        tables = [r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        for t_name in tables:
            db.execute(f"DROP TABLE IF EXISTS {t_name};")
        db.executescript(schema_sql)
        db.execute("PRAGMA foreign_keys = ON;")
        db.commit()
        print("Database schema reset cleanly.")
    
    t = today()
    m_id = create_merchant({'name': 'Artisan Wear Bangladesh'})

    # 4-Tier Hierarchy Users
    # 1. Super Admin
    super_admin_id = create_user(m_id, {
        'name': 'Chief Super Admin',
        'email': 'superadmin@gross.bd',
        'password': 'password123',
        'whatsapp': '8801700000001',
        'role': 'super_admin',
    })

    # 2. Admin
    admin_id = create_user(m_id, {
        'name': 'Platform Admin',
        'email': 'admin@gross.bd',
        'password': 'password123',
        'whatsapp': '8801700000002',
        'role': 'admin',
    })

    # 3. Agency Owner (Tamim Ahmed)
    owner_id = create_user(m_id, {
        'name': 'Tamim Ahmed',
        'email': 'owner@demo.bd',
        'password': 'password123',
        'whatsapp': '8801711000001',
        'role': 'agency_owner',
    })

    # 4. Accountant (Karim Accountant)
    accountant_id = create_user(m_id, {
        'name': 'Karim Accountant',
        'email': 'accountant@demo.bd',
        'password': 'password123',
        'whatsapp': '8801711000002',
        'role': 'accountant',
    })

    # 5. Manager (Jamal Manager)
    manager_id = create_user(m_id, {
        'name': 'Jamal Manager',
        'email': 'manager@demo.bd',
        'password': 'password123',
        'whatsapp': '8801711000003',
        'role': 'manager',
    })

    actor = f"user:{owner_id}"
    ctx = {'source': 'manual', 'actor': actor}

    # 1. Cash Accounts
    city_bank = create_cash_account(m_id, {
        'name': 'City Bank - Corporate',
        'kind': 'bank',
        'opening_balance': 25000000, # ৳250,000
        'opening_date': add_days(t, -60),
        'is_default': True,
    }, actor)

    bkash = create_cash_account(m_id, {
        'name': 'bKash Merchant Account',
        'kind': 'bkash',
        'opening_balance': 4500000, # ৳45,000
        'opening_date': add_days(t, -60),
    }, actor)

    nagad = create_cash_account(m_id, {
        'name': 'Nagad Merchant Account',
        'kind': 'nagad',
        'opening_balance': 2000000, # ৳20,000
        'opening_date': add_days(t, -60),
    }, actor)

    cash_drawer = create_cash_account(m_id, {
        'name': 'Office Cash Drawer',
        'kind': 'cash',
        'opening_balance': 1500000, # ৳15,000
        'opening_date': add_days(t, -60),
    }, actor)

    # 2. Suppliers
    from app.db.session import run
    supp_knit = create_supplier(m_id, {'name': 'Narayanganj Knitwear Mills', 'phone': '01712000001'}, actor)
    supp_tex = create_supplier(m_id, {'name': 'Dhaka Textiles & Dyeing', 'phone': '01712000002'}, actor)
    supp_acc = create_supplier(m_id, {'name': 'Hossain Accessories & Packaging', 'phone': '01712000003'}, actor)
    run("UPDATE suppliers SET address = 'Babubazar, Old Dhaka', terms_days = 15, credit_terms_days = 15, categories = 'Cotton, Silk', advance_balance = 500000 WHERE id = ?", supp_knit)
    run("UPDATE suppliers SET address = 'New Market, Dhaka', terms_days = 30, credit_terms_days = 30, categories = 'Buttons, Zippers, Accessories', advance_balance = 0 WHERE id = ?", supp_tex)
    run("UPDATE suppliers SET address = 'Mirpur 10, Dhaka', terms_days = 7, credit_terms_days = 7, categories = 'Poly bags, Shipping labels, Cartons', advance_balance = 200000 WHERE id = ?", supp_acc)

    # 3. Products
    shirt = upsert_product(m_id, {
        'external_id': 'P-TS-01',
        'sku': 'TS-001',
        'name': 'Premium Cotton T-Shirt',
        'selling_price': 65000, # ৳650
        'purchase_price': 28000, # ৳280
        'stock_qty': 100,
    }, ctx)

    set_price(m_id, shirt, 30000, {
        'effective_from': add_days(t, -30),
        'source': 'manual',
        'actor': actor,
        'note': 'Supplier price revision (batch #42)',
    })

    panjabi = upsert_product(m_id, {
        'external_id': 'P-PJ-01',
        'sku': 'PJ-101',
        'name': 'Traditional Silk Panjabi',
        'selling_price': 220000, # ৳2,200
        'purchase_price': 110000, # ৳1,100
        'stock_qty': 45,
    }, ctx)

    chino = upsert_product(m_id, {
        'external_id': 'P-CP-01',
        'sku': 'CP-201',
        'name': 'Slim Fit Chino Pants',
        'selling_price': 145000, # ৳1,450
        'purchase_price': 75000, # ৳750
        'stock_qty': 50,
    }, ctx)

    shawl = upsert_product(m_id, {
        'external_id': 'P-SH-01',
        'sku': 'SH-301',
        'name': 'Embroidered Winter Shawl',
        'selling_price': 180000, # ৳1,800
        'purchase_price': 90000, # ৳900
        'stock_qty': 30,
    }, ctx)

    # Missing purchase price product (Rule 11)
    hoodie = upsert_product(m_id, {
        'external_id': 'P-HD-01',
        'sku': 'HD-401',
        'name': 'Graphic Hoodie - Black Edition',
        'selling_price': 165000, # ৳1,650
        'stock_qty': 25,
    }, ctx)

    print("Products, cash accounts, and suppliers created.")

    # 4. Operating Expenses
    record_expense(m_id, {'head': 'rent', 'amount': 3500000, 'date': add_days(t, -25), 'cash_account_id': city_bank, 'note': 'Banani showroom rent'}, ctx)
    record_expense(m_id, {'head': 'salary', 'amount': 4500000, 'date': add_days(t, -20), 'cash_account_id': city_bank, 'note': 'Monthly staff salaries'}, ctx)
    record_expense(m_id, {'head': 'packaging', 'amount': 650000, 'date': add_days(t, -18), 'cash_account_id': bkash, 'note': 'Poly courier bags and boxes'}, ctx)
    record_expense(m_id, {'head': 'utilities', 'amount': 420000, 'date': add_days(t, -12), 'cash_account_id': city_bank, 'note': 'Electricity and fiber internet bill'}, ctx)
    record_expense(m_id, {'head': 'transport', 'amount': 280000, 'date': add_days(t, -8), 'cash_account_id': cash_drawer, 'note': 'Van freight & parcel drop-off'}, ctx)

    # 5. Ad Spend (Rule 5: fixed FX rate)
    record_ad_spend(m_id, {
        'amount': 15000,
        'currency': 'USD',
        'rate': '122.50',
        'rate_date': add_days(t, -22),
        'date': add_days(t, -22),
        'cash_account_id': city_bank,
        'note': 'Meta Ads - Autumn Panjabi Campaign',
    }, ctx)

    record_ad_spend(m_id, {
        'amount': 20000,
        'currency': 'USD',
        'rate': '123.00',
        'rate_date': add_days(t, -10),
        'date': add_days(t, -10),
        'cash_account_id': city_bank,
        'note': 'Meta Ads - T-Shirt & Chino Prospecting',
    }, ctx)

    # 6. Owner Withdrawal (Rule 9: reduces cash, profit untouched)
    record_withdrawal(m_id, {
        'amount': 2500000,
        'date': add_days(t, -15),
        'cash_account_id': city_bank,
        'note': 'Personal withdrawal for family expenses',
    }, ctx)

    # 7. Transfer
    record_transfer(m_id, {
        'from_account_id': bkash,
        'to_account_id': city_bank,
        'amount': 2000000,
        'fee': 29800,
        'date': add_days(t, -14),
        'note': 'bKash merchant cash-out to City Bank',
    }, ctx)

    # 8. Purchase Batches
    pur1_id = record_purchase(m_id, {
        'supplier_id': supp_knit,
        'product_id': shirt,
        'qty': 60,
        'unit_cost': 31000,
        'paid_amount': 1000000,
        'cash_account_id': city_bank,
        'date': add_days(t, -16),
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-0412', status = 'part_paid', total_cost = 1860000, paid_amount = 1000000 WHERE id = ?", pur1_id)

    pur2_id = record_purchase(m_id, {
        'supplier_id': supp_knit,
        'product_id': panjabi,
        'qty': 20,
        'unit_cost': 110000,
        'paid_amount': 0,
        'cash_account_id': city_bank,
        'date': add_days(t, -5),
    }, ctx)
    run("UPDATE purchases SET batch_no = 'PB-0450', status = 'unpaid', total_cost = 2200000, paid_amount = 0 WHERE id = ?", pur2_id)

    # 9. Orders
    # Order 1: Delivered
    o1 = create_order(m_id, {
        'external_id': 'INV-1001',
        'order_date': add_days(t, -24),
        'customer_name': 'Sadman Sakib',
        'customer_phone': '01711223344',
        'address': 'Gulshan 2, Dhaka',
        'courier': 'steadfast',
        'consignment_id': 'SF-9001',
        'items': [{'product_id': shirt, 'qty': 2, 'unit_price': 65000}],
        'shipping_charge': 6000,
    }, ctx)
    apply_status(m_id, o1, 'delivered', {'date': add_days(t, -21), 'charges': {'delivery_charge': 6000, 'cod_fee': 1300}, **ctx})

    # Order 2: Delivered
    o2 = create_order(m_id, {
        'external_id': 'INV-1002',
        'order_date': add_days(t, -20),
        'customer_name': 'Fahim Morshed',
        'customer_phone': '01811334455',
        'address': 'Dhanmondi 27, Dhaka',
        'courier': 'pathao',
        'consignment_id': 'PT-8001',
        'items': [{'product_id': panjabi, 'qty': 1, 'unit_price': 220000}],
        'shipping_charge': 6000,
    }, ctx)
    apply_status(m_id, o2, 'delivered', {'date': add_days(t, -17), 'charges': {'delivery_charge': 10000, 'cod_fee': 2200}, **ctx})

    # Order 3: Delivered
    o3 = create_order(m_id, {
        'external_id': 'INV-1003',
        'order_date': add_days(t, -18),
        'customer_name': 'Nayeem Hasan',
        'customer_phone': '01911445566',
        'address': 'Uttara Sector 7, Dhaka',
        'courier': 'steadfast',
        'consignment_id': 'SF-9002',
        'items': [
            {'product_id': chino, 'qty': 1, 'unit_price': 145000},
            {'product_id': shirt, 'qty': 1, 'unit_price': 65000},
        ],
        'shipping_charge': 6000,
    }, ctx)
    apply_status(m_id, o3, 'delivered', {'date': add_days(t, -15), 'charges': {'delivery_charge': 6000, 'cod_fee': 2100}, **ctx})

    # Order 4: Returned
    o4 = create_order(m_id, {
        'external_id': 'INV-1004',
        'order_date': add_days(t, -16),
        'customer_name': 'Rakibul Islam',
        'customer_phone': '01611556677',
        'address': 'Chittagong GEC',
        'courier': 'steadfast',
        'consignment_id': 'SF-9003',
        'items': [{'product_id': shawl, 'qty': 1, 'unit_price': 180000}],
        'shipping_charge': 13000,
    }, ctx)
    apply_status(m_id, o4, 'returned', {'date': add_days(t, -11), 'charges': {'delivery_charge': 13000, 'return_fee': 6500}, **ctx})

    # Order 5: In transit
    o5 = create_order(m_id, {
        'external_id': 'INV-1005',
        'order_date': add_days(t, -5),
        'customer_name': 'Mahbubur Rahman',
        'customer_phone': '01711667788',
        'address': 'Sylhet Zindabazar',
        'courier': 'pathao',
        'consignment_id': 'PT-8002',
        'items': [{'product_id': panjabi, 'qty': 1, 'unit_price': 220000}],
        'shipping_charge': 13000,
    }, ctx)
    apply_status(m_id, o5, 'in_transit', {'date': add_days(t, -4), **ctx})

    # Order 6: Placed (not yet shipped)
    create_order(m_id, {
        'external_id': 'INV-1006',
        'order_date': add_days(t, -1),
        'customer_name': 'Tanvir Hossain',
        'customer_phone': '01811778899',
        'address': 'Mirpur 10, Dhaka',
        'courier': 'steadfast',
        'items': [{'product_id': shirt, 'qty': 1, 'unit_price': 65000}],
        'shipping_charge': 6000,
    }, ctx)

    # Order 7: Missing purchase price (Held)
    o7 = create_order(m_id, {
        'external_id': 'INV-1007',
        'order_date': add_days(t, -8),
        'customer_name': 'Shahed Ali',
        'customer_phone': '01911889900',
        'address': 'Bashundhara R/A, Dhaka',
        'courier': 'steadfast',
        'consignment_id': 'SF-9007',
        'items': [{'product_id': hoodie, 'qty': 1, 'unit_price': 165000}],
        'shipping_charge': 6000,
    }, ctx)
    apply_status(m_id, o7, 'delivered', {'date': add_days(t, -6), 'charges': {'delivery_charge': 6000, 'cod_fee': 1650}, **ctx})

    # Scan exceptions for Merchant 1
    scan_merchant(m_id)

    # Initial Audit Logs for Merchant 1
    from app.lib.audit import log_audit
    log_audit(m_id, "user_login", f"user:{owner_id}", "sessions", details={"note": "Tamim Ahmed logged in from Dhaka"})
    log_audit(m_id, "expense_recorded", f"user:{accountant_id}", "journals", details={"amount": 4200, "head": "packaging", "note": "Karim recorded packaging boxes"})
    log_audit(m_id, "courier_sync", "system:steadfast", "orders", details={"synced_orders": 4, "delivered": 3, "cod_collected": 595000})

    # ==============================================================================
    # 2. TENANT 2: DHAKA GADGET HUB (Electronics & Accessories)
    # ==============================================================================
    print("Seeding Tenant 2: Dhaka Gadget Hub...")
    m2_id = create_merchant({'name': 'Dhaka Gadget Hub'})
    
    # Agency Owner
    m2_owner_id = create_user(m2_id, {
        'name': 'Tanvir Hasan',
        'email': 'tanvir@gadgethub.bd',
        'password': 'password123',
        'whatsapp': '8801819000001',
        'role': 'agency_owner',
    })
    
    # Accountant
    m2_acc_id = create_user(m2_id, {
        'name': 'Rafiq Accountant',
        'email': 'rafiq@gadgethub.bd',
        'password': 'password123',
        'whatsapp': '8801819000002',
        'role': 'accountant',
    })
    
    m2_actor = f"user:{m2_owner_id}"
    m2_ctx = {'source': 'manual', 'actor': m2_actor}
    
    # Cash accounts
    create_cash_account(m2_id, {
        'name': 'Dutch-Bangla Bank (Corporate)',
        'kind': 'bank',
        'opening_balance': 48000000, # ৳480,000
        'opening_date': add_days(t, -45),
        'is_default': True,
    }, m2_actor)
    
    create_cash_account(m2_id, {
        'name': 'bKash Merchant (Gadget Hub)',
        'kind': 'bkash',
        'opening_balance': 12500000, # ৳125,000
        'opening_date': add_days(t, -45),
    }, m2_actor)

    # Products
    p_earbuds = upsert_product(m2_id, {
        'sku': 'GH-TWS-PRO',
        'name': 'Noise-Cancelling Earbuds Pro',
        'selling_price': 245000,
        'purchase_price': 110000,
        'stock_qty': 60
    }, m2_ctx)

    p_powerbank = upsert_product(m2_id, {
        'sku': 'GH-PB-20K',
        'name': 'Fast Charge 20,000mAh PowerBank',
        'selling_price': 185000,
        'purchase_price': 85000,
        'stock_qty': 40
    }, m2_ctx)

    p_watch = upsert_product(m2_id, {
        'sku': 'GH-SW-01',
        'name': 'Amoled Smartwatch Ultra',
        'selling_price': 320000,
        'purchase_price': 160000,
        'stock_qty': 25
    }, m2_ctx)

    # Orders for Dhaka Gadget Hub
    o2_1 = create_order(m2_id, {
        'external_id': 'GH-501',
        'order_date': add_days(t, -5),
        'customer_name': 'Zakir Hossain',
        'customer_phone': '01712998877',
        'address': 'Dhanmondi 27, Dhaka',
        'courier': 'steadfast',
        'consignment_id': 'SF-GH-101',
        'items': [{'product_id': p_earbuds, 'qty': 1, 'unit_price': 245000}],
        'shipping_charge': 6000,
    }, m2_ctx)
    apply_status(m2_id, o2_1, 'delivered', {'date': add_days(t, -3), 'charges': {'delivery_charge': 6000, 'cod_fee': 2450}, **m2_ctx})

    o2_2 = create_order(m2_id, {
        'external_id': 'GH-502',
        'order_date': add_days(t, -3),
        'customer_name': 'Mehedi Hasan',
        'customer_phone': '01915443322',
        'address': 'GEC Circle, Chittagong',
        'courier': 'steadfast',
        'consignment_id': 'SF-GH-102',
        'items': [{'product_id': p_powerbank, 'qty': 2, 'unit_price': 185000}],
        'shipping_charge': 12000,
    }, m2_ctx)
    apply_status(m2_id, o2_2, 'in_transit', {'date': add_days(t, -2), **m2_ctx})

    o2_3 = create_order(m2_id, {
        'external_id': 'GH-503',
        'order_date': add_days(t, -1),
        'customer_name': 'Farhana Yeasmin',
        'customer_phone': '01611223344',
        'address': 'Uttara Sector 7, Dhaka',
        'courier': 'steadfast',
        'items': [{'product_id': p_watch, 'qty': 1, 'unit_price': 320000}],
        'shipping_charge': 6000,
    }, m2_ctx)

    scan_merchant(m2_id)
    log_audit(m2_id, "user_login", f"user:{m2_owner_id}", "sessions", details={"note": "Tanvir Hasan logged in"})
    log_audit(m2_id, "expense_recorded", f"user:{m2_acc_id}", "journals", details={"amount": 3500, "head": "office_stationery", "note": "Rafiq bought packaging tape & bubble wrap"})

    # ==============================================================================
    # 3. TENANT 3: CHITTAGONG ORGANIC TEAS (D2C Organic Food & Beverage)
    # ==============================================================================
    print("Seeding Tenant 3: Chittagong Organic Teas...")
    m3_id = create_merchant({'name': 'Chittagong Organic Teas'})
    
    # Agency Owner
    m3_owner_id = create_user(m3_id, {
        'name': 'Nusrat Jahan',
        'email': 'nusrat@organictea.bd',
        'password': 'password123',
        'whatsapp': '8801612000001',
        'role': 'agency_owner',
    })
    
    # Accountant
    m3_acc_id = create_user(m3_id, {
        'name': 'Sultana Begum',
        'email': 'sultana@organictea.bd',
        'password': 'password123',
        'whatsapp': '8801612000002',
        'role': 'accountant',
    })

    m3_actor = f"user:{m3_owner_id}"
    m3_ctx = {'source': 'manual', 'actor': m3_actor}

    create_cash_account(m3_id, {
        'name': 'BRAC Bank SME Account',
        'kind': 'bank',
        'opening_balance': 18000000, # ৳180,000
        'opening_date': add_days(t, -30),
        'is_default': True,
    }, m3_actor)

    p_tea = upsert_product(m3_id, {
        'sku': 'TEA-SM-500',
        'name': 'Sreemangal First Flush Black Tea 500g',
        'selling_price': 85000,
        'purchase_price': 38000,
        'stock_qty': 80
    }, m3_ctx)

    p_green = upsert_product(m3_id, {
        'sku': 'TEA-GR-250',
        'name': 'Organic Tulsi Green Tea 250g',
        'selling_price': 65000,
        'purchase_price': 28000,
        'stock_qty': 50
    }, m3_ctx)

    o3_1 = create_order(m3_id, {
        'external_id': 'TEA-101',
        'order_date': add_days(t, -4),
        'customer_name': 'Kazi Shahid',
        'customer_phone': '01719556677',
        'address': 'Nasirabad, Chittagong',
        'courier': 'steadfast',
        'consignment_id': 'SF-TEA-01',
        'items': [{'product_id': p_tea, 'qty': 2, 'unit_price': 85000}],
        'shipping_charge': 5000,
    }, m3_ctx)
    apply_status(m3_id, o3_1, 'delivered', {'date': add_days(t, -2), 'charges': {'delivery_charge': 5000, 'cod_fee': 1700}, **m3_ctx})

    scan_merchant(m3_id)
    log_audit(m3_id, "user_login", f"user:{m3_owner_id}", "sessions", details={"note": "Nusrat Jahan signed in"})
    log_audit(m3_id, "expense_recorded", f"user:{m3_acc_id}", "journals", details={"amount": 1200, "head": "rickshaw_delivery", "note": "Sultana recorded local parcel drop"})

    # ==============================================================================
    # 4. TENANT 4: SYLHET CRAFT LEATHER (Handcrafted Leather Goods)
    # ==============================================================================
    print("Seeding Tenant 4: Sylhet Craft Leather...")
    m4_id = create_merchant({'name': 'Sylhet Craft Leather'})
    m4_owner_id = create_user(m4_id, {
        'name': 'Kamal Uddin',
        'email': 'kamal@sylhetleather.bd',
        'password': 'password123',
        'whatsapp': '8801713000001',
        'role': 'agency_owner',
    })

    # ==============================================================================
    # 5. PLATFORM ADMIN TELEMETRY, BILLING, JOBS, AI & MULTI-DEVICE SESSIONS
    # ==============================================================================
    print("Seeding SaaS Plans, Billing, Scheduled Jobs, DLQ, AI Models, and Multi-Device Telemetry...")

    # Update merchant plans and quotas
    run("UPDATE merchants SET plan = 'growth', plan_price = 100000, order_limit = 5000, ai_token_cap = 50000, ai_tokens_used = 18450 WHERE id = ?", m_id)
    run("UPDATE merchants SET plan = 'starter', plan_price = 50000, order_limit = 1500, ai_token_cap = 50000, ai_tokens_used = 7200 WHERE id = ?", m2_id)
    run("UPDATE merchants SET plan = 'growth', plan_price = 100000, order_limit = 5000, ai_token_cap = 50000, ai_tokens_used = 2410 WHERE id = ?", m3_id)
    run("UPDATE merchants SET plan = 'trial', plan_price = 0, trial_ends_at = ?, order_limit = 500, ai_token_cap = 50000, ai_tokens_used = 450 WHERE id = ?", add_days(t, 14), m4_id)

    # SaaS Plans
    saas_plans = [
        ("starter", "Starter", 50000, 1500, 1, 2, 1, 0, 0, "active", "2026-01-01T00:00:00Z"),
        ("growth", "Growth", 100000, 5000, 5, 6, 1, 1, 0, "active", "2026-01-01T00:00:00Z"),
        ("scale", "Scale", 250000, 999999, 99, 99, 1, 1, 1, "not_launched", "2026-01-01T00:00:00Z"),
        ("trial", "Trial", 0, 500, 1, 2, 1, 0, 0, "active", "2026-01-01T00:00:00Z"),
    ]
    for p in saas_plans:
        run("""
            INSERT OR REPLACE INTO saas_plans (id, name, price_poisha, order_limit, courier_limit, user_limit, has_whatsapp, has_meta_sync, has_mushak, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *p)

    # Billing Invoices
    billing_invoices = [
        (m_id, "growth", 100000, "bkash", "bKash TrxID: 9J28A4471", "paid", 1, 3, None, f"{t[:7]}", add_days(t, -5) + "T10:00:00Z"),
        (m2_id, "starter", 50000, "card", "MasterCard ending 4471", "paid", 1, 3, None, f"{t[:7]}", add_days(t, -6) + "T11:00:00Z"),
        (m_id, "growth", 100000, "bkash", "bKash TrxID: 8H17Z3360", "paid", 1, 3, None, add_days(t, -32)[:7], add_days(t, -35) + "T10:00:00Z"),
        (m2_id, "starter", 50000, "card", "MasterCard ending 4471", "paid", 1, 3, None, add_days(t, -32)[:7], add_days(t, -36) + "T11:00:00Z"),
        (m3_id, "growth", 100000, "card", "Declined: Insufficient funds", "failed", 2, 3, add_days(t, 2), f"{t[:7]}", add_days(t, -2) + "T09:30:00Z"),
        (m4_id, "starter", 50000, "bkash", "Declined: Merchant wallet low balance", "failed", 3, 3, add_days(t, 0), f"{t[:7]}", add_days(t, -7) + "T14:15:00Z"),
    ]
    for inv in billing_invoices:
        run("""
            INSERT INTO billing_invoices (merchant_id, plan_id, amount, payment_method, payment_details, status, attempt_count, max_attempts, pauses_at, billing_period, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *inv)

    # 13 Scheduled Background Jobs
    jobs = [
        ("exception_scan", "Exception Scanner", "1 hour", add_days(t, 0) + "T12:00:00Z", 30000, "failed", "Courier API timeout after 30000ms", "TimeoutError: connection to steadfast timed out", 1, add_days(t, 0) + "T13:00:00Z"),
        ("courier_sync", "Courier API Sync", "30 min", add_days(t, 0) + "T12:30:00Z", 420, "ok", None, None, 0, add_days(t, 0) + "T13:00:00Z"),
        ("settlement_match", "Settlement Auto-Reconciliation", "on upload", add_days(t, -1) + "T18:00:00Z", 850, "ok", None, None, 0, None),
        ("stuck_parcel_scan", "Stuck Parcel Scanner", "daily", add_days(t, 0) + "T04:00:00Z", 110, "ok", None, None, 0, add_days(t, 1) + "T04:00:00Z"),
        ("meta_ads_sync", "Meta Ads Spend Sync", "1 hour", add_days(t, 0) + "T12:00:00Z", 350, "ok", None, None, 0, add_days(t, 0) + "T13:00:00Z"),
        ("cogs_recompute", "COGS Moving Average Recompute", "nightly", add_days(t, 0) + "T02:00:00Z", 2100, "ok", None, None, 0, add_days(t, 1) + "T02:00:00Z"),
        ("daily_digest", "Morning WhatsApp Profit Digest", "09:00 local", add_days(t, 0) + "T09:00:00Z", 95, "ok", None, None, 0, add_days(t, 1) + "T09:00:00Z"),
        ("recurring_expense_post", "Recurring Expenses Auto-Post", "daily", add_days(t, 0) + "T00:05:00Z", 55, "ok", None, None, 0, add_days(t, 1) + "T00:05:00Z"),
        ("session_cleanup", "Stale Session Cleanup", "daily", add_days(t, 0) + "T03:00:00Z", 30, "ok", None, None, 0, add_days(t, 1) + "T03:00:00Z"),
        ("backup_verify", "Weekly Scratch DB Restore Test", "weekly", add_days(t, -3) + "T02:00:00Z", 14200, "ok", None, None, 0, add_days(t, 4) + "T02:00:00Z"),
        ("dunning_retry", "Failed Collection Dunning Retry", "daily", add_days(t, 0) + "T06:00:00Z", 120, "ok", None, None, 0, add_days(t, 1) + "T06:00:00Z"),
        ("token_quota_reset", "AI Token Quota Reset", "monthly", add_days(t, -10) + "T00:00:00Z", 15, "ok", None, None, 0, add_days(t, 20) + "T00:00:00Z"),
        ("audit_archival", "Audit Log Archival to Storage", "weekly", add_days(t, -2) + "T05:00:00Z", 6500, "ok", None, None, 0, add_days(t, 5) + "T05:00:00Z"),
    ]
    for j in jobs:
        run("""
            INSERT OR REPLACE INTO scheduled_jobs (job_key, name, frequency, last_run_at, duration_ms, status, error_message, error_stack, consecutive_failures, next_run_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *j)

    # Dead-Letter Queue
    dlq_items = [
        ("courier_sync", '{"consignment_id": "SF-9912", "courier": "steadfast", "merchant_id": 1}', add_days(t, -1) + "T14:22:00Z", 3, "HTTP 504 Gateway Timeout on Steadfast webhook", "waiting_human"),
        ("meta_ads_sync", '{"merchant_id": 2, "account_id": "act_881920"}', add_days(t, -2) + "T10:15:00Z", 3, "OAuth token expired / insufficient permissions", "waiting_human"),
        ("daily_digest", '{"merchant_id": 3, "recipient": "8801719556677"}', add_days(t, 0) + "T09:01:00Z", 3, "WhatsApp API 131026: Receiver phone number not opted in", "waiting_human"),
    ]
    for dl in dlq_items:
        run("""
            INSERT INTO dead_letter_jobs (job_key, payload, failed_at, retry_count, error, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, *dl)

    # Integration Connections
    conns = [
        (m_id, "courier", "pathao", "healthy", add_days(t, 0) + "T11:00:00Z", 0, None, add_days(t, 45), '{"client_id": "pth_live_88"}', add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T11:00:00Z"),
        (m_id, "courier", "steadfast", "healthy", add_days(t, 0) + "T12:15:00Z", 0, None, add_days(t, 180), '{"api_key": "sf_live_77"}', add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T12:15:00Z"),
        (m_id, "meta_ads", "meta_ads", "healthy", add_days(t, 0) + "T10:00:00Z", 0, None, add_days(t, 2), '{"act_id": "act_881920"}', add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T10:00:00Z"),
        (m_id, "store", "shopify", "healthy", add_days(t, 0) + "T08:00:00Z", 0, None, add_days(t, 60), '{"shop": "artisanwear.myshopify.com"}', add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T08:00:00Z"),
        (m_id, "bkash", "bkash", "healthy", add_days(t, 0) + "T09:00:00Z", 0, None, add_days(t, 90), '{"app_key": "bkash_live_55"}', add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T09:00:00Z"),
        (m2_id, "courier", "steadfast", "healthy", add_days(t, 0) + "T11:45:00Z", 0, None, add_days(t, 120), '{"api_key": "sf_live_22"}', add_days(t, -45) + "T00:00:00Z", add_days(t, 0) + "T11:45:00Z"),
        (m2_id, "courier", "redx", "failing", add_days(t, -2) + "T15:30:00Z", 4, "Invalid API Secret / IP not whitelisted", add_days(t, 5), '{"api_key": "rx_live_11"}', add_days(t, -45) + "T00:00:00Z", add_days(t, -2) + "T15:30:00Z"),
        (m3_id, "courier", "steadfast", "healthy", add_days(t, 0) + "T10:10:00Z", 0, None, add_days(t, 85), '{"api_key": "sf_live_33"}', add_days(t, -30) + "T00:00:00Z", add_days(t, 0) + "T10:10:00Z"),
    ]
    for c in conns:
        run("""
            INSERT INTO integration_connections (merchant_id, connector_type, provider, status, last_success_at, consecutive_failures, failure_reason, token_expires_at, config, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *c)

    # Support Tickets
    tickets = [
        (m_id, "Pathao webhook signature validation mismatch", "We received error 401 when Pathao posts delivery status updates.", "urgent", "open", None, 32, add_days(t, -2) + "T08:00:00Z", None, None),
        (m2_id, "RedX tracking codes failing to sync", "RedX shipments created yesterday are showing in transit on redx portal but not updating here.", "high", "open", None, 28, add_days(t, -1) + "T10:00:00Z", None, None),
        (m3_id, "How to reconcile short settlement deduction?", "We have a short settlement from Steadfast with 200 Tk less than parcel COD.", "normal", "waiting_admin", None, 14, add_days(t, 0) + "T02:00:00Z", add_days(t, 0) + "T06:00:00Z", None),
        (m_id, "Add support for sundarban courier slip OCR", "Can we upload Sundarban CN memo photos for automatic entry?", "low", "waiting_merchant", None, 8, add_days(t, -3) + "T12:00:00Z", add_days(t, -2) + "T14:00:00Z", None),
        (m2_id, "Card payment declined for renewal", "Our card was declined due to foreign transaction limit. Please re-try.", "urgent", "resolved", super_admin_id, 0, add_days(t, -5) + "T09:00:00Z", add_days(t, -5) + "T09:30:00Z", add_days(t, -4) + "T10:00:00Z"),
    ]
    for tk in tickets:
        run("""
            INSERT INTO support_tickets (merchant_id, subject, body, priority, status, assigned_to, waiting_hours, created_at, first_replied_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *tk)

    # Announcements
    announcements = [
        ("Steadfast Courier API Maintenance on Friday 2AM - 4AM", "Steadfast has scheduled database upgrades. Sync jobs will pause and resume automatically.", "all_tenants", 1, super_admin_id, add_days(t, -1) + "T12:00:00Z", "published", add_days(t, -1) + "T12:00:00Z"),
        ("Meta Ads USD to BDT Conversion Rate Update", "The standard Bangladesh Bank conversion rate for Meta Ads reporting has been updated to ৳123.50/USD.", "growth", 0, super_admin_id, add_days(t, -3) + "T09:00:00Z", "published", add_days(t, -3) + "T09:00:00Z"),
        ("Upcoming Ramadan Extended Settlement Windows", "Advance notice regarding bank holiday settlement clearance cycles with Pathao and Steadfast.", "all_tenants", 0, super_admin_id, add_days(t, 0) + "T15:00:00Z", "draft", add_days(t, 0) + "T15:00:00Z"),
    ]
    for an in announcements:
        run("""
            INSERT INTO announcements (title, message, target_audience, send_whatsapp, created_by, published_at, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, *an)

    # AI Prompt Versions & Guardrails
    prompts = [
        ("bengali_expense_extraction", "v7", "Production prompt template with contextual Bangla dialect parsing and number normalization", "Extract financial transaction details from the following Bengali text...", "live", 100, 0.94, "platform_admin", add_days(t, -30) + "T00:00:00Z"),
        ("bengali_expense_extraction", "v8", "Canary prompt template with zero-shot multi-item memo extraction and confidence scoring", "Extract all distinct line items from the following Bengali invoice memo text...", "canary", 10, 0.91, "platform_admin", add_days(t, -2) + "T00:00:00Z"),
        ("bengali_expense_extraction", "v6", "Retired baseline prompt template", "Extract amount and category from Bengali note...", "retired", 0, 0.82, "platform_admin", add_days(t, -90) + "T00:00:00Z"),
    ]
    for pr in prompts:
        run("""
            INSERT INTO ai_prompt_versions (task_key, version_label, description, prompt_template, rollout_status, rollout_percentage, confirmation_rate, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *pr)

    corrections = [
        (m_id, "কালকে ব্যানারের জন্য সাভারে ৩০০ টাকা গাড়ি ভাড়া আর ৪০ টাকার চা", '{"amount": 340, "head": "entertainment"}', "AI combined transport and tea into entertainment instead of splitting into transport (৳300) and office tea (৳40)", '{"items": [{"amount": 30000, "head": "transport"}, {"amount": 4000, "head": "office_stationery"}]}', "pending", add_days(t, -1) + "T16:00:00Z"),
        (m_id, "দারাজ থেকে ১০ পিস বাবল র‍্যাপ আনাইছি ১৫০০ টাকা ক্যাশ দিয়েছি", '{"amount": 1500, "head": "raw_materials"}', "Parsed as inventory raw materials instead of packaging supplies expense", '{"amount": 150000, "head": "packaging"}', "corrected", add_days(t, -3) + "T11:00:00Z"),
    ]
    for cr in corrections:
        run("""
            INSERT INTO ai_training_corrections (merchant_id, raw_input, ai_understood, rejection_reason, corrected_data, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, *cr)

    # Feature Flags
    flags = [
        ("product_performance_report", "Product Performance Report", "Per-SKU profit with delivered vs return rates", 100, add_days(t, -10) + "T00:00:00Z"),
        ("voice_note_entry", "Voice Note Entry", "Bengali speech to draft expense with Whisper", 25, add_days(t, -10) + "T00:00:00Z"),
        ("multi_brand", "Multi-brand Store Management", "Run multiple brands under one organization", 8, add_days(t, -10) + "T00:00:00Z"),
        ("mushak_tax", "Mushak 6.3 & 9.1 Output", "NBR compliant tax packs", 0, add_days(t, -10) + "T00:00:00Z"),
        ("fifo_costing", "FIFO Inventory Costing", "Alternative to weighted moving average", 0, add_days(t, -10) + "T00:00:00Z"),
    ]
    for fl in flags:
        run("""
            INSERT OR REPLACE INTO feature_flags (flag_key, label, description, rollout_percentage, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, *fl)

    # Courier Adapters
    adapters = [
        (1, "pathao", "Pathao API", "api", "mapping v4", 138, '{"consignment_id": "consignment_id", "cod": "cod_collected", "delivery_fee": "delivery_charge"}', 1, add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T00:00:00Z"),
        (2, "steadfast", "Steadfast API", "api", "mapping v3", 96, '{"consignment_id": "tracking_code", "cod": "cod_amount", "delivery_fee": "delivery_charge"}', 1, add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T00:00:00Z"),
        (3, "redx", "RedX API", "api", "mapping v2", 42, '{"consignment_id": "tracking_id", "cod": "cash_collected", "delivery_fee": "charge"}', 1, add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T00:00:00Z"),
        (4, "sa_paribahan", "SA Paribahan Sheet", "sheet", "mapping v1", 18, '{"consignment_id": "CN Number", "cod": "Amount", "delivery_fee": "Freight"}', 1, add_days(t, -60) + "T00:00:00Z", add_days(t, 0) + "T00:00:00Z"),
    ]
    for ad in adapters:
        run("""
            INSERT OR REPLACE INTO courier_adapters (id, courier_code, name, adapter_type, mapping_version, tenants_count, column_mapping, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, *ad)

    # Platform Configuration
    configs = [
        ("platform_quotas", '{"api_rate_limit": 600, "courier_pulls": 2, "whatsapp_daily": 200, "upload_size_mb": 25, "session_timeout_days": 30}', add_days(t, -10) + "T00:00:00Z"),
        ("maintenance_mode", '{"enabled": false, "reason": ""}', add_days(t, -10) + "T00:00:00Z"),
        ("worker_fleet", '{"workers_total": 6, "workers_online": 6}', add_days(t, -10) + "T00:00:00Z"),
        ("backups_status", '{"last_backup": "2026-11-08T02:00:00Z", "last_verified_restore": "2026-11-08T03:15:00Z", "destination": "Backblaze B2", "pitr_days": 7}', add_days(t, -10) + "T00:00:00Z"),
        ("ai_pricing", '{"cost_per_draft_usd": 0.005, "cost_per_1k_tokens_usd": 0.002, "usd_to_bdt_rate": 123.50}', add_days(t, -10) + "T00:00:00Z"),
    ]
    for cf in configs:
        run("""
            INSERT OR REPLACE INTO system_config (config_key, value, updated_at)
            VALUES (?, ?, ?)
        """, *cf)

    # AI Safety Guardrails
    guardrails_seed = [
        ("must_confirm", "Never write without confirmation", "Require explicit merchant confirmation before writing any journal or order", 1, 1, "{}", add_days(t, -10) + "T00:00:00Z"),
        ("amount_sanity", "Amount sanity check", "Flag expenses or orders deviating more than 3x from rolling average", 1, 0, '{"multiplier": 3}', add_days(t, -10) + "T00:00:00Z"),
        ("dedupe_10m", "Duplicate within 10 min", "Prevent double-submitting identical drafts created within 10 minutes", 1, 0, '{"window_minutes": 10}', add_days(t, -10) + "T00:00:00Z"),
        ("date_bounds", "Date range ±365 days", "Reject journal dates older than 365 days or in the future", 1, 0, '{"max_days_past": 365, "allow_future": false}', add_days(t, -10) + "T00:00:00Z"),
        ("high_value_block", "Block above ৳1,00,000", "Require super-admin approval for single transactions exceeding ৳1,00,000", 0, 0, '{"threshold_poisha": 10000000}', add_days(t, -10) + "T00:00:00Z"),
    ]
    for gr in guardrails_seed:
        run("""
            INSERT OR REPLACE INTO ai_guardrails (guardrail_key, label, description, is_enabled, is_immutable, parameters, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, *gr)

    # AI Model Routes
    model_routes_seed = [
        ("intent_classification", "gpt-4o-mini", "Fast classification of merchant intent", add_days(t, -10) + "T00:00:00Z"),
        ("ambiguous_extraction", "gpt-4o", "Deep reasoning for ambiguous expense notes and voice queries", add_days(t, -10) + "T00:00:00Z"),
        ("voice_and_ocr", "whisper+vision", "Audio transcription and memo photo OCR", add_days(t, -10) + "T00:00:00Z"),
    ]
    for mr in model_routes_seed:
        run("""
            INSERT OR REPLACE INTO ai_model_routes (task_key, model_name, description, updated_at)
            VALUES (?, ?, ?, ?)
        """, *mr)

    # Recurring Expenses for Tenant 1
    run("""
        INSERT INTO recurring_expenses (merchant_id, head, name, amount, posts_on_day, cash_account_id, note, active, last_posted_date, next_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, m_id, "rent", "Banani Showroom Rent", 3500000, 1, city_bank, "Contract active until Dec 2027", 1, add_days(t, -25), add_days(t, 5), "system", add_days(t, -60) + "T00:00:00Z", add_days(t, -25) + "T00:00:00Z")

    run("""
        INSERT INTO recurring_expenses (merchant_id, head, name, amount, posts_on_day, cash_account_id, note, active, last_posted_date, next_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, m_id, "internet", "Fiber Internet & Dedicated IP", 300000, 5, bkash, "50Mbps symmetric line", 1, add_days(t, -12), add_days(t, 18), "system", add_days(t, -60) + "T00:00:00Z", add_days(t, -12) + "T00:00:00Z")

    run("""
        INSERT INTO recurring_expenses (merchant_id, head, name, amount, posts_on_day, cash_account_id, note, active, last_posted_date, next_date, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, m_id, "other_expense", "Office Refreshments & Cleaning", 150000, 10, cash_drawer, "Weekly tea, biscuits and cleaning", 1, add_days(t, -6), add_days(t, 4), "system", add_days(t, -60) + "T00:00:00Z", add_days(t, -6) + "T00:00:00Z")

    # Multi-Device Sessions for Tamim Ahmed (Tenant 1 Owner)
    run("""
        INSERT OR REPLACE INTO sessions (token, user_id, active_merchant_id, device_info, ip_address, location, last_active_at, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, "sess_desktop_tamim_001", owner_id, m_id, "Chrome 122.0 on Windows 11", "103.205.71.18", "Dhaka, Bangladesh", t + "T10:30:00Z", add_days(t, -5) + "T08:00:00Z", add_days(t, 25) + "T08:00:00Z")

    run("""
        INSERT OR REPLACE INTO sessions (token, user_id, active_merchant_id, device_info, ip_address, location, last_active_at, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, "sess_mobile_tamim_002", owner_id, m_id, "Android App 2.4.1 (Samsung Galaxy S23)", "119.30.38.10", "Dhaka, Bangladesh", t + "T09:15:00Z", add_days(t, -10) + "T09:00:00Z", add_days(t, 20) + "T09:00:00Z")

    run("""
        INSERT OR REPLACE INTO sessions (token, user_id, active_merchant_id, device_info, ip_address, location, last_active_at, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, "sess_stale_tamim_003", owner_id, m_id, "Safari 16.2 on iPhone 12", "103.205.71.22", "Chittagong, Bangladesh", add_days(t, -35) + "T14:00:00Z", add_days(t, -40) + "T14:00:00Z", add_days(t, -10) + "T14:00:00Z")

    print("Seeding completed successfully!")
    print("Multi-Tenant SaaS Demo Users:")
    print("  SUPER ADMIN:   superadmin@gross.bd / password123 (Developer Control Tower)")
    print("  ADMIN:         admin@gross.bd      / password123 (Developer Platform Admin)")
    print("  TENANT 1 OWNER: owner@demo.bd       / password123 (Tamim Ahmed - Artisan Wear)")
    print("  TENANT 1 MGR:   manager@demo.bd     / password123 (Jamal Manager - Artisan Wear)")
    print("  TENANT 2 OWNER: tanvir@gadgethub.bd / password123 (Tanvir Hasan - Dhaka Gadget Hub)")
    print("  TENANT 3 OWNER: nusrat@organictea.bd/ password123 (Nusrat Jahan - Organic Teas)")
    print("  TENANT 4 OWNER: kamal@sylhetleather.bd/ password123 (Kamal Uddin - Sylhet Craft Leather)")

if __name__ == '__main__':
    seed()

