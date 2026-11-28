"""Repository layer for bundle recommendations and acceptance events."""

from app.core.db import db_cursor


def save_recommendations(rows: list[dict]) -> list[int]:
    """Persist candidate recommendations; return inserted ids."""
    if not rows:
        return []
    ids: list[int] = []
    with db_cursor(commit=True) as cur:
        for row in rows:
            cur.execute(
                """
                INSERT INTO cart_bundle_recommendations (
                    cart_id, base_sku, candidate_sku, size, compat_score,
                    price, mrp, saving, reason, tier_label, tier_discount,
                    stock_available
                ) VALUES (
                    %(cart_id)s, %(base_sku)s, %(candidate_sku)s, %(size)s,
                    %(compat_score)s, %(price)s, %(mrp)s, %(saving)s,
                    %(reason)s, %(tier_label)s, %(tier_discount)s,
                    %(stock_available)s
                )
                RETURNING id
                """,
                row,
            )
            ids.append(cur.fetchone()["id"])
    return ids


def get_recommendations_for_cart(cart_id: str, accepted_only: bool = False):
    with db_cursor() as cur:
        if accepted_only:
            cur.execute(
                """
                SELECT cbr.*, p.name, p.brand, p.colour, p.colour_family, p.image_url
                FROM cart_bundle_recommendations cbr
                JOIN products p ON p.sku = cbr.candidate_sku
                WHERE cbr.cart_id = %s AND cbr.accepted = TRUE
                ORDER BY cbr.created_at DESC
                """,
                (cart_id,),
            )
        else:
            cur.execute(
                """
                SELECT cbr.*, p.name, p.brand, p.colour, p.colour_family, p.image_url
                FROM cart_bundle_recommendations cbr
                JOIN products p ON p.sku = cbr.candidate_sku
                WHERE cbr.cart_id = %s
                ORDER BY cbr.created_at DESC
                """,
                (cart_id,),
            )
        return cur.fetchall()


def mark_accepted(recommendation_id: int, order_id: str | None = None) -> bool:
    with db_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE cart_bundle_recommendations SET accepted = TRUE WHERE id = %s",
            (recommendation_id,),
        )
        if cur.rowcount == 0:
            return False
        if order_id:
            cur.execute(
                """
                INSERT INTO bundle_acceptance_events (recommendation_id, order_id)
                VALUES (%s, %s)
                """,
                (recommendation_id, order_id),
            )
        return True


def mark_rejected(recommendation_id: int) -> bool:
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM cart_bundle_recommendations WHERE id = %s",
            (recommendation_id,),
        )
        return cur.rowcount > 0


def get_bundle_acceptance_count() -> int:
    with db_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS n FROM cart_bundle_recommendations WHERE accepted = TRUE"
        )
        return int(cur.fetchone()["n"])


def get_bundle_recommendation_count() -> int:
    with db_cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM cart_bundle_recommendations")
        return int(cur.fetchone()["n"])
