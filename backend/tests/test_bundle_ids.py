"""Recommendation ID propagation and accept/reject workflow tests — require seeded DB."""

from fastapi.testclient import TestClient

from app.main import app
from app.core.db import db_cursor


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


def test_acceptance_without_order_is_not_a_purchase():
    """Recommendation acceptance is distinct from order placement.

    Accepting a recommendation without an order_id succeeds as a cart action.
    No bundle_acceptance_events row is created until an order is linked,
    so acceptance alone does not constitute a purchase.
    """
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
    assert len(data["recommendations"]) >= 1
    rec_id = data["recommendations"][0]["recommendation_id"]

    # Accept without an order_id - succeeds as cart action
    accept_resp = client.post(
        "/api/v1/bundles/accept",
        json={"recommendation_id": rec_id},
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["accepted"] is True
    assert accept_resp.json()["recommendation_id"] == rec_id

    # Verify no acceptance_events row exists (not linked to a purchase)
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT order_id FROM bundle_acceptance_events
            WHERE recommendation_id = %s
            """,
            (rec_id,),
        )
        row = cur.fetchone()
        assert row is None, "Acceptance without order_id must not create an acceptance_events row"


def test_acceptance_with_order_links_to_purchase():
    """Acceptance can be linked to an order_id once an order is placed."""
    # Insert a real order first (FK constraint requires it to exist)
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO orders (id, user_id, customer_name, status, payment,
                                subtotal, discount, shipping, total, placed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            """,
            ("test-order-linked", "user-test", "Test Customer", "Delivered", "card",
             1899.00, 0, 0, 1899.00),
        )

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
    assert len(data["recommendations"]) >= 1
    rec_id = data["recommendations"][0]["recommendation_id"]

    # Accept with an order_id
    accept_resp = client.post(
        "/api/v1/bundles/accept",
        json={"recommendation_id": rec_id, "order_id": "test-order-linked"},
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["accepted"] is True

    # Verify the acceptance event links to the order
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT order_id FROM bundle_acceptance_events
            WHERE recommendation_id = %s
            """,
            (rec_id,),
        )
        row = cur.fetchone()
        assert row is not None
        assert row["order_id"] == "test-order-linked"


def test_cleanup_linked_order():
    """Remove test order inserted by acceptance test."""
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM bundle_acceptance_events WHERE order_id = 'test-order-linked'"
        )
        cur.execute(
            "DELETE FROM orders WHERE id = 'test-order-linked'"
        )
