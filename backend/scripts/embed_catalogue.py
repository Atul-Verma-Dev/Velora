"""Backfill product embeddings so vector search covers the whole catalogue.

Every product image is embedded with the configured Gemini embedding model
(GEN_MODEL_EMBEDDING, 768 dims) — the same model and dimensionality the
Gemini-seeded rows already use, so all rows live in one vector space. Text
embeddings are only used for a product whose image file is missing, and each
row records which method produced its vector.

Resumable: embeddings are cached by image filename in
backend/scripts/embedding_cache.json, so a re-run only calls Gemini for rows
that are not cached yet. Pass --all to recompute everything.

Usage
    python scripts/embed_catalogue.py            # only rows with NULL embedding
    python scripts/embed_catalogue.py --all      # recompute every row
    python scripts/embed_catalogue.py --calibrate-only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.db import db_cursor  # noqa: E402

PUBLIC_DIR = PROJECT_ROOT / "frontend" / "public"
CACHE_PATH = Path(__file__).resolve().parent / "embedding_cache.json"
GEMINI_CACHE_PATH = Path(__file__).resolve().parent / "gemini_catalog_cache.json"
EMBED_DIMS = 768

PRODUCT_COLUMNS = """
    sku, name, brand, category, subcategory, colour, colour_family, fabric, pattern,
    occasion, description, image_url, embedding
