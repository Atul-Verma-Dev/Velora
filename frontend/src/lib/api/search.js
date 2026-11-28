// Search API client — flag-gated backend integration.
//
// Mirrors the local search.js contract so Search.jsx can log events to the
// backend when VITE_API_BACKEND=true, falling back to local-only logging.
//
// Endpoints:
//   POST /api/v1/search/log   — log a search event
//   GET  /api/v1/search/events — recent search events
//   GET  /api/v1/search/metrics — search metrics
//   GET  /api/v1/search/products — server-side product search (fallback)
import { api, isBackendEnabled } from "./client.js";

export function backendEnabled() {
  return isBackendEnabled();
}

export async function logSearchEvent(entry) {
  if (!isBackendEnabled()) return null;
  return api.post("/api/v1/search/log", {
    query: entry.query || "",
    has_image: Boolean(entry.hasImage),
    result_count: entry.resultCount || 0,
    excluded: entry.excluded || {},
    duration_ms: entry.durationMs || 0,
  });
}

export async function getSearchEvents(limit = 60) {
  if (!isBackendEnabled()) return null;
  return api.get(`/api/v1/search/events?limit=${limit}`);
}

export async function getSearchMetrics() {
  if (!isBackendEnabled()) return null;
  return api.get("/api/v1/search/metrics");
}

export async function searchProducts({ q, category, subcategory, limit = 20 }) {
  if (!isBackendEnabled()) return null;
  const params = new URLSearchParams({ limit: String(limit) });
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (subcategory) params.set("subcategory", subcategory);
  return api.get(`/api/v1/search/products?${params}`);
}
