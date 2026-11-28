"""Seller revenue integration tests — require seeded database.

These tests verify that seller gross sales use order_items.price * order_items.qty
(line-item revenue), not orders.total, and that distinct orders are counted
correctly when an order contains items from multiple sellers.

Each test creates uniquely named seller records so pre-existing seeded orders
cannot contaminate its metrics. Test orders, linked events, transactions, and
seller records are removed during fixture teardown.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.db import db_cursor


client = TestClient(app)


def _new_order_id() -> str:
    return f"test-order-{uuid.uuid4().hex}"


def _create_test_seller(scope: dict) -> str:
    """Create an isolated seller record for a revenue test."""
    seller_id = f"pytest-seller-{uuid.uuid4().hex}"
    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO sellers (id, name) VALUES (%s, %s)",
            (seller_id, f"Revenue Test Seller {seller_id[-8:]}"),
        )
    scope["seller_ids"].append(seller_id)
    return seller_id


def _insert_test_order(order_id: str, user_id: str, status: str, items: list[tuple]):
    """Insert an order with line items.

    items: list of (sku, seller_id, price, qty) tuples.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO orders (id, user_id, customer_name, status, payment,
                                subtotal, discount, shipping, total, placed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            """,
            (order_id, user_id, "Test Customer", status, "card", 0, 0, 0, 0),
        )
        for sku, seller_id, price, qty in items:
            cur.execute(
                """
                INSERT INTO order_items (order_id, sku, size, qty, price, offer_flag, seller_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (order_id, sku, "M", qty, price, False, seller_id),
            )


def _cleanup_test_orders(order_ids: list[str]) -> None:
    """Delete only the explicitly supplied test orders and related records."""
    if not order_ids:
        return

    order_reasons = [f"Sale · order {order_id}" for order_id in order_ids]
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM bundle_acceptance_events WHERE order_id = ANY(%s)",
            (order_ids,),
        )
        cur.execute(
            "DELETE FROM inventory_transactions WHERE reason = ANY(%s)",
            (order_reasons,),
        )
        cur.execute(
            "DELETE FROM order_items WHERE order_id = ANY(%s)",
            (order_ids,),
        )
        cur.execute(
            "DELETE FROM orders WHERE id = ANY(%s)",
            (order_ids,),
        )


def _cleanup_test_sellers(seller_ids: list[str]) -> None:
    """Delete only the temporary seller records created by this test scope."""
    if not seller_ids:
        return

    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM sellers WHERE id = ANY(%s)",
            (seller_ids,),
        )


@pytest.fixture
def revenue_test_scope():
    """Track isolated test data and always remove it after each test."""
    scope = {"order_ids": [], "seller_ids": []}
    try:
        yield scope
    finally:
        # Seller rows are referenced by order_items, so order cleanup must be
        # attempted first. Still attempt seller cleanup if order cleanup fails.
        try:
            _cleanup_test_orders(scope["order_ids"])
        finally:
            _cleanup_test_sellers(scope["seller_ids"])


def _insert_scoped_order(scope: dict, user_id: str, status: str, items: list[tuple]) -> str:
    order_id = _new_order_id()
    # Register before the insert so teardown also handles a partially completed
    # insert transaction if the helper raises.
    scope["order_ids"].append(order_id)
    _insert_test_order(order_id, user_id, status, items)
    return order_id


def test_mixed_seller_order_revenue_is_line_item_based(revenue_test_scope):
    """An order with items from two sellers attributes only each seller's lines.

    seller A: VLR-1001, ₹1500 x 1 = ₹1500.
    seller B: VLR-1002, ₹800 x 2 = ₹1600.
    The order total is irrelevant to seller-specific revenue.
    """
    seller_a = _create_test_seller(revenue_test_scope)
    seller_b = _create_test_seller(revenue_test_scope)
    _insert_scoped_order(
        revenue_test_scope,
        "user-test-mixed",
        "Delivered",
        [
            ("VLR-1001", seller_a, 1500.00, 1),
            ("VLR-1002", seller_b, 800.00, 2),
        ],
    )

    resp_a = client.get(f"/api/v1/seller/{seller_a}/metrics")
    resp_b = client.get(f"/api/v1/seller/{seller_b}/metrics")
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200

    data_a = resp_a.json()
    data_b = resp_b.json()

    assert data_a["gross_sales"] == 1500.0, f"seller A gross_sales: {data_a['gross_sales']}"
    assert data_b["gross_sales"] == 1600.0, f"seller B gross_sales: {data_b['gross_sales']}"
    assert data_a["orders"] == 1
    assert data_b["orders"] == 1
    assert data_a["delivered_sales"] == 1500.0
    assert data_b["delivered_sales"] == 1600.0


def test_distinct_order_count_with_multiple_items_same_seller(revenue_test_scope):
    """Two line items from one seller in one order count as one order."""
    seller_id = _create_test_seller(revenue_test_scope)
    _insert_scoped_order(
        revenue_test_scope,
        "user-test-multiple-lines",
        "Delivered",
        [
            ("VLR-1001", seller_id, 1000.00, 1),
            ("VLR-1003", seller_id, 500.00, 2),
        ],
    )

    resp = client.get(f"/api/v1/seller/{seller_id}/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["orders"] == 1
    assert data["gross_sales"] == 2000.0


def test_cancelled_order_excluded_from_gross_sales(revenue_test_scope):
    """Cancelled orders do not contribute to gross sales."""
    seller_id = _create_test_seller(revenue_test_scope)
    _insert_scoped_order(
        revenue_test_scope,
        "user-test-cancelled",
        "Cancelled",
        [("VLR-1001", seller_id, 1000.00, 1)],
    )

    resp = client.get(f"/api/v1/seller/{seller_id}/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["gross_sales"] == 0.0


def test_returned_order_tracked_as_refunds(revenue_test_scope):
    """Returned sales remain in gross sales and are separately counted as refunds."""
    seller_id = _create_test_seller(revenue_test_scope)
    _insert_scoped_order(
        revenue_test_scope,
        "user-test-returned",
        "Returned",
        [("VLR-1001", seller_id, 1000.00, 1)],
    )

    resp = client.get(f"/api/v1/seller/{seller_id}/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["gross_sales"] == 1000.0
    assert data["refunds"] == 1000.0


def test_cleanup_test_orders():
    """The scoped cleanup helper removes only the supplied test order."""
    order_id = _new_order_id()
    seller_scope = {"seller_ids": []}
    seller_id = _create_test_seller(seller_scope)
    try:
        _insert_test_order(
            order_id,
            "user-test-cleanup",
            "Delivered",
            [("VLR-1001", seller_id, 1000.00, 1)],
        )
        _cleanup_test_orders([order_id])
        with db_cursor() as cur:
            cur.execute("SELECT COUNT(*)::INTEGER AS n FROM orders WHERE id = %s", (order_id,))
            assert cur.fetchone()["n"] == 0
            cur.execute("SELECT COUNT(*)::INTEGER AS n FROM order_items WHERE order_id = %s", (order_id,))
            assert cur.fetchone()["n"] == 0
    finally:
        _cleanup_test_orders([order_id])
        _cleanup_test_sellers(seller_scope["seller_ids"])
