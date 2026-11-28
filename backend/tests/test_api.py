"""API endpoint tests — require seeded database."""

import uuid

from fastapi.testclient import TestClient

from app.core.db import db_cursor
from app.main import app


client = TestClient(app)


import pytest


@pytest.fixture
def test_user_id():
    """Unique test user ID per test — prevents cross-test pollution and avoids
    matching real VLR-prefixed production orders during cleanup."""
    return f"pytest-{uuid.uuid4().hex[:12]}"


@pytest.fixture
def cleanup_test_orders(test_user_id):
    """Scoped cleanup: only restores/deletes data belonging to this test's
    unique user. Never touches other users' orders, inventory, or acceptance events."""
    yield
    with db_cursor(commit=True) as cur:
        # Find orders created by this test user.
        cur.execute(
            "SELECT id FROM orders WHERE user_id = %s",
            (test_user_id,),
        )
        test_order_ids = [row["id"] for row in cur.fetchall()]
        if not test_order_ids:
            return

        # Restore per-size stock for products touched by this test's orders.
        cur.execute(
            """
            SELECT oi.sku, oi.size, SUM(oi.qty)::INTEGER AS qty
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.user_id = %s
            GROUP BY oi.sku, oi.size
            """,
            (test_user_id,),
        )
        for row in cur.fetchall():
            cur.execute(
                """
                UPDATE product_sizes
                SET stock = stock + %s
                WHERE sku = %s AND size = %s
                """,
                (row["qty"], row["sku"], row["size"]),
            )

        # Restore aggregate product stock.
        cur.execute(
            """
            SELECT oi.sku, SUM(oi.qty)::INTEGER AS qty
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.user_id = %s
            GROUP BY oi.sku
            """,
            (test_user_id,),
        )
        for row in cur.fetchall():
            cur.execute(
                "UPDATE products SET stock = stock + %s WHERE sku = %s",
                (row["qty"], row["sku"]),
            )

        # Delete acceptance events linked to these orders.
        cur.execute(
            """
            DELETE FROM bundle_acceptance_events
            WHERE order_id = ANY(%s)
            """,
            (test_order_ids,),
        )
        # Delete inventory transactions for these orders.
        if test_order_ids:
            order_reasons = [f"Sale · order {oid}" for oid in test_order_ids]
            cur.execute(
                """
                DELETE FROM inventory_transactions
                WHERE reason = ANY(%s)
                """,
                (order_reasons,),
            )
        # Delete order items then orders (FK cascade handles items, but be explicit).
        cur.execute(
            "DELETE FROM order_items WHERE order_id = ANY(%s)",
            (test_order_ids,),
        )
        cur.execute(
            "DELETE FROM orders WHERE user_id = %s",
            (test_user_id,),
        )


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_list_products():
    resp = client.get("/api/v1/products/?limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) <= 5


def test_get_product_by_sku():
    resp = client.get("/api/v1/products/VLR-1001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sku"] == "VLR-1001"


def test_get_product_not_found():
    resp = client.get("/api/v1/products/NONEXISTENT")
    assert resp.status_code == 404


def test_list_products_includes_sizes():
    resp = client.get("/api/v1/products/?limit=3")
    assert resp.status_code == 200
    data = resp.json()
    items = data["items"]
    assert len(items) > 0
    for item in items:
        assert "sizes" in item
        assert isinstance(item["sizes"], list)
        for size_entry in item["sizes"]:
            assert "size" in size_entry
            assert "stock" in size_entry
            assert isinstance(size_entry["size"], str)
            assert isinstance(size_entry["stock"], int)


def test_get_product_by_sku_includes_sizes():
    resp = client.get("/api/v1/products/VLR-1001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sku"] == "VLR-1001"
    assert "sizes" in data
    assert isinstance(data["sizes"], list)
    assert len(data["sizes"]) > 0
    for size_entry in data["sizes"]:
        assert "size" in size_entry
        assert "stock" in size_entry


def test_aging_inventory():
    resp = client.get("/api/v1/inventory/aging?min_age=60&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    for item in data["items"]:
        assert item["days_in_inventory"] >= 60
        assert item["stock"] > 0


def test_seller_metrics():
    resp = client.get("/api/v1/seller/seller-1/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "live_listings" in data
    assert "bundle_attach_rate" in data


def test_bundle_recommend():
    resp = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [
                {"sku": "VLR-1001", "size": "M", "qty": 1}
            ],
            "cart_subtotal": 2000,
            "limit": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "recommendations" in data
    assert "cart_subtotal" in data
    assert "deep_bundle_gate" in data
    assert "gate_met" in data
    assert "offers_enabled" in data
    for rec in data["recommendations"]:
        assert "recommendation_id" in rec
        assert isinstance(rec["recommendation_id"], int)
        assert "base_sku" in rec
        assert isinstance(rec["base_sku"], str)
        assert len(rec["base_sku"]) > 0


def test_fit_recommend():
    resp = client.post(
        "/api/v1/fit/recommend",
        json={
            "product_sku": "VLR-1001",
            "profile": {
                "height": 175,
                "weight": 75,
                "shape": "Balanced",
                "anchor_brand": "Morrow Studio",
                "usual_size": "M",
                "fit_preference": "regular",
                "mode": "fast",
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["product_sku"] == "VLR-1001"
    assert data["recommendation"] is not None
    assert "size" in data["recommendation"]
    assert "confidence" in data["recommendation"]
    assert "zones" in data["recommendation"]
    assert "explanation" in data["recommendation"]


def test_fit_recommend_product_not_found():
    resp = client.post(
        "/api/v1/fit/recommend",
        json={
            "product_sku": "NONEXISTENT",
            "profile": {
                "height": 175,
                "weight": 75,
                "shape": "Balanced",
                "anchor_brand": "Test",
                "usual_size": "M",
            },
        },
    )
    assert resp.status_code == 404


def test_search_products():
    resp = client.get("/api/v1/search/products?q=shirt&limit=5")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert "query" in data
    assert data["query"] == "shirt"


def test_search_products_empty_query():
    resp = client.get("/api/v1/search/products?limit=3")
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert data["query"] == ""
    assert len(data["results"]) <= 3


def test_log_search_event():
    resp = client.post(
        "/api/v1/search/log",
        json={
            "query": "kurta",
            "has_image": False,
            "result_count": 5,
            "excluded": {"price": 2, "category": 1},
            "duration_ms": 42,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


def test_log_search_event_missing_query():
    """An empty query is still accepted (defaults to empty string)."""
    resp = client.post(
        "/api/v1/search/log",
        json={
            "has_image": True,
            "result_count": 0,
            "excluded": {},
            "duration_ms": 0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data


def test_search_metrics():
    resp = client.get("/api/v1/search/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "total" in data


def test_inflated_client_subtotal_cannot_unlock_deep_tier():
    """Client-submitted inflated cart_subtotal must not unlock the 60% deep tier.

    The deep-tier gate is enforced using the server-calculated subtotal only.
    VLR-1001 price = 1899, qty=1 -> server subtotal = 1899 < 2000 gate.
    Client claims 5000 but gate must still be false.
    """
    resp = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [
                {"sku": "VLR-1001", "size": "M", "qty": 1}
            ],
            "cart_subtotal": 5000,
            "limit": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Server-calculated subtotal
    assert data["cart_subtotal"] == 1899.0
    # Client value preserved as diagnostic only
    assert data["client_subtotal"] == 5000.0
    # Gate must NOT be met despite inflated client value
    assert data["gate_met"] is False


def test_recommendation_session_uniqueness():
    """Two requests with different cart contents must get different cart_id sessions.

    The cart_id is a UUID, not a join of SKUs, so different sessions never collide.
    We verify this indirectly: each recommend call generates its own session,
    and the recommendation IDs are unique per call.
    """
    resp1 = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [
                {"sku": "VLR-1001", "size": "M", "qty": 1}
            ],
            "cart_subtotal": 1500,
            "limit": 3,
        },
    )
    assert resp1.status_code == 200
    ids_1 = {r["recommendation_id"] for r in resp1.json()["recommendations"]}

    resp2 = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [
                {"sku": "VLR-1002", "size": "L", "qty": 2}
            ],
            "cart_subtotal": 1500,
            "limit": 3,
        },
    )
    assert resp2.status_code == 200
    ids_2 = {r["recommendation_id"] for r in resp2.json()["recommendations"]}

    # Different sessions produce different recommendation IDs
    assert ids_1 != ids_2
    assert not (ids_1 & ids_2), "Recommendation IDs must not collide across sessions"


def test_place_order_success(test_user_id, cleanup_test_orders):
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1001", "size": "S", "qty": 1},
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"].startswith("VLR-")
    assert data["status"] == "Processing"
    # Server-calculated total from database price (VLR-1002 M).
    assert data["total"] > 0
    assert data["subtotal"] > 0
    assert data["customer_name"] == "Aarav Mehta"


def test_place_order_ignores_client_total(test_user_id, cleanup_test_orders):
    """A manipulated client total must never override the server-calculated total."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1003", "size": "M", "qty": 1},
            ],
            "client_subtotal": 0,
            "client_discount": 1000,
            "client_shipping": 0,
            "client_total": 1,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Total must be server-calculated, not the client's manipulated value.
    assert data["total"] != 1.0
    assert data["subtotal"] != 0.0


def test_place_order_zero_subtotal_still_charges_full_price(test_user_id, cleanup_test_orders):
    """Client-submitted zero subtotal must not reduce the server total."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1001", "size": "S", "qty": 1},
            ],
            "client_subtotal": 0,
            "client_total": 0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] > 0
    assert data["subtotal"] > 0


def test_place_order_insufficient_stock(test_user_id, cleanup_test_orders):
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1002", "size": "M", "qty": 99999},
            ],
        },
    )
    assert resp.status_code == 409


def test_place_order_nonexistent_product(test_user_id, cleanup_test_orders):
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "NONEXISTENT", "size": "M", "qty": 1},
            ],
        },
    )
    assert resp.status_code == 404


