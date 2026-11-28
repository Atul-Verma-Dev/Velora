"""Build a Velora catalogue seed from the existing product photography with Gemini.

Pipeline
  1. Read every existing JPEG under frontend/public/images/ (nothing is downloaded,
     generated or overwritten).
  2. Send each chosen image to the configured Gemini Flash multimodal model
     (GEN_MODEL_FLASH) for structured attribute extraction.
  3. Embed the same image with the configured Gemini embedding model
     (GEN_MODEL_EMBEDDING) into a 768-dim vector.
  4. Map the analysis onto the project taxonomy, sellers and price anchors used by
     frontend/src/data/catalog.js and emit backend/scripts/gemini_catalog_seed.json
     in exactly that catalogue shape (plus `embedding`).

Resumable / auditable: every per-image analysis and embedding is cached in
backend/scripts/gemini_catalog_cache.json, so a re-run only calls Gemini for
images that are not cached yet. Products are never invented when Gemini fails:
a failed image is reported and skipped.

Usage
    python scripts/generate_gemini_catalog.py --analyze-only
    python scripts/generate_gemini_catalog.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
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

IMAGE_DIR = PROJECT_ROOT / "frontend" / "public" / "images"
CACHE_PATH = Path(__file__).resolve().parent / "gemini_catalog_cache.json"
OUTPUT_PATH = Path(__file__).resolve().parent / "gemini_catalog_seed.json"

EMBED_DIMS = 768  # products.embedding is float8[]; 768 matches the pgvector upgrade path

# Editorial / campaign imagery is not a product shot and is never seeded.
EDITORIAL = {
    "aranya-hero.jpg",
    "aranya-campaign-haveli.jpg",
    "meher-hero.jpg",
    "velora-hero.jpg",
    "velora-reference.jpg",
}

# Final product selection (one product per image) — balanced across the four groups
# the brief asks for: men's western, women's western, ethnic, accessories/footwear.
SELECTED: tuple[str, ...] = (
    # men's western wear
    "velora-chino.jpg",
    "velora-jacket.jpg",
    "velora-overcoat.jpg",
    "velora-selvedge-jean.jpg",
    "velora-wool-trouser.jpg",
    # women's western wear
    "meher-blazer.jpg",
    "meher-cardigan.jpg",
    "meher-coord.jpg",
    "meher-dress.jpg",
    "meher-shirt.jpg",
    "meher-trousers.jpg",
    "velora-merino-polo.jpg",
    "velora-oxford-shirt.jpg",
    # ethnic wear
    "aranya-anarkali.jpg",
    "aranya-chikankari-coord.jpg",
    "aranya-genda-lehenga.jpg",
    "aranya-indigo-kurta.jpg",
    "aranya-marigold-kurta.jpg",
    "aranya-noir-kurta.jpg",
    "aranya-rani-saree.jpg",
    "aranya-rosewater-saree.jpg",
    "aranya-terracotta-coord.jpg",
    # accessories
    "aranya-jewellery.jpg",
    "aranya-marigold-dupatta.jpg",
    "meher-tote.jpg",
    "velora-watch-leather.jpg",
    # footwear
    "velora-derby.jpg",
    "velora-loafer.jpg",
    "velora-trainer.jpg",
)

# ---------------------------------------------------------------------------
# Project taxonomy (mirrors frontend/src/data/catalog.js)
# ---------------------------------------------------------------------------

CATEGORIES = ["Western Wear", "Ethnic Wear", "Footwear", "Accessories"]

SUBCATEGORY_BY_CATEGORY = {
    "Western Wear": [
        "Shirts", "Tops & Shirts", "Knitwear", "Trousers", "Trousers & Denim",
        "Denim", "Outerwear", "Dresses", "Co-ords",
    ],
    "Ethnic Wear": ["Kurta Sets", "Sarees", "Lehengas", "Anarkalis", "Co-ords"],
    "Footwear": ["Loafers", "Derbies", "Sneakers"],
    "Accessories": ["Watches", "Bags", "Dupattas", "Jewellery", "Caps & Scarves"],
}

ALL_SUBCATEGORIES = sorted({s for subs in SUBCATEGORY_BY_CATEGORY.values() for s in subs})

# A subcategory that belongs to exactly one category is the stronger signal than the
# model's category label, so it wins when the two disagree (e.g. a dupatta reported as
# "Ethnic Wear"). Subcategories shared by two categories (Co-ords) keep the model's
# category. Every correction is recorded on the generated product.
SUBCATEGORY_CATEGORIES: dict[str, set[str]] = {}
for _cat, _subs in SUBCATEGORY_BY_CATEGORY.items():
    for _sub in _subs:
        SUBCATEGORY_CATEGORIES.setdefault(_sub, set()).add(_cat)

# Hand-audited corrections for images whose garment the model placed in the wrong bucket,
# each checked visually. (category, subcategory, reason)
SUBCATEGORY_OVERRIDES: dict[str, tuple[str, str, str]] = {
    "aranya-genda-lehenga.jpg": (
        "Ethnic Wear", "Lehengas",
        "photo shows a flared lehenga with skirt and dupatta, not a kurta set",
    ),
    "aranya-terracotta-coord.jpg": (
        "Ethnic Wear", "Co-ords",
        "pleated tunic with wide-leg trouser reads as an ethnic-fusion co-ord",
    ),
}

# Names that were wrong for an audited override (the model described the wrong garment).
NAME_OVERRIDES: dict[str, str] = {
    "aranya-genda-lehenga.jpg": "Genda Embroidered Lehenga",
}

COLOUR_FAMILIES = [
    "Ivory", "Beige", "Brown", "Black", "Grey", "White", "Green", "Blue",
    "Red", "Pink", "Purple", "Yellow", "Orange", "Metallic", "Multi",
]

OCCASIONS = [
    "Everyday", "Workwear", "Festive", "Wedding", "Puja", "Party", "Travel",
    "Loungewear", "Beach", "Date night",
]

SELLERS = {
    "seller-1": {"brand": "House of Aranya", "origin": "Jaipur, India"},
    "seller-2": {"brand": "Nila Collective", "origin": "Bengaluru, India"},
    "seller-3": {"brand": "Morrow Studio", "origin": "Mumbai, India"},
    "seller-4": {"brand": "Meher Atelier", "origin": "Kolkata, India"},
    "seller-5": {"brand": "Common Thread", "origin": "Chennai, India"},
}

# Mid-market anchor per subcategory, taken from the existing catalogue's live prices.
ANCHOR_PRICE = {
    "Shirts": 1899, "Tops & Shirts": 1799, "Knitwear": 2299, "Trousers": 1899,
    "Trousers & Denim": 2099, "Denim": 2299, "Outerwear": 3699, "Dresses": 2699,
    "Kurta Sets": 1999, "Sarees": 4799, "Lehengas": 7499, "Anarkalis": 4749,
    "Co-ords": 3099, "Loafers": 2199, "Derbies": 2499, "Sneakers": 1949,
    "Watches": 3599, "Bags": 899, "Dupattas": 999, "Jewellery": 1299,
    "Caps & Scarves": 799,
}

# Price band as a multiple of the catalogue anchor, per Gemini's tier read.
TIER_BAND = {"budget": (0.72, 0.94), "mid": (0.90, 1.10), "premium": (1.10, 1.32)}

COLOUR_HEX_FALLBACK = {
    "Ivory": "#e8e1d3", "Beige": "#d9cdb8", "Brown": "#7a5a44", "Black": "#1d1d1f",
    "Grey": "#8a8a8a", "White": "#f4f2ee", "Green": "#7f8b6a", "Blue": "#3a5b7d",
    "Red": "#a6302f", "Pink": "#d9a3a5", "Purple": "#8a7aa0", "Yellow": "#d4ac4d",
    "Orange": "#c4652f", "Metallic": "#c2a35a", "Multi": "#b9a98f",
}

COGS_RATIO = {
    "Western Wear": 0.34, "Ethnic Wear": 0.30, "Footwear": 0.40, "Accessories": 0.28,
}

SIZES = {
    "apparel": ["XS", "S", "M", "L", "XL", "XXL"],
    "core": ["S", "M", "L", "XL", "XXL"],
    "ethnic": ["XS", "S", "M", "L", "XL"],
    "footwear": ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
    "one": ["One size"],
}

SYSTEM_INSTRUCTION = """You are the catalogue team for Velora, an Indian multi-brand fashion \
marketplace. You are shown ONE product photograph. Report only what is visibly present in \
that photograph; never infer a brand, price or fabric that the image does not support. When \
something is not visible, answer "Not visible" rather than guessing. Velora's taxonomy is \
fixed: category is one of Western Wear, Ethnic Wear, Footwear, Accessories, and subcategory \
must come from the allowed list. Gender describes who the garment is photographed on and \
shown for: Women, Men or Unisex (Unisex only for genuinely genderless items such as watches, \
caps, scarves and some footwear). Prices are Indian retail prices in INR."""


