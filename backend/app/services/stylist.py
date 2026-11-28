"""Inventory-aware stylist service for Complete the Look recommendations.

Pipeline:
  1. Receive the primary cart product(s).
  2. Retrieve eligible complementary inventory (age >= 60 days, live, stock > 0).
  3. Exclude the primary product itself.
  4. Check stock availability (exact size or one-size).
  5. Determine aesthetic compatibility:
       - vector path: cosine similarity of image embeddings gates the candidate
         (threshold from settings.aesthetic_threshold, calibrated on this catalogue)
       - metadata path: deterministic colour/occasion/gender/category score, threshold 0.60
  6. Consider colour, fabric, category, occasion and product attributes: the vector
     gate decides *whether* a piece is visually coherent, the metadata score decides
     whether it is actually complementary, and ranking blends the two.
  7. Rank eligible recommendations.
  8. Pass candidates to the pricing engine.

Genuine vector similarity is clearly distinguished from deterministic metadata scoring.
"""

from app.core.config import get_settings
from app.repositories.product import get_products_by_skus, stock_for_size
from app.services.pricing import compute_offer, deep_tier_gate_met, tier_for

settings = get_settings()

# Ranking blend. The image embedding captures visual coherence (palette, studio
# treatment, silhouette family); the metadata score captures whether the piece is a
# genuine complement (complementary subcategory, shared occasion, colour tone).
# The vector threshold gates eligibility; this blend orders what passes.
VECTOR_WEIGHT = 0.6
META_WEIGHT = 0.4

# Colour tone affinity map (ported from frontend ctl.js).
COLOUR_TONE = {
    "Yellow": ["Yellow", "Gold", "Beige", "Ivory", "Rust"],
    "Green": ["Green", "Ivory", "Gold", "Beige", "Rust"],
    "Ivory": ["Ivory", "Gold", "Rust", "Pink", "Green"],
    "Blue": ["Blue", "Ivory", "Silver", "Gold", "Pink"],
    "Pink": ["Pink", "Ivory", "Gold", "Green", "Rust"],
    "Rust": ["Rust", "Ivory", "Gold", "Green", "Beige"],
    "Black": ["Black", "Silver", "Gold", "Ivory", "White"],
    "Grey": ["Grey", "Black", "White", "Silver", "Blue"],
    "Beige": ["Beige", "Ivory", "Brown", "Green", "Gold"],
    "Brown": ["Brown", "Beige", "Ivory", "Gold", "Green"],
    "Gold": ["Gold", "Ivory", "Rust", "Pink", "Black"],
    "Silver": ["Silver", "Black", "White", "Blue", "Grey"],
    "White": ["White", "Beige", "Blue", "Black", "Gold"],
}

# Complementary subcategory map (ported from frontend ctl.js).
COMPLEMENTARY = {
    "Kurta Sets": ["Dupattas", "Jewellery", "Footwear"],
    "Sarees": ["Jewellery", "Dupattas", "Footwear"],
    "Lehengas": ["Jewellery", "Dupattas", "Footwear"],
    "Anarkalis": ["Dupattas", "Jewellery"],
    "Dresses": ["Footwear", "Bags", "Jewellery"],
    "Shirts": ["Trousers", "Denim", "Footwear", "Watches"],
    "Tops & Shirts": ["Trousers", "Denim", "Footwear"],
    "Knitwear": ["Trousers", "Denim", "Footwear"],
    "Trousers": ["Shirts", "Knitwear", "Footwear"],
    "Denim": ["Shirts", "Knitwear", "Footwear"],
    "Co-ords": ["Jewellery", "Footwear", "Bags"],
    "Outerwear": ["Knitwear", "Shirts", "Footwear"],
    "Footwear": ["Trousers", "Denim", "Accessories"],
}


def _cosine_similarity(a: list[float] | None, b: list[float] | None) -> float | None:
    if not a or not b or len(a) != len(b) or len(a) == 0:
        return None
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return None
    return dot / (norm_a * norm_b)


def _metadata_compatibility(base: dict, candidate: dict) -> float:
    """Deterministic colour/occasion/gender/category compatibility score (0-1)."""
    score = 0.0
    base_family = base.get("colour_family")
    cand_family = candidate.get("colour_family")
    if base_family and cand_family and cand_family in COLOUR_TONE.get(base_family, []):
        score += 0.34
    if base_family and cand_family and base_family == cand_family:
        score += 0.08
    base_occasion = set(base.get("occasion") or [])
    cand_occasion = set(candidate.get("occasion") or [])
    if base_occasion & cand_occasion:
        score += 0.30
    if (base.get("gender") == candidate.get("gender")
            or candidate.get("gender") == "Unisex"
            or base.get("gender") == "Unisex"):
        score += 0.12
    comp = COMPLEMENTARY.get(base.get("subcategory"), [])
    if candidate.get("subcategory") in comp:
        score += 0.26
    if candidate.get("sku") == base.get("sku"):
        score = 0.0
    return round(min(1.0, score), 2)


def _compatible_size_and_base(cart_lines: list[dict], candidate: dict):
    """Find the best (base_product, size) pair for a candidate against cart lines.

    Size rule: exact shared size, or one-size candidate. Returns (base, size, score)
    using the base with which the candidate has the highest compatibility.
    """
    raw_sizes = candidate.get("sizes") or []
    # Normalise sizes to a list of size strings (DB returns [{size, stock}, ...]).
    candidate_sizes = []
    for s in raw_sizes:
        if isinstance(s, dict):
            candidate_sizes.append(s["size"])
        else:
            candidate_sizes.append(s)
    is_one_size = len(candidate_sizes) == 1 and candidate_sizes[0] == "One size"
    best = None
    for line in cart_lines:
        base = line.get("product") or {}
        # Two SKUs sharing one photograph are duplicate listings of the same garment,
        # not a complementary piece, so they are never offered as a bundle.
        if base.get("image_url") and base.get("image_url") == candidate.get("image_url"):
            continue
        line_size = line.get("size")
        if is_one_size:
            size = "One size"
            eligible = True
        elif line_size and line_size in candidate_sizes:
            size = line_size
            eligible = True
        else:
            continue
        score = _metadata_compatibility(base, candidate)
        if best is None or score > best[2]:
            best = (base, size, score)
    return best


