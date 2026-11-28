"""Pydantic schemas for bundle recommendations (Complete the Look)."""

from pydantic import BaseModel, Field


class CartItemIn(BaseModel):
    sku: str = Field(..., min_length=1)
    size: str = Field(..., min_length=1)
    qty: int = Field(default=1, ge=1)


class BundleRecommendRequest(BaseModel):
    cart_items: list[CartItemIn] = Field(..., min_length=1)
    cart_subtotal: float | None = Field(default=None, ge=0)
    limit: int = Field(default=3, ge=1, le=10)


class BundleRecommendationOut(BaseModel):
    recommendation_id: int = Field(description="Database-generated recommendation ID")
    sku: str
    name: str
    brand: str
    image_url: str | None
    colour: str | None
    colour_family: str | None
    size: str
    compat_score: float = Field(ge=0, le=1)
    mrp: float = Field(description="Original price (MRP)")
    price: float = Field(description="Actual final selling price after discount + floor")
    discount_pct: int = Field(description="Actual discount percentage applied")
    saving: float = Field(description="MRP minus final price")
    reason: str
    tier_label: str
    stock_available: int

    class Config:
        from_attributes = True


class BundleRecommendResponse(BaseModel):
    recommendations: list[BundleRecommendationOut]
    cart_subtotal: float
    deep_bundle_gate: int
    gate_met: bool
    offers_enabled: bool


class BundleAcceptRequest(BaseModel):
    recommendation_id: int


class BundleAcceptResponse(BaseModel):
    accepted: bool
    recommendation_id: int
    message: str


class BundleRejectRequest(BaseModel):
    recommendation_id: int


class BundleRejectResponse(BaseModel):
    rejected: bool
    recommendation_id: int
    message: str