def build_schema() -> types.Schema:
    return types.Schema(
        type="OBJECT",
        properties={
            "is_product_shot": types.Schema(type="BOOLEAN"),
            "product_type": types.Schema(type="STRING"),
            "category": types.Schema(type="STRING", enum=CATEGORIES),
            "subcategory": types.Schema(type="STRING", enum=ALL_SUBCATEGORIES),
            "gender": types.Schema(type="STRING", enum=["Women", "Men", "Unisex"]),
            "colour": types.Schema(type="STRING"),
            "colour_hex": types.Schema(type="STRING"),
            "colour_family": types.Schema(type="STRING", enum=COLOUR_FAMILIES),
            "fabric": types.Schema(type="STRING"),
            "pattern": types.Schema(type="STRING"),
            "neckline": types.Schema(type="STRING"),
            "sleeve": types.Schema(type="STRING"),
            "fit": types.Schema(type="STRING"),
            "length": types.Schema(type="STRING"),
            "occasion": types.Schema(type="ARRAY", items=types.Schema(type="STRING", enum=OCCASIONS)),
            "description": types.Schema(type="STRING"),
            "tags": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
            "name_suggestion": types.Schema(type="STRING"),
            "price_tier": types.Schema(type="STRING", enum=["budget", "mid", "premium"]),
            "price_band_inr": types.Schema(type="INTEGER"),
            "confidence": types.Schema(type="NUMBER"),
            "notes": types.Schema(type="STRING"),
        },
        required=[
            "is_product_shot", "product_type", "category", "subcategory", "gender",
            "colour", "colour_hex", "colour_family", "fabric", "pattern", "neckline",
            "sleeve", "fit", "length", "occasion", "description", "tags",
            "name_suggestion", "price_tier", "price_band_inr", "confidence",
        ],
    )


