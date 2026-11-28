// Seller & inventory API client — flag-gated backend integration.
//
// Mirrors the local PartnerHub / Operations data so seller metrics,
// liquidation feed, and inventory aging can come from the backend when
// VITE_API_BACKEND=true, falling back to local state.
//
// Endpoints:
//   GET  /api/v1/seller/{seller_id}/metrics
//   GET  /api/v1/seller/{seller_id}/liquidation?min_age=60
//   GET  /api/v1/inventory/aging?min_age=60&limit=100
import { api, isBackendEnabled } from "./client.js";

export function backendEnabled() {
  return isBackendEnabled();
}

export async function sellerMetrics(sellerId) {
  if (!isBackendEnabled()) return null;
  return api.get(`/api/v1/seller/${encodeURIComponent(sellerId)}/metrics`);
}

export async function sellerLiquidation(sellerId, minAge = 60) {
  if (!isBackendEnabled()) return null;
  return api.get(`/api/v1/seller/${encodeURIComponent(sellerId)}/liquidation?min_age=${minAge}`);
}

// Realised Complete-the-Look outcomes: capital liquidated from aging stock and the
// reverse-logistics cost avoided on those units.
export async function sellerLiquidationSummary(sellerId) {
  if (!isBackendEnabled()) return null;
  return api.get(`/api/v1/seller/${encodeURIComponent(sellerId)}/liquidation/summary`);
}

export async function agingInventory(minAge = 60, limit = 100) {
  if (!isBackendEnabled()) return null;
  return api.get(`/api/v1/inventory/aging?min_age=${minAge}&limit=${limit}`);
}
