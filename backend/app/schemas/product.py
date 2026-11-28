"""Pydantic schemas for product domain."""

from pydantic import BaseModel, Field


class ProductSizeBase(BaseModel):
    size: str = Field(..., min_length=1, max_length=32)
    stock: int = Field(default=0, ge=0)


class ProductBase(BaseModel):
    sku: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    brand: str = Field(..., min_length=1)
    gender: str | None = None
    category: str
    subcategory: str
    colour: str | None = None
    colour_family: str | None = None
    colour_hex: str | None = None
    fabric: str | None = None
    pattern: str | None = None
    neckline: str | None = None
    sleeve: str | None = None
    fit: str | None = None
    fit_ease: str | None = None
    stretch: str | None = None
    length: str | None = None
    occasion: list[str] = Field(default_factory=list)
    care: str | None = None
    origin: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    image_url: str | None = None
    images: list[str] = Field(default_factory=list)
    mrp: float = Field(..., ge=0)
    price: float = Field(..., ge=0)
    cogs: float = Field(..., ge=0)
    marginal_shipping: float = Field(default=45, ge=0)
    stock: int = Field(default=0, ge=0)
    days_in_inventory: int = Field(default=0, ge=0)
    units_sold_30d: int = Field(default=0, ge=0)
    seller_id: str
    status: str = Field(default="live")
    is_featured: bool = False
    added_days_ago: int = Field(default=0, ge=0)
    sizes: list[ProductSizeBase] = Field(default_factory=list)


class Product(ProductBase):
    class Config:
        from_attributes = True


class ProductListItem(BaseModel):
    sku: str
    name: str
    brand: str
    category: str
    subcategory: str
    colour: str | None
    colour_family: str | None
    image_url: str | None
    mrp: float
    price: float
    stock: int
    days_in_inventory: int
    seller_id: str
    status: str

    class Config:
        from_attributes = True