def user_prompt() -> str:
    taxonomy = "\n".join(
        f"- {cat}: {', '.join(subs)}" for cat, subs in SUBCATEGORY_BY_CATEGORY.items()
    )
    return f"""Catalogue this photograph.

Taxonomy (category -> allowed subcategories):
{taxonomy}

Rules:
- Pick the subcategory from the list belonging to the category you choose.
- colour_hex must be the dominant garment colour as a #RRGGBB value read from the image.
- fabric: only name a fibre when the weave/drape makes it plausible (e.g. "Linen blend",
  "Cotton poplin", "Wool", "Silk", "Denim"); otherwise "Not visible".
- neckline / sleeve / fit / length: describe only the garment actually shown; use
  "Not visible" where the crop hides it. fit values should read like Regular, Relaxed,
  Slim, Straight, Oversized, Flared. length like Cropped, Hip length, Knee length,
  Midi, Maxi, Full length.
- occasion: 1-3 values from the allowed list.
- description: two sentences, 25-40 words, factual, no superlatives or invented details.
- tags: 4-6 lowercase single words or short phrases.
- name_suggestion: a 2-4 word catalogue name in the house style ("Cove Camp Shirt",
  "Marigold Handblock Kurta") without the brand name, no colour prefix unless the
  colour is intrinsic to the name.
- price_tier / price_band_inr: the plausible Indian retail price for this garment at
  Velora's mid-market tier, anchored to comparable garments.
- confidence: 0-1, how confident you are in category, subcategory and gender.
- notes: one short sentence on anything ambiguous or hidden."""


