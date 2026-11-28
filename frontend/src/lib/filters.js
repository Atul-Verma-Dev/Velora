import { stockForSize } from "../data/catalog.js";

export const SORT_OPTIONS = [
  { id: "recommended", label: "Recommended" },
  { id: "new", label: "Newest first" },
  { id: "price-low", label: "Price: low to high" },
  { id: "price-high", label: "Price: high to low" },
  { id: "rating", label: "Customer rating" },
  { id: "popular", label: "Popularity" },
  { id: "discount", label: "Discount" },
];

export const emptyFilters = {
  gender: [], category: [], subcategory: [], brands: [], sizes: [], colours: [],
  occasions: [], fabrics: [], fits: [], priceMin: "", priceMax: "",
  rating: "", discount: "", inStock: false, sort: "recommended",
};

export function activeFilterCount(f) {
  return (
    f.gender.length + f.category.length + f.subcategory.length + f.brands.length +
    f.sizes.length + f.colours.length + f.occasions.length + f.fabrics.length +
    f.fits.length + (f.priceMin ? 1 : 0) + (f.priceMax ? 1 : 0) +
    (f.rating ? 1 : 0) + (f.discount ? 1 : 0) + (f.inStock ? 1 : 0)
  );
}

export function applyFilters(products, f) {
  let out = products.filter((p) => p.status === "live");
  if (f.gender?.length) out = out.filter((p) => f.gender.includes(p.gender) || p.gender === "Unisex");
  if (f.category?.length) out = out.filter((p) => f.category.includes(p.category));
  if (f.subcategory?.length) out = out.filter((p) => f.subcategory.includes(p.subcategory));
  if (f.brands?.length) out = out.filter((p) => f.brands.includes(p.brand));
  if (f.sizes?.length) out = out.filter((p) => f.sizes.some((s) => p.sizes.includes(s)));
  if (f.colours?.length) out = out.filter((p) => f.colours.includes(p.colorFamily));
  if (f.occasions?.length) out = out.filter((p) => p.occasion.some((o) => f.occasions.includes(o)));
  if (f.fabrics?.length) out = out.filter((p) => f.fabrics.some((x) => p.fabric.toLowerCase().includes(x.toLowerCase())));
  if (f.fits?.length) out = out.filter((p) => f.fits.some((x) => p.fit.toLowerCase().includes(x.toLowerCase())));
  if (f.priceMin) out = out.filter((p) => p.price >= Number(f.priceMin));
  if (f.priceMax) out = out.filter((p) => p.price <= Number(f.priceMax));
  if (f.rating) out = out.filter((p) => p.rating >= Number(f.rating));
  if (f.discount) out = out.filter((p) => 1 - p.price / p.mrp >= Number(f.discount) / 100);
  if (f.inStock) out = out.filter((p) => p.stock > 0);

  const sorted = [...out];
  switch (f.sort) {
    case "price-low": sorted.sort((a, b) => a.price - b.price); break;
    case "price-high": sorted.sort((a, b) => b.price - a.price); break;
    case "rating": sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.reviewCount - a.reviewCount); break;
    case "popular": sorted.sort((a, b) => b.unitsSold30d - a.unitsSold30d); break;
    case "discount": sorted.sort((a, b) => (1 - b.price / b.mrp) - (1 - a.price / a.mrp)); break;
    case "new": sorted.sort((a, b) => a.addedDaysAgo - b.addedDaysAgo); break;
    default:
      sorted.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0) || (b.rating || 0) - (a.rating || 0));
  }
  return sorted;
}

const countBy = (items, keyFn) => {
  const map = new Map();
  items.forEach((item) => {
    const keys = [].concat(keyFn(item));
    keys.forEach((k) => {
      if (!k) return;
      map.set(k, (map.get(k) || 0) + 1);
    });
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
};

export function buildFacets(products) {
  const live = products.filter((p) => p.status === "live");
  const accessoriesOnly = live.every((p) => p.category === "Accessories" || p.category === "Footwear");
  return {
    genders: countBy(live, (p) => p.gender),
    categories: countBy(live, (p) => p.category),
    subcategories: countBy(live, (p) => p.subcategory),
    brands: countBy(live, (p) => p.brand),
    sizes: accessoriesOnly ? [] : countBy(live, (p) => p.sizes.filter((s) => s !== "One size")),
    colours: countBy(live, (p) => p.colorFamily),
    occasions: countBy(live, (p) => p.occasion),
    fabrics: countBy(live, (p) => p.fabric),
    fits: countBy(live, (p) => p.fit),
    maxPrice: Math.max(...live.map((p) => p.price)),
    minPrice: Math.min(...live.map((p) => p.price)),
  };
}

export const emptyStockCheck = (product, size) => stockForSize(product, size) > 0;
