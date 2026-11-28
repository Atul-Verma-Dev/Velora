"""Inventory API endpoints."""

from fastapi import APIRouter

from app.core.config import get_settings
from app.repositories.inventory import get_aging_inventory

settings = get_settings()
router = APIRouter()


@router.get("/aging")
def aging_inventory(min_age: int = 60, limit: int = 100):
    """Inventory eligible for Complete the Look (age >= min_age days, live, stock > 0)."""
    rows = get_aging_inventory(min_age=min_age, limit=limit)
    return {"items": rows, "count": len(rows), "min_age": min_age}
