"""Pytest configuration and fixtures for Velora backend tests."""

import pytest


@pytest.fixture(autouse=True)
def no_db_for_unit_tests(monkeypatch):
    """Unit tests (pricing, stylist) must not touch the database."""
    yield
