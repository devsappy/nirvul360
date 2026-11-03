# Gross Management — Accounting Software for Bangladeshi E-commerce Merchants

## Project layout

- `backend/` — FastAPI HTTP API, domain rules, database access and integrations.
  - `app/` — application code (api, domain, db, whatsapp, lib).
  - `tests/` — automated backend tests (pytest).
  - `data/` — local SQLite runtime data (dev only, not source).
- `frontend/` — Next.js (App Router) web dashboard.
- `supabase/` — Postgres schema + seed for production (Supabase).
- `Dockerfile.backend`, `docker-compose.yml` — containerized deployment.

## Quick start (local dev)

Backend:
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
# first run auto-seeds SQLite demo data
```

Frontend:
```bash
cd frontend
npm ci
npm run dev   # http://localhost:3000
```

Root shortcuts (if present): `npm run dev:backend`, `npm run dev:frontend`.

## Environment

Copy `.env.example` to `.env` and fill in. Key variables:

- `DATABASE_URL` / `SUPABASE_DB_URL` — Postgres connection (production). Unset → local SQLite (dev/test).
- `SUPABASE_URL`, `SUPABASE_KEY` — Supabase REST (optional).
- `CORS_ORIGINS` — comma list (default `http://localhost:3000`).
- `COOKIE_SECURE` — `true` in production (HTTPS).
- `COURIER_WEBHOOK_SECRET` — required for courier webhooks.
- `WHATSAPP_VERIFY_TOKEN` — required for WhatsApp Cloud webhook verification.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp Cloud API (optional until configured).
- `META_ADS_TOKEN`, `META_ADS_ACCOUNT_ID` — Meta Ads API (optional until configured).
- `WHATSAPP_SCHEDULER_ENABLED` — `false` by default.

## Deploy (production)

1. Provision Supabase Postgres; run `supabase/schema.sql` then `supabase/seed.sql` (or use `migrate_to_supabase.py`).
2. Set `.env` with `DATABASE_URL` pointing at Supabase and secrets.
3. `docker compose up -d --build` (backend on :8000).
4. Deploy `frontend` to Vercel; set `NEXT_PUBLIC_API_URL` to the backend URL.

## Verification

```bash
cd backend && python -m pytest tests -q   # all tests must pass
cd frontend && npm run build           # must succeed
```

Acceptance criteria (12 checks) are encoded as tests in `backend/tests/` (engine, exceptions, settlements, prices, hierarchy, whatsapp, api, integrations, security).

## Notes

- All money is stored in poisha (integers). Never float.
- Six non-negotiable data rules are enforced in `app/domain/`: versioned purchase prices, exception queue, short-payment reason codes, WhatsApp confirmation before write, FX rate stored on the transaction row, source + audit trail on every ledger row.
- Owner withdrawals reduce cash, never net profit. Profit and cash are reported separately.