"""Insert the Gemini-generated catalogue into PostgreSQL.

Reads backend/scripts/gemini_catalog_seed.json (written by
generate_gemini_catalog.py) and writes it through the project's own repository
layer, so the rows have exactly the shape the backend serves:

  - app.repositories.product.upsert_product      (products, embedding included)
  - app.repositories.product.upsert_product_size (product_sizes)
  - seed_catalogue._map_product / per_size_stock (catalogue-shape -> column mapping
    and the same deterministic per-size stock split used by the existing seed)

Idempotent and resumable: every write is an upsert keyed by SKU, so re-running
refreshes the same rows instead of duplicating them. Nothing is written if
validation fails.

Usage
    python scripts/seed_gemini_catalog.py
    python scripts/seed_gemini_catalog.py --verify-only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.db import db_cursor  # noqa: E402
from app.repositories.product import upsert_product, upsert_product_size  # noqa: E402
from seed_catalogue import _map_product, per_size_stock  # noqa: E402

PROJECT_ROOT = BACKEND_DIR.parent
SEED_PATH = Path(__file__).resolve().parent / "gemini_catalog_seed.json"
IMAGE_DIR = PROJECT_ROOT / "frontend" / "public" / "images"
EMBED_DIMS = 768


def load_seed() -> dict:
    if not SEED_PATH.exists():
        print(f"Seed file not found: {SEED_PATH}")
        print("Run: python scripts/generate_gemini_catalog.py")
        sys.exit(1)
    return json.loads(SEED_PATH.read_text())


def validate(products: list[dict]) -> list[str]:
    errors: list[str] = []
    skus = [p["id"] for p in products]
    if len(skus) != len(set(skus)):
        errors.append("duplicate SKUs in seed file")
    if not 20 <= len(products) <= 30:
        errors.append(f"expected 20-30 products, found {len(products)}")
    with db_cursor() as cur:
        cur.execute("SELECT id FROM sellers")
        sellers = {r["id"] for r in cur.fetchall()}
        cur.execute("SELECT sku, image_url FROM products WHERE sku = ANY(%s)", (skus,))
        existing = {r["sku"]: r["image_url"] for r in cur.fetchall()}
    for p in products:
        sku = p["id"]
        if p["sellerId"] not in sellers:
            errors.append(f"{sku}: seller {p['sellerId']} does not exist")
        image_file = IMAGE_DIR / Path(p["image"]).name
        if not image_file.is_file():
            errors.append(f"{sku}: image missing on disk ({image_file})")
        embedding = p.get("embedding") or []
        if len(embedding) != EMBED_DIMS or not all(isinstance(v, (int, float)) for v in embedding):
            errors.append(f"{sku}: embedding must be {EMBED_DIMS} numeric values (found {len(embedding)})")
        if p["price"] > p["mrp"]:
            errors.append(f"{sku}: price {p['price']} exceeds mrp {p['mrp']}")
        if p["cogs"] >= p["price"]:
            errors.append(f"{sku}: cogs {p['cogs']} is not below price {p['price']}")
        if not p.get("sizes"):
            errors.append(f"{sku}: no sizes")
        # Never overwrite a row that belongs to a different listing.
        if sku in existing and existing[sku] != p["image"]:
            errors.append(f"{sku}: SKU already exists with image {existing[sku]}")
    return errors


def insert(products: list[dict]) -> int:
    for p in products:
        row = _map_product(p)
        row["embedding"] = [float(v) for v in p["embedding"]]
        upsert_product(row)
        for size, stock in per_size_stock(p).items():
            upsert_product_size(p["id"], size, stock)
    return len(products)


def verify(products: list[dict]) -> None:
    skus = [p["id"] for p in products]
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT count(*) AS n,
                   count(embedding) AS embedded,
                   min(array_length(embedding, 1)) AS min_dims,
                   max(array_length(embedding, 1)) AS max_dims,
                   min(price) AS min_price,
                   max(price) AS max_price
            FROM products WHERE sku = ANY(%s)
            """,
            (skus,),
        )
        summary = cur.fetchone()
        print(
            f"Rows: {summary['n']}/{len(products)} | with embedding: {summary['embedded']} | "
            f"dims {summary['min_dims']}-{summary['max_dims']} | price ₹{summary['min_price']}-₹{summary['max_price']}"
        )
        cur.execute(
            "SELECT count(*) AS n FROM product_sizes WHERE sku = ANY(%s)", (skus,)
        )
        print("Size rows:", cur.fetchone()["n"])
        cur.execute(
            """
            SELECT category, count(*) AS n FROM products
            WHERE sku = ANY(%s) GROUP BY category ORDER BY category
            """,
            (skus,),
        )
        print("By category:", {r["category"]: r["n"] for r in cur.fetchall()})
        cur.execute("SELECT count(*) AS n FROM products")
        print("Catalogue total:", cur.fetchone()["n"])
        cur.execute(
            """
            SELECT sku, name, brand, category, subcategory, gender, colour, price, stock, seller_id
            FROM products WHERE sku = ANY(%s) ORDER BY sku
            """,
            (skus,),
        )
        for r in cur.fetchall():
            print(
                f"  {r['sku']} | {r['name'][:34]:34s} | {r['category']:12s} | "
                f"{r['subcategory']:14s} | {r['gender']:6s} | ₹{r['price']:>5} | "
                f"stock {r['stock']:>2} | {r['seller_id']}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true", help="verify without writing")
    args = parser.parse_args()

    seed = load_seed()
    products = seed["products"]
    print(
        f"Seed: {len(products)} products from {seed.get('models', {}).get('flash')} + "
        f"{seed.get('models', {}).get('embedding')} ({seed.get('generated_at')})"
    )

    errors = validate(products)
    if errors:
        print("Validation failed — nothing written:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    if not args.verify_only:
        written = insert(products)
        print(f"Upserted {written} products (idempotent by SKU).")

    verify(products)


if __name__ == "__main__":
    main()
