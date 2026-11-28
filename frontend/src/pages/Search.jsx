import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle, ArrowRight, ArrowUpRight, Camera, Check, ChevronRight, Image as ImageIcon,
  Pencil, ScanLine, Search as SearchIcon, SlidersHorizontal, Sparkles, Trash2, Upload, Wand2, X,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { explainIntent, search as runSearch, threadB } from "../lib/search.js";
import { searchProducts, backendEnabled as searchBackendEnabled } from "../lib/api/search.js";
import { logSearchEvent } from "../lib/api/search.js";
import { categories } from "../data/catalog.js";
import { money } from "../lib/format.js";
import { applyFilters, buildFacets, emptyFilters, SORT_OPTIONS } from "../lib/filters.js";
import ProductCard from "../components/ProductCard.jsx";
import FilterPanel, { activeChips } from "../components/FilterPanel.jsx";
import { Badge, Breadcrumbs, Btn, Chip, Drawer, EmptyState, InfoNote, PageHead, Spinner } from "../components/ui.jsx";

const EXAMPLES = [
  "A pastel green kurta for a daytime wedding under ₹2,000",
  "An outfit suitable for an outdoor haldi ceremony",
  "A relaxed cotton shirt for everyday wear",
  "Find dresses similar to this picture",
  "Something handloom for a festive dinner, not red",
];

const ALL_OCCASIONS = ["Wedding", "Haldi", "Mehendi", "Festive", "Party", "Workwear", "Everyday", "Travel"];
const ALL_COLOURS = ["Yellow", "Green", "Ivory", "White", "Blue", "Pink", "Rust", "Black", "Grey", "Beige", "Brown", "Gold", "Silver"];

