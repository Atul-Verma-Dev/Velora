"""Complete the Look bundle recommendation API."""

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.repositories.bundle import (
    save_recommendations,
    mark_accepted,
    mark_rejected,
    get_bundle_acceptance_count,
    get_bundle_recommendation_count,
)
from app.repositories.inventory import get_aging_inventory
from app.repositories.product import get_products_by_skus, get_product_sizes
from app.schemas.bundle import (
    BundleRecommendRequest,
    BundleRecommendResponse,
    BundleRecommendationOut,
    BundleAcceptRequest,
    BundleAcceptResponse,
    BundleRejectRequest,
    BundleRejectResponse,
)
from app.services.stylist import recommend

settings = get_settings()
router = APIRouter()


@router.post("/recommend", response_model=BundleRecommendResponse)
def recommend_bundles(req: BundleRecommendRequest):
    """Return bundle recommendations for a cart.

    Cart items must include sku, size, and qty. Each product is fetched from the
    database to get full attributes (embedding, colour family, occasion, etc.).
    """
    cart_skus = [item.sku for item in req.cart_items]
    products = {p["sku"]: p for p in get_products_by_skus(cart_skus)}
    missing = [sku for sku in cart_skus if sku not in products]
    if missing:
        raise HTTPException(status_code=404, detail=f"Products not found: {missing}")

    # Merge per-size stock into cart product dicts so the stylist can check size availability.
    cart_sizes = get_product_sizes(cart_skus)
    for sku, sizes in cart_sizes.items():
        if sku in products:
            products[sku]["sizes"] = sizes

    cart_lines = []
    for item in req.cart_items:
        product = products[item.sku]
        cart_lines.append(
            {
                "product": product,
                "size": item.size,
                "qty": item.qty,
            }
        )

    candidates = get_aging_inventory(min_age=60, limit=200)
    candidate_skus = [c["sku"] for c in candidates]
    cand_sizes = get_product_sizes(candidate_skus)
    for c in candidates:
        if c["sku"] in cand_sizes:
            c["sizes"] = cand_sizes[c["sku"]]

    recs = recommend(cart_lines, candidates, limit=req.limit)

    # Persist recommendations and pair each with its database-generated ID.
    cart_id = "+".join(cart_skus)
    rec_ids = save_recommendations(
        [
            {
                "cart_id": cart_id,
                "base_sku": r["base_sku"],
                "candidate_sku": r["sku"],
                "size": r["size"],
                "compat_score": r["compat_score"],
                "price": r["price"],
                "mrp": r["mrp"],
                "saving": r["saving"],
                "reason": r["reason"],
                "tier_label": r["tier_label"],
                "tier_discount": r["discount_pct"] / 100.0,
                "stock_available": r["stock_available"],
            }
            for r in recs
        ]
    )

    out = [
        BundleRecommendationOut(
            recommendation_id=rec_id,
            sku=r["sku"],
            name=r["name"],
            brand=r["brand"],
            image_url=r["image_url"],
            colour=r["colour"],
            colour_family=r["colour_family"],
            size=r["size"],
            compat_score=r["compat_score"],
            mrp=r["mrp"],
            price=r["price"],
            discount_pct=r["discount_pct"],
            saving=r["saving"],
            reason=r["reason"],
            tier_label=r["tier_label"],
            stock_available=r["stock_available"],
        )
        for rec_id, r in zip(rec_ids, recs)
    ]

    cart_subtotal = req.cart_subtotal or sum(
        float(p.get("price", 0)) * int(item.qty) for p, item in zip([products[i.sku] for i in req.cart_items], req.cart_items)
    )
    gate_met = cart_subtotal >= settings.deep_bundle_gate

    return BundleRecommendResponse(
        recommendations=out,
        cart_subtotal=cart_subtotal,
        deep_bundle_gate=settings.deep_bundle_gate,
        gate_met=gate_met,
        offers_enabled=settings.offers_enabled,
    )


@router.post("/accept", response_model=BundleAcceptResponse)
def accept_bundle(req: BundleAcceptRequest):
    ok = mark_accepted(req.recommendation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return BundleAcceptResponse(
        accepted=True,
        recommendation_id=req.recommendation_id,
        message="Bundle recommendation accepted",
    )


@router.post("/reject", response_model=BundleRejectResponse)
def reject_bundle(req: BundleRejectRequest):
    ok = mark_rejected(req.recommendation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    return BundleRejectResponse(
        rejected=True,
        recommendation_id=req.recommendation_id,
        message="Bundle recommendation rejected",
    )


@router.get("/metrics")
def bundle_metrics():
    return {
        "presented": get_bundle_recommendation_count(),
        "accepted": get_bundle_acceptance_count(),
    }
