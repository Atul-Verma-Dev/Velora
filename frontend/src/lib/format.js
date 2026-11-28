export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(n) || 0));

export const discountPct = (price, mrp) =>
  mrp && mrp > price ? Math.round((1 - price / mrp) * 100) : 0;

export const FREE_SHIPPING_THRESHOLD = 1499;

// Coupon rules live in one place so Bag, Checkout and the order agree.
export const COUPON_MIN_BAG = 1999;
export const couponValue = (coupon, subtotal) =>
  coupon && coupon.code === "VELORA10" && subtotal >= COUPON_MIN_BAG ? Math.round(subtotal * 0.1) : 0;

// Offer lines keep the price they were added at; everything else tracks the live price.
export const linePrice = (line, product) => (line.offer ? line.price : product?.price ?? line.price);

export const shippingFor = (subtotal) => (subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : 79);

export const formatDate = (d = new Date()) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const pluralise = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Supports both product ids and readable slugs in URLs.
export function findProduct(products, idOrSlug) {
  if (!idOrSlug) return null;
  let key = String(idOrSlug);
  try { key = decodeURIComponent(key); } catch { /* malformed escape — fall back to the raw segment */ }
  key = key.toLowerCase();
  return (
    products.find((p) => p.id.toLowerCase() === key) ||
    products.find((p) => slugify(`${p.name}`) === key) ||
    null
  );
}

// "Women" and "Men" are departments (a gender filter); the rest are categories.
export const departmentHref = (label) =>
  ["Women", "Men", "Kids"].includes(label)
    ? `/shop?gender=${encodeURIComponent(label)}`
    : `/shop?category=${encodeURIComponent(label)}`;

export const productPath = (p) => `/product/${p.id}`;

export const pincodeEta = (pincode) => {
  if (!/^\d{6}$/.test(pincode)) return null;
  const zone = Number(pincode[0]);
  const days = zone <= 2 ? 3 : zone <= 4 ? 4 : zone <= 6 ? 5 : 7;
  return `${days}–${days + 1} business days`;
};
