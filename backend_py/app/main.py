"""
FastAPI Main Application entry point for Gross Management.
"""
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Automatically load .env from project root if present
root_dir = Path(__file__).resolve().parent.parent.parent
env_file = root_dir / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file, override=True)
else:
    load_dotenv(override=True)

from app.db.session import open_db
from app.domain.exceptions import seed_reason_codes
from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.orders import router as orders_router
from app.api.money import router as money_router
from app.api.integrations import router as integrations_router
from app.api.events import router as events_router
from app.api.webhooks import router as webhooks_router
from app.api.admin import router as admin_router
from app.api.products import router as products_router
from app.api.exceptions import router as exceptions_router
from app.api.settlements import router as settlements_router
from app.api.reports import router as reports_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Determine DB path / connection (Direct Supabase PostgreSQL vs local SQLite)
    pg_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL") or os.getenv("SUPABASE_POSTGRES_URL")
    if pg_url:
        print(f"Initializing connection to Supabase PostgreSQL...")
        open_db(pg_url)
        seed_reason_codes()
    else:
        db_file = os.getenv("DB_FILE")
        if not db_file:
            db_file = str(Path(__file__).resolve().parent.parent / "data" / "gross.db")
        needs_seed = not os.path.exists(db_file)
        open_db(db_file)
        if needs_seed:
            try:
                from seed import seed
                seed()
            except Exception as e:
                print(f"Auto-seed warning: {e}")
        seed_reason_codes()

    print(f"Gross Management (FastAPI) active — Engine ready.")
    yield

app = FastAPI(
    title="Gross Management API",
    description="Automated accounting engine for Bangladeshi E-commerce & F-commerce",
    version="2.0.0",
    lifespan=lifespan
)

_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(orders_router)
app.include_router(money_router)
app.include_router(integrations_router)
app.include_router(events_router)
app.include_router(webhooks_router)
app.include_router(admin_router)
app.include_router(products_router)
app.include_router(exceptions_router)
app.include_router(settlements_router)
app.include_router(reports_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "framework": "FastAPI", "engine": "Python 3.11"}
