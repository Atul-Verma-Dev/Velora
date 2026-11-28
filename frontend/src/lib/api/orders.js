// Order API client — flag-gated backend integration.
//
// Mirrors the local placeOrder in AppStore so orders can be placed through
// the FastAPI backend when VITE_API_BACKEND=true, falling back to local
// state. The backend handles order creation, order items, and stock
// decrement atomically.
//
// Endpoints:
//   POST /api/v1/orders
import { api, isBackendEnabled } from "./client.js";

export function backendEnabled() {
  return isBackendEnabled();
}

export async function placeOrder(order) {
  if (!isBackendEnabled()) return null;
  return api.post("/api/v1/orders", order);
}
