"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgres://velora:velora_dev@127.0.0.1:5433/velora"

    # Google GenAI — configured but NOT yet implemented.
    # No vector search or embeddings are generated/used by the backend.
    # Metadata compatibility is the active fallback for aesthetic scoring.
    google_api_key: str = ""
    gen_model_embedding: str = "gemini-embedding-2"
    gen_model_flash: str = "gemini-3.5-flash-lite"

    # API
    api_base_url: str = "http://127.0.0.1:8000"
    debug: bool = True
    log_level: str = "INFO"

    # Complete the Look
    deep_bundle_gate: int = 2000
    offers_enabled: bool = True
    aesthetic_threshold: float = 0.78
    metadata_compat_threshold: float = 0.60
    default_marginal_shipping: int = 45

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
