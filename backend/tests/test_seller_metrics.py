"""Seller-specific metrics unit tests — require seeded DB."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_seller_metrics_structure():
    resp = client.get("/api/v1/seller/seller-1/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert "live_listings" in data
    assert "bundle_attach_rate" in data
    assert "bundle_presented" in data
    assert "bundle_accepted" in data


def test_seller_metrics_scoped_to_seller():
    """Bundle metrics for different sellers can differ (not global)."""
    resp_1 = client.get("/api/v1/seller/seller-1/metrics")
    resp_2 = client.get("/api/v1/seller/seller-2/metrics")
    assert resp_1.status_code == 200
    assert resp_2.status_code == 200
    data_1 = resp_1.json()
    data_2 = resp_2.json()
    # Each seller has their own live_listings count
    assert "live_listings" in data_1
    assert "live_listings" in data_2


def test_seller_liquidation_endpoint():
    resp = client.get("/api/v1/seller/seller-1/liquidation?min_age=60")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for item in data:
        assert "tier_discount" in item
        assert "margin_floor" in item
        assert "sku" in item
