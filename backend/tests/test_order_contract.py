"""Order-payload contract for Complete the Look offer references (no database).

Checkout builds references from the recommendationId persisted on the cart
line, so the wire shape is {recommendation_id, sku, size}. These tests pin the
schema gate: a well-formed reference is accepted, and a missing or invalid
recommendation id never reaches the order path.
"""

import pytest
from pydantic import ValidationError

from app.schemas.order import OrderIn


def _payload(**overrides):
    payload = {
        "user_id": "user-demo",
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
            {"recommendation_id": 42, "sku": "VLR-1004", "size": "S"},
        ],
    }
    payload.update(overrides)
    return payload


def test_checkout_offer_reference_is_accepted():
    order = OrderIn(**_payload())
    assert len(order.offer_references) == 1
    ref = order.offer_references[0]
    assert (ref.recommendation_id, ref.sku, ref.size) == (42, "VLR-1004", "S")


def test_order_without_offers_is_still_valid():
    order = OrderIn(**_payload(offer_references=[]))
    assert order.offer_references == []


def test_missing_recommendation_id_is_rejected():
    with pytest.raises(ValidationError):
        OrderIn(**_payload(offer_references=[{"sku": "VLR-1004", "size": "S"}]))


@pytest.mark.parametrize("bad_id", [0, -1, None, "not-an-int"])
def test_invalid_recommendation_id_is_rejected(bad_id):
    with pytest.raises(ValidationError):
        OrderIn(
            **_payload(
                offer_references=[{"recommendation_id": bad_id, "sku": "VLR-1004", "size": "S"}]
            )
        )


def test_offer_reference_requires_sku_and_size():
    with pytest.raises(ValidationError):
        OrderIn(**_payload(offer_references=[{"recommendation_id": 42, "sku": "", "size": "S"}]))
    with pytest.raises(ValidationError):
        OrderIn(**_payload(offer_references=[{"recommendation_id": 42, "sku": "VLR-1004"}]))
