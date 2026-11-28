// Complete the Look — inventory-aware cart styling.
//
// Candidate rules (demo implementation of the blueprint):
//   • stock age > 60 days (received-lot age in demo data)
//   • sellable quantity in the shopper's selected size, or a one-size accessory
//   • occasion + colour compatibility
//   • offer price = max(age-tier price, COGS + marginal shipping)
//   • the deepest tier requires the configured cart-value gate
// Shoppers never see COGS, age, margin or internal tier names.

import { stockForSize } from "../data/catalog.js";
import { linePrice } from "./format.js";

export const OFFER_TIERS = [
  { min: 60, max: 90, discount: 0.3, label: "Stylist pairing" },
  { min: 90, max: 120, discount: 0.45, label: "VIP bundle" },
  { min: 120, max: Infinity, discount: 0.6, label: "End-of-season" },
];

export const tierFor = (age) => OFFER_TIERS.find((t) => age >= t.min && age < t.max) || OFFER_TIERS[0];

export const floorPrice = (product, config = {}) =>
  Math.round((product.cogs || product.price * 0.35) + (product.marginalShipping || 40) + (config.extraCostPerUnit || 0));

// Tier prices are a discount off MRP, exactly like the backend pricing engine
// (app/services/pricing.py). Floor = COGS + marginal shipping.
export function offerPrice(product, config = {}) {
  const tier = tierFor(product.stockAgeDays);
  const tierPrice = Math.round(product.mrp * (1 - tier.discount));
  return { tier, price: Math.max(tierPrice, floorPrice(product, config)), tierPrice, floor: floorPrice(product, config) };
}

// Server-side style check used when an offer is added and again at order time.
export function offerStillValid(product, line, config = {}) {
  if (!product || product.status !== "live" || config.offersEnabled === false) return false;
  if ((product.stockAgeDays || 0) < 60) return false;
  return line.price >= floorPrice(product, config) && line.price < product.mrp;
}

const COLOUR_TONE = {
  Yellow: ["Yellow", "Gold", "Beige", "Ivory", "Rust"],
  Green: ["Green", "Ivory", "Gold", "Beige", "Rust"],
  Ivory: ["Ivory", "Gold", "Rust", "Pink", "Green"],
  Blue: ["Blue", "Ivory", "Silver", "Gold", "Pink"],
  Pink: ["Pink", "Ivory", "Gold", "Green", "Rust"],
  Rust: ["Rust", "Ivory", "Gold", "Green", "Beige"],
  Black: ["Black", "Silver", "Gold", "Ivory", "White"],
  Grey: ["Grey", "Black", "White", "Silver", "Blue"],
  Beige: ["Beige", "Ivory", "Brown", "Green", "Gold"],
  Brown: ["Brown", "Beige", "Ivory", "Gold", "Green"],
  Gold: ["Gold", "Ivory", "Rust", "Pink", "Black"],
  Silver: ["Silver", "Black", "White", "Blue", "Grey"],
  White: ["White", "Beige", "Blue", "Black", "Gold"],
};

export function visualCompatibility(candidate, base) {
  if (!base) return 0;
  let score = 0;
  if ((COLOUR_TONE[base.colorFamily] || []).includes(candidate.colorFamily)) score += 0.34;
  if (candidate.colorFamily === base.colorFamily) score += 0.08;
  const occ = candidate.occasion.filter((o) => base.occasion.includes(o));
  if (occ.length) score += 0.3;
  if (candidate.gender === base.gender || candidate.gender === "Unisex" || base.gender === "Unisex") score += 0.12;
  const complementary = {
    "Kurta Sets": ["Dupattas", "Jewellery", "Footwear"],
    Sarees: ["Jewellery", "Dupattas", "Footwear"],
    Lehengas: ["Jewellery", "Dupattas", "Footwear"],
    Anarkalis: ["Dupattas", "Jewellery"],
    Dresses: ["Footwear", "Bags", "Jewellery"],
    Shirts: ["Trousers", "Denim", "Footwear", "Watches"],
    "Tops & Shirts": ["Trousers", "Denim", "Footwear"],
    Knitwear: ["Trousers", "Denim", "Footwear"],
    Trousers: ["Shirts", "Knitwear", "Footwear"],
    Denim: ["Shirts", "Knitwear", "Footwear"],
    "Co-ords": ["Jewellery", "Footwear", "Bags"],
    Outerwear: ["Knitwear", "Shirts", "Footwear"],
    Footwear: ["Trousers", "Denim", "Accessories"],
  };
  if ((complementary[base.subcategory] || []).includes(candidate.subcategory)) score += 0.26;
  if (candidate.id === base.id) score = 0;
  return Math.round(Math.min(1, score) * 100) / 100;
}

