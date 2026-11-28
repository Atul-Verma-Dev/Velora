"""Seller metrics and liquidation feed API."""

from fastapi import APIRouter

from app.repositories.seller import seller_metrics, liquidation_feed

router = APIRouter()


@router.get("/{seller_id}/metrics")
def seller_metrics_endpoint(seller_id: str):
    return seller_metrics(seller_id)


@router.get("/{seller_id}/liquidation")
def seller_liquidation(seller_id: str, min_age: int = 60):
    return liquidation_feed(seller_id, min_age=min_age)