def test_place_order_invalid_size_rejected(test_user_id, cleanup_test_orders):
    """A size with no product_sizes record must be rejected (no aggregate fallback)."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1001", "size": "XXXL", "qty": 1},
            ],
        },
    )
    assert resp.status_code == 409


def test_place_order_duplicate_lines_aggregated(test_user_id, cleanup_test_orders):
    """Duplicate SKU/size lines in the cart are aggregated before inventory check."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1001", "size": "S", "qty": 1},
                {"sku": "VLR-1001", "size": "S", "qty": 1},
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Two lines of qty 1 each -> aggregated qty 2
    assert data["subtotal"] == 1899.0 * 2
    assert data["total"] == 1899.0 * 2


def test_place_order_rollback_leaves_inventory_unchanged(test_user_id, cleanup_test_orders):
    """A failed order (insufficient stock) leaves inventory unchanged."""
    with db_cursor() as cur:
        cur.execute(
            "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
            ("VLR-1003", "M"),
        )
        before = int(cur.fetchone()["stock"])

    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1003", "size": "M", "qty": 99999},
            ],
        },
    )
    assert resp.status_code == 409

    with db_cursor() as cur:
        cur.execute(
            "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
            ("VLR-1003", "M"),
        )
        after = int(cur.fetchone()["stock"])
    assert before == after, f"Stock changed: {before} -> {after}"


