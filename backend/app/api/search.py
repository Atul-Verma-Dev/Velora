"""Search API endpoints."""

from fastapi import APIRouter

from app.repositories.product import list_products
from app.repositories.search import log_search_event, get_search_events, search_metrics
from app.schemas.search import SearchLogRequest

router = APIRouter()


@router.get("/products")
def search_products(
    q: str = "",
    category: str | None = None,
    subcategory: str | None = None,
    limit: int = 20,
):
    """Simple server-side product search by text match.

    This is a lightweight backend search that does NOT replace the frontend
    search engine (src/lib/search.js). It is provided for cases where a
    server-side fallback is needed.
    """
    rows = list_products(category=category, subcategory=subcategory, limit=limit)
    if not q:
        return {"results": rows, "query": q, "count": len(rows)}
    q_lower = q.lower()
    results = [
        r
        for r in rows
        if q_lower in (r.get("name") or "").lower()
        or q_lower in (r.get("brand") or "").lower()
        or q_lower in (r.get("category") or "").lower()
        or q_lower in (r.get("subcategory") or "").lower()
        or q_lower in (r.get("colour") or "").lower()
    ]
    return {"results": results, "query": q, "count": len(results)}


@router.post("/log")
def log_search(req: SearchLogRequest):
    """Log a search event.

    Accepts a JSON body matching SearchLogRequest. The previous scalar
    (query-parameter) signature is replaced so the frontend can POST JSON.
    """
    eid = log_search_event(
        query=req.query,
        has_image=req.has_image,
        result_count=req.result_count,
        excluded=req.excluded,
        duration_ms=req.duration_ms,
    )
    return {"id": eid}


@router.get("/events")
def search_events(limit: int = 60):
    return get_search_events(limit=limit)


@router.get("/metrics")
def search_metrics_endpoint():
    return search_metrics()
