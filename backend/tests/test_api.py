"""API endpoint tests — require seeded database."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


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
        params={
            "query": "kurta",
            "has_image": False,
            "result_count": 5,
            "duration_ms": 42,
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
