"""Recommendation ID propagation and accept/reject workflow tests — require seeded DB."""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_recommendation_includes_id():
    """Every persisted recommendation has a database-generated ID in the response."""
    resp = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [
                {"sku": "VLR-1001", "size": "M", "qty": 1}
            ],
            "cart_subtotal": 2500,
            "limit": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    for rec in data["recommendations"]:
        assert "recommendation_id" in rec
        assert isinstance(rec["recommendation_id"], int)
        assert rec["recommendation_id"] > 0


def test_accept_reject_workflow():
    """Complete recommend → accept → reject workflow."""
    # Create a recommendation
    resp = client.post(
        "/api/v1/bundles/recommend",
        json={
            "cart_items": [
                {"sku": "VLR-1001", "size": "M", "qty": 1}
            ],
            "cart_subtotal": 2500,
            "limit": 1,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["recommendations"]) >= 1, "Expected at least one recommendation"
    rec_id = data["recommendations"][0]["recommendation_id"]

    # Accept it
    accept_resp = client.post(
        "/api/v1/bundles/accept",
        json={"recommendation_id": rec_id},
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["accepted"] is True
    assert accept_resp.json()["recommendation_id"] == rec_id

    # Rejecting deletes the row — it exists so rejected=True
    reject_resp = client.post(
        "/api/v1/bundles/reject",
        json={"recommendation_id": rec_id},
    )
    assert reject_resp.status_code == 200
    assert reject_resp.json()["rejected"] is True

    # Row is now deleted; accepting again returns 404
    accept_again = client.post(
        "/api/v1/bundles/accept",
        json={"recommendation_id": rec_id},
    )
    assert accept_again.status_code == 404


def test_accept_nonexistent_recommendation():
    """Accepting a non-existent recommendation returns 404."""
    resp = client.post(
        "/api/v1/bundles/accept",
        json={"recommendation_id": 999999},
    )
    assert resp.status_code == 404


def test_reject_nonexistent_recommendation():
    """Rejecting a non-existent recommendation returns 404."""
    resp = client.post(
        "/api/v1/bundles/reject",
        json={"recommendation_id": 999999},
    )
    assert resp.status_code == 404
