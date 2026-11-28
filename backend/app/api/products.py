"""Product catalog API."""

from fastapi import APIRouter

from app.repositories.product import list_products, get_product_by_sku

router = APIRouter()


@router.get("")
def list_products_endpoint(
    category: str | None = None,
    subcategory: str | None = None,
    seller_id: str | None = None,
    status: str = "live",
    min_stock: int = 0,
    limit: int = 100,
    offset: int = 0,
):
    rows = list_products(
        category=category,
        subcategory=subcategory,
        seller_id=seller_id,
        status=status,
        min_stock=min_stock,
        limit=limit,
        offset=offset,
    )
    return {"items": rows, "count": len(rows)}


@router.get("/{sku}")
def get_product(sku: str):
    row = get_product_by_sku(sku)
    if not row:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Product not found")
    return row