export function completeTheLook(products, cart, config = {}, profile = null) {
  if (!cart.length || config.offersEnabled === false) return [];
  const bases = cart
    .map((line) => ({ line, product: products.find((p) => p.id === line.productId) }))
    .filter((x) => x.product);
  if (!bases.length) return [];

  const cartIds = new Set(cart.map((l) => l.productId));
  const subtotal = bases.reduce((s, b) => s + linePrice(b.line, b.product) * b.line.qty, 0);
  const gate = config.deepBundleGate ?? 2000;
  const primaryOccasion = bases
    .flatMap((b) => b.product.occasion)
    .sort((a, b) =>
      bases.flatMap((x) => x.product.occasion).filter((o) => o === b).length -
      bases.flatMap((x) => x.product.occasion).filter((o) => o === a).length
    )[0];

  const candidates = [];
  products
    .filter((p) => p.status === "live" && p.stock > 0 && !cartIds.has(p.id))
    .forEach((candidate) => {
      if (candidate.stockAgeDays < 60) return;

      const base = bases
        .map((b) => ({ product: b.product, compat: visualCompatibility(candidate, b.product), line: b.line }))
        .sort((a, b) => b.compat - a.compat)[0];
      if (!base || base.compat < 0.62) return;

      // Size availability: exact selected size where both are sized, or one-size.
      let size = "One size";
      if (candidate.sizes.length === 1) size = candidate.sizes[0];
      else {
        const sizeMatch = bases.find((b) => b.line.size && candidate.sizes.includes(b.line.size));
        if (!sizeMatch) return;
        size = sizeMatch.line.size;
      }

      // Real units in the exact size — never a rounded guess.
      const stockForVariant = Math.min(candidate.stock, stockForSize(candidate, size));
      if (stockForVariant < 1) return;

      const { tier, price } = offerPrice(candidate, config);
      if (price >= candidate.mrp) return; // never "discount" upward
      if (tier.discount >= 0.6 && subtotal < gate) return;

      candidates.push({
        product: candidate,
        baseProduct: base.product,
        size,
        compat: base.compat,
        price,
        mrp: candidate.mrp,
        saving: candidate.mrp - price,
        reason: reasonFor(base.product, candidate),
        tierLabel: "Complete the look",
        stockAvailable: stockForVariant,
      });
    });

  return candidates
    .sort((a, b) => b.compat - a.compat || b.saving - a.saving)
    .slice(0, 3)
    .map((c) => ({ ...c, occasion: primaryOccasion }));
}

function reasonFor(base, candidate) {
  const occasion = candidate.occasion.find((o) => base.occasion.includes(o)) || candidate.occasion[0];
  if (candidate.subcategory === "Dupattas")
    return `A ${candidate.color.toLowerCase()} dupatta that finishes the ${base.color.toLowerCase()} ${base.subcategory.toLowerCase()} for ${occasion.toLowerCase()} wear.`;
  if (candidate.subcategory === "Jewellery")
    return `Tonal ${candidate.color.toLowerCase()} jewellery that lifts the neckline without competing with the print.`;
  if (candidate.category === "Footwear")
    return `A ${candidate.color.toLowerCase()} sole grounds the look and works for ${occasion.toLowerCase()} occasions.`;
  if (candidate.subcategory === "Trousers" || candidate.subcategory === "Denim")
    return `A clean, complementary bottom that balances the ${base.color.toLowerCase()} top.`;
  if (candidate.subcategory === "Shirts" || candidate.subcategory === "Knitwear")
    return `Layers neatly under or over the ${base.name.toLowerCase()} in a compatible palette.`;
  return `Matches the ${occasion.toLowerCase()} register and the ${base.color.toLowerCase()} palette.`;
}
