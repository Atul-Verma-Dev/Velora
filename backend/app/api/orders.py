"""Order placement API — transactional order + inventory decrement.

All pricing is server-authoritative: subtotal is calculated from database
product prices, shipping from server-controlled rules, discounts validated
server-side. Client-supplied pricing fields are diagnostic only and are
never trusted for the persisted total.

Concurrency safety: product rows and per-size stock are locked with
SELECT ... FOR UPDATE within a single transaction. Duplicate SKU/size
cart lines are aggregated before inventory checks. Conditional stock
updates cannot decrement below zero. Every mutation is rolled back if
any operation fails.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException

from app.core.db import db_cursor
from app.core.config import get_settings
from app.schemas.order import OrderIn, OrderOut, OrderItemOut
from app.services.pricing import compute_offer, deep_tier_gate_met

router = APIRouter()

settings = get_settings()

# Server-controlled shipping rules (mirrors frontend format.js).
FREE_SHIPPING_THRESHOLD = Decimal("1499.00")
STANDARD_SHIPPING = Decimal("79.00")
EXPRESS_SHIPPING = Decimal("99.00")

# Server-controlled coupon rules (mirrors frontend format.js).
COUPON_MIN_BAG = Decimal("1999.00")
COUPON_DISCOUNT_PCT = Decimal("10")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _money(value) -> Decimal:
    """Round to 2 decimal places using half-up rounding for consistency."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _server_shipping(delivery_method: str, subtotal: Decimal) -> Decimal:
    """Calculate shipping using server-controlled rules.

    delivery_method is a validated allowlist value: "standard" or "express".
    """
    if delivery_method == "express":
        return EXPRESS_SHIPPING
    if subtotal >= FREE_SHIPPING_THRESHOLD:
        return Decimal("0.00")
    return STANDARD_SHIPPING


def _server_discount(coupon_code: str | None, subtotal: Decimal) -> Decimal:
    """Validate discount/coupon eligibility server-side."""
    if not coupon_code:
        return Decimal("0.00")
    code = coupon_code.strip().upper()
    if code == "VELORA10" and subtotal >= COUPON_MIN_BAG:
        return _money(subtotal * COUPON_DISCOUNT_PCT / Decimal("100"))
    return Decimal("0.00")