# ---------------------------------------------------------------------------
# Deterministic helpers
# ---------------------------------------------------------------------------

def stable_int(key: str) -> int:
    return int(hashlib.sha256(key.encode()).hexdigest()[:12], 16)


def normalise_taxonomy(image: str, analysis: dict) -> tuple[str, str, str | None]:
    """Return (category, subcategory, correction_note) for a Gemini analysis."""
    override = SUBCATEGORY_OVERRIDES.get(image)
    if override:
        category, subcategory, reason = override
        return category, subcategory, f"taxonomy override: {reason}"
    category = analysis["category"]
    subcategory = analysis["subcategory"]
    owners = SUBCATEGORY_CATEGORIES.get(subcategory, set())
    if len(owners) == 1:
        canonical = next(iter(owners))
        if canonical != category:
            return canonical, subcategory, f"category {category!r} normalised to {canonical!r} for {subcategory!r}"
    return category, subcategory, None


def safe_hex(value: str, family: str) -> tuple[str, bool]:
    """Validate a #RRGGBB value, falling back to the colour family's swatch."""
    value = (value or "").strip()
    if re.fullmatch(r"#?[0-9a-fA-F]{6}", value):
        return "#" + value.lstrip("#").upper(), False
    return COLOUR_HEX_FALLBACK.get(family, "#b9a98f"), True


def pick_seller(subcategory: str, category: str, gender: str) -> str:
    """Map a product onto the existing sellers in frontend/src/data/catalog.js."""
    if category == "Ethnic Wear" or subcategory in {"Dupattas", "Jewellery"}:
        return "seller-1"
    if category == "Footwear":
        return "seller-5"
    if category == "Accessories":
        if subcategory == "Watches":
            return "seller-1"
        if subcategory == "Bags":
            return "seller-2"
        return "seller-2"
    if gender == "Men":
        return "seller-2" if subcategory in {"Shirts", "Trousers", "Denim"} else "seller-3"
    if subcategory in {"Outerwear", "Knitwear", "Trousers", "Trousers & Denim"}:
        return "seller-3"
    return "seller-4"


def size_set(category: str, subcategory: str, gender: str) -> list[str]:
    if category == "Accessories":
        return list(SIZES["one"])
    if category == "Footwear":
        return list(SIZES["footwear"])
    if category == "Ethnic Wear":
        return list(SIZES["ethnic"])
    if gender in {"Men", "Unisex"}:
        return list(SIZES["core"])
    return list(SIZES["apparel"])


def care_for(fabric: str) -> str:
    f = fabric.lower()
    if any(k in f for k in ("silk", "organza", "chanderi", "banarasi", "velvet", "tulle")):
        return "Dry clean only"
    if any(k in f for k in ("wool", "merino", "mohair", "cashmere", "tweed")):
        return "Dry clean recommended, steam to refresh"
    if any(k in f for k in ("leather", "suede")):
        return "Wipe with a soft dry cloth, store with a shoe tree"
    if "linen" in f:
        return "Gentle machine wash cold, line dry"
    if any(k in f for k in ("jersey", "knit", "rib")):
        return "Hand wash cold, dry flat"
    if any(k in f for k in ("sequin", "gota", "zari", "embroider")):
        return "Dry clean only"
    return "Machine wash cold, tumble dry low"


