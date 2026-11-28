"""Application logging configuration."""

import logging
import sys

from app.core.config import get_settings


def setup_logging() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [velora] %(name)s: %(message)s",
        stream=sys.stdout,
    )
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("psycopg2").setLevel(logging.WARNING)
