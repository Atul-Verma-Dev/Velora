# Velora Backend

FastAPI + PostgreSQL backend for the Velora storefront. Phase 1 implements an
inventory-aware stylist (Complete the Look) and a margin-protection pricing
engine. The frontend (`frontend/`) continues to run independently on Vite; the
backend is opt-in via `VITE_API_BACKEND=true`.

## Architecture

```
backend/
  app/
    main.py              FastAPI app, lifespan (DB pool), CORS, router mounts
    core/
      config.py          Pydantic settings from .env
      db.py              psycopg2 SimpleConnectionPool + db_cursor context mgr
      logging.py         Structured logging
    api/
      bundles.py         POST /recommend, /accept, /reject, GET /metrics
      inventory.py       GET /aging
      seller.py          GET /{id}/metrics, /{id}/liquidation
      products.py        GET /, /{sku}
      search.py          GET /products, POST /log, GET /events, /metrics
      fit.py             POST /recommend (fit confidence)
    repositories/        Parameterized psycopg2 SQL (RealDictCursor)
    services/
      pricing.py         Margin-protection pricing engine
      stylist.py         Inventory-aware stylist (vector + metadata fallback)
      fit.py             Fit confidence engine (port of frontend fit.js)
  database/
    schema.sql           DDL: tables, indexes, SQL functions
  scripts/
    seed_catalogue.py    Idempotent catalogue seed from frontend catalog.js
    extract_catalog.mjs  Extract sellers/categories/raw from catalog.js
  tests/
    test_pricing.py      Unit tests (no DB)
    test_stylist.py      Unit tests (no DB)
    test_api.py          API integration tests (requires seeded DB)
```

## Environment

Python 3.12+. Create a virtual environment and install dependencies:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

Never commit real credentials. `.env` is in `.gitignore`.

## PostgreSQL

PostgreSQL 18 running on port 5433. Database `velora`, user `velora`/`velora_dev`:

```bash
DATABASE_URL=postgres://velora:velora_dev@127.0.0.1:5433/velora
```

### Schema initialization (reproducible)

```bash
psql "postgres://velora:velora_dev@127.0.0.1:5433/velora" -f database/schema.sql
```

The schema is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE
FUNCTION`). Safe to re-run.

### pgvector note

This environment cannot install the pgvector C extension (no root, no
`postgresql-server-dev-18` headers). Embeddings are stored as `float8[]` and
compared with a SQL `cosine_similarity()` function (identical semantics to
pgvector's cosine distance `<->`). When pgvector is available, alter the
`products.embedding` column to `vector(768)`, create an ivfflat/hnsw index,
and replace similarity `ORDER BY` with `<->` — no application logic changes
required.

## Seed the catalogue

```bash
# 1. Extract catalogue data from frontend source
node scripts/extract_catalog.mjs

# 2. Seed PostgreSQL (idempotent, safe to re-run)
source .venv/bin/activate
python scripts/seed_catalogue.py
```

Per-size stock is derived deterministically from the frontend's
`derivedStockForSize()` (see `scripts/seed_catalogue.py` for the exact
distribution). No values are fabricated — the frontend catalogue only stores
total stock; per-size stock is computed from a fixed size distribution.

## Run the backend

```bash
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check: `http://127.0.0.1:8000/health`

API docs: `http://127.0.0.1:8000/docs`

## Frontend integration

The frontend uses `VITE_API_BACKEND` to opt into backend recommendations:

- `VITE_API_BACKEND=false` (default): local `ctl.js` logic is used
- `VITE_API_BACKEND=true`: backend `/api/v1/bundles/recommend` is called

If the backend is enabled but unavailable, the frontend falls back to local
`ctl.js` recommendations — valid local recommendations are never replaced with
an empty array.

Set in `frontend/.env`:

```bash
VITE_API_BACKEND=true
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Gemini / GenAI status

`google-genai` is listed in `requirements.txt` and `google_api_key` /
`gen_model_*` settings exist in `config.py`, but **no vector search or
embedding generation is implemented**. All code paths that reference embeddings
gracefully degrade to deterministic metadata compatibility scoring. GenAI
integration is isolated and can be implemented independently without touching
existing services.

## Testing

Unit tests (no database required):

```bash
source .venv/bin/activate
pytest tests/test_pricing.py tests/test_stylist.py -v
```

API integration tests (requires seeded database):

```bash
source .venv/bin/activate
pytest tests/test_api.py -v
```

All tests:

```bash
source .venv/bin/activate
pytest tests/ -v
```

## API contract

### Bundles

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/bundles/recommend` | POST | Complete the Look recommendations with margin-protection pricing |
| `/api/v1/bundles/accept` | POST | Accept a recommendation (by `recommendation_id`) |
| `/api/v1/bundles/reject` | POST | Reject/delete a recommendation |
| `/api/v1/bundles/metrics` | GET | Bundle presentation/acceptance counts |

Response item includes `recommendation_id` (database-generated primary key).

### Inventory

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/inventory/aging` | GET | 60+ day inventory eligible for Complete the Look |

### Products

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/products/` | GET | List products (filter by category/subcategory/seller) |
| `/api/v1/products/{sku}` | GET | Get a single product by SKU |

### Seller

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/seller/{seller_id}/metrics` | GET | Seller metrics (scoped to that seller) |
| `/api/v1/seller/{seller_id}/liquidation` | GET | Aging inventory with offer economics |

### Search

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/search/products` | GET | Lightweight server-side product search |
| `/api/v1/search/log` | POST | Log a search event |
| `/api/v1/search/events` | GET | Recent search events |
| `/api/v1/search/metrics` | GET | Search metrics |

### Fit

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/fit/recommend` | POST | Advisory fit recommendation for a product + profile |

### Health

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |

## Git hygiene

`.venv`, `__pycache__`, `.pytest_cache`, `.env`, `catalog-extract.json`, and
build artifacts are excluded via `backend/.gitignore`. No credentials are
stored in source control — `.env.example` provides a template with placeholder
values.

## CORS

Explicitly allowed origins: `http://localhost:5173`, `http://127.0.0.1:5173`.
No wildcard with credentials.
