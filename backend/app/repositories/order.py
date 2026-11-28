"""Repository layer for orders and order items."""

from app.core.db import db_cursor


def create_order(order: dict) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO orders (
                id, user_id, customer_name, status, payment, delivery_label,
                delivery_price, subtotal, discount, shipping, total, placed_at,
                address, contact, tracking
            ) VALUES (
                %(id)s, %(user_id)s, %(customer_name)s, %(status)s, %(payment)s,
                %(delivery_label)s, %(delivery_price)s, %(subtotal)s, %(discount)s,
                %(shipping)s, %(total)s, %(placed_at)s, %(address)s, %(contact)s,
                %(tracking)s
            )
            """,
            order,
        )


def create_order_items(items: list[dict]) -> None:
    if not items:
        return
    with db_cursor(commit=True) as cur:
        for item in items:
            cur.execute(
                """
                INSERT INTO order_items (order_id, sku, size, qty, price, offer_flag, seller_id)
                VALUES (%(order_id)s, %(sku)s, %(size)s, %(qty)s, %(price)s, %(offer_flag)s, %(seller_id)s)
                """,
                item,
            )


def get_orders(*, user_id: str | None = None, status: str | None = None, limit: int = 100):
    conditions = []
    params: list = []
    if user_id:
        conditions.append("user_id = %s")
        params.append(user_id)
    if status:
        conditions.append("status = %s")
        params.append(status)
    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    with db_cursor() as cur:
        cur.execute(
            f"""
            SELECT id, user_id, customer_name, status, payment, delivery_label,
                   delivery_price, subtotal, discount, shipping, total, placed_at,
                   address, contact, tracking
            FROM orders
            {where}
            ORDER BY placed_at DESC
            LIMIT %s
            """,
            (*params, limit),
        )
        return cur.fetchall()


def get_order_items(order_id: str):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, order_id, sku, size, qty, price, offer_flag, seller_id
            FROM order_items
            WHERE order_id = %s
            """,
            (order_id,),
        )
        return cur.fetchall()
