# Gross Management

## Project layout

- `frontend/public/` — browser UI: HTML, CSS and JavaScript modules.
- `backend/src/` — HTTP API, domain rules, database access and integrations.
- `backend/scripts/` — development utilities, including the demo-data seeder.
- `backend/test/` — automated backend and end-to-end route tests.
- `backend/data/` — local SQLite runtime data (not application source).

## Commands

```bash
npm start   # run the API and serve the frontend
npm run dev # run with file watching
npm run seed
npm test
```
