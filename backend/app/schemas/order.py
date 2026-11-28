"""Pydantic schemas for order domain."""

from typing import Literal
from decimal import Decimal

from pydantic import BaseModel, Field


class OrderItemIn(BaseModel):
    sku: str = Field(..., min_length=1)
    size: str = Field(..., min_length=1, max_length=32)
    qty: int = Field(..., ge=1)


class OfferReferenceIn(BaseModel):
    """A Complete the Look offer reference accepted by the shopper.

    The server validates that the recommendation exists, is accepted,
    and that the offered price matches the persisted recommendation price.
    """
    recommendation_id: int = Field(..., ge=1)
    sku: str = Field(..., min_length=1)
    size: str = Field(..., min_length=1, max_length=32)


class OrderIn(BaseModel):
    user_id: str = Field(default="user-demo", min_length=1)
    customer_name: str = Field(..., min_length=1)
    contact: str = Field(..., min_length=1)
    address: str = Field(..., min_length=1)
    payment: str = Field(..., min_length=1)
    delivery: Literal["standard", "express"] = Field(default="standard")
    items: list[OrderItemIn] = Field(..., min_length=1)
    offer_references: list[OfferReferenceIn] = Field(default_factory=list)
    coupon_code: str | None = Field(default=None, max_length=64)
    # Client-supplied pricing fields are diagnostic only. The server always
    # recalculates subtotal, shipping and total from database values and
    # never trusts a client-supplied total.
    client_subtotal: float | None = Field(default=None, ge=0)
    client_discount: float | None = Field(default=None, ge=0)
    client_shipping: float | None = Field(default=None, ge=0)
    client_total: float | None = Field(default=None, ge=0)


class OrderItemOut(BaseModel):
    id: int
    order_id: str
    sku: str
    size: str
    qty: int
    price: float
    offer_flag: bool
    seller_id: str


class OrderOut(BaseModel):
    id: str
    user_id: str
    customer_name: str
    status: str
    payment: str
    delivery_label: str
    delivery_price: float
    subtotal: float
    discount: float
    shipping: float
    total: float
    placed_at: str
    address: str
    contact: str
    tracking: list
    items: list[OrderItemOut] = []
