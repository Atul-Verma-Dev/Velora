// Fit API client — flag-gated backend integration.
//
// Mirrors the local fit.js contract so Fit.jsx can call the backend fit
// recommendation endpoint when VITE_API_BACKEND=true, falling back to the
// local recommend() in lib/fit.js.
//
// Endpoint:
//   POST /api/v1/fit/recommend — advisory fit recommendation for a product + profile
import { api, isBackendEnabled } from "./client.js";

export function backendEnabled() {
  return isBackendEnabled();
}

export async function fitRecommend(productSku, profile) {
  if (!isBackendEnabled()) return null;
  return api.post("/api/v1/fit/recommend", {
    product_sku: productSku,
    profile,
  });
}
