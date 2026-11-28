"""Database connection management using psycopg2 parameterized SQL."""

import logging
from contextlib import contextmanager
from typing import Generator

from psycopg2 import pool
from psycopg2.extras import RealDictCursor

from app.core.config import get_settings

logger = logging.getLogger("velora.db")

_connection_pool: pool.AbstractConnectionPool | None = None


def init_db_pool() -> None:
    """Create the psycopg2 connection pool once at startup."""
    global _connection_pool
    if _connection_pool is not None:
        return
    settings = get_settings()
    logger.info("Initialising database pool for %s", settings.database_url)
    _connection_pool = pool.SimpleConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=settings.database_url,
    )


def close_db_pool() -> None:
    """Close all pooled connections."""
    global _connection_pool
    if _connection_pool is not None:
        _connection_pool.closeall()
        _connection_pool = None


def get_conn():
    """Return a pooled connection. Caller must return it via putconn or close it."""
    if _connection_pool is None:
        init_db_pool()
    assert _connection_pool is not None
    return _connection_pool.getconn()


def put_conn(conn) -> None:
    """Return a connection to the pool."""
    if _connection_pool is not None and conn is not None:
        _connection_pool.putconn(conn)


@contextmanager
def db_connection() -> Generator:
    """Context manager yielding a pooled connection and returning it on exit."""
    conn = get_conn()
    try:
        yield conn
    finally:
        put_conn(conn)


@contextmanager
def db_cursor(commit: bool = False):
    """Context manager yielding a RealDictCursor, with optional commit and rollback."""
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        put_conn(conn)
