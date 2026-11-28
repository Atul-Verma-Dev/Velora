import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, SlidersHorizontal, X } from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { categories } from "../data/catalog.js";
import { activeFilterCount, applyFilters, buildFacets, emptyFilters, SORT_OPTIONS } from "../lib/filters.js";
import FilterPanel, { activeChips } from "../components/FilterPanel.jsx";
import ProductCard from "../components/ProductCard.jsx";
import { Breadcrumbs, Btn, Chip, Drawer, EmptyState, SectionHead } from "../components/ui.jsx";

// The URL is the single source of truth for filters, so Back from a product restores the
// exact view and any filtered list is shareable. Short keys keep links readable.
const ARRAY_KEYS = { gender: "gender", category: "category", subcategory: "subcategory", brands: "brand", sizes: "size", colours: "colour", occasions: "occasion", fabrics: "fabric", fits: "fit" };
const SCALAR_KEYS = { priceMin: "min", priceMax: "max", rating: "rating", discount: "discount" };

const defaultSort = (mode) => (mode === "new" ? "new" : "recommended");

const fromParams = (params, mode) => {
  const f = { ...emptyFilters };
  Object.entries(ARRAY_KEYS).forEach(([key, param]) => { f[key] = params.getAll(param).filter(Boolean); });
  Object.entries(SCALAR_KEYS).forEach(([key, param]) => { f[key] = params.get(param) || ""; });
  f.inStock = params.get("instock") === "1";
  const sort = params.get("sort");
  f.sort = SORT_OPTIONS.some((s) => s.id === sort) ? sort : defaultSort(mode);
  return f;
};

const toParams = (f, mode) => {
  const p = new URLSearchParams();
  Object.entries(ARRAY_KEYS).forEach(([key, param]) => (f[key] || []).forEach((v) => p.append(param, v)));
  Object.entries(SCALAR_KEYS).forEach(([key, param]) => { if (f[key]) p.set(param, f[key]); });
  if (f.inStock) p.set("instock", "1");
  if (f.sort && f.sort !== defaultSort(mode)) p.set("sort", f.sort);
  return p;
};

const COPY = {
  "Ethnic Wear": {
    title: "Ethnic wear",
    lede: "Hand-block prints, chikankari, Kanjivaram silk and occasion pieces — with fabric and craft detail on every listing.",
  },
  "Western Wear": {
    title: "Western wear",
    lede: "Tailoring-led shirts, dresses, denim and knitwear for everyday and the office, made in small batches.",
  },
  Footwear: { title: "Footwear", lede: "Leather loafers, derbies and canvas trainers from Indian workshops." },
  Accessories: { title: "Accessories", lede: "Dupattas, watches, bags and jewellery that finish the look." },
};

