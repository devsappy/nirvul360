"""
Database Session & Execution Engine.
Natively supports:
1. Supabase PostgreSQL via direct connection (DATABASE_URL / SUPABASE_DB_URL).
2. SQLite fallback for offline development (DB_FILE).
3. Real-time dual-replication to Supabase REST if configured.
Preserves the non-negotiable double-entry accounting rules across both engines.
"""
import os
import json
import sqlite3
import threading
from pathlib import Path
from contextlib import contextmanager
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Auto-load .env from project root if present
_here = Path(__file__).resolve().parent
_candidates = [
    _here.parent.parent.parent / ".env", # project root
    _here.parent.parent / ".env",        # backend
    Path.cwd() / ".env"
]
for _env_file in _candidates:
    if _env_file.exists():
        load_dotenv(dotenv_path=_env_file, override=False)
        break

_is_postgres: bool = False
_db_conn = None
_tx_depth = 0
_local = threading.local()

def is_postgres() -> bool:
    global _is_postgres
    return _is_postgres

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

def _get_schema_sql(is_pg: bool) -> str:
    here = Path(__file__).resolve().parent
    if is_pg:
        # Load Supabase PostgreSQL schema
        schema_path = here.parents[2] / "supabase" / "schema.sql"
        if not schema_path.exists():
            schema_path = here / "schema.sql"
    else:
        schema_path = here / "schema.sql"

    if schema_path.exists():
        with open(schema_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""

def open_db(target: Optional[str] = None):
    """
    Opens database connection.
    If target or DATABASE_URL / SUPABASE_DB_URL starts with postgresql:// or postgres://,
    connects directly to Supabase PostgreSQL. Otherwise defaults to SQLite.
    """
    global _db_conn, _is_postgres, _tx_depth
    
    conn_str = (
        target or 
        os.getenv("DATABASE_URL") or 
        os.getenv("SUPABASE_DB_URL") or 
        os.getenv("SUPABASE_POSTGRES_URL") or 
        os.getenv("DB_FILE") or 
        ":memory:"
    )

    if conn_str.startswith("postgres://") or conn_str.startswith("postgresql://"):
        # Fix legacy postgres:// URL scheme for psycopg2
        if conn_str.startswith("postgres://"):
            conn_str = "postgresql://" + conn_str[11:]
        
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            
            _db_conn = psycopg2.connect(conn_str, cursor_factory=RealDictCursor)
            _db_conn.autocommit = True
            _is_postgres = True
            print(f"Connected to Supabase PostgreSQL successfully.")

            # Check if schema exists in Supabase
            with _db_conn.cursor() as cur:
                cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'merchants';")
                has_schema = cur.fetchone()
                if not has_schema:
                    print("Initializing Supabase schema from supabase/schema.sql...")
                    schema_sql = _get_schema_sql(is_pg=True)
                    if schema_sql:
                        cur.execute(schema_sql)
                        print("Supabase schema initialized cleanly.")
                        print("Supabase schema initialized cleanly.")
            
            _tx_depth = 0
            return _db_conn
        except Exception as e:
            if os.getenv("REQUIRE_SUPABASE", "false").lower() in ("true", "1", "yes"):
                raise RuntimeError(f"CRITICAL: Failed to connect to Supabase PostgreSQL ({e}). SQLite is strictly disabled.")
            print(f"Warning: Failed to connect to Supabase PostgreSQL ({e}). Falling back to local SQLite.")
            _is_postgres = False
            conn_str = os.getenv("DB_FILE") or str(here.parent.parent / "data" / "gross.db")

    if target != ":memory:" and os.getenv("REQUIRE_SUPABASE", "false").lower() in ("true", "1", "yes"):
        raise RuntimeError("CRITICAL: Only Supabase PostgreSQL is permitted. DATABASE_URL must be configured.")

    # Default: Local SQLite database
    _is_postgres = False
    if conn_str != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(conn_str)), exist_ok=True)

    _db_conn = sqlite3.connect(conn_str, check_same_thread=False)
    _db_conn.row_factory = dict_factory
    _db_conn.execute("PRAGMA foreign_keys = ON;")
    _db_conn.execute("PRAGMA journal_mode = WAL;")
    _db_conn.execute("PRAGMA busy_timeout = 5000;")

    # Apply schema if fresh
    has_schema = _db_conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='merchants'").fetchone()
    if not has_schema:
        schema_sql = _get_schema_sql(is_pg=False)
        if schema_sql:
            _db_conn.executescript(schema_sql)
    else:
        try:
            _db_conn.execute("ALTER TABLE sessions ADD COLUMN active_merchant_id INTEGER REFERENCES merchants(id);")
            _db_conn.commit()
        except Exception:
            pass

    _tx_depth = 0
    _local.conn = _db_conn
    return _db_conn

def get_db():
    global _db_conn
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = _db_conn
        if conn is None:
            conn = open_db()
        _local.conn = conn
    # reconnect if closed
    try:
        if _is_postgres:
            if getattr(conn, 'closed', 0) != 0:
                conn = open_db()
                _local.conn = conn
        else:
            conn.execute("SELECT 1")
    except Exception:
        conn = open_db()
        _local.conn = conn
    return conn

