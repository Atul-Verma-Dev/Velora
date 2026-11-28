"""Seller revenue integration tests — require seeded database.

Tests that seller gross sales use order_items.price * order_items.qty
(line-item revenue), not orders.total, and that distinct orders are
counted correctly when an order contains items from multiple sellers.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.core.db import db_cursor


client = TestClient(app)


def _cleanup_test_orders():
    """Remove all test orders and their items."""
    with db_cursor(commit=True) as cur:
        cur.execute(
            "DELETE FROM order_items WHERE order_id LIKE 'test-order-%'"
        )
        cur.execute(
            "DELETE FROM orders WHERE id LIKE 'test-order-%'"
        )


def _insert_test_order(order_id, user_id, status, items):
    """Insert an order with line items for revenue testing.

    items: list of (sku, seller_id, price, qty) tuples.
    """
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO orders (id, user_id, customer_name, status, payment,
                                subtotal, discount, shipping, total, placed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            """,
            (order_id, user_id, "Test Customer", status, "card",
             0, 0, 0, 0),
        )
        for sku, seller_id, price, qty in items:
            cur.execute(
                """
                INSERT INTO order_items (order_id, sku, size, qty, price, offer_flag, seller_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (order_id, sku, "M", qty, price, False, seller_id),
            )


def test_mixed_seller_order_revenue_is_line_item_based():
    """An order with items from two sellers must attribute revenue per seller.

    Order: items from seller-1 and seller-2.
    - seller-1: VLR-1001, price=1500, qty=1 -> line-item revenue = 1500
    - seller-2: VLR-1002, price=800, qty=2 -> line-item revenue = 1600
    Order total would be 3100, but each seller only gets their line items.
    """
    _cleanup_test_orders()
    _insert_test_order(
        "test-order-mixed-1",
        "user-test-1",
        "Delivered",
        [
            ("VLR-1001", "seller-1", 1500.00, 1),
            ("VLR-1002", "seller-2", 800.00, 2),
        ],
    )

    resp_1 = client.get("/api/v1/seller/seller-1/metrics")
    resp_2 = client.get("/api/v1/seller/seller-2/metrics")
    assert resp_1.status_code == 200
    assert resp_2.status_code == 200

    data_1 = resp_1.json()
    data_2 = resp_2.json()

    # Seller-1 revenue must be 1500 (line item), not 3100 (order total)
    assert data_1["gross_sales"] == 1500.0, f"seller-1 gross_sales: {data_1['gross_sales']}"
    # Seller-2 revenue must be 1600 (line item), not 3100 (order total)
    assert data_2["gross_sales"] == 1600.0, f"seller-2 gross_sales: {data_2['gross_sales']}"
    # Each seller has 1 distinct order
    assert data_1["orders"] == 1
    assert data_2["orders"] == 1
    # Delivered sales match gross sales for delivered orders
    assert data_1["delivered_sales"] == 1500.0
    assert data_2["delivered_sales"] == 1600.0


def test_distinct_order_count_with_multiple_items_same_seller():
    """An order with two items from the same seller counts as one distinct order."""
    _cleanup_test_orders()
    _insert_test_order(
        "test-order-multi-same-seller",
        "user-test-2",
        "Delivered",
        [
            ("VLR-1001", "seller-1", 1000.00, 1),
            ("VLR-1003", "seller-1", 500.00, 2),
        ],
    )

    resp = client.get("/api/v1/seller/seller-1/metrics")
    assert resp.status_code == 200
    data = resp.json()
    # Two line items but one distinct order
    assert data["orders"] == 1
    # Revenue = 1000*1 + 500*2 = 2000
    assert data["gross_sales"] == 2000.0


def test_cancelled_order_excluded_from_gross_sales():
    """Cancelled orders must not contribute to gross sales."""
    _cleanup_test_orders()
    _insert_test_order(
        "test-order-cancelled",
        "user-test-3",
        "Cancelled",
        [
            ("VLR-1001", "seller-1", 1000.00, 1),
        ],
    )

    resp = client.get("/api/v1/seller/seller-1/metrics")
    assert resp.status_code == 200
    data = resp.json()
    # Cancelled order excluded from gross sales
    assert data["gross_sales"] == 0.0


def test_returned_order_tracked_as_refunds():
    """Returned orders are tracked separately as refunds but still count in gross sales.

    Gross sales includes all non-cancelled orders (the sale happened).
    Refunds tracks the returned portion separately. Net sales would be
    gross_sales - refunds.
    """
    _cleanup_test_orders()
    _insert_test_order(
        "test-order-returned",
        "user-test-4",
        "Returned",
        [
            ("VLR-1001", "seller-1", 1000.00, 1),
        ],
    )

    resp = client.get("/api/v1/seller/seller-1/metrics")
    assert resp.status_code == 200
    data = resp.json()
    # Returned order is included in gross sales (the sale happened)
    assert data["gross_sales"] == 1000.0
    # And tracked separately as refunds
    assert data["refunds"] == 1000.0


def test_cleanup_test_orders():
    """Remove test orders inserted by previous tests."""
    _cleanup_test_orders()