// Map a backend product row to the frontend product shape used by ProductCard.
// Backend and frontend schemas are intentionally not merged — this is a one-way
// adaptation for display only. Fields the backend does not provide (rating,
// reviewCount, per-size stock) get safe defaults.
function toFrontendProduct(row) {
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
    sizes: ["One size"],
    occasion: row.occasion || [],
    fabric: row.fabric || "",
    pattern: row.pattern || "",
    fit: row.fit || "",
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

export default function Search() {
  const { products, recordSearch, fitProfile } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fileRef = useRef(null);

  const [query, setQuery] = useState(params.get("q") || "");
  const [file, setFile] = useState(null);
  const [visual, setVisual] = useState(null);
  const [imageError, setImageError] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | reading | analysing | ranking | done
  const [result, setResult] = useState(null);
  const [duration, setDuration] = useState(0);
  const [interpretation, setInterpretation] = useState(null);
  const [editing, setEditing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [extraFilters, setExtraFilters] = useState(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState("recommended");

  const autoRan = useRef(false);

  const analyse = async (imageFile) => {
    try {
      const signals = await threadB(imageFile);
      setVisual(signals);
      setImageError("");
      return signals;
    } catch (err) {
      setImageError(err.message);
      return null;
    }
  };

  const run = async (imageFile = file) => {
    if (!query.trim() && !imageFile) return;
    const useBackend = searchBackendEnabled() && !imageFile;
    setPhase("reading");
    setResult(null);
    const started = performance.now();
    let signals = visual;
    if (imageFile && !signals) {
      setPhase("analysing");
      signals = await analyse(imageFile);
      if (!signals) {
        setPhase("idle");
        return;
      }
    }
    setPhase("ranking");
    await new Promise((r) => setTimeout(r, 260));

    let res;
    if (useBackend) {
      // Backend search is text-only — image search always stays local.
      const intent = runSearch(products, { query, visual: null, overrides: {} }).intent;
      const backendRes = await searchProducts({
        q: query.trim(),
        category: intent.category || undefined,
        subcategory: intent.subcategory || undefined,
        limit: 50,
      });
      if (!backendRes) {
        throw new Error("Backend search returned no data");
      }
      const results = (backendRes.results || []).map(toFrontendProduct);
      res = {
        results: results.map((p) => ({ product: p, score: 0, signals: ["backend match"], colourFromImage: false })),
        intent,
        excluded: { price: 0, category: 0, colour: 0, stock: 0, status: 0 },
        weights: { text: 1, image: 0 },
        no_results: results.length === 0,
      };
    } else {
      const resLocal = runSearch(products, { query, visual: signals, overrides: {} });
      res = resLocal;
    }
    const ms = Math.round(performance.now() - started);
    setDuration(ms);
    setInterpretation(res.intent);
    setResult(res);
    setPhase("done");
    setExtraFilters(emptyFilters);
    recordSearch({
      id: `s-${Date.now()}`,
      at: new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      query: query.trim() || "(image only)",
      hasImage: Boolean(imageFile),
      resultCount: res.results.length,
      excluded: res.excluded,
      durationMs: ms,
    });
    // Also log to backend when the flag is enabled — non-blocking, local log is authoritative.
    try {
      await logSearchEvent({
        query: query.trim() || "(image only)",
        hasImage: Boolean(imageFile),
        resultCount: res.results.length,
        excluded: res.excluded,
        durationMs: ms,
      });
    } catch {
      // Backend unavailable — local search log remains the source of truth.
    }
  };

  useEffect(() => {
    const stateFile = location.state?.imageFile;
    if (stateFile && !autoRan.current) {
      autoRan.current = true;
      setFile(stateFile);
      analyse(stateFile).then(async (signals) => {
        if (params.get("q")) run(stateFile);
        else if (signals) {
          // Nothing typed: search straight from the reference image.
          setQuery("");
          const res = runSearch(products, { query: "", visual: signals, overrides: {} });
          setInterpretation(res.intent);
          setResult(res);
          setPhase("done");
          recordSearch({
            id: `s-${Date.now()}`, at: new Date().toLocaleString(), query: "(image only)",
            hasImage: true, resultCount: res.results.length, excluded: res.excluded, durationMs: 0,
          });
          try {
            await logSearchEvent({
              query: "(image only)",
              hasImage: true,
              resultCount: res.results.length,
              excluded: res.excluded,
              durationMs: 0,
            });
          } catch {
            // Backend unavailable — local search log remains the source of truth.
          }
        }
      });
    } else if (params.get("q") && !autoRan.current) {
      autoRan.current = true;
      run(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (f) => {
    if (!f) return;
    setFile(f);
    setImageError("");
    setVisual(null);
    await analyse(f);
  };

  const updateInterpretation = (patch) => {
    const next = {
      ...interpretation,
      ...patch,
      exclusions: { ...(interpretation.exclusions || { colours: [], terms: [] }), ...(patch.exclusions || {}) },
    };
    setInterpretation(next);
    const res = runSearch(products, { query, visual, overrides: next });
    setResult(res);
  };

  const removeChip = (chip) => {
    const [kind, value] = chip.key.split(":");
    if (kind === "colour") updateInterpretation({ colours: interpretation.colours.filter((c) => c !== value) });
    else if (kind === "occasion") updateInterpretation({ occasions: interpretation.occasions.filter((o) => o !== value) });
    else if (kind === "fabric") updateInterpretation({ fabrics: interpretation.fabrics.filter((f) => f !== value) });
    else if (kind === "fit") updateInterpretation({ fits: interpretation.fits.filter((f) => f !== value) });
    else if (kind === "exclude") updateInterpretation({ exclusions: { colours: (interpretation.exclusions?.colours || []).filter((c) => c !== value), terms: interpretation.exclusions?.terms || [] } });
    else if (kind === "splitPrice" && chip.key === "maxPrice") updateInterpretation({ maxPrice: null });
    else if (chip.key === "maxPrice") updateInterpretation({ maxPrice: null });
    else if (chip.key === "minPrice") updateInterpretation({ minPrice: null });
    else if (chip.key === "subcategory") updateInterpretation({ subcategory: null, category: null });
    else if (chip.key === "category") updateInterpretation({ category: null, subcategory: null });
    else if (chip.key === "gender") updateInterpretation({ gender: null });
  };

  const chips = interpretation ? explainIntent(interpretation) : [];
  const matched = result?.results.map((r) => r.product) || [];
  const signalMap = useMemo(
    () => Object.fromEntries((result?.results || []).map((r) => [r.product.id, r.signals])),
    [result]
  );

  const filteredResults = useMemo(() => {
    if (!result) return [];
    const ids = new Set(applyFilters(matched, { ...extraFilters, sort }).map((p) => p.id));
    return result.results.filter((r) => ids.has(r.product.id));
  }, [result, matched, extraFilters, sort]);

  const displayList = useMemo(() => {
    const arr = filteredResults.map((r) => r.product);
    if (sort === "price-low") return [...arr].sort((a, b) => a.price - b.price);
    if (sort === "price-high") return [...arr].sort((a, b) => b.price - a.price);
    if (sort === "rating") return [...arr].sort((a, b) => b.rating - a.rating);
    if (sort === "new") return [...arr].sort((a, b) => a.addedDaysAgo - b.addedDaysAgo);
    return arr;
  }, [filteredResults, sort]);

  const facets = useMemo(() => buildFacets(matched), [matched]);
  const extraChips = activeChips(extraFilters, setExtraFilters, facets);
  const reset = () => {
    setQuery("");
    setFile(null);
    setVisual(null);
    setResult(null);
    setInterpretation(null);
    setPhase("idle");
    setExtraFilters(emptyFilters);
  };
  const busy = phase === "reading" || phase === "analysing" || phase === "ranking";

  return (
    <main id="main" className="page-shell search-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Search" }]} />

      <PageHead
        eyebrow="VELORA DISCOVERY"
        title={<>Describe the look.<br /><em>We’ll find the pieces.</em></>}
        caption="Natural language, a reference image, or both. Velora reads the language and the image independently, then searches real, in-stock catalogue pieces."
      />

      <div className="search-shell">
        <section className="search-input-card">
          <label className="visually-hidden" htmlFor="search-brief">Describe what you're looking for</label>
          <textarea
            id="search-brief"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
            placeholder="e.g. a pastel green kurta for a daytime wedding under ₹2,000"
            rows={3}
          />
          <div className="search-input-tools">
            <span className="search-hint">Be as specific — or as vague — as you like. Add a photo to search by look.</span>
            <div className="search-input-actions">
              <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()}>
                <Camera size={16} /> {file ? "Replace image" : "Add an image"}
              </button>
              {file && (
                <button type="button" className="tool-btn subtle" onClick={() => { setFile(null); setVisual(null); }}>
                  <Trash2 size={14} /> Remove
                </button>
              )}
              <button type="button" className="btn btn-dark" onClick={() => run()} disabled={busy || (!query.trim() && !file)}>
                {busy ? <><Spinner /> Reading your request</> : <><Wand2 size={15} /> Find my look</>}
              </button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />

          <div
            className={`drop-zone${dragOver ? " over" : ""}${visual ? " has-image" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}
            onClick={() => !visual && fileRef.current?.click()}
            role={!visual ? "button" : undefined}
            tabIndex={!visual ? 0 : undefined}
            onKeyDown={(e) => { if (!visual && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileRef.current?.click(); } }}
          >
            {visual ? (
              <>
                <img src={visual.previewUrl} alt="Your uploaded reference" />
                <div className="drop-meta">
                  <b>Reference added</b>
                  <small>{file?.name}</small>
                  <div className="visual-read">
                    <span>Palette</span>
                    {visual.palette.map((c) => (
                      <i key={c.hex} style={{ background: c.hex }} title={c.hex} />
                    ))}
                    <span>{visual.tone} tone · {visual.patternHint.toLowerCase()}</span>
                  </div>
                </div>
                <button type="button" className="drop-remove" aria-label="Remove reference image" onClick={(e) => { e.stopPropagation(); setFile(null); setVisual(null); }}>
                  <X size={15} />
                </button>
              </>
            ) : (
              <>
                <span className="drop-icon"><Upload size={18} /></span>
                <b>Drop a reference image</b>
                <small>JPG or PNG, up to 8 MB. Processed in your browser; not uploaded or stored.</small>
              </>
            )}
          </div>
          {imageError && <p className="inline-error" role="alert"><AlertCircle size={14} /> {imageError}</p>}

          <div className="example-row">
            <span className="eyebrow">Try</span>
            {EXAMPLES.slice(0, 4).map((q) => (
              <button type="button" key={q} onClick={() => { setQuery(q); }}>{q}</button>
            ))}
          </div>
        </section>

        <aside className="search-aside">
          <span className="eyebrow">HOW VELORA READS A SEARCH</span>
          <div className="thread-card">
            <span className="thread-no">01</span>
            <div>
              <b>Your words</b>
              <p>Occasion, garment, colour, fabric, fit and budget are extracted as structured constraints — with exclusions kept separate.</p>
            </div>
          </div>
          <div className="thread-card">
            <span className="thread-no">02</span>
            <div>
              <b>Your reference</b>
              <p>Palette, tone and surface detail from the image are read independently, so print and silhouette are not lost in translation.</p>
            </div>
          </div>
          <div className="thread-card thread-merge">
            <span className="thread-no">03</span>
            <div>
              <b>Then the catalogue</b>
              <p>Impossible pieces are removed first — budget, category, stock. What remains is ranked by relevance.</p>
            </div>
          </div>
          <InfoNote tone="soft" icon={<Sparkles size={14} />} title="Demo engine">
            Interpretation and ranking run on-device in this prototype. Palette is sampled from your image with a canvas; no model
            service is called and no embedding is generated. A production build swaps in the two model services without changing this flow.
          </InfoNote>
        </aside>
      </div>

      {busy && (
        <section className="search-progress" aria-live="polite">
          <div className="search-progress-head">
            <Spinner size={18} />
            <b>
              {phase === "reading" ? "Understanding your request" : phase === "analysing" ? "Analysing your reference" : "Checking available pieces"}
            </b>
          </div>
          <div className="progress-steps">
            <span className={phase !== "reading" ? "done" : "active"}>
              {phase !== "reading" ? <Check size={12} /> : <span className="dot-live" />} Reading your words
            </span>
            <ChevronRight size={13} />
            <span className={phase === "analysing" ? "active" : phase === "ranking" ? "done" : ""}>
              {phase === "ranking" ? <Check size={12} /> : <ScanLine size={12} />} Reading the reference
            </span>
            <ChevronRight size={13} />
            <span className={phase === "ranking" ? "active" : ""}>
              <SearchIcon size={12} /> Filtering and ranking real pieces
            </span>
          </div>
          <p className="progress-note">No invented percentages — these are the actual stages of this demo search.</p>
        </section>
      )}

      {phase === "done" && result && (
        <section className="search-results" aria-live="polite">
          <div className="interpretation-card">
            <div className="interp-head">
              <div>
                <span className="eyebrow"><Sparkles size={11} /> WHAT VELORA UNDERSTOOD</span>
                <p>Correct anything that looks wrong — every change re-runs the search.</p>
              </div>
              <button type="button" className="text-link" onClick={() => setEditing((e) => !e)}>
                <Pencil size={13} /> {editing ? "Done" : "Edit preferences"}
              </button>
            </div>
            <div className="interp-chips">
              {chips.length === 0 && <span className="muted">No specific constraints — showing in-stock pieces ranked by quality.</span>}
              {chips.map((c) => (
                <Chip key={c.key} active onRemove={() => removeChip(c)}>
                  {c.key === "maxPrice" ? `Under ${money(c.label.replace("Under ", ""))}` : c.label}
                </Chip>
              ))}
            </div>

            {editing && (
              <div className="interp-editor">
                <div className="form-row">
                  <label className="field">
                    <span className="field-label">Category</span>
                    <select
                      value={interpretation.category || ""}
                      onChange={(e) => updateInterpretation({ category: e.target.value || null, subcategory: null })}
                    >
                      <option value="">Any category</option>
                      {categories.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Budget ceiling (₹)</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={interpretation.maxPrice ?? ""}
                      placeholder="No ceiling"
                      onChange={(e) => updateInterpretation({ maxPrice: e.target.value ? Number(e.target.value) : null })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Occasion</span>
                    <select
                      value={interpretation.occasions?.[0] || ""}
                      onChange={(e) => updateInterpretation({ occasions: e.target.value ? [e.target.value] : [] })}
                    >
                      <option value="">Any occasion</option>
                      {ALL_OCCASIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                </div>
                <div className="interp-add-row">
                  <span className="eyebrow">Add colour</span>
                  {ALL_COLOURS.slice(0, 8).map((c) => (
                    <Chip
                      key={c}
                      active={interpretation.colours?.includes(c)}
                      onClick={() =>
                        updateInterpretation({
                          colours: interpretation.colours?.includes(c)
                            ? interpretation.colours.filter((x) => x !== c)
                            : [...(interpretation.colours || []), c],
                        })
                      }
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
                <div className="interp-add-row">
                  <span className="eyebrow">Exclude</span>
                  {["Red", "Pink", "Yellow", "Green", "Black"].map((c) => (
                    <Chip
                      key={c}
                      tone="danger"
                      active={interpretation.exclusions?.colours?.includes(c)}
                      onClick={() =>
                        updateInterpretation({
                          exclusions: {
                            colours: interpretation.exclusions?.colours?.includes(c)
                              ? interpretation.exclusions.colours.filter((x) => x !== c)
                              : [...(interpretation.exclusions?.colours || []), c],
                            terms: interpretation.exclusions?.terms || [],
                          },
                        })
                      }
                    >
                      No {c}
                    </Chip>
                  ))}
                  {!["Red", "Pink", "Yellow", "Green", "Black"].includes(interpretation.exclusions?.colours?.[0]) && interpretation.exclusions?.colours?.length > 0 && (
                    <span className="muted small">Exclusion applied: {interpretation.exclusions.colours.join(", ")}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="results-toolbar">
            <div>
              <b>{displayList.length} {displayList.length === 1 ? "piece" : "pieces"} for “{query || "your reference"}”</b>
              <span>
                {result.weights.image > 0 ? "Ranked by text + visual reference" : "Ranked by your brief"} · {duration} ms on-device · {result.excluded.price + result.excluded.category + result.excluded.colour + result.excluded.stock} considered and excluded by hard filters
              </span>
            </div>
            <div className="results-toolbar-actions">
              <button type="button" className="filter-trigger mobile-only" onClick={() => setFilterOpen(true)}>
                <SlidersHorizontal size={15} /> Filters
              </button>
              <label className="sort-control">
                <span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORT_OPTIONS.filter((s) => ["recommended", "price-low", "price-high", "rating", "new"].includes(s.id)).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {extraChips.length > 0 && (
            <div className="active-chips">
              {extraChips.map((c) => <Chip key={c.key} active onRemove={c.onRemove}>{c.label}</Chip>)}
              <button type="button" className="clear-all" onClick={() => setExtraFilters(emptyFilters)}>Clear all</button>
            </div>
          )}

          <div className="search-results-layout">
            <aside className="listing-sidebar desktop-only">
              <div className="filter-head"><b>Refine results</b></div>
              <FilterPanel facets={facets} filters={extraFilters} setFilters={setExtraFilters} hide={["fabric"]} />
            </aside>
            <div>
              {displayList.length === 0 ? (
                <div className="no-results">
                  <EmptyState
                    icon={<SearchIcon size={20} />}
                    title="Nothing matched every constraint"
                    body="One of the hard filters is excluding the rest of the catalogue. Widen the budget, clear the category or remove an exclusion — the pieces are still there."
                    action={<Btn variant="dark" onClick={() => updateInterpretation({ maxPrice: null, category: null, subcategory: null, exclusions: { colours: [], terms: [] } })}>Widen the search</Btn>}
                  />
                  <div className="exclusion-breakdown">
                    <span className="eyebrow">WHY PIECES WERE EXCLUDED</span>
                    <div>
                      <span><b>{result.excluded.price}</b> over budget</span>
                      <span><b>{result.excluded.category}</b> another category</span>
                      <span><b>{result.excluded.colour}</b> excluded colour</span>
                      <span><b>{result.excluded.stock}</b> out of stock</span>
                    </div>
                  </div>
                  {result.excluded.price > 0 && interpretation.maxPrice && (
                    <div className="budget-nudge">
                      <p>The closest pieces above your {money(interpretation.maxPrice)} ceiling:</p>
                      <div className="product-grid cols-3">
                        {products
                          .filter((p) => p.status === "live" && p.price > interpretation.maxPrice)
                          .sort((a, b) => a.price - b.price)
                          .slice(0, 3)
                          .map((p) => <ProductCard key={p.id} product={p} />)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="match-signals">
                    {displayList.slice(0, 1).map((p) => (
                      <p key={p.id}>
                        <Sparkles size={13} /> Strongest matches were led by {signalMap[p.id]?.join(", ") || "your constraints"}.
                        {interpretation.coloursFromImage ? " Colour came from your reference; your words still set the hard constraints." : ""}
                      </p>
                    ))}
                  </div>
                  <div className="product-grid cols-3 search-grid">
                    {displayList.map((p) => (
                      <div className="search-card-wrap" key={p.id}>
                        <ProductCard product={p} />
                        {signalMap[p.id]?.length > 0 && (
                          <div className="card-signals">
                            {signalMap[p.id].map((s) => <span key={s}>{s}</span>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="search-trust-note">
                <InfoNote tone="soft" icon={<Sparkles size={14} />} title="About these results">
                  Velora ranks real catalogue SKUs; the assistant never invents a product. Sponsored placements, when enabled, are labelled separately.
                  Relevance is explainable: hard constraints are applied before any similarity ranking.
                </InfoNote>
              </div>
            </div>
          </div>

          <div className="search-again">
            <p>Not quite it?</p>
            <div>
              <button type="button" className="btn btn-outline" onClick={() => { setQuery("a relaxed linen co-ord under ₹3,000"); }}>
                Try a related brief
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>Start over</button>
            </div>
          </div>
        </section>
      )}

      {phase === "idle" && !result && (
        <section className="zero-state-search">
          <div className="zero-art">
            <img src="/images/velora-reference.jpg" alt="" loading="lazy" />
            <span>Reference-image search</span>
          </div>
          <div>
            <span className="eyebrow">NOT SURE HOW TO DESCRIBE IT?</span>
            <h2>Save a photo of something you love.<br /><em>We’ll find its cousins.</em></h2>
            <p>Occasion, fabric, budget and exclusions can be typed or edited afterwards. Nothing is locked in.</p>
            <div className="zero-actions">
              <button type="button" className="btn btn-dark" onClick={() => fileRef.current?.click()}><Camera size={16} /> Upload a reference</button>
              <Link to="/shop" className="btn btn-outline">Browse instead <ArrowRight size={15} /></Link>
            </div>
            {fitProfile && (
              <p className="fit-on-note"><Check size={13} /> Fit profile active — suggestions shown on product cards.</p>
            )}
          </div>
        </section>
      )}

      <Drawer open={filterOpen} onClose={() => setFilterOpen(false)} title="Refine results" side="bottom">
        <FilterPanel facets={facets} filters={extraFilters} setFilters={setExtraFilters} hide={["fabric"]} />
        <div className="drawer-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setExtraFilters(emptyFilters)}>Clear all</button>
          <button type="button" className="btn btn-dark" onClick={() => setFilterOpen(false)}>Show {displayList.length} pieces</button>
        </div>
      </Drawer>
    </main>
  );
}