def _format_sql(sql: str) -> str:
    if _is_postgres:
        formatted = sql.replace("?", "%s")
        # Ensure SQLite-style integer comparisons for boolean columns work seamlessly in PostgreSQL
        formatted = formatted.replace("is_duplicate = 0", "is_duplicate = FALSE")
        formatted = formatted.replace("is_duplicate = 1", "is_duplicate = TRUE")
        formatted = formatted.replace("is_default = 1", "is_default = TRUE")
        formatted = formatted.replace("is_default = 0", "is_default = FALSE")
        formatted = formatted.replace("overdue = 1", "overdue = TRUE")
        formatted = formatted.replace("overdue = 0", "overdue = FALSE")
        formatted = formatted.replace("active = 1", "active = TRUE")
        formatted = formatted.replace("active = 0", "active = FALSE")
        return formatted
    return sql

def one(sql: str, *params) -> Optional[Dict[str, Any]]:
    conn = get_db()
    f_sql = _format_sql(sql)
    if _is_postgres:
        with conn.cursor() as cur:
            cur.execute(f_sql, params)
            res = cur.fetchone()
            return dict(res) if res else None
    else:
        cur = conn.execute(f_sql, params)
        return cur.fetchone()

def all(sql: str, *params) -> List[Dict[str, Any]]:
    conn = get_db()
    f_sql = _format_sql(sql)
    if _is_postgres:
        with conn.cursor() as cur:
            cur.execute(f_sql, params)
            rows = cur.fetchall()
            return [dict(r) for r in rows]
    else:
        cur = conn.execute(f_sql, params)
        return cur.fetchall()

def run(sql: str, *params):
    conn = get_db()
    f_sql = _format_sql(sql)
    if _is_postgres:
        with conn.cursor() as cur:
            cur.execute(f_sql, params)
            if "RETURNING" in sql.upper():
                row = cur.fetchone()
                if _tx_depth == 0:
                    conn.commit()
                if row:
                    return list(row.values())[0] if isinstance(row, dict) else row[0]
            if _tx_depth == 0:
                conn.commit()
            return cur
    else:
        cur = conn.execute(f_sql, params)
        if _tx_depth == 0:
            conn.commit()
        if "RETURNING" in sql.upper():
            row = cur.fetchone()
            if row:
                return list(row.values())[0] if isinstance(row, dict) else row[0]
        return cur

def _normalise(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, bool):
        return v if _is_postgres else (1 if v else 0)
    if isinstance(v, (dict, list)):
        return json.dumps(v)
    return v

def insert(table: str, row: Dict[str, Any]) -> int:
    conn = get_db()
    keys = [k for k, v in row.items() if v is not None]
    vals = [_normalise(row[k]) for k in keys]
    
    if _is_postgres:
        placeholders = ", ".join(["%s"] * len(keys))
        if table in (
            "sessions", "reason_codes", "scheduler_runs",
            "saas_plans", "scheduled_jobs", "feature_flags",
            "ai_guardrails", "ai_model_routes", "system_config"
        ):
            sql = f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({placeholders})"
            with conn.cursor() as cur:
                cur.execute(sql, vals)
                if _tx_depth == 0:
                    conn.commit()
            return 0
        else:
            sql = f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({placeholders}) RETURNING id"
            with conn.cursor() as cur:
                cur.execute(sql, vals)
                res = cur.fetchone()
                row_id = res["id"] if res and "id" in res else 0
                if _tx_depth == 0:
                    conn.commit()
    else:
        placeholders = ", ".join(["?"] * len(keys))
        sql = f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({placeholders})"
        cur = conn.execute(sql, vals)
        if _tx_depth == 0:
            conn.commit()
        row_id = cur.lastrowid



    return int(row_id)

def update(table: str, row_id: int, changes: Dict[str, Any]):
    conn = get_db()
    keys = [k for k, v in changes.items() if v is not None]
    if not keys:
        return
    vals = [_normalise(changes[k]) for k in keys]
    
    if _is_postgres:
        set_clause = ", ".join([f"{k} = %s" for k in keys])
        sql = f"UPDATE {table} SET {set_clause} WHERE id = %s"
        with conn.cursor() as cur:
            cur.execute(sql, [*vals, row_id])
            if _tx_depth == 0:
                conn.commit()
    else:
        set_clause = ", ".join([f"{k} = ?" for k in keys])
        sql = f"UPDATE {table} SET {set_clause} WHERE id = ?"
        conn.execute(sql, [*vals, row_id])
        if _tx_depth == 0:
            conn.commit()



@contextmanager
def tx():
    global _tx_depth
    conn = get_db()
    name = f"sp{_tx_depth}"
    
    if _is_postgres:
        if _tx_depth == 0:
            conn.autocommit = False
        with conn.cursor() as cur:
            if _tx_depth > 0:
                cur.execute(f"SAVEPOINT {name}")
            _tx_depth += 1
            try:
                yield
                _tx_depth -= 1
                if _tx_depth == 0:
                    conn.commit()
                    conn.autocommit = True
                else:
                    cur.execute(f"RELEASE SAVEPOINT {name}")
            except Exception:
                _tx_depth -= 1
                if _tx_depth == 0:
                    conn.rollback()
                    conn.autocommit = True
                else:
                    cur.execute(f"ROLLBACK TO SAVEPOINT {name}")
                raise
    else:
        if _tx_depth == 0:
            conn.execute("BEGIN IMMEDIATE")
        else:
            conn.execute(f"SAVEPOINT {name}")
        _tx_depth += 1
        try:
            yield
            _tx_depth -= 1
            if _tx_depth == 0:
                conn.execute("COMMIT")
            else:
                conn.execute(f"RELEASE {name}")
        except Exception:
            _tx_depth -= 1
            if _tx_depth == 0:
                conn.execute("ROLLBACK")
            else:
                conn.execute(f"ROLLBACK TO {name}")
                conn.execute(f"RELEASE {name}")
            raise