@router.post("")
def place_order(order: OrderIn):
    """Place an order atomically with server-authoritative pricing.

    Steps (all in one transaction):
    1. Deduplicate cart lines by (sku, size), summing quantities.
    2. Sort lock keys deterministically to reduce deadlock risk.
    3. Lock product rows and per-size stock with SELECT ... FOR UPDATE.
    4. Validate SKUs exist, are live, and have valid size records.
    5. Check stock against aggregated quantities.
    6. Validate Complete the Look offer references.
    7. Calculate subtotal from DB prices, shipping and discount server-side.
    8. Create order, order items, decrement stock, record inventory transactions,
       and link CTL acceptance events.
    9. Commit or roll back everything on failure.
    """
    # Deduplicate cart lines by (sku, size), summing quantities.
    aggregated: dict[tuple[str, str], int] = {}
    for item in order.items:
        key = (item.sku, item.size)
        aggregated[key] = aggregated.get(key, 0) + item.qty

    # Sort keys deterministically for consistent lock ordering.
    sorted_keys = sorted(aggregated.keys())
    skus = [sku for sku, _ in sorted_keys]

    with db_cursor(commit=True) as cur:
        # Lock product rows for the duration of the transaction.
        cur.execute(
            """
            SELECT sku, name, brand, category, subcategory, colour, colour_family,
                   colour_hex, fabric, pattern, neckline, sleeve, fit, fit_ease, stretch,
                   length, occasion, care, origin, description, tags, image_url, images,
                   mrp, price, cogs, marginal_shipping, stock, days_in_inventory,
                   units_sold_30d, seller_id, status, is_featured, added_days_ago
            FROM products
            WHERE sku = ANY(%s)
            FOR UPDATE
            """,
            (skus,),
        )
        products = cur.fetchall()
        product_map = {p["sku"]: p for p in products}

        # Validate products exist and are live.
        for sku, size in sorted_keys:
            qty = aggregated[(sku, size)]
            p = product_map.get(sku)
            if not p:
                raise HTTPException(status_code=404, detail=f"Product {sku} not found")
            if p["status"] != "live":
                raise HTTPException(status_code=409, detail=f"Product {sku} is not live")

        # Lock and validate per-size stock. No aggregate fallback for missing sizes.
        size_stock: dict[tuple[str, str], int] = {}
        for sku, size in sorted_keys:
            qty = aggregated[(sku, size)]
            cur.execute(
                "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s FOR UPDATE",
                (sku, size),
            )
            size_row = cur.fetchone()
            if not size_row:
                raise HTTPException(
                    status_code=409,
                    detail=f"No size record for {sku} size {size}",
                )
            available = int(size_row["stock"])
            if available < qty:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for {sku} size {size}: {available} available, {qty} requested",
                )
            size_stock[(sku, size)] = available

        # Validate Complete the Look offer references.
        offer_price_by_key: dict[tuple[str, str], Decimal] = {}
        used_recommendation_ids: set[int] = set()
        used_candidate_keys: set[tuple[str, str]] = set()
        ctl_tier_60_keys: set[tuple[str, str]] = set()
        order_base_skus: set[str] = {sku for sku, _ in sorted_keys}

        # Pricing config for CTL revalidation.
        ctl_config = {
            "default_marginal_shipping": settings.default_marginal_shipping,
            "offers_enabled": settings.offers_enabled,
            "deep_bundle_gate": settings.deep_bundle_gate,
        }

        for ref in order.offer_references:
            # Reject duplicate recommendation references.
            if ref.recommendation_id in used_recommendation_ids:
                raise HTTPException(
                    status_code=409,
                    detail=f"Recommendation {ref.recommendation_id} already referenced in this order",
                )
            used_recommendation_ids.add(ref.recommendation_id)

            # Lock the recommendation row.
            cur.execute(
                """
                SELECT id, candidate_sku AS sku, size, price, accepted, base_sku
                FROM cart_bundle_recommendations
                WHERE id = %s
                FOR UPDATE
                """,
                (ref.recommendation_id,),
            )
            rec = cur.fetchone()
            if not rec:
                raise HTTPException(
                    status_code=404,
                    detail=f"Recommendation {ref.recommendation_id} not found",
                )
            if not rec["accepted"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"Recommendation {ref.recommendation_id} has not been accepted",
                )
            # Prevent reuse: check if already linked to a completed order.
            cur.execute(
                """
                SELECT 1 FROM bundle_acceptance_events
                WHERE recommendation_id = %s AND order_id IS NOT NULL
                """,
                (ref.recommendation_id,),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=f"Recommendation {ref.recommendation_id} has already been redeemed",
                )
            # Validate candidate SKU matches.
            if rec["sku"] != ref.sku:
                raise HTTPException(
                    status_code=409,
                    detail=f"Recommendation {ref.recommendation_id} candidate SKU {rec['sku']} does not match {ref.sku}",
                )
            # Validate size matches.
            if rec["size"] != ref.size:
                raise HTTPException(
                    status_code=409,
                    detail=f"Recommendation {ref.recommendation_id} size {rec['size']} does not match {ref.size}",
                )
            # Validate base SKU is present in the order.
            if rec["base_sku"] not in order_base_skus:
                raise HTTPException(
                    status_code=409,
                    detail=f"Recommendation {ref.recommendation_id} base SKU {rec['base_sku']} is not in this order",
                )
            # Validate candidate is still live.
            candidate = product_map.get(rec["sku"])
            if not candidate:
                raise HTTPException(
                    status_code=404,
                    detail=f"Candidate product {rec['sku']} not found",
                )
            if candidate["status"] != "live":
                raise HTTPException(
                    status_code=409,
                    detail=f"Candidate product {rec['sku']} is no longer live",
                )
            # Validate candidate has sufficient stock in the offered size.
            candidate_key = (rec["sku"], rec["size"])
            if candidate_key not in size_stock:
                raise HTTPException(
                    status_code=409,
                    detail=f"Candidate product {rec['sku']} size {rec['size']} not in order inventory",
                )
            # Prevent duplicate candidate keys across CTL references.
            if candidate_key in used_candidate_keys:
                raise HTTPException(
                    status_code=409,
                    detail=f"Candidate {rec['sku']} size {rec['size']} referenced multiple times in CTL offers",
                )
            used_candidate_keys.add(candidate_key)
            # CTL items must be exactly 1 unit.
            if aggregated.get(candidate_key, 0) != 1:
                raise HTTPException(
                    status_code=409,
                    detail=f"CTL candidate {rec['sku']} size {rec['size']} must have qty=1, got {aggregated.get(candidate_key, 0)}",
                )
            # Revalidate CTL eligibility and pricing using the pricing engine.
            candidate_product = dict(candidate)
            offer = compute_offer(candidate_product, ctl_config)
            if not offer["eligible"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"CTL candidate {rec['sku']} is no longer offer-eligible: {offer['explanation']}",
                )
            # Validate the database price matches the computed offer price.
            computed_price = Decimal(str(offer["final_price"]))
            db_price = Decimal(str(rec["price"]))
            if computed_price != db_price:
                raise HTTPException(
                    status_code=409,
                    detail=f"CTL price {db_price} does not match computed offer price {computed_price} for {rec['sku']}",
                )
            # Track 60% tier items for deep bundle gate check.
            if offer["tier"]["discount"] >= 0.60:
                ctl_tier_60_keys.add(candidate_key)
            # Use database-authoritative price, never the client-supplied offer_price.
            offer_price_by_key[candidate_key] = db_price

        # Calculate subtotal from database prices (never trust client subtotal).
        subtotal = Decimal("0.00")
        line_prices: dict[tuple[str, str], Decimal] = {}
        for sku, size in sorted_keys:
            qty = aggregated[(sku, size)]
            p = product_map[sku]
            unit_price = offer_price_by_key.get((sku, size), Decimal(str(p["price"])))
            line_prices[(sku, size)] = unit_price
            subtotal += unit_price * qty
        subtotal = _money(subtotal)

        # Deep bundle gate: 60% CTL tier requires cart subtotal >= gate.
        if ctl_tier_60_keys and not deep_tier_gate_met(float(subtotal), int(settings.deep_bundle_gate)):
            raise HTTPException(
                status_code=409,
                detail=f"60% CTL tier requires cart subtotal >= ₹{settings.deep_bundle_gate}",
            )

        # Calculate shipping and discount server-side.
        shipping = _server_shipping(order.delivery, subtotal)
        discount = _server_discount(order.coupon_code, subtotal)
        total = _money(subtotal - discount + shipping)

        order_id = f"VLR-{uuid.uuid4().hex[:8]}"
        placed_at = _now_iso()

        # Create order with server-calculated values.
        cur.execute(
            """
            INSERT INTO orders (
                id, user_id, customer_name, status, payment, delivery_label,
                delivery_price, subtotal, discount, shipping, total, placed_at,
                address, contact, tracking
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
            )
            """,
            (
                order_id, order.user_id, order.customer_name, "Processing",
                order.payment, order.delivery, shipping, subtotal,
                discount, shipping, total, placed_at,
                order.address, order.contact, "[]",
            ),
        )

        # Create order items, decrement per-size stock, record inventory transactions.
        qty_by_sku: dict[str, int] = {}
        for sku, size in sorted_keys:
            qty = aggregated[(sku, size)]
            p = product_map[sku]
            unit_price = line_prices[(sku, size)]
            is_offer = (sku, size) in offer_price_by_key
            cur.execute(
                """
                INSERT INTO order_items (order_id, sku, size, qty, price, offer_flag, seller_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (order_id, sku, size, qty, unit_price, is_offer, p["seller_id"]),
            )
            cur.execute(
                """
                UPDATE product_sizes
                SET stock = stock - %s
                WHERE sku = %s AND size = %s AND stock >= %s
                """,
                (qty, sku, size, qty),
            )
            # Verify the conditional update affected a row (stock was sufficient).
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for {sku} size {size} (concurrent depletion)",
                )
            cur.execute(
                """
                INSERT INTO inventory_transactions (sku, size, delta, reason, actor)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (sku, size, -qty, f"Sale · order {order_id}", "System"),
            )
            qty_by_sku[sku] = qty_by_sku.get(sku, 0) + qty

        # Decrement total product stock with concurrency guard.
        for sku, total_qty in qty_by_sku.items():
            cur.execute(
                """
                UPDATE products
                SET stock = stock - %s
                WHERE sku = %s AND stock >= %s
                """,
                (total_qty, sku, total_qty),
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for {sku} (concurrent depletion)",
                )

        # Link accepted CTL recommendations to this order (atomic redemption).
        for ref in order.offer_references:
            cur.execute(
                """
                INSERT INTO bundle_acceptance_events (recommendation_id, order_id)
                VALUES (%s, %s)
                """,
                (ref.recommendation_id, order_id),
            )

    items_out = []
    for sku, size in sorted_keys:
        qty = aggregated[(sku, size)]
        items_out.append(
            OrderItemOut(
                id=0, order_id=order_id, sku=sku, size=size, qty=qty,
                price=float(line_prices[(sku, size)]),
                offer_flag=(sku, size) in offer_price_by_key,
                seller_id=product_map[sku]["seller_id"],
            )
        )
    return OrderOut(
        id=order_id,
        user_id=order.user_id,
        customer_name=order.customer_name,
        status="Processing",
        payment=order.payment,
        delivery_label=order.delivery,
        delivery_price=float(shipping),
        subtotal=float(subtotal),
        discount=float(discount),
        shipping=float(shipping),
        total=float(total),
        placed_at=placed_at,
        address=order.address,
        contact=order.contact,
        tracking=[],
        items=items_out,
    )
