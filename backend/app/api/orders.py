"""Order placement API — transactional order + inventory decrement."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.core.db import db_cursor
from app.schemas.order import OrderIn, OrderOut, OrderItemOut

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("")
def place_order(order: OrderIn):
    """Place an order atomically: create order, items, decrement stock, record ledger."""
    skus = list({item.sku for item in order.items})

    with db_cursor(commit=True) as cur:
        # Load products and per-size stock inside the transaction for consistency.
        cur.execute(
            """
            SELECT sku, name, brand, category, subcategory, colour, colour_family,
                   colour_hex, fabric, pattern, neckline, sleeve, fit, fit_ease, stretch,
                   length, occasion, care, origin, description, tags, image_url, images,
                   mrp, price, cogs, marginal_shipping, stock, days_in_inventory,
                   units_sold_30d, seller_id, status, is_featured, added_days_ago
            FROM products
            WHERE sku = ANY(%s)
            """,
            (skus,),
        )
        products = cur.fetchall()
        product_map = {p["sku"]: p for p in products}

        # Validate stock availability before writing anything.
        for item in order.items:
            p = product_map.get(item.sku)
            if not p:
                raise HTTPException(status_code=404, detail=f"Product {item.sku} not found")
            if p["status"] != "live":
                raise HTTPException(status_code=409, detail=f"Product {item.sku} is not live")
            cur.execute(
                "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
                (item.sku, item.size),
            )
            size_row = cur.fetchone()
            available = int(size_row["stock"]) if size_row else int(p["stock"])
            if available < item.qty:
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for {item.sku} size {item.size}: {available} available, {item.qty} requested",
                )

        order_id = f"VLR-{uuid.uuid4().hex[:8]}"
        placed_at = _now_iso()

        # Create order.
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
                order.payment, order.delivery, order.shipping, order.subtotal,
                order.discount, order.shipping, order.total, placed_at,
                order.address, order.contact, "[]",
            ),
        )

        # Create order items, decrement per-size stock, record inventory transactions.
        qty_by_sku = {}
        for item in order.items:
            p = product_map[item.sku]
            cur.execute(
                """
                INSERT INTO order_items (order_id, sku, size, qty, price, offer_flag, seller_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (order_id, item.sku, item.size, item.qty, float(p["price"]), False, p["seller_id"]),
            )
            cur.execute(
                """
                INSERT INTO product_sizes (sku, size, stock)
                VALUES (%s, %s, %s)
                ON CONFLICT (sku, size) DO UPDATE SET stock = product_sizes.stock - EXCLUDED.stock
                """,
                (item.sku, item.size, item.qty),
            )
            cur.execute(
                """
                INSERT INTO inventory_transactions (sku, size, delta, reason, actor)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (item.sku, item.size, -item.qty, f"Sale · order {order_id}", "System"),
            )
            qty_by_sku[item.sku] = qty_by_sku.get(item.sku, 0) + item.qty

        # Decrement total product stock.
        for sku, total_qty in qty_by_sku.items():
            cur.execute(
                "UPDATE products SET stock = stock - %s WHERE sku = %s",
                (total_qty, sku),
            )

    items_out = [
        OrderItemOut(
            id=0, order_id=order_id, sku=item.sku, size=item.size, qty=item.qty,
            price=float(product_map[item.sku]["price"]), offer_flag=False, seller_id=product_map[item.sku]["seller_id"],
        )
        for item in order.items
    ]
    return OrderOut(
        id=order_id,
        user_id=order.user_id,
        customer_name=order.customer_name,
        status="Processing",
        payment=order.payment,
        delivery_label=order.delivery,
        delivery_price=order.shipping,
        subtotal=order.subtotal,
        discount=order.discount,
        shipping=order.shipping,
        total=order.total,
        placed_at=placed_at,
        address=order.address,
        contact=order.contact,
        tracking=[],
    )
