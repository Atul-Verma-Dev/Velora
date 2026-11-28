"""Seed the Velora catalogue from frontend/src/data/catalog.js into PostgreSQL.

Resumable: all upserts are idempotent (ON CONFLICT DO UPDATE). Safe to re-run.

Per-size stock derivation:
  The frontend catalogue (src/data/catalog.js:2508-2532) defines stockForSize():
    - If product.sizeStock is present, use those explicit values.
    - Otherwise derive deterministically from total stock using derivedStockForSize().

  derivedStockForSize() uses a fixed size distribution:
    [0.16, 0.22, 0.26, 0.18, 0.11, 0.07]

  A few SKUs intentionally have a sold-out extremity:
    (char_code_of_last_id_char + size_index) % 11 == 0  => stock 0 for that size.

  This script replicates the same logic. No values are fabricated.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.db import db_cursor
from app.repositories.product import upsert_product, upsert_product_size

EXTRACT_PATH = Path(__file__).resolve().parent / "catalog-extract.json"

# Same distribution as frontend src/data/catalog.js:2506
DISTRIBUTION = [0.16, 0.22, 0.26, 0.18, 0.11, 0.07]


def derived_stock_for_size(total_stock: int, sizes: list, size: str, product_id: str) -> int:
    """Replicate frontend derivedStockForSize() deterministically."""
    if not sizes:
        return 0
    if len(sizes) == 1:
        return total_stock
    try:
        i = sizes.index(size)
    except ValueError:
        return 0  # a size the product doesn't come in is never in stock
    weights = [DISTRIBUTION[idx % len(DISTRIBUTION)] for idx in range(len(sizes))]
    total_weight = sum(weights)
    raw = (total_stock * weights[i]) / total_weight
    # Sold-out extremity rule: (char_code_of_last_id_char + size_index) % 11 == 0
    return 0 if (ord(product_id[-1]) + i) % 11 == 0 else max(0, round(raw))


def per_size_stock(product: dict) -> dict:
    """Return {size: stock} for a product, matching frontend stockForSize().

    Respects explicit product.sizeStock when present; otherwise derives
    per-size stock deterministically.
    """
    sizes = product.get("sizes", [])
    total_stock = int(product.get("stock", 0))
    product_id = product["id"]

    explicit = product.get("sizeStock")
    if explicit:
        return {size: max(0, int(explicit.get(size, 0) or 0)) for size in sizes}

    return {
        size: derived_stock_for_size(total_stock, sizes, size, product_id)
        for size in sizes
    }


def _map_seller(s: dict) -> dict:
    return {
        "id": s["id"],
        "name": s["name"],
        "legal_name": s.get("legalName"),
        "email": s.get("email"),
        "city": s.get("city"),
        "kyc": s.get("kyc"),
        "status": s.get("status", "active"),
        "rating": float(s.get("rating") or 0),
        "response_rate": int(s.get("responseRate") or 0),
        "gstin": s.get("gstin"),
        "bank": s.get("bank"),
        "categories": s.get("categories", []),
        "commission": int(s.get("commission") or 0),
        "owner": s.get("owner"),
        "phone": s.get("phone"),
        "summary": s.get("summary"),
    }


def _map_product(p: dict) -> dict:
    return {
        "sku": p["id"],
        "name": p["name"],
        "brand": p["brand"],
        "gender": p.get("gender"),
        "category": p.get("category"),
        "subcategory": p.get("subcategory"),
        "colour": p.get("color"),
        "colour_family": p.get("colorFamily"),
        "colour_hex": p.get("colorHex"),
        "fabric": p.get("fabric"),
        "pattern": p.get("pattern"),
        "neckline": p.get("neckline"),
        "sleeve": p.get("sleeve"),
        "fit": p.get("fit"),
        "fit_ease": p.get("fitEase"),
        "stretch": p.get("stretch"),
        "length": p.get("length"),
        "occasion": p.get("occasion", []),
        "care": p.get("care"),
        "origin": p.get("origin"),
        "description": p.get("description"),
        "tags": p.get("tags", []),
        "image_url": p.get("image"),
        "images": [p.get("image")] if p.get("image") else [],
        "mrp": float(p.get("mrp", p.get("price", 0))),
        "price": float(p.get("price", 0)),
        "cogs": float(p.get("cogs", 0)),
        "marginal_shipping": float(p.get("marginalShipping", 45)),
        "stock": int(p.get("stock", 0)),
        "days_in_inventory": int(p.get("stockAgeDays", 0)),
        "units_sold_30d": int(p.get("unitsSold30d", 0)),
        "seller_id": p.get("sellerId"),
        "status": "live",
        "is_featured": bool(p.get("isFeatured", False)),
        "added_days_ago": int(p.get("addedDaysAgo", 0)),
        "embedding": None,
    }


def seed() -> None:
    if not EXTRACT_PATH.exists():
        print(f"Extract file not found: {EXTRACT_PATH}")
        print("Run: node scripts/extract_catalog.mjs")
        sys.exit(1)

    data = json.loads(EXTRACT_PATH.read_text())
    sellers = data.get("sellers", [])
    products = data.get("raw", [])

    print(f"Seeding {len(sellers)} sellers and {len(products)} products...")

    with db_cursor(commit=True) as cur:
        for s in sellers:
            row = _map_seller(s)
            cur.execute(
                """
                INSERT INTO sellers (
                    id, name, legal_name, email, city, kyc, status, rating,
                    response_rate, gstin, bank, categories, commission, owner, phone, summary
                ) VALUES (
                    %(id)s, %(name)s, %(legal_name)s, %(email)s, %(city)s, %(kyc)s,
                    %(status)s, %(rating)s, %(response_rate)s, %(gstin)s, %(bank)s,
                    %(categories)s, %(commission)s, %(owner)s, %(phone)s, %(summary)s
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    legal_name = EXCLUDED.legal_name,
                    email = EXCLUDED.email,
                    city = EXCLUDED.city,
                    kyc = EXCLUDED.kyc,
                    status = EXCLUDED.status,
                    rating = EXCLUDED.rating,
                    response_rate = EXCLUDED.response_rate,
                    gstin = EXCLUDED.gstin,
                    bank = EXCLUDED.bank,
                    categories = EXCLUDED.categories,
                    commission = EXCLUDED.commission,
                    owner = EXCLUDED.owner,
                    phone = EXCLUDED.phone,
                    summary = EXCLUDED.summary
                """,
                row,
            )

    for p in products:
        row = _map_product(p)
        upsert_product(row)
        sizes = p.get("sizes", [])
        for size, stock in per_size_stock(p).items():
            upsert_product_size(p["id"], size, stock)

    print(f"Done. Seeded {len(sellers)} sellers, {len(products)} products.")


if __name__ == "__main__":
    seed()
