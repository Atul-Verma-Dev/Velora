// Complete the Look — backend-backed recommendations.
//
// Mirrors the local ctl.js contract so Cart.jsx can consume either source
// with minimal changes. Each recommendation includes the fields the UI expects:
//   product, size, compat, price, mrp, saving, reason, tierLabel, stockAvailable
import { api, isBackendEnabled } from "./client.js";

export function backendEnabled() {
  return isBackendEnabled();
}

// Convert a backend recommendation into the shape Cart.jsx expects.
function toOffer(rec) {
  return {
    product: {
      id: rec.sku,
      name: rec.name,
      brand: rec.brand,
      image: rec.image_url,
      color: rec.colour,
      colorFamily: rec.colour_family,
      subcategory: rec.subcategory || null,
      category: rec.category || null,
      occasion: rec.occasion || [],
      mrp: rec.mrp,
      price: rec.price,
      sellerName: rec.brand,
    },
    baseProduct: {
      id: rec.base_sku,
    },
    size: rec.size,
    compat: rec.compat_score,
    price: rec.price,
    mrp: rec.mrp,
    saving: rec.saving,
    reason: rec.reason,
    tierLabel: rec.tier_label,
    stockAvailable: rec.stock_available,
    recommendationId: rec.recommendation_id,
    _source: "backend",
  };
}

export async function fetchBundleRecommendations(cartItems, cartSubtotal, limit = 3) {
  if (!isBackendEnabled()) return null;

  const payload = {
    cart_items: cartItems.map((c) => ({
      sku: c.productId,
      size: c.size,
      qty: c.qty,
    })),
    cart_subtotal: cartSubtotal,
    limit,
  };

  const data = await api.post("/api/v1/bundles/recommend", payload);
  return (data.recommendations || []).map(toOffer);
}

export async function acceptBundle(recommendationId) {
  if (!isBackendEnabled()) return null;
  return api.post("/api/v1/bundles/accept", { recommendation_id: recommendationId });
}

export async function rejectBundle(recommendationId) {
  if (!isBackendEnabled()) return null;
  return api.post("/api/v1/bundles/reject", { recommendation_id: recommendationId });
}
