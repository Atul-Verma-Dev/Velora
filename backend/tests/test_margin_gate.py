"""Margin floor and deep-discount gate unit tests — no database required."""

from app.services.pricing import margin_floor, compute_offer, deep_tier_gate_met


def test_margin_floor_basic():
    assert margin_floor(100, 45) == 145
    assert margin_floor(0, 0) == 0
    assert margin_floor(500.5, 45.5) == 546


def test_margin_floor_holds_price_at_cost():
    """When tier price would go below cost floor, price is held at floor."""
    product = {
        "sku": "TEST-FLOOR",
        "mrp": 1000,
        "cogs": 900,  # high COGS
        "marginal_shipping": 45,
        "days_in_inventory": 150,  # 60% tier
        "status": "live",
        "stock": 10,
    }
    offer = compute_offer(product, {})
    # Tier price = 1000 * 0.4 = 400, floor = 900 + 45 = 945
    # final = max(400, 945) = 945, but 945 >= 1000 (mrp)? No, 945 < 1000
    assert offer["floor"] == 945
    assert offer["final_price"] == 945
    assert offer["eligible"] is True  # 945 < 1000


def test_margin_floor_never_discounts_upward():
    """When floor >= MRP, price is set to MRP with 0% discount."""
    product = {
        "sku": "TEST-UP",
        "mrp": 100,
        "cogs": 90,
        "marginal_shipping": 45,
        "days_in_inventory": 120,
        "status": "live",
        "stock": 10,
    }
    offer = compute_offer(product, {})
    # Tier price = 40, floor = 135, final = max(40, 135) = 135 >= 100 (mrp)
    # → final = mrp = 100, discount = 0, not eligible
    assert offer["final_price"] == 100
    assert offer["discount_pct"] == 0
    assert offer["eligible"] is False


def test_deep_tier_gate_at_threshold():
    assert deep_tier_gate_met(2000, 2000) is True


def test_deep_tier_gate_below_threshold():
    assert deep_tier_gate_met(1999.99, 2000) is False
    assert deep_tier_gate_met(0, 2000) is False


def test_deep_tier_gate_above_threshold():
    assert deep_tier_gate_met(2500, 2000) is True
