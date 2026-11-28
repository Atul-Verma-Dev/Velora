"""Fit confidence API endpoint.

Advisory only — not a guarantee of measurement accuracy. No camera scanning.
"""

from fastapi import APIRouter, HTTPException

from app.repositories.product import get_product_by_sku
from app.schemas.fit import (
    FitProfileIn,
    FitRecommendRequest,
    FitRecommendResponse,
)
from app.services.fit import fit_profile_for

router = APIRouter()


@router.post("/recommend", response_model=FitRecommendResponse)
def fit_recommend(req: FitRecommendRequest):
    """Return a fit recommendation for a product given a shopper profile.

    The product is fetched from the database; the fit engine runs locally
    (no model API call) and returns an advisory size recommendation.
    """
    product = get_product_by_sku(req.product_sku)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    recommendation = fit_profile_for(product, req.profile.model_dump())
    return FitRecommendResponse(
        product_sku=req.product_sku,
        profile=req.profile,
        recommendation=recommendation,
    )
