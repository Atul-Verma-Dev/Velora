"""Margin-protection pricing engine — independent of API handlers.

Business rules (Phase 1 spec):
  * Inventory discount ladder:
      60–90 days  -> 30%
      90–120 days -> 45%
      120+ days   -> 60%
  * The 60% tier requires a cart value of at least ₹2,000.
  * final_price = max(mrp * (1 - discount_rate), cogs + marginal_shipping)
  * Prices rounded to whole INR.
  * Never discount upward (final price never exceeds MRP).
"""

OFFER_TIERS = [
    {"min": 60, "max": 90, "discount": 0.30, "label": "Stylist pairing"},
    {"min": 90, "max": 120, "discount": 0.45, "label": "VIP bundle"},
    {"min": 120, "max": None, "discount": 0.60, "label": "End-of-season"},
]


def tier_for(days_in_inventory: int) -> dict:
    for tier in OFFER_TIERS:
        if days_in_inventory >= tier["min"] and (tier["max"] is None or days_in_inventory < tier["max"]):
            return tier
    return OFFER_TIERS[0]


def margin_floor(cogs: float, marginal_shipping: float) -> int:
    return int(round(cogs + marginal_shipping))


def compute_offer(product: dict, config: dict) -> dict:
    """Compute the offer for a single product.

    Returns the full economic breakdown (suitable for seller endpoints). The
    caller decides which fields to expose to shoppers.
    """
    mrp = float(product["mrp"])
    cogs = float(product.get("cogs", mrp * 0.35))
    marginal_shipping = float(product.get("marginal_shipping", config.get("default_marginal_shipping", 45)))
    age = int(product.get("days_in_inventory", 0))
    tier = tier_for(age)
    tier_price = int(round(mrp * (1 - tier["discount"])))
    floor = margin_floor(cogs, marginal_shipping)
    final_price = max(tier_price, floor)
    # Never discount upward.
    if final_price >= mrp:
        final_price = int(mrp)
        applied_discount = 0
        applied_tier = {"min": 0, "max": 0, "discount": 0.0, "label": "No offer"}
    else:
        applied_discount = int(round((1 - final_price / mrp) * 100))
        applied_tier = tier
    saving = mrp - final_price

    explanation = []
    if age < 60:
        explanation.append(f"Not eligible: stock is {age} days old (needs 60+ days).")
    else:
        explanation.append(f"Stock age {age} days -> {applied_tier['label']} tier.")
        if applied_tier["discount"] >= 0.60:
            explanation.append("Deepest tier (60%) applies.")
        if final_price == floor:
            explanation.append(f"Price held at cost floor (COGS + shipping = ₹{floor}).")
        else:
            explanation.append(f"Tier price ₹{tier_price} clears the cost floor ₹{floor}.")
    if final_price >= mrp:
        explanation[0] = "Not eligible: offer would exceed MRP."

    return {
        "sku": product.get("sku"),
        "mrp": mrp,
        "original_price": mrp,
        "tier": applied_tier,
        "tier_price": tier_price,
        "floor": floor,
        "final_price": final_price,
        "discount_pct": applied_discount,
        "saving": saving,
        "margin_floor": floor,
        "cogs": cogs,
        "inventory_age": age,
        "days_in_inventory": age,
        "eligible": final_price < mrp and age >= 60,
        "explanation": " ".join(explanation),
    }


def deep_tier_gate_met(cart_subtotal: float, gate: int) -> bool:
    return cart_subtotal >= gate


def is_offer_eligible(product: dict, config: dict) -> bool:
    age = int(product.get("days_in_inventory", 0))
    if age < 60:
        return False
    if product.get("status") != "live":
        return False
    if int(product.get("stock", 0)) <= 0:
        return False
    offer = compute_offer(product, config)
    return offer["eligible"]
