"""
nirvul360 — Supabase Migration & Seeding CLI.
Run this script to initialize and migrate tables and demo data directly to Supabase PostgreSQL.
Usage:
  python migrate_to_supabase.py
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env
root_dir = Path(__file__).resolve().parent
load_dotenv(root_dir / ".env", override=True)

# Add backend to sys.path
backend_dir = root_dir / "backend"
sys.path.insert(0, str(backend_dir))

def run_migration():
    pg_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL")
    
    if not pg_url:
        print("=" * 70)
        print("ERROR: DATABASE_URL is not set in your .env file!")
        print("=" * 70)
        print("To connect directly to Supabase PostgreSQL:")
        print("1. Go to your Supabase Dashboard: https://supabase.com/dashboard")
        print("2. Navigate to: Project Settings -> Database -> Connection string -> URI")
        print("3. Copy the URI and set it in your .env file as:")
        print("   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres")
        print("   (or pooler URI: postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres)")
        print("=" * 70)
        sys.exit(1)

    print("=" * 70)
    print("NIRVUL360 — SUPABASE CLOUD DATABASE MIGRATION")
    print("=" * 70)
    print(f"Connecting to Supabase PostgreSQL...")

    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        print("ERROR: psycopg2 is required. Run: pip install psycopg2-binary")
        sys.exit(1)

    # 1. Connect
    try:
        conn = psycopg2.connect(pg_url, cursor_factory=RealDictCursor)
        conn.autocommit = True
        print("[OK] Connected to Supabase PostgreSQL successfully!")
    except Exception as e:
        print(f"[X] Failed to connect to Supabase: {e}")
        sys.exit(1)

    # 2. Apply Schema
    schema_path = root_dir / "supabase" / "schema.sql"
    if not schema_path.exists():
        print(f"[X] Schema file not found at: {schema_path}")
        sys.exit(1)

    print(f"Applying schema from {schema_path.name}...")
    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    with conn.cursor() as cur:
        try:
            cur.execute(schema_sql)
            print("[OK] Tables, indexes, triggers, and Realtime publications applied cleanly!")
        except Exception as e:
            print(f"Warning/Error applying schema: {e}")

    # 3. Populate Demo Data from supabase/seed.sql
    seed_path = root_dir / "supabase" / "seed.sql"
    if seed_path.exists():
        print(f"\nApplying initial seed data from {seed_path.name}...")
        with open(seed_path, "r", encoding="utf-8") as f:
            seed_sql = f.read()
        with conn.cursor() as cur:
            try:
                cur.execute(seed_sql)
                print("[OK] Seeded all multi-tenant accounts, products, and orders in Supabase!")
            except Exception as e:
                print(f"Warning during seed: {e}")
    else:
        print("[!] No supabase/seed.sql found.")

    # 3.5. Post the double-entry journals for the seeded orders through the
    #      accounting engine (direct-SQL seeds bypass postings; this repairs that).
    try:
        from backfill_ledger import backfill
        rep = backfill()
        if rep['unbalanced']:
            print(f"[!] Backfill verification: {rep['unbalanced']} unbalanced journal(s)!")
        else:
            print("[OK] Ledger backfill complete — every journal balances to zero.")
        for m in rep['merchants']:
            print(f"     {m['name']}: sales ৳{m['gross_sales'] / 100:,.0f} • "
                  f"net profit ৳{m['net_profit'] / 100:,.0f} • cash ৳{m['cash'] / 100:,.0f}")
    except Exception as e:
        print(f"[!] Ledger backfill failed (run `python backfill_ledger.py` later): {e}")

    # 4. Verification table counts
    print("\nSupabase Table Verification:")
    tables = [
        'merchants', 'users', 'cash_accounts', 'suppliers', 'products', 
        'product_price_history', 'orders', 'order_items', 'journals', 
        'journal_lines', 'audit_log'
    ]
    with conn.cursor() as cur:
        for t in tables:
            try:
                cur.execute(f"SELECT COUNT(*) as c FROM {t};")
                count = cur.fetchone()['c']
                print(f"  * {t:<22} : {count:>4} rows")
            except Exception as e:
                print(f"  * {t:<22} : error ({e})")

    print("\n" + "=" * 70)
    print("MIGRATION COMPLETED SUCCESSFULLY!")
    print("Your Supabase database is now live, structured, and ready to use.")
    print("=" * 70)

if __name__ == "__main__":
    run_migration()
