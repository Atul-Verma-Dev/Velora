"""Seller metrics and liquidation feed API."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.repositories.seller import liquidation_feed, liquidation_summary, seller_metrics

settings = get_settings()
router = APIRouter()


@router.get("/{seller_id}/metrics")
def seller_metrics_endpoint(seller_id: str):
    return seller_metrics(seller_id)


@router.get("/{seller_id}/liquidation/summary")
def seller_liquidation_summary(seller_id: str):
    """Capital at risk vs capital liquidated through Complete the Look.

    `capital_liquidated` is the offer value of bundle units shoppers accepted into
    their bags (an acceptance is a cart action, not a settled order).
    `reverse_logistics_saved` values the avoided return (pickup + QC + re-listing)
    for each of those units at REVERSE_LOGISTICS_COST.
    """
    data = liquidation_summary(seller_id)
    accepted = data.pop("accepted_rows")
    presented = int(data["presented"])

    units = len(accepted)
    capital_liquidated = sum(float(row["price"]) for row in accepted)
    cogs_released = sum(float(row["cogs"]) for row in accepted)
    contribution_released = sum(
        float(row["price"]) - float(row["cogs"]) - float(row["marginal_shipping"])
        for row in accepted
    )
    reverse_cost = int(settings.reverse_logistics_cost)

    recent = [
        {
            "recommendation_id": row["id"],
            "sku": row["candidate_sku"],
            "name": row["name"],
            "size": row["size"],
            "image_url": row["image_url"],
            "days_in_inventory": row["days_in_inventory"],
            "tier_label": row["tier_label"],
            "tier_discount_pct": int(round(float(row["tier_discount"]) * 100)),
            "mrp": float(row["mrp"]),
            "price": float(row["price"]),
            "saving": float(row["saving"]),
            "accepted_at": row["created_at"],
        }
        for row in accepted[:10]
    ]

    return {
        **data,
        "presented": presented,
        "accepted": units,
        "attach_rate_pct": round(units / presented * 100, 2) if presented else 0.0,
        "units_liquidated": units,
        "capital_liquidated": round(capital_liquidated, 2),
        "cogs_released": round(cogs_released, 2),
        "contribution_released": round(contribution_released, 2),
        "reverse_logistics_cost": reverse_cost,
        "reverse_logistics_saved": round(units * reverse_cost, 2),
        "recent": recent,
    }


@router.get("/{seller_id}/liquidation")
def seller_liquidation(seller_id: str, min_age: int = 60):
    return liquidation_feed(seller_id, min_age=min_age)