export default function Listing({ mode = "shop" }) {
  const { products, fitProfile } = useApp();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => fromParams(params, mode), [params, mode]);
  const setFilters = useCallback(
    (next) => {
      const value = typeof next === "function" ? next(filters) : next;
      setParams(toParams({ ...emptyFilters, ...value }, mode), { replace: true, state: { keep: true } });
    },
    [filters, mode, setParams]
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [visible, setVisible] = useState(12);

  const live = useMemo(() => products.filter((p) => p.status === "live"), [products]);
  const isNew = mode === "new";
  const base = useMemo(
    () => (isNew ? live.filter((p) => p.addedDaysAgo <= 21) : live),
    [live, isNew]
  );
  const facets = useMemo(() => buildFacets(base), [base]);
  const results = useMemo(() => applyFilters(base, filters), [base, filters]);
  const count = activeFilterCount(filters);

  const paramKey = params.toString();
  useEffect(() => { setVisible(12); }, [paramKey]);

  const primary = isNew ? null : filters.category[0] || null;
  const heading = isNew
    ? "New in"
    : filters.subcategory.length === 1
    ? filters.subcategory[0]
    : filters.gender.length === 1 && !primary
    ? `${filters.gender[0]}’s edit`
    : primary || "All of Velora";
  const copy = isNew
    ? { lede: "The newest pieces to land from our partner studios, in the order they arrived." }
    : COPY[primary] || {
        title: heading,
        lede: filters.gender.length ? `Considered pieces for ${filters.gender[0].toLowerCase()}, from independent Indian labels.` : "Every live piece across Velora's partner studios, in one place.",
      };
  const dept = categories.find((c) => c.label === primary);
  const subcategoryLinks = dept?.children || [];

  const toggleArray = (key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  const clearAll = () => setFilters({ ...emptyFilters, sort: filters.sort });
  const chips = activeChips(filters, setFilters, facets);

  return (
    <main id="main" className="page-shell listing-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Shop", to: "/shop" }, { label: heading }]} />

      <header className="listing-head">
        <div>
          <span className="eyebrow">{isNew ? "JUST IN" : primary ? "COLLECTION" : "ALL PRODUCTS"}</span>
          <h1>{heading}</h1>
          <p>{copy.lede}</p>
        </div>
        <div className="listing-head-meta">
          <span>{results.length} styles</span>
          {fitProfile && <span className="fit-on">Fit profile on</span>}
        </div>
      </header>

      {(subcategoryLinks.length > 0 || filters.gender.length > 0) && (
        <div className="subcat-strip" aria-label="Browse types">
          {filters.gender.length === 1 && (
            <Chip active={!filters.category.length} onClick={() => setFilters((f) => ({ ...f, category: [], subcategory: [] }))}>
              All {filters.gender[0].toLowerCase()}’s
            </Chip>
          )}
          {(subcategoryLinks.length ? subcategoryLinks : facets.subcategories.map((s) => s.value)).map((link) => (
            <Chip
              key={link}
              active={filters.subcategory.includes(link)}
              onClick={() => toggleArray("subcategory", link)}
            >
              {link}
            </Chip>
          ))}
        </div>
      )}

      <div className="listing-toolbar">
        <button type="button" className="filter-trigger mobile-only" onClick={() => setDrawerOpen(true)}>
          <SlidersHorizontal size={16} /> Filters {count > 0 && <i>{count}</i>}
        </button>
        <span className="toolbar-count">{results.length} {results.length === 1 ? "style" : "styles"}{filters.subcategory.length ? ` in ${filters.subcategory.join(", ")}` : ""}</span>
        <label className="sort-control">
          <span>Sort by</span>
          <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} aria-label="Sort products">
            {SORT_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <div className="active-chips">
          {chips.map((c) => <Chip key={c.key} active onRemove={c.onRemove}>{c.label}</Chip>)}
          <button type="button" className="clear-all" onClick={clearAll}>Clear all</button>
        </div>
      )}

      <div className="listing-layout">
        <aside className="listing-sidebar desktop-only" aria-label="Filters">
          <div className="filter-head">
            <b>Filters</b>
            {count > 0 && <button type="button" onClick={clearAll}>Clear all ({count})</button>}
          </div>
          <FilterPanel facets={facets} filters={filters} setFilters={setFilters} />
        </aside>

        <div className="listing-results">
          {results.length === 0 ? (
            <EmptyState
              icon={<X size={22} />}
              title="No pieces match those filters"
              body="Try widening the price range or removing a fabric or size filter. Our full catalogue is still a good place to start."
              action={<Btn variant="dark" onClick={clearAll}>Clear all filters</Btn>}
            />
          ) : (
            <>
              <div className="product-grid cols-4 listing-grid">
                {results.slice(0, visible).map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
              {visible < results.length && (
                <div className="load-more">
                  <p>Showing {Math.min(visible, results.length)} of {results.length}</p>
                  <Btn variant="outline" onClick={() => setVisible((v) => v + 12)} iconRight={<ArrowRight size={15} />}>
                    Load more pieces
                  </Btn>
                </div>
              )}
            </>
          )}

          {!isNew && results.length > 0 && (
            <div className="listing-note">
              <span className="eyebrow">BUYING NOTE</span>
              <p>
                Colours can read differently screen to screen, and hand-block or handloom pieces carry
                small variations by nature. Fit guidance is an estimate built from garment measurements,
                intended ease and fabric behaviour.
              </p>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filters & sorting"
        side="bottom"
        footer={
          <div className="drawer-actions">
            <button type="button" className="btn btn-ghost" onClick={clearAll}>Clear all</button>
            <button type="button" className="btn btn-dark" onClick={() => setDrawerOpen(false)}>
              Show {results.length} styles
            </button>
          </div>
        }
      >
        <label className="sort-control mobile-sort">
          <span>Sort by</span>
          <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
            {SORT_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <FilterPanel facets={facets} filters={filters} setFilters={setFilters} />
      </Drawer>
    </main>
  );
}