def stretch_for(fabric: str) -> str:
    f = fabric.lower()
    if any(k in f for k in ("jersey", "knit", "rib", "elastane", "lycra", "ponte", "mohair")):
        return "medium"
    if any(k in f for k in ("denim", "twill", "linen")):
        return "low"
    return "low"


def fit_ease_for(fit: str) -> str:
    f = fit.lower()
    if any(k in f for k in ("relaxed", "oversized", "loose", "boxy")):
        return "relaxed"
    return "regular"


def price_for(subcategory: str, tier: str, band: int, key: str) -> int:
    anchor = ANCHOR_PRICE[subcategory]
    # Gemini's estimate is advisory: keep it inside the tier band around the anchor
    # so new rows sit consistently against the existing catalogue's price ladder.
    low, high = TIER_BAND.get(tier, TIER_BAND["mid"])
    lo, hi = anchor * low, anchor * high
    band = int(band) if band else int(anchor)
    value = min(max(band, lo), hi)
    # Deterministic small variation so a whole shelf does not share one price.
    value *= 0.97 + (stable_int(key) % 7) / 100
    price = int(round(value / 50.0) * 50) - 1
    return max(399, price)


def mrp_for(price: int, key: str) -> int:
    depth = (1.30, 1.35, 1.40, 1.42)[stable_int(key + "mrp") % 4]
    return int(-(-price * depth // 100) * 100) - 1


def cogs_for(price: int, category: str) -> int:
    return max(120, int(round(price * COGS_RATIO[category] / 10.0) * 10))


def shipping_for(subcategory: str, category: str) -> int:
    if category == "Footwear" or subcategory in {"Outerwear", "Lehengas", "Sarees"}:
        return 65
    return 45


def inventory_for(key: str, category: str) -> tuple[int, int, int, int]:
    """Return (stock, days_in_inventory, units_sold_30d, added_days_ago)."""
    r = stable_int(key)
    stock_range = {
        "Western Wear": (18, 46), "Ethnic Wear": (12, 34),
        "Footwear": (10, 30), "Accessories": (24, 72),
    }[category]
    stock = stock_range[0] + r % (stock_range[1] - stock_range[0] + 1)
    days = 4 + (r >> 7) % 146
    sold = min(stock, max(0, round(stock / 5) + (r >> 13) % 9))
    added = 1 + (r >> 19) % 40
    return stock, days, sold, added


def unique_name(base: str, colour: str, used: set[str]) -> str:
    base = base.strip().title() if base.isupper() else base.strip()
    if base and base.lower() not in used:
        used.add(base.lower())
        return base
    candidate = f"{colour} {base}".strip()
    i = 2
    while candidate.lower() in used:
        candidate = f"{base} {i}"
        i += 1
    used.add(candidate.lower())
    return candidate


# ---------------------------------------------------------------------------
# Gemini calls
# ---------------------------------------------------------------------------

def analyse_image(client: genai.Client, path: Path, model: str) -> dict:
    data = path.read_bytes()
    prompt = user_prompt()
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=build_schema(),
        temperature=0.15,
        system_instruction=SYSTEM_INSTRUCTION,
    )
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[types.Part.from_bytes(data=data, mime_type="image/jpeg"), prompt],
                config=config,
            )
            return json.loads(resp.text)
        except Exception as exc:  # transient 429/5xx or malformed JSON
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"analysis failed for {path.name}: {last_err}")


def embed_image(client: genai.Client, path: Path, model: str) -> list[float]:
    data = path.read_bytes()
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            resp = client.models.embed_content(
                model=model,
                contents=[types.Part.from_bytes(data=data, mime_type="image/jpeg")],
                config=types.EmbedContentConfig(output_dimensionality=EMBED_DIMS),
            )
            values = list(resp.embeddings[0].values)
            if len(values) != EMBED_DIMS:
                raise RuntimeError(f"expected {EMBED_DIMS} dims, got {len(values)}")
            return [round(float(v), 6) for v in values]
        except Exception as exc:
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"embedding failed for {path.name}: {last_err}")


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text())
    return {}