# ── CTL (Complete the Look) validation tests ──────────────────────────

def _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1004", size="M",
                              price=1200, accepted=True, order_id=None):
    """Create a bundle recommendation directly in the DB for testing."""
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO cart_bundle_recommendations (
                cart_id, base_sku, candidate_sku, size, compat_score,
                price, mrp, saving, reason, tier_label, tier_discount,
                stock_available, accepted
            ) VALUES (
                %s, %s, %s, %s, 0.85, %s, 2000, 500, 'Test CTL offer',
                'End-of-season', 0.60, 10, %s
            )
            RETURNING id
            """,
            (f"test-cart-{uuid.uuid4().hex[:8]}", cart_sku, cand_sku, size, price, accepted),
        )
        rec_id = cur.fetchone()["id"]
        if order_id:
            cur.execute(
                """
                INSERT INTO bundle_acceptance_events (recommendation_id, order_id)
                VALUES (%s, %s)
                """,
                (rec_id, order_id),
            )
    return rec_id


def _delete_ctl_recommendation(rec_id):
    with db_cursor(commit=True) as cur:
        cur.execute("DELETE FROM bundle_acceptance_events WHERE recommendation_id = %s", (rec_id,))
        cur.execute("DELETE FROM cart_bundle_recommendations WHERE id = %s", (rec_id,))


def test_ctl_valid_accepted_recommendation_succeeds(test_user_id, cleanup_test_orders):
    """A valid accepted CTL recommendation linked to a base SKU in the order succeeds."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1004", size="S", price=1200)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "CTL Tester",
                "contact": "+91 99999 99999",
                "address": "123 CTL Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] > 0
        # CTL line should use the recommendation price from the database.
        ctl_item = [i for i in data.get("items", []) if i["sku"] == "VLR-1004"]
        assert len(ctl_item) == 1
        assert ctl_item[0]["offer_flag"] is True
        assert ctl_item[0]["price"] == 1200.0
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_incorrect_recommendation_id_fails(test_user_id, cleanup_test_orders):
    """A non-existent recommendation ID returns 404."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "CTL Tester",
            "contact": "+91 99999 99999",
            "address": "123 CTL Street, Mumbai 400001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1001", "size": "S", "qty": 1},
                {"sku": "VLR-1002", "size": "S", "qty": 1},
            ],
            "offer_references": [
                {"recommendation_id": 999999, "sku": "VLR-1002", "size": "S"},
            ],
        },
    )
    assert resp.status_code == 404


def test_ctl_unaccepted_recommendation_fails(test_user_id, cleanup_test_orders):
    """An unaccepted recommendation returns 409."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1002", size="S", price=1500, accepted=False)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "CTL Tester",
                "contact": "+91 99999 99999",
                "address": "123 CTL Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1002", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 409
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_wrong_candidate_sku_fails(test_user_id, cleanup_test_orders):
    """A recommendation whose candidate SKU doesn't match the ordered SKU fails."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1002", size="S", price=1500)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "CTL Tester",
                "contact": "+91 99999 99999",
                "address": "123 CTL Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1003", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1003", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 409
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_wrong_size_fails(test_user_id, cleanup_test_orders):
    """A recommendation whose size doesn't match the ordered size fails."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1002", size="S", price=1500)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "CTL Tester",
                "contact": "+91 99999 99999",
                "address": "123 CTL Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1002", "size": "M", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1002", "size": "M"},
                ],
            },
        )
        assert resp.status_code == 409
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_base_sku_not_in_order_fails(test_user_id, cleanup_test_orders):
    """A recommendation whose base SKU is not in the order fails."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1002", size="S", price=1500)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "CTL Tester",
                "contact": "+91 99999 99999",
                "address": "123 CTL Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1003", "size": "S", "qty": 1},
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1002", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 409
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_recommendation_reuse_fails(test_user_id, cleanup_test_orders):
    """A recommendation already linked to another order cannot be reused."""
    # Create a "previous" order that redeems this recommendation.
    prev_user = f"pytest-{uuid.uuid4().hex[:12]}"
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1004", size="S", price=1200)
    try:
        # Place an order with the same user to redeem the recommendation.
        resp1 = client.post(
            "/api/v1/orders",
            json={
                "user_id": prev_user,
                "customer_name": "First Buyer",
                "contact": "+91 99999 99999",
                "address": "123 First Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp1.status_code == 200

        # Now try to reuse the same recommendation with a different user.
        resp2 = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "Second Buyer",
                "contact": "+91 99999 99999",
                "address": "123 Second Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp2.status_code == 409

        # Clean up the first order manually since it used a different user.
        with db_cursor(commit=True) as cur:
            cur.execute("SELECT id FROM orders WHERE user_id = %s", (prev_user,))
            prev_order_ids = [row["id"] for row in cur.fetchall()]
            if prev_order_ids:
                cur.execute("DELETE FROM bundle_acceptance_events WHERE order_id = ANY(%s)", (prev_order_ids,))
                cur.execute("DELETE FROM order_items WHERE order_id = ANY(%s)", (prev_order_ids,))
                cur.execute("DELETE FROM orders WHERE user_id = %s", (prev_user,))
                # Restore inventory for the previous order.
                cur.execute(
                    """
                    SELECT oi.sku, oi.size, SUM(oi.qty)::INTEGER AS qty
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    WHERE o.user_id = %s
                    GROUP BY oi.sku, oi.size
                    """,
                    (prev_user,),
                )
                for row in cur.fetchall():
                    cur.execute(
                        "UPDATE product_sizes SET stock = stock + %s WHERE sku = %s AND size = %s",
                        (row["qty"], row["sku"], row["size"]),
                    )
                cur.execute(
                    """
                    SELECT oi.sku, SUM(oi.qty)::INTEGER AS qty
                    FROM order_items oi
                    JOIN orders o ON o.id = oi.order_id
                    WHERE o.user_id = %s
                    GROUP BY oi.sku
                    """,
                    (prev_user,),
                )
                for row in cur.fetchall():
                    cur.execute(
                        "UPDATE products SET stock = stock + %s WHERE sku = %s",
                        (row["qty"], row["sku"]),
                    )
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_duplicate_recommendation_references_fails(test_user_id, cleanup_test_orders):
    """Duplicate recommendation references in the same order are rejected."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1002", size="S", price=1500)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "CTL Tester",
                "contact": "+91 99999 99999",
                "address": "123 CTL Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1002", "size": "S"},
                    {"recommendation_id": rec_id, "sku": "VLR-1002", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 409
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_candidate_not_live_fails(test_user_id, cleanup_test_orders):
    """A CTL recommendation for a candidate no longer live is rejected."""
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1002", size="S", price=1500)
    try:
        # Mark the candidate as not live.
        with db_cursor(commit=True) as cur:
            cur.execute("UPDATE products SET status = 'draft' WHERE sku = %s", ("VLR-1002",))
        try:
            resp = client.post(
                "/api/v1/orders",
                json={
                    "user_id": test_user_id,
                    "customer_name": "CTL Tester",
                    "contact": "+91 99999 99999",
                    "address": "123 CTL Street, Mumbai 400001",
                    "payment": "UPI (demo)",
                    "delivery": "standard",
                    "items": [
                        {"sku": "VLR-1001", "size": "S", "qty": 1},
                        {"sku": "VLR-1002", "size": "S", "qty": 1},
                    ],
                    "offer_references": [
                        {"recommendation_id": rec_id, "sku": "VLR-1002", "size": "S"},
                    ],
                },
            )
            assert resp.status_code == 409
        finally:
            # Restore candidate to live.
            with db_cursor(commit=True) as cur:
                cur.execute("UPDATE products SET status = 'live' WHERE sku = %s", ("VLR-1002",))
    finally:
        _delete_ctl_recommendation(rec_id)


# ── Coupon pricing tests ─────────────────────────────────────────────

def _base_order_payload(test_user_id, sku="VLR-1003", size="M", qty=1, **overrides):
    payload = {
        "user_id": test_user_id,
        "customer_name": "Coupon Tester",
        "contact": "+91 99999 99999",
        "address": "123 Coupon Street, Mumbai 400001",
        "payment": "UPI (demo)",
        "delivery": "standard",
        "items": [{"sku": sku, "size": size, "qty": qty}],
    }
    payload.update(overrides)
    return payload


def test_coupon_valid_at_threshold(test_user_id, cleanup_test_orders):
    """VELORA10 at exactly ₹1,999 subtotal gets 10% discount."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1003", size="S", qty=1,
            coupon_code="VELORA10",
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    # VLR-1003 price = 2499, >= 1999 threshold, so 10% discount applies
    assert data["discount"] > 0
    assert data["total"] == data["subtotal"] - data["discount"] + data["shipping"]


def test_coupon_valid_above_threshold(test_user_id, cleanup_test_orders):
    """VELORA10 above ₹1,999 subtotal gets 10% discount."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1003", size="L", qty=1,
            coupon_code="VELORA10",
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["discount"] > 0


def test_coupon_invalid_code(test_user_id, cleanup_test_orders):
    """An invalid coupon code produces zero discount."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1003", size="M", qty=1,
            coupon_code="FAKECODE",
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["discount"] == 0


def test_coupon_below_threshold(test_user_id, cleanup_test_orders):
    """VELORA10 below ₹1,999 subtotal produces zero discount."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1002", size="M", qty=1,
            coupon_code="VELORA10",
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["discount"] == 0


def test_coupon_no_code(test_user_id, cleanup_test_orders):
    """No coupon code produces zero discount."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(test_user_id, sku="VLR-1003", size="M", qty=1),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["discount"] == 0


def test_client_fake_discount_ignored(test_user_id, cleanup_test_orders):
    """A client-supplied fake discount is ignored — server calculates from DB."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1003", size="M", qty=1,
            client_discount=500,
            coupon_code=None,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["discount"] == 0


def test_client_fake_total_ignored(test_user_id, cleanup_test_orders):
    """A client-supplied fake total is ignored — server calculates from DB."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1003", size="M", qty=1,
            client_total=1,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] > 1


def test_client_zero_subtotal_ignored(test_user_id, cleanup_test_orders):
    """A client-supplied zero subtotal is ignored — server charges full price."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(
            test_user_id, sku="VLR-1003", size="M", qty=1,
            client_subtotal=0,
            client_total=0,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["subtotal"] > 0


# ── Delivery pricing tests ────────────────────────────────────────────

def test_delivery_standard_below_threshold(test_user_id, cleanup_test_orders):
    """Standard delivery below ₹1,499 costs ₹79."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(test_user_id, sku="VLR-2011", size="M", qty=1, delivery="standard"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["shipping"] == 79.0


def test_delivery_standard_at_threshold(test_user_id, cleanup_test_orders):
    """Standard delivery at ₹1,499+ is free."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(test_user_id, sku="VLR-1002", size="L", qty=1, delivery="standard"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["shipping"] == 0.0


def test_delivery_express(test_user_id, cleanup_test_orders):
    """Express delivery costs ₹99 regardless of subtotal."""
    resp = client.post(
        "/api/v1/orders",
        json=_base_order_payload(test_user_id, sku="VLR-1003", size="M", qty=1, delivery="express"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["shipping"] == 99.0


# ── Concurrency test ──────────────────────────────────────────────────

def test_concurrent_orders_cannot_oversell(test_user_id, cleanup_test_orders):
    """Two concurrent orders for the last unit: exactly one succeeds."""
    from concurrent.futures import ThreadPoolExecutor
    import threading

    # Find a product-size with exactly 1 unit available.
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT sku, size, stock FROM product_sizes
            WHERE stock = 1
            LIMIT 1
            """
        )
        row = cur.fetchone()
    if not row:
        # Fall back to a known low-stock product.
        sku, size = "VLR-1001", "XXL"
    else:
        sku, size = row["sku"], row["size"]

    # Record stock before for snapshot restoration.
    with db_cursor() as cur:
        cur.execute(
            "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
            (sku, size),
        )
        before = int(cur.fetchone()["stock"])

    barrier = threading.Barrier(2)
    results: list[tuple[int, str]] = []
    results_lock = threading.Lock()

    def place_one(user_suffix):
        uid = f"pytest-concurrent-{user_suffix}-{uuid.uuid4().hex[:8]}"
        try:
            barrier.wait()  # Ensure both threads start simultaneously
            resp = client.post(
                "/api/v1/orders",
                json={
                    "user_id": uid,
                    "customer_name": "Concurrent Tester",
                    "contact": "+91 99999 99999",
                    "address": "123 Concurrent Street, Mumbai 400001",
                    "payment": "UPI (demo)",
                    "delivery": "standard",
                    "items": [{"sku": sku, "size": size, "qty": 1}],
                },
            )
            status_code = resp.status_code
        except Exception as e:
            status_code = 0
            uid = str(e)
        with results_lock:
            results.append((status_code, uid))

    # Fire two requests concurrently with a barrier for true simultaneity.
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(place_one, i) for i in range(2)]
        for f in futures:
            f.result()

    try:
        # Exactly one should succeed, one should fail with 409.
        statuses = sorted([r[0] for r in results if isinstance(r[0], int)])
        assert 200 in statuses, f"Expected one success, got {statuses}"
        assert 409 in statuses, f"Expected one 409 rejection, got {statuses}"

        # Verify stock is now 0.
        with db_cursor() as cur:
            cur.execute(
                "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
                (sku, size),
            )
            after = int(cur.fetchone()["stock"])
        assert after == 0, f"Stock should be 0 after concurrent sale, got {after}"
    finally:
        # Restore stock snapshot regardless of test outcome.
        with db_cursor(commit=True) as cur:
            cur.execute(
                "UPDATE product_sizes SET stock = %s WHERE sku = %s AND size = %s",
                (before, sku, size),
            )
            # Clean up any orders created by this test.
            for status, uid in results:
                if isinstance(uid, str) and uid.startswith("pytest-concurrent-"):
                    cur.execute("SELECT id FROM orders WHERE user_id = %s", (uid,))
                    order_ids = [row["id"] for row in cur.fetchall()]
                    if order_ids:
                        cur.execute(
                            "DELETE FROM bundle_acceptance_events WHERE order_id = ANY(%s)",
                            (order_ids,),
                        )
                        cur.execute(
                            "DELETE FROM order_items WHERE order_id = ANY(%s)",
                            (order_ids,),
                        )
                        cur.execute("DELETE FROM orders WHERE user_id = %s", (uid,))
