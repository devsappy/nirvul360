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
    pg_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL")
    if os.getenv("REQUIRE_SUPABASE", "false").lower() in ("true", "1", "yes") or (pg_url and (pg_url.startswith("postgres://") or pg_url.startswith("postgresql://"))):
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
    supp_knit = create_supplier(m_id, {'name': 'Narayanganj Knitwear Mills', 'phone': '01712000001'}, actor)
    supp_tex = create_supplier(m_id, {'name': 'Dhaka Textiles & Dyeing', 'phone': '01712000002'}, actor)

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

    # 8. Purchase
    record_purchase(m_id, {
        'supplier_id': supp_knit,
        'product_id': shirt,
        'qty': 60,
        'unit_cost': 31000,
        'paid_amount': 1000000,
        'cash_account_id': city_bank,
        'date': add_days(t, -16),
    }, ctx)

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

    print("Seeding completed successfully!")
    print("Multi-Tenant SaaS Demo Users:")
    print("  SUPER ADMIN:   superadmin@gross.bd / password123 (Developer Control Tower)")
    print("  ADMIN:         admin@gross.bd      / password123 (Developer Platform Admin)")
    print("  TENANT 1 OWNER: owner@demo.bd       / password123 (Tamim Ahmed - Artisan Wear)")
    print("  TENANT 2 OWNER: tanvir@gadgethub.bd / password123 (Tanvir Hasan - Dhaka Gadget Hub)")
    print("  TENANT 3 OWNER: nusrat@organictea.bd/ password123 (Nusrat Jahan - Organic Teas)")

if __name__ == '__main__':
    seed()