def save_cache(cache: dict) -> None:
    CACHE_PATH.write_text(json.dumps(cache, indent=1))


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_product(image: str, cell: dict, used_names: set[str]) -> dict:
    a = cell["analysis"]
    category, subcategory, taxonomy_note = normalise_taxonomy(image, a)
    gender = a["gender"]
    seller_id = pick_seller(subcategory, category, gender)
    seller = SELLERS[seller_id]
    key = image
    hex_value, hex_fallback = safe_hex(a.get("colour_hex", ""), a.get("colour_family", ""))

    price = price_for(subcategory, a["price_tier"], int(a.get("price_band_inr") or 0), key)
    stock, days, sold, added = inventory_for(key, category)

    tags = [t.strip().lower() for t in a.get("tags", []) if t.strip()]
    for extra in (subcategory.lower(), gender.lower()):
        if extra not in tags:
            tags.append(extra)
    tags = list(dict.fromkeys(tags))[:7]

    name = unique_name(
        NAME_OVERRIDES.get(image)
        or a.get("name_suggestion")
        or f"{a['colour']} {a['product_type']}",
        a["colour"],
        used_names,
    )

    return {
        "id": cell["sku"],
        "name": name,
        "brand": seller["brand"],
        "gender": gender,
        "category": category,
        "subcategory": subcategory,
        "price": price,
        "mrp": mrp_for(price, key),
        "image": f"/images/{image}",
        "color": a["colour"],
        "colorFamily": a["colour_family"],
        "colorHex": hex_value,
        "fabric": a["fabric"],
        "pattern": a["pattern"],
        "neckline": a["neckline"],
        "sleeve": a["sleeve"],
        "fit": a["fit"],
        "fitEase": fit_ease_for(a["fit"]),
        "stretch": stretch_for(a["fabric"]),
        "length": a["length"],
        "occasion": a["occasion"][:3],
        "care": care_for(a["fabric"]),
        "origin": seller["origin"],
        "description": a["description"],
        "tags": tags,
        "sellerId": seller_id,
        "sizes": size_set(category, subcategory, gender),
        "stock": stock,
        "stockAgeDays": days,
        "unitsSold30d": sold,
        "cogs": cogs_for(price, category),
        "marginalShipping": shipping_for(subcategory, category),
        "isFeatured": False,
        "addedDaysAgo": added,
        "embedding": cell["embedding"],
        "gemini": {
            "source_image": image,
            "model_flash": cell["model_flash"],
            "model_embedding": cell["model_embedding"],
            "embedding_dims": len(cell["embedding"]),
            "confidence": a.get("confidence"),
            "analysis_notes": a.get("notes", ""),
            "taxonomy_correction": taxonomy_note,
            "colour_hex_fallback": hex_fallback,
            "analysed_at": cell["analysed_at"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--analyze-only", action="store_true", help="only refresh/inspect the cache")
    parser.add_argument("--refresh", action="store_true", help="ignore cached analysis and re-call Gemini")
    args = parser.parse_args()

    settings = get_settings()
    api_key = os.environ.get("GOOGLE_API_KEY") or settings.google_api_key
    if not api_key:
        print("GOOGLE_API_KEY is missing from backend/.env — no Gemini calls made, nothing generated.")
        sys.exit(2)

    client = genai.Client(api_key=api_key)
    flash = settings.gen_model_flash
    embed_model = settings.gen_model_embedding

    pool = sorted(p.name for p in IMAGE_DIR.glob("*.jpg") if p.name not in EDITORIAL)
    selected = list(SELECTED) or pool
    missing = [n for n in selected if n not in pool]
    if missing:
        print(f"Selected images not found in {IMAGE_DIR}: {missing}")
        sys.exit(2)

    to_analyse = pool if args.analyze_only else selected
    cache = load_cache()

    print(f"Image pool: {len(pool)} | to analyse: {len(to_analyse)} | flash={flash} embed={embed_model}")
    failures: list[tuple[str, str]] = []
    for i, image in enumerate(to_analyse, 1):
        cell = cache.get(image)
        if cell and not args.refresh:
            continue
        path = IMAGE_DIR / image
        t0 = time.time()
        try:
            analysis = analyse_image(client, path, flash)
            if not analysis.get("is_product_shot", True):
                failures.append((image, "not a product shot"))
                print(f"[{i}/{len(to_analyse)}] {image}: skipped (not a product shot)")
                continue
            embedding = embed_image(client, path, embed_model)
        except Exception as exc:
            failures.append((image, str(exc)[:200]))
            print(f"[{i}/{len(to_analyse)}] {image}: FAILED {exc}")
            continue
        cache[image] = {
            "sku": "",
            "analysis": analysis,
            "embedding": embedding,
            "model_flash": flash,
            "model_embedding": embed_model,
            "analysed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        save_cache(cache)
        print(
            f"[{i}/{len(to_analyse)}] {image}: {analysis['gender']} {analysis['category']} / "
            f"{analysis['subcategory']} / {analysis['colour']} ({time.time() - t0:.1f}s)"
        )

    if args.analyze_only:
        print("\nimage | category | subcategory | gender | colour | tier | price_band | conf | name")
        for image in to_analyse:
            cell = cache.get(image)
            if not cell:
                continue
            a = cell["analysis"]
            print(
                f"{image:34s} | {a['category']:12s} | {a['subcategory']:15s} | {a['gender']:6s} | "
                f"{a['colour']:12s} | {a['price_tier']:7s} | {a['price_band_inr']:>5} | "
                f"{a.get('confidence', 0):.2f} | {a['name_suggestion']}"
            )
        if failures:
            print(f"\n{len(failures)} image(s) failed/skipped:")
            for image, err in failures:
                print(f"  {image}: {err}")
        return

    # Assign SKUs in the unused VLR-5xxx block, deterministically by image name.
    available = [n for n in selected if n in cache]
    missing_analysis = [n for n in selected if n not in cache]
    if missing_analysis:
        print(f"Missing analysis for: {missing_analysis}")
        sys.exit(1)

    start = 5001
    ordered = sorted(available)
    for offset, image in enumerate(ordered):
        cache[image]["sku"] = f"VLR-{start + offset:04d}"
    save_cache(cache)

    used_names: set[str] = set()
    products = [build_product(image, cache[image], used_names) for image in ordered]

    repeat = len(products) - len({p["name"].lower() for p in products})
    if repeat:
        print(f"Name collision resolution applied to {repeat} product(s)")

    corrections = [(p["id"], p["gemini"]["taxonomy_correction"]) for p in products
                   if p["gemini"]["taxonomy_correction"]]
    for sku, note in corrections:
        print(f"  taxonomy: {sku} — {note}")
    if not 20 <= len(products) <= 30:
        print(f"Product count {len(products)} is outside the requested 20-30 range")
        sys.exit(1)

    OUTPUT_PATH.write_text(json.dumps({
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generator": "backend/scripts/generate_gemini_catalog.py",
        "models": {"flash": flash, "embedding": embed_model, "embedding_dims": EMBED_DIMS},
        "products": products,
    }, indent=2) + "\n")

    prices = [p["price"] for p in products]
    print(f"\nWrote {len(products)} products to {OUTPUT_PATH}")
    print(f"Price range: ₹{min(prices)}–₹{max(prices)} (median ₹{int(statistics.median(prices))})")
    by_cat: dict[str, int] = {}
    for p in products:
        by_cat[p["category"]] = by_cat.get(p["category"], 0) + 1
    print("By category:", by_cat)
    if failures:
        print(f"{len(failures)} image(s) failed/skipped: {[f[0] for f in failures]}")


if __name__ == "__main__":
    main()
