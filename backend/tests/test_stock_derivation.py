"""Unit tests for catalogue size-stock derivation — no database required.

These tests verify that the backend's derived_stock_for_size() and
per_size_stock() faithfully reproduce the frontend's derivedStockForSize()
and stockForSize() behaviour from frontend/src/data/catalog.js.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.seed_catalogue import derived_stock_for_size, per_size_stock, DISTRIBUTION


def test_distribution_matches_frontend():
    """The backend distribution must match the frontend's exactly."""
    assert DISTRIBUTION == [0.16, 0.22, 0.26, 0.18, 0.11, 0.07]


def test_single_size_returns_total_stock():
    """A product with one size gets the full stock for that size."""
    result = derived_stock_for_size(100, ["M"], "M", "VLR-1001")
    assert result == 100


def test_unknown_size_returns_zero():
    """A size the product doesn't come in is never in stock."""
    result = derived_stock_for_size(100, ["S", "M", "L"], "XL", "VLR-1001")
    assert result == 0


def test_empty_sizes_returns_zero():
    """No sizes means no stock."""
    result = derived_stock_for_size(100, [], "M", "VLR-1001")
    assert result == 0


def test_derived_stock_parity_with_frontend():
    """Backend derivation matches frontend derivedStockForSize() for VLR-1001.

    Frontend: VLR-1001 has sizes ['S','M','L','XL','XXL'], stock=38.
    Distribution for 5 sizes: [0.16, 0.22, 0.26, 0.18, 0.11]
    Total weight = 0.93
    S (idx 0): 38 * 0.16 / 0.93 = 6.54 -> round 7, soldOut check: ('1' + 0) % 11 != 0
    M (idx 1): 38 * 0.22 / 0.93 = 8.99 -> round 9, soldOut check: ('1' + 1) % 11 != 0
    ...
    """
    sizes = ["S", "M", "L", "XL", "XXL"]
    total_stock = 38
    product_id = "VLR-1001"

    expected = {}
    for idx, size in enumerate(sizes):
        weight = DISTRIBUTION[idx % len(DISTRIBUTION)]
        total_weight = sum(DISTRIBUTION[i % len(DISTRIBUTION)] for i in range(len(sizes)))
        raw = (total_stock * weight) / total_weight
        sold_out = (ord(product_id[-1]) + idx) % 11 == 0
        expected[size] = 0 if sold_out else max(0, round(raw))

    for size in sizes:
        result = derived_stock_for_size(total_stock, sizes, size, product_id)
        assert result == expected[size], f"Size {size}: expected {expected[size]}, got {result}"


def test_product_specific_sold_out_rule():
    """Each product has its own sold-out extremity based on its ID's last char.

    VLR-1001 ends in '1'. Sold-out when (49 + i) % 11 == 0, i.e. i = 6 (not in range 0-4).
    VLR-1002 ends in '2'. Sold-out when (50 + i) % 11 == 0, i.e. i = 5 (not in range 0-4).
    VLR-1003 ends in '3'. Sold-out when (51 + i) % 11 == 0, i.e. i = 4 -> XXL sold out.
    """
    sizes = ["S", "M", "L", "XL", "XXL"]

    # VLR-1003: '3' char code is 51. (51 + 4) % 11 = 55 % 11 = 0 -> XXL sold out
    result_xxl = derived_stock_for_size(38, sizes, "XXL", "VLR-1003")
    assert result_xxl == 0, "VLR-1003 XXL should be sold out"

    # VLR-1001: '1' char code is 49. (49 + i) % 11 == 0 -> i = 6, not in range. No sold-out.
    result_xxl_1001 = derived_stock_for_size(38, sizes, "XXL", "VLR-1001")
    assert result_xxl_1001 > 0, "VLR-1001 XXL should not be sold out"


def test_per_size_stock_respects_explicit_sizeStock():
    """When product.sizeStock is present, those values are used instead of deriving."""
    product = {
        "id": "VLR-TEST",
        "sizes": ["S", "M", "L"],
        "stock": 100,
        "sizeStock": {"S": 10, "M": 20, "L": 30},
    }
    result = per_size_stock(product)
    assert result == {"S": 10, "M": 20, "L": 30}


def test_per_size_stock_derives_when_no_sizeStock():
    """When product.sizeStock is absent, stock is derived deterministically."""
    product = {
        "id": "VLR-1001",
        "sizes": ["S", "M", "L", "XL", "XXL"],
        "stock": 38,
    }
    result = per_size_stock(product)
    assert len(result) == 5
    for size in ["S", "M", "L", "XL", "XXL"]:
        assert size in result
        assert result[size] >= 0
    # Sum of derived sizes may not equal total stock due to rounding and sold-out rule
    # but each individual size should match derived_stock_for_size
    test_sizes = ["S", "M", "L", "XL", "XXL"]
    for size in test_sizes:
        expected = derived_stock_for_size(38, test_sizes, size, "VLR-1001")
        assert result[size] == expected


def test_per_size_stock_with_explicit_uses_only_defined_sizes():
    """Explicit sizeStock values are used only for sizes the product actually has."""
    product = {
        "id": "VLR-TEST",
        "sizes": ["S", "M"],
        "stock": 50,
        "sizeStock": {"S": 5, "M": 10, "XL": 999},  # XL not in product sizes, should be ignored
    }
    result = per_size_stock(product)
    assert result == {"S": 5, "M": 10}


def test_zero_stock_product_derives_zero_for_all_sizes():
    """A product with zero total stock derives zero stock for every size."""
    product = {
        "id": "VLR-ZERO",
        "sizes": ["S", "M", "L"],
        "stock": 0,
    }
    result = per_size_stock(product)
    assert result == {"S": 0, "M": 0, "L": 0}
