-- Velora backend database schema.
-- Phase 1: inventory-aware stylist + margin-protection pricing engine.
--
-- Embedding storage note: this environment cannot install the pgvector C extension
-- (no root / no postgresql-server-dev headers). Embeddings are stored as float8[]
-- arrays and compared with SQL cosine similarity, which has identical semantics to
-- pgvector's cosine distance (<->). When pgvector is available, alter the column to
-- `vector(768)`, create an ivfflat/hnsw index, and replace the similarity ORDER BY
-- with `<->` — no application logic changes required.

CREATE TABLE IF NOT EXISTS sellers (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    legal_name    TEXT,
    email         TEXT,
    city          TEXT,
    kyc           TEXT,
    status        TEXT,
    rating        NUMERIC(3,2),
    response_rate INTEGER,
    gstin         TEXT,
    bank          TEXT,
    categories    TEXT[],
    commission    INTEGER,
    owner         TEXT,
    phone         TEXT,
    summary       TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    sku                TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    brand              TEXT NOT NULL,
    gender             TEXT,
    category           TEXT NOT NULL,
    subcategory        TEXT NOT NULL,
    colour             TEXT,
    colour_family      TEXT,
    colour_hex         TEXT,
    fabric             TEXT,
    pattern            TEXT,
    neckline           TEXT,
    sleeve             TEXT,
    fit                TEXT,
    fit_ease           TEXT,
    stretch            TEXT,
    length             TEXT,
    occasion           TEXT[],
    care               TEXT,
    origin             TEXT,
    description        TEXT,
    tags               TEXT[],
    image_url          TEXT,
    images             TEXT[],
    mrp                NUMERIC(10,2) NOT NULL,
    price              NUMERIC(10,2) NOT NULL,
    cogs               NUMERIC(10,2) NOT NULL,
    marginal_shipping  NUMERIC(10,2) NOT NULL,
    stock              INTEGER NOT NULL DEFAULT 0,
    days_in_inventory  INTEGER NOT NULL DEFAULT 0,
    units_sold_30d     INTEGER NOT NULL DEFAULT 0,
    seller_id          TEXT NOT NULL REFERENCES sellers(id),
    status             TEXT NOT NULL DEFAULT 'live',
    is_featured        BOOLEAN NOT NULL DEFAULT FALSE,
    added_days_ago     INTEGER NOT NULL DEFAULT 0,
    embedding          float8[],           -- swap to vector(768) when pgvector is available
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_colour_family ON products(colour_family);
CREATE INDEX IF NOT EXISTS idx_products_days_inventory ON products(days_in_inventory);

CREATE TABLE IF NOT EXISTS product_sizes (
    sku      TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
    size     TEXT NOT NULL,
    stock    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sku, size)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id          BIGSERIAL PRIMARY KEY,
    sku         TEXT NOT NULL REFERENCES products(sku),
    size        TEXT,
    delta       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    actor       TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    customer_name  TEXT,
    status         TEXT NOT NULL,
    payment        TEXT,
    delivery_label TEXT,
    delivery_price NUMERIC(10,2) DEFAULT 0,
    subtotal       NUMERIC(10,2) NOT NULL,
    discount       NUMERIC(10,2) DEFAULT 0,
    shipping       NUMERIC(10,2) DEFAULT 0,
    total          NUMERIC(10,2) NOT NULL,
    placed_at      TIMESTAMPTZ NOT NULL,
    address        TEXT,
    contact        TEXT,
    tracking       JSONB DEFAULT '[]'::jsonb,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at);

CREATE TABLE IF NOT EXISTS order_items (
    id          BIGSERIAL PRIMARY KEY,
    order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sku         TEXT NOT NULL REFERENCES products(sku),
    size        TEXT NOT NULL,
    qty         INTEGER NOT NULL,
    price       NUMERIC(10,2) NOT NULL,
    offer_flag  BOOLEAN NOT NULL DEFAULT FALSE,
    seller_id   TEXT NOT NULL REFERENCES sellers(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);

CREATE TABLE IF NOT EXISTS cart_bundle_recommendations (
    id                BIGSERIAL PRIMARY KEY,
    cart_id           TEXT NOT NULL,
    base_sku          TEXT NOT NULL REFERENCES products(sku),
    candidate_sku     TEXT NOT NULL REFERENCES products(sku),
    size              TEXT NOT NULL,
    compat_score      NUMERIC(4,3) NOT NULL,
    price             NUMERIC(10,2) NOT NULL,
    mrp               NUMERIC(10,2) NOT NULL,
    saving            NUMERIC(10,2) NOT NULL,
    reason            TEXT,
    tier_label        TEXT,
    tier_discount     NUMERIC(4,3),
    stock_available   INTEGER NOT NULL DEFAULT 0,
    accepted          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_bundle_cart ON cart_bundle_recommendations(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_bundle_accepted ON cart_bundle_recommendations(accepted);

CREATE TABLE IF NOT EXISTS bundle_acceptance_events (
    id                BIGSERIAL PRIMARY KEY,
    recommendation_id BIGINT NOT NULL REFERENCES cart_bundle_recommendations(id),
    order_id          TEXT REFERENCES orders(id),
    accepted_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_events (
    id           BIGSERIAL PRIMARY KEY,
    query        TEXT NOT NULL,
    has_image    BOOLEAN NOT NULL DEFAULT FALSE,
    result_count INTEGER NOT NULL DEFAULT 0,
    excluded     JSONB DEFAULT '{}'::jsonb,
    duration_ms  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events(created_at);

-- Cosine similarity SQL function (pgvector-equivalent semantics for float8[]).
CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[])
RETURNS float8 LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT CASE
        WHEN a IS NULL OR b IS NULL THEN 0
        WHEN array_length(a, 1) IS NULL OR array_length(b, 1) IS NULL THEN 0
        WHEN array_length(a, 1) = 0 OR array_length(b, 1) = 0 THEN 0
        ELSE (
            SELECT COALESCE(SUM(x * y), 0) /
                   NULLIF(SQRT(SUM(x * x) * SUM(y * y)), 0)
            FROM unnest(a, b) AS t(x, y)
        )
    END
$$;

-- Helper: is a product eligible for Complete the Look (age >= 60 days, live, stock).
CREATE OR REPLACE FUNCTION ctl_eligible(p products)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT p.status = 'live'
           AND p.days_in_inventory >= 60
           AND p.stock > 0
$$;
