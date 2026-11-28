"""Repository layer for products — parameterized psycopg2 SQL."""

from app.core.db import db_cursor


def get_product_by_sku(sku: str):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, name, brand, gender, category, subcategory, colour, colour_family,
                   colour_hex, fabric, pattern, neckline, sleeve, fit, fit_ease, stretch,
                   length, occasion, care, origin, description, tags, image_url, images,
                   mrp, price, cogs, marginal_shipping, stock, days_in_inventory,
                   units_sold_30d, seller_id, status, is_featured, added_days_ago,
                   embedding
            FROM products
            WHERE sku = %s
            """,
            (sku,),
        )
        return cur.fetchone()


def get_products_by_skus(skus: list[str]):
    if not skus:
        return []
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, name, brand, gender, category, subcategory, colour, colour_family,
                   colour_hex, fabric, pattern, neckline, sleeve, fit, fit_ease, stretch,
                   length, occasion, care, origin, description, tags, image_url, images,
                   mrp, price, cogs, marginal_shipping, stock, days_in_inventory,
                   units_sold_30d, seller_id, status, is_featured, added_days_ago,
                   embedding
            FROM products
            WHERE sku = ANY(%s)
            """,
            (skus,),
        )
        return cur.fetchall()


def list_products(
    *,
    category: str | None = None,
    subcategory: str | None = None,
    seller_id: str | None = None,
    status: str = "live",
    min_stock: int = 0,
    limit: int = 100,
    offset: int = 0,
):
    conditions = ["status = %s"]
    params: list = [status]
    if category:
        conditions.append("category = %s")
        params.append(category)
    if subcategory:
        conditions.append("subcategory = %s")
        params.append(subcategory)
    if seller_id:
        conditions.append("seller_id = %s")
        params.append(seller_id)
    if min_stock > 0:
        conditions.append("stock > %s")
        params.append(min_stock)
    where = " AND ".join(conditions)
    with db_cursor() as cur:
        cur.execute(
            f"""
            SELECT sku, name, brand, gender, category, subcategory, colour, colour_family,
                   colour_hex, fabric, pattern, neckline, sleeve, fit, fit_ease, stretch,
                   length, occasion, care, origin, description, tags, image_url, images,
                   mrp, price, cogs, marginal_shipping, stock, days_in_inventory,
                   units_sold_30d, seller_id, status, is_featured, added_days_ago,
                   embedding
            FROM products
            WHERE {where}
            ORDER BY is_featured DESC, units_sold_30d DESC
            LIMIT %s OFFSET %s
            """,
            (*params, limit, offset),
        )
        return cur.fetchall()


def stock_for_size(sku: str, size: str) -> int | None:
    """Return per-size stock, or None if no per-size record exists (distinguishable from zero)."""
    with db_cursor() as cur:
        cur.execute(
            "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
            (sku, size),
        )
        row = cur.fetchone()
        return int(row["stock"]) if row else None


def upsert_product(row: dict) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO products (
                sku, name, brand, gender, category, subcategory, colour, colour_family,
                colour_hex, fabric, pattern, neckline, sleeve, fit, fit_ease, stretch,
                length, occasion, care, origin, description, tags, image_url, images,
                mrp, price, cogs, marginal_shipping, stock, days_in_inventory,
                units_sold_30d, seller_id, status, is_featured, added_days_ago,
                embedding, updated_at
            ) VALUES (
                %(sku)s, %(name)s, %(brand)s, %(gender)s, %(category)s, %(subcategory)s,
                %(colour)s, %(colour_family)s, %(colour_hex)s, %(fabric)s, %(pattern)s,
                %(neckline)s, %(sleeve)s, %(fit)s, %(fit_ease)s, %(stretch)s, %(length)s,
                %(occasion)s, %(care)s, %(origin)s, %(description)s, %(tags)s,
                %(image_url)s, %(images)s, %(mrp)s, %(price)s, %(cogs)s,
                %(marginal_shipping)s, %(stock)s, %(days_in_inventory)s,
                %(units_sold_30d)s, %(seller_id)s, %(status)s, %(is_featured)s,
                %(added_days_ago)s, %(embedding)s, now()
            )
            ON CONFLICT (sku) DO UPDATE SET
                name = EXCLUDED.name,
                brand = EXCLUDED.brand,
                gender = EXCLUDED.gender,
                category = EXCLUDED.category,
                subcategory = EXCLUDED.subcategory,
                colour = EXCLUDED.colour,
                colour_family = EXCLUDED.colour_family,
                colour_hex = EXCLUDED.colour_hex,
                fabric = EXCLUDED.fabric,
                pattern = EXCLUDED.pattern,
                neckline = EXCLUDED.neckline,
                sleeve = EXCLUDED.sleeve,
                fit = EXCLUDED.fit,
                fit_ease = EXCLUDED.fit_ease,
                stretch = EXCLUDED.stretch,
                length = EXCLUDED.length,
                occasion = EXCLUDED.occasion,
                care = EXCLUDED.care,
                origin = EXCLUDED.origin,
                description = EXCLUDED.description,
                tags = EXCLUDED.tags,
                image_url = EXCLUDED.image_url,
                images = EXCLUDED.images,
                mrp = EXCLUDED.mrp,
                price = EXCLUDED.price,
                cogs = EXCLUDED.cogs,
                marginal_shipping = EXCLUDED.marginal_shipping,
                stock = EXCLUDED.stock,
                days_in_inventory = EXCLUDED.days_in_inventory,
                units_sold_30d = EXCLUDED.units_sold_30d,
                seller_id = EXCLUDED.seller_id,
                status = EXCLUDED.status,
                is_featured = EXCLUDED.is_featured,
                added_days_ago = EXCLUDED.added_days_ago,
                embedding = EXCLUDED.embedding,
                updated_at = now()
            """,
            row,
        )


def upsert_product_size(sku: str, size: str, stock: int) -> None:
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO product_sizes (sku, size, stock)
            VALUES (%s, %s, %s)
            ON CONFLICT (sku, size) DO UPDATE SET stock = EXCLUDED.stock
            """,
            (sku, size, stock),
        )


def get_product_sizes(skus: list[str]) -> dict[str, list[dict]]:
    """Return {sku: [{size, stock}, ...]} for the given skus."""
    if not skus:
        return {}
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, size, stock
            FROM product_sizes
            WHERE sku = ANY(%s)
            ORDER BY sku, size
            """,
            (skus,),
        )
        rows = cur.fetchall()
    result: dict[str, list[dict]] = {}
    for row in rows:
        result.setdefault(row["sku"], []).append({"size": row["size"], "stock": int(row["stock"])})
    return result
