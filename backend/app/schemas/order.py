"""Pydantic schemas for order domain."""

from pydantic import BaseModel, Field


class OrderItemIn(BaseModel):
    sku: str = Field(..., min_length=1)
    size: str = Field(..., min_length=1, max_length=32)
    qty: int = Field(..., ge=1)


class OrderIn(BaseModel):
    user_id: str = Field(default="user-demo", min_length=1)
    customer_name: str = Field(..., min_length=1)
    contact: str = Field(..., min_length=1)
    address: str = Field(..., min_length=1)
    payment: str = Field(..., min_length=1)
    delivery: str = Field(..., min_length=1)
    items: list[OrderItemIn] = Field(..., min_length=1)
    subtotal: float = Field(..., ge=0)
    discount: float = Field(default=0, ge=0)
    shipping: float = Field(default=0, ge=0)
    total: float = Field(..., ge=0)


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
