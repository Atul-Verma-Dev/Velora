"""Repository layer for seller metrics and liquidation feed."""

from app.core.db import db_cursor


def seller_products(seller_id: str):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, name, brand, category, subcategory, colour, colour_family,
                   image_url, mrp, price, cogs, marginal_shipping, stock,
                   days_in_inventory, units_sold_30d, status
            FROM products
            WHERE seller_id = %s
            ORDER BY days_in_inventory DESC
            """,
            (seller_id,),
        )
        return cur.fetchall()


def seller_metrics(seller_id: str) -> dict:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'live') AS live_listings,
                COUNT(*) FILTER (WHERE stock > 0 AND stock <= 8) AS low_stock,
                COUNT(*) FILTER (WHERE stock = 0) AS out_of_stock,
                COUNT(*) FILTER (WHERE days_in_inventory >= 60 AND stock > 0) AS aging_inventory,
                COALESCE(SUM(cogs * stock) FILTER (WHERE days_in_inventory >= 60 AND stock > 0), 0) AS aging_capital_at_cost,
                COALESCE(SUM(units_sold_30d), 0) AS units_sold_30d
            FROM products
            WHERE seller_id = %s
            """,
            (seller_id,),
        )
        product_stats = dict(cur.fetchone())

        # Seller-specific line-item revenue. An order's total is never attributed
        # to a seller who did not sell any line in it. Cancelled orders are
        # excluded from gross sales; returned orders are tracked separately as
        # refunds; delivered orders are tracked as delivered sales.
        cur.execute(
            """
            SELECT
                COUNT(DISTINCT o.id) AS orders,
                COALESCE(SUM(oi.price * oi.qty) FILTER (WHERE o.status <> 'Cancelled'), 0) AS gross_sales,
                COALESCE(SUM(oi.price * oi.qty) FILTER (WHERE o.status = 'Delivered'), 0) AS delivered_sales,
                COALESCE(SUM(oi.price * oi.qty) FILTER (WHERE o.status = 'Returned'), 0) AS refunds
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE oi.seller_id = %s
            """,
            (seller_id,),
        )
        order_stats = dict(cur.fetchone())

        # Bundle metrics are attributed to the candidate product's seller. A
        # recommendation presents the candidate item to the shopper; acceptance
        # means the shopper added that candidate to their bag. The candidate's
        # seller is the one who benefits from the bundle sale. This avoids
        # double-counting by not also crediting the base product's seller.
        cur.execute(
            """
            SELECT COUNT(*) AS n
            FROM cart_bundle_recommendations cbr
            JOIN products p ON p.sku = cbr.candidate_sku
            WHERE p.seller_id = %s
            """,
            (seller_id,),
        )
        presented = int(cur.fetchone()["n"])
        cur.execute(
            """
            SELECT COUNT(*) AS n
            FROM cart_bundle_recommendations cbr
            JOIN products p ON p.sku = cbr.candidate_sku
            WHERE p.seller_id = %s AND cbr.accepted = TRUE
            """,
            (seller_id,),
        )
        accepted = int(cur.fetchone()["n"])
        attach_rate = (accepted / presented * 100) if presented else 0.0

    return {
        **product_stats,
        **order_stats,
        "bundle_attach_rate": round(attach_rate, 2),
        "bundle_presented": presented,
        "bundle_accepted": accepted,
    }


def liquidation_summary(seller_id: str) -> dict:
    """Aging-stock snapshot plus realised Complete-the-Look outcomes for one seller.

    Realised figures come from stored bundle events (recommendations the shopper
    accepted), not from an estimate. Reverse logistics saved is valued at the
    configured per-return cost for the units that cleared through a bundle.
    """
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'live' AND days_in_inventory >= 60 AND stock > 0) AS eligible_skus,
                COALESCE(SUM(stock) FILTER (WHERE status = 'live' AND days_in_inventory >= 60 AND stock > 0), 0) AS eligible_units,
                COALESCE(SUM(cogs * stock) FILTER (WHERE status = 'live' AND days_in_inventory >= 60 AND stock > 0), 0) AS aging_capital_at_cost,
                COALESCE(SUM(price * stock) FILTER (WHERE status = 'live' AND days_in_inventory >= 60 AND stock > 0), 0) AS aging_capital_at_price
            FROM products
            WHERE seller_id = %s
            """,
            (seller_id,),
        )
        snapshot = dict(cur.fetchone())

        cur.execute(
            """
            SELECT COUNT(*) AS n
            FROM cart_bundle_recommendations cbr
            JOIN products p ON p.sku = cbr.candidate_sku
            WHERE p.seller_id = %s
            """,
            (seller_id,),
        )
        presented = int(cur.fetchone()["n"])

        cur.execute(
            """
            SELECT cbr.id, cbr.candidate_sku, cbr.size, cbr.price, cbr.mrp, cbr.saving,
                   cbr.tier_label, cbr.tier_discount, cbr.created_at,
                   p.name, p.cogs, p.marginal_shipping, p.days_in_inventory, p.image_url
            FROM cart_bundle_recommendations cbr
            JOIN products p ON p.sku = cbr.candidate_sku
            WHERE p.seller_id = %s AND cbr.accepted = TRUE
            ORDER BY cbr.created_at DESC
            """,
            (seller_id,),
        )
        accepted = cur.fetchall()

    return {
        **snapshot,
        "presented": presented,
        "accepted_rows": accepted,
    }


def liquidation_feed(seller_id: str, min_age: int = 60):
    """Aging inventory with offer economics for the seller liquidation view."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, name, brand, category, subcategory, colour, colour_family,
                   image_url, mrp, price, cogs, marginal_shipping, stock,
                   days_in_inventory, units_sold_30d,
                   (cogs + marginal_shipping) AS margin_floor,
                   CASE
                     WHEN days_in_inventory >= 120 THEN 0.60
                     WHEN days_in_inventory >= 90 THEN 0.45
                     WHEN days_in_inventory >= 60 THEN 0.30
                     ELSE 0
                   END AS tier_discount
            FROM products
            WHERE seller_id = %s
              AND status = 'live'
              AND days_in_inventory >= %s
              AND stock > 0
            ORDER BY days_in_inventory DESC
            """,
            (seller_id, min_age),
        )
        return cur.fetchall()
