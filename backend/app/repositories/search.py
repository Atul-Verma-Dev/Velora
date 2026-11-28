"""Repository layer for search event logging."""

import json

from app.core.db import db_cursor


def log_search_event(
    *,
    query: str,
    has_image: bool,
    result_count: int,
    excluded: dict,
    duration_ms: int,
) -> int:
    with db_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO search_events (query, has_image, result_count, excluded, duration_ms)
            VALUES (%s, %s, %s, %s::jsonb, %s)
            RETURNING id
            """,
            (query, has_image, result_count, json.dumps(excluded), duration_ms),
        )
        return int(cur.fetchone()["id"])


def get_search_events(limit: int = 60):
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, query, has_image, result_count, excluded, duration_ms, created_at
            FROM search_events
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cur.fetchall()


def search_metrics() -> dict:
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE result_count = 0) AS zero_result,
                COALESCE(ROUND(AVG(duration_ms))::int, 0) AS avg_latency_ms,
                COUNT(*) FILTER (WHERE has_image) AS with_image
            FROM search_events
            """
        )
        return dict(cur.fetchone())
