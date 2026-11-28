"""Pydantic schemas for fit confidence engine."""

from pydantic import BaseModel, Field


class FitProfileIn(BaseModel):
    height: float = Field(..., ge=100, le=250, description="Height in cm")
    weight: float = Field(..., ge=25, le=200, description="Weight in kg")
    shape: str = Field(..., description="Balanced | Triangle | Inverted triangle | Oval | Hourglass")
    anchor_brand: str = Field(..., min_length=1)
    usual_size: str = Field(..., min_length=1)
    fit_preference: str = Field(default="regular", description="snug | regular | loose")
    mode: str = Field(default="fast", description="fast | precision")
    measurements: dict | None = Field(default=None, description="chest/waist/hip/footLengthCm for precision mode")


class ZoneFitOut(BaseModel):
    zone: str
    fit: str
    tone: str


class SizeRankingOut(BaseModel):
    size: str
    score: float
    zones: list[ZoneFitOut]


class FitRecommendOut(BaseModel):
    size: str
    confidence: str
    zones: list[ZoneFitOut]
    explanation: str
    ranked: list[SizeRankingOut]
    note: str
    advisory: bool = True


class FitRecommendResponse(BaseModel):
    product_sku: str
    profile: FitProfileIn
    recommendation: FitRecommendOut | None


class FitRecommendRequest(BaseModel):
    product_sku: str = Field(..., min_length=1, description="Product SKU")
    profile: FitProfileIn
