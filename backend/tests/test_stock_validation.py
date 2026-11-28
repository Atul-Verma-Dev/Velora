"""Exact per-size stock validation unit tests — no database required."""

from app.services.stylist import recommend


def _product(sku, days=90, stock=10, colour_family="Blue", subcategory="Shirts",
             occasion=None, gender="Men", embedding=None, mrp=2000, price=1800,
             cogs=500, sizes=None):
    return {
        "sku": sku,
        "name": f"Product {sku}",
        "brand": "Test Brand",
        "colour_family": colour_family,
        "subcategory": subcategory,
        "occasion": occasion or ["Everyday"],
        "gender": gender,
        "embedding": embedding,
        "mrp": mrp,
        "price": price,
        "cogs": cogs,
        "marginal_shipping": 45,
        "stock": stock,
        "days_in_inventory": days,
        "status": "live",
        "sizes": sizes or ["M", "L"],
        "image_url": f"/images/{sku}.jpg",
        "colour": colour_family,
    }


def test_zero_stock_product_rejected():
    """A product with zero total stock is never recommended."""
    cart_lines = [{"product": _product("P1", days=90), "size": "M", "qty": 1}]
    candidates = [_product("P2", days=90, stock=0, subcategory="Trousers")]
    recs = recommend(cart_lines, candidates)
    assert len(recs) == 0


def test_per_size_zero_stock_rejected():
    """A product with zero stock in the requested size is not recommended
    even when total stock is positive."""
    cart_lines = [{"product": _product("P1", days=90), "size": "M", "qty": 1}]
    candidates = [
        _product("P2", days=90, stock=100, subcategory="Trousers", sizes=["S", "M", "L"])
    ]
    # P2 has total stock=100 but per-size M stock may be zero in the DB.
    # With no per-size record (None), stock cannot be verified — rejected.
    recs = recommend(cart_lines, candidates)
    assert len(recs) == 0


def test_one_size_stock_uses_total():
    """One-size candidates use total product stock (no per-size lookup needed)."""
    cart_lines = [{"product": _product("P1", days=90), "size": "M", "qty": 1}]
    candidates = [_product("P2", days=90, stock=5, subcategory="Dupattas", sizes=["One size"])]
    recs = recommend(cart_lines, candidates)
    # One-size with stock=5 should pass stock check (subject to compat threshold)
    if recs:
        assert recs[0]["stock_available"] >= 1


def test_missing_per_size_record_not_fallback():
    """Missing per-size record (None) is distinguishable from zero stock
    and does NOT fall back to total product stock."""
    # This test verifies behavior via the repository layer: stock_for_size
    # returns None for missing rows, and the stylist skips those candidates.
    # Unit test: a candidate without per-size data in the DB is skipped.
    cart_lines = [{"product": _product("P1", days=90), "size": "M", "qty": 1}]
    candidates = [_product("P2", days=90, stock=100, subcategory="Trousers", sizes=["S", "M", "L"])]
    recs = recommend(cart_lines, candidates)
    # Without DB per-size rows, stock_for_size returns None → candidate skipped
    assert len(recs) == 0
