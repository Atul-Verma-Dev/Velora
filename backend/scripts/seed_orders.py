"""Seed the demo orders (and their stock-movement history) into PostgreSQL.

Source of truth: frontend/src/data/orders.js, extracted to
backend/scripts/orders-extract.json by extract_orders.mjs. These are the same
synthetic demo orders the storefront already shows, so order history, seller
fulfilment and settlement views have consistent state in both layers.

Idempotent by order id: re-running updates the order, replaces its line items and
rewrites the seeded stock-movement rows (actor = 'seed-orders'). Product stock is
NOT touched — the catalogue already represents current stock, and these are
historical orders.

Usage
    node scripts/extract_orders.mjs
    python scripts/seed_orders.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from psycopg2.extras import Json

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.core.db import db_cursor  # noqa: E402

EXTRACT_PATH = Path(__file__).resolve().parent / "orders-extract.json"
ACTOR = "seed-orders"


def delivery_price(order: dict) -> float:
    if order.get("shipping") is not None:
        return float(order["shipping"])
    return 99.0 if "99" in str(order.get("delivery") or "") else 0.0


def seed() -> None:
    if not EXTRACT_PATH.exists():
        print(f"Extract file not found: {EXTRACT_PATH}")
        print("Run: node scripts/extract_orders.mjs")
        sys.exit(1)

    orders = json.loads(EXTRACT_PATH.read_text())["orders"]

    with db_cursor() as cur:
        cur.execute("SELECT sku FROM products")
        known_skus = {r["sku"] for r in cur.fetchall()}
        cur.execute("SELECT id FROM sellers")
        known_sellers = {r["id"] for r in cur.fetchall()}

    problems = []
    for o in orders:
        for item in o["items"]:
            if item["id"] not in known_skus:
                problems.append(f"{o['id']}: unknown sku {item['id']}")
            if item.get("sellerId") not in known_sellers:
                problems.append(f"{o['id']}: unknown seller {item.get('sellerId')}")
    if problems:
        print("Validation failed — nothing written:")
        for p in problems:
            print("  -", p)
        sys.exit(1)

    units = 0
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM inventory_transactions WHERE actor = %s", (ACTOR,))
        for o in orders:
            items = o["items"]
            subtotal = float(o.get("subtotal") or sum(i["price"] * i["qty"] for i in items))
            shipping = delivery_price(o)
            total = float(o.get("total") or subtotal + shipping)
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
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    payment = EXCLUDED.payment,
                    delivery_label = EXCLUDED.delivery_label,
                    delivery_price = EXCLUDED.delivery_price,
                    subtotal = EXCLUDED.subtotal,
                    discount = EXCLUDED.discount,
                    shipping = EXCLUDED.shipping,
                    total = EXCLUDED.total,
                    placed_at = EXCLUDED.placed_at,
                    address = EXCLUDED.address,
                    contact = EXCLUDED.contact,
                    tracking = EXCLUDED.tracking
                """,
                {
                    "id": o["id"],
                    "user_id": o.get("userId") or "user-demo",
                    "customer_name": o.get("customer") or "Velora shopper",
                    "status": o["status"],
                    "payment": o.get("payment"),
                    "delivery_label": o.get("delivery"),
                    "delivery_price": shipping,
                    "subtotal": subtotal,
                    "discount": float(o.get("discount") or 0),
                    "shipping": shipping,
                    "total": total,
                    "placed_at": o["placedAt"],
                    "address": o.get("address"),
                    "contact": o.get("contact"),
                    "tracking": Json(o.get("tracking") or []),
                },
            )
            cur.execute("DELETE FROM order_items WHERE order_id = %s", (o["id"],))
            for item in items:
                cur.execute(
                    """
                    INSERT INTO order_items (order_id, sku, size, qty, price, offer_flag, seller_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        o["id"], item["id"], item["size"], int(item["qty"]),
                        float(item["price"]), False, item["sellerId"],
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO inventory_transactions (sku, size, delta, reason, actor)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (item["id"], item["size"], -int(item["qty"]), f"Sale · order {o['id']}", ACTOR),
                )
                units += int(item["qty"])

    with db_cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM orders")
        order_count = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM order_items")
        item_count = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM inventory_transactions WHERE actor = %s", (ACTOR,))
        movement_count = cur.fetchone()["n"]

    print(
        f"Seeded {len(orders)} orders ({units} units) | orders table: {order_count} | "
        f"order_items: {item_count} | stock movements: {movement_count}"
    )


if __name__ == "__main__":
    seed()
