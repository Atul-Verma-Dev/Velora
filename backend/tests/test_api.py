"""API endpoint tests — require seeded database."""

from fastapi.testclient import TestClient

from app.core.db import db_cursor
from app.main import app


client = TestClient(app)


import pytest


@pytest.fixture(autouse=True)
def _cleanup_test_orders():
    """Clean up test orders after each test to avoid polluting other test modules."""
    yield
    with db_cursor(commit=True) as cur:
        # Restore per-size stock for products touched by test orders.
        cur.execute(
            """
            SELECT sku, size, -SUM(delta) as restored
            FROM inventory_transactions
            WHERE reason LIKE 'Sale · order VLR-%'
            GROUP BY sku, size
            """
        )
        for row in cur.fetchall():
            cur.execute(
                """
                UPDATE product_sizes
                SET stock = stock + %s
                WHERE sku = %s AND size = %s
                """,
                (row["restored"], row["sku"], row["size"]),
            )
        # Also restore total product stock.
        cur.execute(
            """
            SELECT sku, -SUM(delta) as restored
            FROM inventory_transactions
            WHERE reason LIKE 'Sale · order VLR-%'
            GROUP BY sku
            """
        )
        for row in cur.fetchall():
            cur.execute(
                "UPDATE products SET stock = stock + %s WHERE sku = %s",
                (row["restored"], row["sku"]),
            )
        # Delete test order records.
        cur.execute("DELETE FROM inventory_transactions WHERE reason LIKE 'Sale · order VLR-%'")
        cur.execute("DELETE FROM order_items WHERE order_id LIKE 'VLR-%'")
        cur.execute("DELETE FROM orders WHERE id LIKE 'VLR-%' AND user_id = 'user-demo'")


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


def test_place_order_success():
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
            "items": [
                {"sku": "VLR-1001", "size": "S", "qty": 1},
            ],
            # Client-supplied pricing is diagnostic only — server recalculates.
            "client_subtotal": 1499,
            "client_discount": 0,
            "client_shipping": 0,
            "client_total": 1499,
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


def test_place_order_ignores_client_total():
    """A manipulated client total must never override the server-calculated total."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
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


def test_place_order_zero_subtotal_still_charges_full_price():
    """Client-submitted zero subtotal must not reduce the server total."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
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


def test_place_order_insufficient_stock():
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
            "items": [
                {"sku": "VLR-1002", "size": "M", "qty": 99999},
            ],
            "client_subtotal": 1499,
            "client_total": 1499,
        },
    )
    assert resp.status_code == 409


def test_place_order_nonexistent_product():
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
            "items": [
                {"sku": "NONEXISTENT", "size": "M", "qty": 1},
            ],
            "client_subtotal": 1499,
            "client_total": 1499,
        },
    )
    assert resp.status_code == 404


def test_place_order_invalid_size_rejected():
    """A size with no product_sizes record must be rejected (no aggregate fallback)."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
            "items": [
                {"sku": "VLR-1001", "size": "XXXL", "qty": 1},
            ],
            "client_subtotal": 1899,
            "client_total": 1899,
        },
    )
    assert resp.status_code == 409


def test_place_order_duplicate_lines_aggregated():
    """Duplicate SKU/size lines in the cart are aggregated before inventory check."""
    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
            "items": [
                {"sku": "VLR-1001", "size": "S", "qty": 1},
                {"sku": "VLR-1001", "size": "S", "qty": 1},
            ],
            "client_subtotal": 0,
            "client_total": 0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Two lines of qty 1 each -> aggregated qty 2
    assert data["subtotal"] == 1899.0 * 2
    assert data["total"] == 1899.0 * 2


def test_place_order_rollback_leaves_inventory_unchanged():
    """A failed order (insufficient stock) leaves inventory unchanged."""
    from app.core.db import db_cursor

    with db_cursor() as cur:
        cur.execute(
            "SELECT stock FROM product_sizes WHERE sku = %s AND size = %s",
            ("VLR-1003", "M"),
        )
        before = int(cur.fetchone()["stock"])

    resp = client.post(
        "/api/v1/orders",
        json={
            "user_id": "user-demo",
            "customer_name": "Aarav Mehta",
            "contact": "+91 98765 43210",
            "address": "123 MG Road, Bengaluru 560001",
            "payment": "UPI (demo)",
            "delivery": "Standard delivery · free",
            "items": [
                {"sku": "VLR-1003", "size": "M", "qty": 99999},
            ],
            "client_subtotal": 0,
            "client_total": 0,
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
