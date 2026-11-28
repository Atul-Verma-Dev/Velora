"""Pricing engine unit tests — no database required."""

from app.services.pricing import (
    OFFER_TIERS,
    tier_for,
    margin_floor,
    compute_offer,
    deep_tier_gate_met,
    is_offer_eligible,
)


def test_tier_for_60_90_days():
    assert tier_for(60)["discount"] == 0.30
    assert tier_for(75)["discount"] == 0.30
    assert tier_for(89)["discount"] == 0.30


def test_tier_for_90_120_days():
    assert tier_for(90)["discount"] == 0.45
    assert tier_for(100)["discount"] == 0.45
    assert tier_for(119)["discount"] == 0.45


def test_tier_for_120_plus_days():
    assert tier_for(120)["discount"] == 0.60
    assert tier_for(200)["discount"] == 0.60


def test_tier_for_under_60_days():
    assert tier_for(30)["discount"] == 0.30  # falls back to first tier


def test_margin_floor():
    assert margin_floor(100, 45) == 145
    assert margin_floor(0, 0) == 0
    assert margin_floor(500.5, 45.5) == 546


def test_compute_offer_never_discounts_upward():
    product = {
        "sku": "TEST-1",
        "mrp": 100,
        "cogs": 90,
        "marginal_shipping": 45,
        "days_in_inventory": 120,
        "status": "live",
        "stock": 10,
    }
    offer = compute_offer(product, {})
    # Tier price = 100 * 0.4 = 40, floor = 90 + 45 = 135, final = max(40, 135) = 135
    # But 135 >= 100 (mrp), so final = mrp = 100, discount = 0, not eligible
    assert offer["final_price"] == 100
    assert offer["discount_pct"] == 0
    assert offer["eligible"] is False


def test_compute_offer_eligible_30pct():
    product = {
        "sku": "TEST-2",
        "mrp": 2000,
        "cogs": 500,
        "marginal_shipping": 45,
        "days_in_inventory": 75,
        "status": "live",
        "stock": 10,
    }
    offer = compute_offer(product, {})
    assert offer["tier"]["discount"] == 0.30
    assert offer["tier_price"] == 1400
    assert offer["floor"] == 545
    assert offer["final_price"] == 1400
    assert offer["discount_pct"] == 30
    assert offer["saving"] == 600
    assert offer["eligible"] is True


def test_compute_offer_deep_tier_60pct():
    product = {
        "sku": "TEST-3",
        "mrp": 3000,
        "cogs": 800,
        "marginal_shipping": 45,
        "days_in_inventory": 150,
        "status": "live",
        "stock": 10,
    }
    offer = compute_offer(product, {})
    assert offer["tier"]["discount"] == 0.60
    assert offer["tier_price"] == 1200
    assert offer["floor"] == 845
    assert offer["final_price"] == 1200
    assert offer["discount_pct"] == 60
    assert offer["eligible"] is True


def test_deep_tier_gate():
    assert deep_tier_gate_met(2000, 2000) is True
    assert deep_tier_gate_met(1999, 2000) is False
    assert deep_tier_gate_met(0, 2000) is False


def test_is_offer_eligible_age_under_60():
    product = {
        "mrp": 1000,
        "cogs": 300,
        "marginal_shipping": 45,
        "days_in_inventory": 30,
        "status": "live",
        "stock": 10,
    }
    assert is_offer_eligible(product, {}) is False


def test_is_offer_eligible_not_live():
    product = {
        "mrp": 1000,
        "cogs": 300,
        "marginal_shipping": 45,
        "days_in_inventory": 100,
        "status": "draft",
        "stock": 10,
    }
    assert is_offer_eligible(product, {}) is False


def test_is_offer_eligible_out_of_stock():
    product = {
        "mrp": 1000,
        "cogs": 300,
        "marginal_shipping": 45,
        "days_in_inventory": 100,
        "status": "live",
        "stock": 0,
    }
    assert is_offer_eligible(product, {}) is False


def test_offer_tiers_order():
    assert OFFER_TIERS[0]["discount"] == 0.30
    assert OFFER_TIERS[1]["discount"] == 0.45
    assert OFFER_TIERS[2]["discount"] == 0.60
