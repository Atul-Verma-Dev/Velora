"""Velora FastAPI application.

Phase 1: inventory-aware stylist + margin-protection pricing engine.
Routes are mounted under /api/v1.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import close_db_pool, init_db_pool
from app.core.logging import setup_logging
from app.api import bundles, inventory, seller, products, search, fit, orders

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    init_db_pool()
    yield
    close_db_pool()


app = FastAPI(
    title="Velora Backend",
    version="1.0.0",
    description="Inventory-aware stylist and margin-protection pricing engine",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bundles.router, prefix="/api/v1/bundles", tags=["bundles"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["inventory"])
app.include_router(seller.router, prefix="/api/v1/seller", tags=["seller"])
app.include_router(products.router, prefix="/api/v1/products", tags=["products"])
app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
app.include_router(fit.router, prefix="/api/v1/fit", tags=["fit"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])


@app.get("/health")
async def health():
    return {"status": "ok"}
