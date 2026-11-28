"""Pydantic schemas for multimodal search."""

from pydantic import BaseModel, Field


class SearchIntentOut(BaseModel):
    query: str
    max_price: float | None = None
    min_price: float | None = None
    category: str | None = None
    subcategory: str | None = None
    gender: str | None = None
    colours: list[str] = Field(default_factory=list)
    occasions: list[str] = Field(default_factory=list)
    fabrics: list[str] = Field(default_factory=list)
    fits: list[str] = Field(default_factory=list)
    exclusions: dict = Field(default_factory=dict)
    keywords: list[str] = Field(default_factory=list)
    weights: dict = Field(default_factory=dict)


class SearchResultItemOut(BaseModel):
    sku: str
    name: str
    brand: str
    category: str
    subcategory: str
    colour: str | None
    colour_family: str | None
    image_url: str | None
    price: float
    mrp: float
    score: float
    signals: list[str] = Field(default_factory=list)


class SearchRequest(BaseModel):
    query: str = ""
    image_url: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class SearchResponse(BaseModel):
    results: list[SearchResultItemOut]
    intent: SearchIntentOut
    excluded: dict
    weights: dict
    no_results: bool


class SearchLogRequest(BaseModel):
    query: str = ""
    has_image: bool = False
    result_count: int = Field(default=0, ge=0)
    excluded: dict = Field(default_factory=dict)
    duration_ms: int = Field(default=0, ge=0)
