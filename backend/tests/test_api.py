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
