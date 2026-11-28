// Product catalogue API client — flag-gated backend integration.
//
// Mirrors the local seed catalogue so product listings and detail pages
// can come from the backend when VITE_API_BACKEND=true, falling back to
// local seed data.
//
// Endpoints:
//   GET  /api/v1/products?category=...&subcategory=...&seller_id=...&status=...&limit=...&offset=...
//   GET  /api/v1/products/{sku}
import { api, isBackendEnabled } from "./client.js";

export function backendEnabled() {
  return isBackendEnabled();
}

export async function getProducts({ category, subcategory, sellerId, status = "live", minStock = 0, limit = 100, offset = 0 } = {}) {
  if (!isBackendEnabled()) return null;
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (subcategory) params.set("subcategory", subcategory);
  if (sellerId) params.set("seller_id", sellerId);
  if (status) params.set("status", status);
  if (minStock > 0) params.set("min_stock", String(minStock));
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return api.get(`/api/v1/products?${params.toString()}`);
}

export async function getProduct(sku) {
  if (!isBackendEnabled()) return null;
  return api.get(`/api/v1/products/${encodeURIComponent(sku)}`);
}

// Map a backend product row to the frontend product shape used by ProductCard
// and PartnerHub. Fields the backend does not provide (rating, reviewCount,
// per-size stock) get safe defaults.
export function toFrontendProduct(row) {
  const sizeEntries = Array.isArray(row.sizes) ? row.sizes : [];

  const sizes = sizeEntries
    .map((entry) =>
      typeof entry === "string" ? entry : entry?.size
    )
    .filter(Boolean);

  const sizeStockEntries = sizeEntries.filter(
    (entry) =>
      typeof entry === "object" && entry !== null && entry.size != null
  );

  const sizeStock = Object.fromEntries(
    sizeStockEntries.map((entry) => [entry.size, Number(entry.stock ?? 0)])
  );

  return {
    id: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    color: row.colour || "",
    colorFamily: row.colour_family || null,
    image: row.image_url || "",
    price: Number(row.price || 0),
    mrp: Number(row.mrp || 0),
    stock: Number(row.stock || 0),
    status: row.status || "live",
    sellerId: row.seller_id || "",
    sellerName: row.brand || "",
    sizes: sizes,
    // Preserve actual database per-size inventory.
    sizeStock: sizeStockEntries.length ? sizeStock : undefined,
    occasion: row.occasion || [],
    fabric: row.fabric || "",
    pattern: row.pattern || "",
    fit: row.fit || "",
    // The fit engine compares finished measurements against the intended ease
    // and fabric stretch, so keep the API values instead of defaulting them.
    fitEase: row.fit_ease || "regular",
    stretch: row.stretch || "low",
    length: row.length || "",
    description: row.description || "",
    tags: row.tags || [],
    rating: 0,
    reviewCount: 0,
    addedDaysAgo: Number(row.added_days_ago || 0),
    stockAgeDays: Number(row.days_in_inventory || 0),
    unitsSold30d: Number(row.units_sold_30d || 0),
    cogs: Number(row.cogs || 0),
    marginalShipping: Number(row.marginal_shipping || 45),
    colorHex: row.colour_hex || "#cccccc",
    images: row.images || [row.image_url],
  };
}