def recommend(
    cart_lines: list[dict],
    candidate_products: list[dict],
    config: dict | None = None,
    limit: int = 3,
) -> list[dict]:
    """Return ranked bundle recommendations for the cart.

    cart_lines: [{ product: dict, size: str, qty: int }]
    candidate_products: eligible inventory dicts from the repository.
    """
    config = config or {
        "deep_bundle_gate": settings.deep_bundle_gate,
        "offers_enabled": settings.offers_enabled,
        "default_marginal_shipping": settings.default_marginal_shipping,
    }
    if not config.get("offers_enabled", True) or not cart_lines:
        return []

    cart_ids = {str(line["product"]["sku"]) for line in cart_lines}
    cart_subtotal = sum(
        float(line["product"].get("price", 0)) * int(line.get("qty", 1)) for line in cart_lines
    )
    gate = int(config.get("deep_bundle_gate", settings.deep_bundle_gate))
    vec_threshold = float(config.get("aesthetic_threshold", settings.aesthetic_threshold))
    meta_threshold = float(config.get("metadata_compat_threshold", settings.metadata_compat_threshold))

    candidates = []
    for candidate in candidate_products:
        sku = str(candidate.get("sku"))
        if sku in cart_ids:
            continue  # exclude the primary product itself
        if candidate.get("status") != "live":
            continue
        if int(candidate.get("days_in_inventory", 0)) < 60:
            continue
        if int(candidate.get("stock", 0)) <= 0:
            continue

        matched = _compatible_size_and_base(cart_lines, candidate)
        if not matched:
            continue
        base, size, meta_score = matched

        # Aesthetic compatibility: vector path when embeddings exist, else metadata fallback.
        base_emb = base.get("embedding")
        cand_emb = candidate.get("embedding")
        vector_sim = _cosine_similarity(base_emb, cand_emb) if base_emb and cand_emb else None

        if vector_sim is not None:
            if float(vector_sim) < vec_threshold:
                continue
            compat_score = round(
                VECTOR_WEIGHT * float(vector_sim) + META_WEIGHT * meta_score, 3
            )
            scoring_mode = "vector"
        else:
            compat_score = meta_score
            if compat_score < meta_threshold:
                continue
            scoring_mode = "metadata"

        # Stock availability in the chosen size.
        stock_for_variant = int(candidate.get("stock", 0))
        if size != "One size":
            size_stock = stock_for_size(sku, size)
            # Missing per-size record (None) means stock cannot be verified — do not fabricate.
            # Zero stock means genuinely unavailable. Neither falls back to total product stock.
            if size_stock is None:
                continue
            stock_for_variant = size_stock
        if stock_for_variant < 1:
            continue

        offer = compute_offer(candidate, config)
        if not offer["eligible"]:
            continue  # never discount upward / below floor
        if offer["tier"]["discount"] >= 0.60 and not deep_tier_gate_met(cart_subtotal, gate):
            continue  # deepest tier gated by cart value

        candidates.append({
            "sku": sku,
            "name": candidate.get("name"),
            "brand": candidate.get("brand"),
            "image_url": candidate.get("image_url"),
            "colour": candidate.get("colour"),
            "colour_family": candidate.get("colour_family"),
            "size": size,
            "compat_score": compat_score,
            "vector_similarity": None if vector_sim is None else round(float(vector_sim), 3),
            "metadata_score": meta_score,
            "scoring_mode": scoring_mode,  # "vector" | "metadata"
            "base_sku": str(base.get("sku")),
            "mrp": offer["mrp"],
            "price": offer["final_price"],
            "discount_pct": offer["discount_pct"],
            "saving": offer["saving"],
            "reason": _reason_for(base, candidate),
            "tier_label": offer["tier"]["label"],
            "stock_available": stock_for_variant,
            "_offer": offer,
        })

    candidates.sort(key=lambda c: (-c["compat_score"], -c["saving"]))
    return candidates[:limit]


def _reason_for(base: dict, candidate: dict) -> str:
    base_colour = (base.get("colour") or "").lower()
    base_sub = (base.get("subcategory") or "").lower()
    cand_sub = (candidate.get("subcategory") or "")
    cand_colour = (candidate.get("colour") or "").lower()
    occasion = (candidate.get("occasion") or [None])[0] or "occasion"
    if cand_sub == "Dupattas":
        return f"A {cand_colour} dupatta that finishes the {base_colour} {base_sub} for {occasion.lower()} wear."
    if cand_sub == "Jewellery":
        return f"Tonal {cand_colour} jewellery that lifts the neckline without competing with the print."
    if (candidate.get("category") or "") == "Footwear":
        return f"A {cand_colour} sole grounds the look and works for {occasion.lower()} occasions."
    if cand_sub in ("Trousers", "Denim"):
        return f"A clean, complementary bottom that balances the {base_colour} top."
    if cand_sub in ("Shirts", "Knitwear"):
        return f"Layers neatly under or over the {base.get('name', 'piece').lower()} in a compatible palette."
    return f"Matches the {occasion.lower()} register and the {base_colour} palette."


def eligibility_explanation(days: int) -> str:
    tier = tier_for(days)
    return f"{days} days in inventory -> {tier['label']} tier ({int(tier['discount']*100)}% off)."
