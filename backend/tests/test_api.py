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
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
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
    """A recommendation already linked to another order cannot be reused.

    The first user redeems the recommendation; the second user's attempt must
    be rejected. Cleanup removes all temporary records and restores the exact
    aggregate and per-size inventory snapshots, even if an assertion or a
    cleanup operation fails.
    """
    prev_user = f"pytest-{uuid.uuid4().hex[:12]}"
    rec_id = _make_ctl_recommendation(
        cart_sku="VLR-1001",
        cand_sku="VLR-1004",
        size="S",
        price=1200,
    )

    stock_keys = (
        ("VLR-1001", "S"),
        ("VLR-1002", "S"),
        ("VLR-1004", "S"),
    )
    snapshots: dict[tuple[str, str], int] = {}
    snapshots_captured = False
    prev_order_ids: list[str] = []

    try:
        # Capture all stock snapshots before either order can change inventory.
        with db_cursor() as cur:
            for sku, size in stock_keys:
                cur.execute(
                    "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
                    (sku, size),
                )
                size_row = cur.fetchone()
                if size_row is None:
                    raise AssertionError(f"Missing product_sizes row for {sku} / {size}")
                snapshots[(sku, size)] = int(size_row["stock"])

                cur.execute(
                    "SELECT stock FROM products WHERE sku = %s",
                    (sku,),
                )
                product_row = cur.fetchone()
                if product_row is None:
                    raise AssertionError(f"Missing products row for {sku}")
                snapshots[(sku, "__product__")] = int(product_row["stock"])
        snapshots_captured = True

        # The first order redeems the recommendation successfully.
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
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp1.status_code == 200, (
            f"Expected first order to succeed, got {resp1.status_code}: {resp1.text}"
        )

        # A different user must not be able to redeem the same recommendation.
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
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp2.status_code == 409, (
            f"Expected recommendation reuse to fail with 409, got {resp2.status_code}: {resp2.text}"
        )
    finally:
        # First attempt: remove all database rows associated with the first order.
        # Stock restoration is in a nested finally so it still runs if deletion fails.
        try:
            with db_cursor(commit=True) as cur:
                cur.execute("SELECT id FROM orders WHERE user_id = %s", (prev_user,))
                prev_order_ids = [row["id"] for row in cur.fetchall()]

                if prev_order_ids:
                    order_reasons = [f"Sale · order {oid}" for oid in prev_order_ids]
                    cur.execute(
                        "DELETE FROM inventory_transactions WHERE reason = ANY(%s)",
                        (order_reasons,),
                    )
                    cur.execute(
                        "DELETE FROM bundle_acceptance_events WHERE order_id = ANY(%s)",
                        (prev_order_ids,),
                    )
                    cur.execute(
                        "DELETE FROM order_items WHERE order_id = ANY(%s)",
                        (prev_order_ids,),
                    )
                    cur.execute(
                        "DELETE FROM orders WHERE id = ANY(%s)",
                        (prev_order_ids,),
                    )
        finally:
            # Exact snapshot restoration is the only stock restoration performed.
            try:
                if snapshots_captured:
                    with db_cursor(commit=True) as cur:
                        for sku, size in stock_keys:
                            cur.execute(
                                "UPDATE product_sizes SET stock = %s WHERE sku = %s AND size = %s",
                                (snapshots[(sku, size)], sku, size),
                            )
                            cur.execute(
                                "UPDATE products SET stock = %s WHERE sku = %s",
                                (snapshots[(sku, "__product__")], sku),
                            )

                    # Verify both inventory tables match the captured snapshots.
                    with db_cursor() as cur:
                        for sku, size in stock_keys:
                            cur.execute(
                                "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
                                (sku, size),
                            )
                            actual_size_stock = int(cur.fetchone()["stock"])
                            assert actual_size_stock == snapshots[(sku, size)], (
                                f"{sku} size {size} stock mismatch: "
                                f"{actual_size_stock} != {snapshots[(sku, size)]}"
                            )

                            cur.execute(
                                "SELECT stock FROM products WHERE sku = %s",
                                (sku,),
                            )
                            actual_product_stock = int(cur.fetchone()["stock"])
                            assert actual_product_stock == snapshots[(sku, "__product__")], (
                                f"{sku} aggregate stock mismatch: "
                                f"{actual_product_stock} != {snapshots[(sku, '__product__')]}"
                            )

                    # Verify that the temporary user and order-linked records are gone.
                    with db_cursor() as cur:
                        cur.execute(
                            "SELECT COUNT(*)::INTEGER AS cnt FROM orders WHERE user_id = %s",
                            (prev_user,),
                        )
                        remaining_orders = int(cur.fetchone()["cnt"])
                        assert remaining_orders == 0, (
                            f"{remaining_orders} orders remain for {prev_user}"
                        )

                        if prev_order_ids:
                            order_reasons = [f"Sale · order {oid}" for oid in prev_order_ids]
                            cur.execute(
                                "SELECT COUNT(*)::INTEGER AS cnt "
                                "FROM inventory_transactions WHERE reason = ANY(%s)",
                                (order_reasons,),
                            )
                            remaining_transactions = int(cur.fetchone()["cnt"])
                            assert remaining_transactions == 0, (
                                f"{remaining_transactions} inventory transactions remain"
                            )

                            cur.execute(
                                "SELECT COUNT(*)::INTEGER AS cnt "
                                "FROM bundle_acceptance_events WHERE order_id = ANY(%s)",
                                (prev_order_ids,),
                            )
                            remaining_events = int(cur.fetchone()["cnt"])
                            assert remaining_events == 0, (
                                f"{remaining_events} bundle acceptance events remain"
                            )
            finally:
                # This must run even if order deletion, stock restoration, or
                # verification raises an exception.
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
    """Two concurrent orders for the last unit: exactly one succeeds.

    The test temporarily sets one product-size and its aggregate product stock
    to one unit. All generated users' orders and related records are removed,
    and both stock values are restored from exact snapshots in a finally block.
    """
    from concurrent.futures import ThreadPoolExecutor
    import threading

    sku, size = "VLR-1001", "XXL"

    # These are initialized before the protected section so cleanup can always
    # identify every generated user, including requests that raise exceptions.
    user_ids = [
        f"pytest-concurrent-{index}-{uuid.uuid4().hex[:8]}"
        for index in range(2)
    ]
    results: list[tuple[int, str]] = []
    results_lock = threading.Lock()
    order_ids: list[str] = []

    # Capture original stock before making any modifications.
    with db_cursor() as cur:
        cur.execute("SELECT stock FROM products WHERE sku = %s", (sku,))
        product_row = cur.fetchone()
        if product_row is None:
            raise AssertionError(f"Missing product row for {sku}")
        original_product_stock = int(product_row["stock"])

        cur.execute(
            "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
            (sku, size),
        )
        size_row = cur.fetchone()
        if size_row is None:
            raise AssertionError(f"Missing product_sizes row for {sku} / {size}")
        original_size_stock = int(size_row["stock"])

    try:
        # The test's temporary stock state is protected by this try/finally.
        with db_cursor(commit=True) as cur:
            cur.execute("UPDATE products SET stock = 1 WHERE sku = %s", (sku,))
            cur.execute(
                "UPDATE product_sizes SET stock = 1 WHERE sku = %s AND size = %s",
                (sku, size),
            )

        barrier = threading.Barrier(2)

        def place_one(uid: str) -> None:
            status_code = 0
            try:
                barrier.wait()
                response = client.post(
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
                status_code = response.status_code
            except Exception:
                # Keep uid intact so cleanup can still find an order in the
                # unlikely event the request committed before the client errored.
                status_code = 0
            finally:
                with results_lock:
                    results.append((status_code, uid))

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(place_one, uid) for uid in user_ids]
            for future in futures:
                future.result()

        statuses = [status for status, _ in results]
        assert statuses.count(200) == 1, f"Expected exactly one successful order, got {statuses}"
        assert statuses.count(409) == 1, f"Expected exactly one 409 rejection, got {statuses}"

        with db_cursor() as cur:
            cur.execute(
                "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
                (sku, size),
            )
            after_size = int(cur.fetchone()["stock"])
            cur.execute("SELECT stock FROM products WHERE sku = %s", (sku,))
            after_product = int(cur.fetchone()["stock"])

        assert after_size == 0, (
            f"Per-size stock should be 0 after concurrent sale, got {after_size}"
        )
        assert after_product == 0, (
            f"Aggregate product stock should be 0 after concurrent sale, got {after_product}"
        )
    finally:
        # Delete all test orders and related records. Even if this block fails,
        # the nested finally below still restores the original stock snapshots.
        try:
            with db_cursor(commit=True) as cur:
                for uid in user_ids:
                    cur.execute("SELECT id FROM orders WHERE user_id = %s", (uid,))
                    order_ids.extend(row["id"] for row in cur.fetchall())

                if order_ids:
                    order_reasons = [f"Sale · order {oid}" for oid in order_ids]
                    cur.execute(
                        "DELETE FROM inventory_transactions WHERE reason = ANY(%s)",
                        (order_reasons,),
                    )
                    cur.execute(
                        "DELETE FROM bundle_acceptance_events WHERE order_id = ANY(%s)",
                        (order_ids,),
                    )
                    cur.execute(
                        "DELETE FROM order_items WHERE order_id = ANY(%s)",
                        (order_ids,),
                    )
                    cur.execute(
                        "DELETE FROM orders WHERE id = ANY(%s)",
                        (order_ids,),
                    )
        finally:
            # Restore each stock snapshot exactly once, regardless of cleanup errors.
            with db_cursor(commit=True) as cur:
                cur.execute(
                    "UPDATE products SET stock = %s WHERE sku = %s",
                    (original_product_stock, sku),
                )
                cur.execute(
                    "UPDATE product_sizes SET stock = %s WHERE sku = %s AND size = %s",
                    (original_size_stock, sku, size),
                )

        # Verify exact stock restoration and absence of test-created records.
        with db_cursor() as cur:
            cur.execute("SELECT stock FROM products WHERE sku = %s", (sku,))
            restored_product_stock = int(cur.fetchone()["stock"])
            cur.execute(
                "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
                (sku, size),
            )
            restored_size_stock = int(cur.fetchone()["stock"])

            cur.execute(
                "SELECT COUNT(*)::INTEGER AS cnt FROM orders WHERE user_id = ANY(%s)",
                (user_ids,),
            )
            remaining_orders = int(cur.fetchone()["cnt"])

            if order_ids:
                order_reasons = [f"Sale · order {oid}" for oid in order_ids]
                cur.execute(
                    "SELECT COUNT(*)::INTEGER AS cnt "
                    "FROM inventory_transactions WHERE reason = ANY(%s)",
                    (order_reasons,),
                )
                remaining_transactions = int(cur.fetchone()["cnt"])
                cur.execute(
                    "SELECT COUNT(*)::INTEGER AS cnt "
                    "FROM bundle_acceptance_events WHERE order_id = ANY(%s)",
                    (order_ids,),
                )
                remaining_events = int(cur.fetchone()["cnt"])
            else:
                remaining_transactions = 0
                remaining_events = 0

        assert restored_product_stock == original_product_stock, (
            f"Product stock mismatch: {restored_product_stock} != {original_product_stock}"
        )
        assert restored_size_stock == original_size_stock, (
            f"Per-size stock mismatch: {restored_size_stock} != {original_size_stock}"
        )
        assert remaining_orders == 0, f"{remaining_orders} test orders remain"
        assert remaining_transactions == 0, (
            f"{remaining_transactions} test inventory transactions remain"
        )
        assert remaining_events == 0, (
            f"{remaining_events} test bundle acceptance events remain"
        )