"""


def image_path(image_url: str | None) -> Path | None:
    if not image_url:
        return None
    path = PUBLIC_DIR / image_url.lstrip("/")
    return path if path.is_file() else None


def text_for(row: dict) -> str:
    parts = [
        row.get("name"), row.get("brand"), row.get("category"), row.get("subcategory"),
        row.get("colour"), row.get("colour_family"), row.get("fabric"), row.get("pattern"),
        " ".join(row.get("occasion") or []), row.get("description"),
    ]
    return " | ".join(str(p) for p in parts if p)


def load_cache() -> dict:
    cache: dict = {}
    # Reuse the embeddings generated for the Gemini-seeded rows so no image is
    # embedded twice.
    if GEMINI_CACHE_PATH.exists():
        for image, cell in json.loads(GEMINI_CACHE_PATH.read_text()).items():
            if cell.get("embedding"):
                cache[f"image:{image}"] = {
                    "vector": cell["embedding"],
                    "method": "image",
                    "model": cell.get("model_embedding"),
                }
    if CACHE_PATH.exists():
        cache.update(json.loads(CACHE_PATH.read_text()))
    return cache


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(json.dumps(cache))


def embed(client: genai.Client, model: str, row: dict, cache: dict) -> tuple[list[float], str]:
    path = image_path(row.get("image_url"))
    if path is not None:
        key = f"image:{path.name}"
        if key not in cache:
            data = path.read_bytes()
            resp = client.models.embed_content(
                model=model,
                contents=[types.Part.from_bytes(data=data, mime_type="image/jpeg")],
                config=types.EmbedContentConfig(output_dimensionality=EMBED_DIMS),
            )
            cache[key] = {
                "vector": [round(float(v), 6) for v in resp.embeddings[0].values],
                "method": "image",
                "model": model,
            }
        return cache[key]["vector"], "image"

    text = text_for(row)
    digest = hashlib.sha256(text.encode()).hexdigest()[:16]
    key = f"text:{digest}"
    if key not in cache:
        resp = client.models.embed_content(
            model=model,
            contents=[text],
            config=types.EmbedContentConfig(output_dimensionality=EMBED_DIMS),
        )
        cache[key] = {
            "vector": [round(float(v), 6) for v in resp.embeddings[0].values],
            "method": "text",
            "model": model,
        }
    return cache[key]["vector"], "text"


def write_embedding(sku: str, vector: list[float]) -> None:
    if len(vector) != EMBED_DIMS:
        raise RuntimeError(f"{sku}: expected {EMBED_DIMS} dims, got {len(vector)}")
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE products SET embedding = %s, updated_at = now() WHERE sku = %s",
            ([float(v) for v in vector], sku),
        )


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def calibrate() -> None:
    """Report the similarity distribution the threshold has to sit inside."""
    with db_cursor() as cur:
        cur.execute(
            f"SELECT {PRODUCT_COLUMNS} FROM products WHERE embedding IS NOT NULL AND status = 'live'"
        )
        rows = cur.fetchall()
        cur.execute("SELECT count(*) AS n, count(embedding) AS emb FROM products")
        counts = cur.fetchone()

    vectors = [(r["sku"], r["name"], r["subcategory"], r["embedding"]) for r in rows]
    sims = []
    for i in range(len(vectors)):
        for j in range(i + 1, len(vectors)):
            sims.append(cosine(vectors[i][3], vectors[j][3]))
    sims.sort()

    def pct(p: float) -> float:
        return round(sims[min(len(sims) - 1, int(len(sims) * p))], 3)

    print(
        f"Embedded {counts['emb']}/{counts['n']} products | "
        f"{len(sims)} unordered pairs | cosine p50={pct(0.5)} p75={pct(0.75)} "
        f"p90={pct(0.90)} p95={pct(0.95)} p99={pct(0.99)} max={round(sims[-1], 3)}"
    )

    # Known complementary pairs from the existing catalogue, for sanity.
    pairs = [
        ("VLR-3001", "VLR-4010", "kurta -> dupatta"),
        ("VLR-3001", "VLR-3019", "kurta -> jewellery"),
        ("VLR-1001", "VLR-1006", "shirt -> chino"),
        ("VLR-1001", "VLR-1014", "shirt -> watch"),
        ("VLR-2002", "VLR-2009", "dress -> sneaker"),
        ("VLR-3004", "VLR-3018", "kurta -> dupatta"),
    ]
    by_sku = {sku: emb for sku, _, _, emb in vectors}
    print("\nKnown complementary pairs:")
    for a, b, label in pairs:
        if a in by_sku and b in by_sku:
            print(f"  {a} / {b} ({label}): {round(cosine(by_sku[a], by_sku[b]), 3)}")

    print("\nTop 5 nearest live products per sample base:")
    for sku in ("VLR-3001", "VLR-1001", "VLR-2002"):
        if sku not in by_sku:
            continue
        scored = sorted(
            ((cosine(by_sku[sku], emb), other, name, sub) for other, name, sub, emb in vectors if other != sku),
            reverse=True,
        )[:5]
        print(f"  {sku}: " + ", ".join(f"{o} {round(s, 3)} ({sub})" for s, o, _, sub in scored))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="recompute embeddings for every product")
    parser.add_argument("--calibrate-only", action="store_true", help="only print similarity stats")
    args = parser.parse_args()

    if args.calibrate_only:
        calibrate()
        return

    settings = get_settings()
    api_key = os.environ.get("GOOGLE_API_KEY") or settings.google_api_key
    if not api_key:
        print("GOOGLE_API_KEY is missing from backend/.env — no Gemini calls made.")
        sys.exit(2)

    with db_cursor() as cur:
        where = "" if args.all else "WHERE embedding IS NULL"
        cur.execute(f"SELECT {PRODUCT_COLUMNS} FROM products {where} ORDER BY sku")
        rows = cur.fetchall()

    if not rows:
        print("Every product already has an embedding.")
        calibrate()
        return

    client = genai.Client(api_key=api_key)
    model = settings.gen_model_embedding
    cache = load_cache()
    print(f"Backfilling {len(rows)} products with {model} ({EMBED_DIMS} dims)")

    failures: list[tuple[str, str]] = []
    methods = {"image": 0, "text": 0}
    for i, row in enumerate(rows, 1):
        t0 = time.time()
        try:
            vector, method = embed(client, model, row, cache)
            write_embedding(row["sku"], vector)
            methods[method] += 1
            save_cache(cache)
        except Exception as exc:
            failures.append((row["sku"], str(exc)[:160]))
            print(f"[{i}/{len(rows)}] {row['sku']}: FAILED {exc}")
            continue
        print(f"[{i}/{len(rows)}] {row['sku']} {row['name'][:32]:32s} {method} ({time.time() - t0:.1f}s)")

    print(f"\nEmbedded via image: {methods['image']} | via text fallback: {methods['text']}")
    if failures:
        print(f"{len(failures)} failure(s): {[f[0] for f in failures]}")
    calibrate()


if __name__ == "__main__":
    main()
