"""Repository layer for inventory aging and transactions."""

from app.core.db import db_cursor


def get_aging_inventory(min_age: int = 60, limit: int = 100):
    """Products eligible for Complete the Look (age >= 60 days, live, stock > 0)."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, name, brand, gender, category, subcategory, colour, colour_family,
                   occasion, image_url, mrp, price, cogs, marginal_shipping, stock,
                   days_in_inventory, units_sold_30d, seller_id, status
            FROM products
            WHERE status = 'live'
              AND days_in_inventory >= %s
              AND stock > 0
            ORDER BY days_in_inventory DESC
            LIMIT %s
            """,
            (min_age, limit),
        )
        return cur.fetchall()


def get_stock_for_size(sku: str, size: str) -> int:
    from app.repositories.product import stock_for_size
    return stock_for_size(sku, size)


def record_transaction(sku: str, size: str | None, delta: int, reason: str, actor: str) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO inventory_transactions (sku, size, delta, reason, actor)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (sku, size, delta, reason, actor),
        )


def adjust_stock(sku: str, size: str | None, delta: int, reason: str, actor: str) -> None:
    """Adjust product total stock and optional per-size stock, then log the transaction."""
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE products SET stock = GREATEST(0, stock + %s), updated_at = now() WHERE sku = %s",
            (delta, sku),
        )
        if size:
            cur.execute(
                """
                INSERT INTO product_sizes (sku, size, stock)
                VALUES (%s, %s, GREATEST(0, %s))
                ON CONFLICT (sku, size) DO UPDATE
                SET stock = GREATEST(0, product_sizes.stock + EXCLUDED.stock)
                """,
                (sku, size, delta),
            )
        record_transaction(sku, size, delta, reason, actor)