# ── Regression tests for checkout hardening ────────────────────────────

def test_ctl_60pct_tier_gated_by_base_cart_subtotal(test_user_id, cleanup_test_orders):
    """60% CTL tier is gated by the original cart subtotal, not the final subtotal.

    VLR-1001 price = 1899 (< 2000 gate). VLR-1004 is a 60% tier CTL candidate
    at ₹1200. The final subtotal would be 1899 + 1200 = 3099 >= 2000, but the
    original cart subtotal (excluding CTL candidate) is only 1899 < 2000, so
    the gate must fail.
    """
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1001", cand_sku="VLR-1004", size="S", price=1200)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "Gate Tester",
                "contact": "+91 99999 99999",
                "address": "123 Gate Street, Mumbai 400001",
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
        assert resp.status_code == 409, f"Expected 409, got {resp.status_code}: {resp.text}"
    finally:
        _delete_ctl_recommendation(rec_id)


def test_ctl_60pct_tier_passes_when_base_cart_subtotal_meets_gate(test_user_id, cleanup_test_orders):
    """60% CTL tier succeeds when the original cart subtotal (excluding CTL candidate) meets the gate.

    VLR-1002 S price = 1499 (below gate), but we add a second non-CTL line
    so the base cart subtotal exceeds 2000. VLR-1004 is the 60% tier CTL candidate.
    """
    rec_id = _make_ctl_recommendation(cart_sku="VLR-1002", cand_sku="VLR-1004", size="S", price=1200)
    try:
        resp = client.post(
            "/api/v1/orders",
            json={
                "user_id": test_user_id,
                "customer_name": "Gate Tester",
                "contact": "+91 99999 99999",
                "address": "123 Gate Street, Mumbai 400001",
                "payment": "UPI (demo)",
                "delivery": "standard",
                "items": [
                    {"sku": "VLR-1002", "size": "S", "qty": 1},
                    {"sku": "VLR-1001", "size": "S", "qty": 1},
                    {"sku": "VLR-1004", "size": "S", "qty": 1},
                ],
                "offer_references": [
                    {"recommendation_id": rec_id, "sku": "VLR-1004", "size": "S"},
                ],
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["total"] > 0
        ctl_item = [i for i in data.get("items", []) if i["sku"] == "VLR-1004"]
        assert len(ctl_item) == 1
        assert ctl_item[0]["offer_flag"] is True
    finally:
        _delete_ctl_recommendation(rec_id)


def test_order_items_return_real_database_ids(test_user_id, cleanup_test_orders):
    """Every returned order item has a positive ID matching the persisted row."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "ID Tester",
            "contact": "+91 99999 99999",
            "address": "123 ID Street, Mumbai 400001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1003", "size": "M", "qty": 1},
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["id"] > 0, f"Order item id must be positive, got {item['id']}"

    # Verify the ID matches the persisted database row.
    with db_cursor() as cur:
        cur.execute(
            "SELECT id FROM order_items WHERE id = %s AND order_id = %s",
            (item["id"], data["id"]),
        )
        row = cur.fetchone()
    assert row is not None, f"Order item id {item['id']} not found in database"
    assert int(row["id"]) == item["id"]


def test_order_items_multiple_lines_return_real_ids(test_user_id, cleanup_test_orders):
    """Multiple order items each return a positive real database ID."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": test_user_id,
            "customer_name": "ID Tester",
            "contact": "+91 99999 99999",
            "address": "123 ID Street, Mumbai 400001",
            "payment": "UPI (demo)",
            "delivery": "standard",
            "items": [
                {"sku": "VLR-1003", "size": "M", "qty": 1},
                {"sku": "VLR-1003", "size": "S", "qty": 2},
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["items"]) == 2
    for item in data["items"]:
        assert item["id"] > 0, f"Order item id must be positive, got {item['id']}"
        with db_cursor() as cur:
            cur.execute(
                "SELECT id FROM order_items WHERE id = %s AND order_id = %s",
                (item["id"], data["id"]),
            )
            row = cur.fetchone()
        assert row is not None, f"Order item id {item['id']} not found in database"
