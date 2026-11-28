"""Inventory age eligibility unit tests — no database required."""

from app.services.pricing import tier_for, is_offer_eligible, compute_offer


def test_inventory_age_under_60_not_eligible():
    """Products under 60 days in inventory are not eligible for Complete the Look."""
    product = {
        "sku": "TEST-NEW",
        "mrp": 2000,
        "cogs": 500,
        "marginal_shipping": 45,
        "days_in_inventory": 59,
        "status": "live",
        "stock": 10,
    }
    assert is_offer_eligible(product, {}) is False
    offer = compute_offer(product, {})
    assert offer["eligible"] is False
    assert "Not eligible" in offer["explanation"]


def test_inventory_age_exactly_60_eligible():
    """Products exactly 60 days old enter the first tier (30%)."""
    product = {
        "sku": "TEST-60",
        "mrp": 2000,
        "cogs": 500,
        "marginal_shipping": 45,
        "days_in_inventory": 60,
        "status": "live",
        "stock": 10,
    }
    assert is_offer_eligible(product, {}) is True
    offer = compute_offer(product, {})
    assert offer["tier"]["discount"] == 0.30
    assert offer["eligible"] is True


def test_inventory_age_boundary_89_90():
    """89 days = 30% tier, 90 days = 45% tier."""
    offer_89 = compute_offer(
        {"sku": "A", "mrp": 2000, "cogs": 500, "marginal_shipping": 45,
         "days_in_inventory": 89, "status": "live", "stock": 10}, {}
    )
    assert offer_89["tier"]["discount"] == 0.30

    offer_90 = compute_offer(
        {"sku": "B", "mrp": 2000, "cogs": 500, "marginal_shipping": 45,
         "days_in_inventory": 90, "status": "live", "stock": 10}, {}
    )
    assert offer_90["tier"]["discount"] == 0.45


def test_inventory_age_boundary_119_120():
    """119 days = 45% tier, 120 days = 60% tier."""
    offer_119 = compute_offer(
        {"sku": "A", "mrp": 3000, "cogs": 800, "marginal_shipping": 45,
         "days_in_inventory": 119, "status": "live", "stock": 10}, {}
    )
    assert offer_119["tier"]["discount"] == 0.45

    offer_120 = compute_offer(
        {"sku": "B", "mrp": 3000, "cogs": 800, "marginal_shipping": 45,
         "days_in_inventory": 120, "status": "live", "stock": 10}, {}
    )
    assert offer_120["tier"]["discount"] == 0.60


def test_tier_for_age_boundaries():
    assert tier_for(60)["discount"] == 0.30
    assert tier_for(89)["discount"] == 0.30
    assert tier_for(90)["discount"] == 0.45
    assert tier_for(119)["discount"] == 0.45
    assert tier_for(120)["discount"] == 0.60
    assert tier_for(200)["discount"] == 0.60
