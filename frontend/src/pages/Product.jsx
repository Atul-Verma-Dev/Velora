import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle, ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronDown, Heart, Maximize2,
  Minus, Package, Plus, Ruler, ScanFace, Send, ShieldCheck, ShoppingBag, Sparkles, Star,
  Store, ThumbsUp, Truck, ZoomIn,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { stockForSize } from "../data/catalog.js";
import { discountPct, findProduct, money, pincodeEta, productPath } from "../lib/format.js";
import { fitProfileFor, garmentSpec, sizeChart } from "../lib/fit.js";
import { reviewSummary } from "../data/reviews.js";
import ProductCard from "../components/ProductCard.jsx";
import {
  Accordion, Badge, Breadcrumbs, Btn, Chip, EmptyState, Field, InfoNote, Modal, RatingPill,
  SectionHead, Stars, StatusPill,
} from "../components/ui.jsx";

const firstAvailableSize = (product) =>
  product?.sizes?.find((s) => stockForSize(product, s) > 0) || product?.sizes?.[0] || "";

function ReviewForm({ product, onDone }) {
  const { addReview } = useApp();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fit, setFit] = useState("Just right");
  const [sizeWorn, setSizeWorn] = useState(product.sizes[0]);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (body.trim().length < 12) {
      setError("Please write at least a sentence about the piece.");
      return;
    }
    setError("");
    const entry = addReview(product.id, { rating, title, body, fit, sizeWorn, anonymous });
    if (!entry) return;
    setTitle(""); setBody("");
    onDone?.();
  };

  return (
    <form className="review-form" onSubmit={submit}>
      <div className="review-form-head">
        <b>Write a review</b>
        <span>Published after moderation · one review per delivered order</span>
      </div>
      <div className="rating-picker" role="group" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating >= n} onClick={() => setRating(n)}>
            <Star size={20} fill={rating >= n ? "currentColor" : "none"} />
          </button>
        ))}
        <span>{rating} / 5</span>
      </div>
      <div className="form-row">
        <Field label="Size worn">
          <select value={sizeWorn} onChange={(e) => setSizeWorn(e.target.value)}>
            {product.sizes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="How did it fit?">
          <select value={fit} onChange={(e) => setFit(e.target.value)}>
            {["Very tight", "Slightly tight", "Just right", "Slightly loose", "Very loose"].map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Review title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up in a line" maxLength={80} />
      </Field>
      <Field label="Your review" required error={error} hint="Fabric, fit, finish, colour accuracy — what would help another shopper?">
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What did you notice when it arrived and after wearing it?" maxLength={1200} />
      </Field>
      <label className="check-inline">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span>Post as “Anonymous shopper”</span>
      </label>
      <button type="submit" className="btn btn-dark">
        Submit review <Send size={14} />
      </button>
    </form>
  );
}

export default function Product() {
  const { id } = useParams();
  const nav = useNavigate();
  const {
    products, reviews, addToCart, toggleWish, wishlist, fitProfile, orders, markViewed,
    flagReview, sellerRespond, notify, user,
  } = useApp();
  const product = findProduct(products, id);

  const [size, setSize] = useState(() => firstAvailableSize(product));
  const [activeView, setActiveView] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [sizeGuide, setSizeGuide] = useState(false);
  const [pincode, setPincode] = useState("");
  const [eta, setEta] = useState("");
  const [qty, setQty] = useState(1);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("Spam or promotional content");

  const productId = product?.id;
  useEffect(() => {
    // Only when the shopper lands on a different piece — a stock or price update must not reset their size.
    setSize(firstAvailableSize(product));
    setActiveView(0);
    setQty(1);
    setEta("");
    setZoom(false);
    if (productId) markViewed(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, markViewed]);

  if (!product) {
    return (
      <main id="main" className="page-shell">
        <EmptyState
          icon={<Package size={22} />}
          title="That piece isn't here"
          body="The listing may have been removed or the link is wrong."
          action={<Btn to="/shop" variant="dark">Browse the catalogue</Btn>}
        />
      </main>
    );
  }

  const approved = (reviews[product.id] || []).filter((r) => r.status === "approved");
  const summary = reviewSummary(reviews[product.id]);
  const off = discountPct(product.price, product.mrp);
  const wished = wishlist.includes(product.id);
  const sizeStock = stockForSize(product, size);
  const fit = fitProfileFor(product, fitProfile);
  const chart = sizeChart(product);
  const seller = product.sellerName;
  const deliveredOrder = orders.find(
    (o) => o.userId === user.id && o.status === "Delivered" && o.items.some((i) => i.id === product.id)
  );
  const alreadyReviewed = (reviews[product.id] || []).some((r) => r.userId === user.id || (!r.userId && r.name === user.name));
  const ratingBuckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: approved.filter((r) => r.rating === star).length,
  }));
  const fitConsensus = approved.reduce((acc, r) => {
    acc[r.fit] = (acc[r.fit] || 0) + 1;
    return acc;
  }, {});
  const related = products
    .filter((p) => p.status === "live" && p.id !== product.id && (p.category === product.category || p.brand === product.brand))
    .slice(0, 4);

  const views = [
    { label: "Front", style: {} },
    { label: "Detail", style: { transform: "scale(1.7)", transformOrigin: "50% 35%" } },
    { label: "Fabric", style: { transform: "scale(2.1)", transformOrigin: "65% 65%" } },
  ];

  const runPincode = (e) => {
    e.preventDefault();
    const result = pincodeEta(pincode);
    setEta(result || "Please enter a valid 6-digit pincode.");
  };

  const add = () => {
    if (!sizeStock) {
      notify("Choose an available size first.", "error");
      return;
    }
    addToCart(product, size, qty);
  };
  const buyNow = () => {
    if (!sizeStock) {
      notify("Choose an available size first.", "error");
      return;
    }
    if (addToCart(product, size, qty)) nav("/checkout");
  };

  const filterReviews = approved.filter((r) => {
    if (reviewFilter === "all") return true;
    if (reviewFilter === "photos") return Boolean(r.photo);
    if (reviewFilter === "critical") return r.rating <= 3;
    return true;
  });

  return (
    <main id="main" className="page-shell product-page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: product.gender === "Men" ? "Men" : product.gender === "Women" ? "Women" : "Shop", to: `/shop?gender=${product.gender}` },
          { label: product.category, to: `/shop?category=${encodeURIComponent(product.category)}` },
          { label: product.name },
        ]}
      />

      <div className="product-layout">
        <section className="gallery" aria-label="Product images">
          <div className={`gallery-main${zoom ? " zoomed" : ""}`}>
            <button type="button" className="gallery-image-btn" onClick={() => setLightbox(true)} aria-label="Open larger image">
              <img
                src={product.image}
                alt={`${product.name} — ${views[activeView].label} view`}
                style={views[activeView].style}
                width="800"
                height="1066"
              />
            </button>
            <div className="gallery-tools">
              <button type="button" onClick={() => setZoom((z) => !z)} aria-pressed={zoom} title="Toggle zoom">
                <ZoomIn size={16} /> Zoom
              </button>
              <button type="button" onClick={() => setLightbox(true)} title="Expand image">
                <Maximize2 size={15} />
              </button>
            </div>
            <div className="gallery-thumbs">
              {views.map((v, i) => (
                <button
                  key={v.label}
                  type="button"
                  className={activeView === i ? "active" : ""}
                  onClick={() => setActiveView(i)}
                  aria-label={`Show ${v.label} view`}
                  aria-pressed={activeView === i}
                >
                  <img src={product.image} alt="" style={v.style} />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
            <p className="gallery-caption">Product reference {product.id} · {seller}</p>
          </div>
        </section>

        <section className="product-info">
          <div className="product-brand-line">
            <Link to={`/shop?brand=${encodeURIComponent(product.brand)}`} className="product-brand">{product.brand}</Link>
            <span className="product-sku">SKU {product.id}</span>
          </div>
          <h1>{product.name}</h1>
          <div className="product-rating-line">
            <RatingPill value={product.rating} count={product.reviewCount} />
            <a href="#reviews">{product.reviewCount} ratings · {(reviewSummary(reviews[product.id])?.count || 0)} written reviews</a>
            <span className="product-gender">{product.gender}</span>
          </div>

          <div className="price-block">
            <div className="price-line">
              <b>{money(product.price)}</b>
              {product.mrp > product.price && <del>{money(product.mrp)}</del>}
              {off > 0 && <span className="off">{off}% off</span>}
            </div>
            <p className="tax-line">Inclusive of all taxes · MRP is the maximum retail price</p>
            <div className="offer-line">
              <Sparkles size={13} />
              <span>Extra 10% off with code <b>VELORA10</b> on bags of ₹1,999 or more.</span>
            </div>
          </div>

          <div className="variant-block">
            <div className="variant-head">
              <b>Colour</b>
              <span>{product.color}</span>
            </div>
            <div className="colour-swatches">
              <button type="button" className="swatch active" title={product.color} aria-label={product.color} aria-pressed="true">
                <span style={{ background: product.colorHex }} />
              </button>
              <small>This style is available in one colourway.</small>
            </div>

            <div className="variant-head size-head">
              <b>Select size</b>
              <button type="button" className="text-link" onClick={() => setSizeGuide(true)}>
                <Ruler size={13} /> Size guide
              </button>
            </div>
            <div className="size-options">
              {product.sizes.map((s) => {
                const out = stockForSize(product, s) === 0;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`${size === s ? "selected" : ""}${out ? " sold-out" : ""}`}
                    onClick={() => {
                      setSize(s);
                      setQty((q) => Math.min(q, Math.max(1, stockForSize(product, s))));
                    }}
                    aria-pressed={size === s}
                    aria-label={`Size ${s}${out ? " (out of stock)" : ""}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {fitProfile && fit?.ranked?.length > 0 && (
              <p className="fit-hint-inline">
                <Ruler size={13} /> Your fit profile suggests <b>{fit.size}</b>.{" "}
                {size !== fit.size && <button type="button" onClick={() => setSize(fit.size)}>Use {fit.size}</button>}
              </p>
            )}
            <div className="stock-line">
              {sizeStock > 0 ? (
                <span className={sizeStock <= 3 ? "stock-low" : "stock-good"}><i />{sizeStock <= 3 ? `Only ${sizeStock} left in ${size}` : `In stock · ${sizeStock} available in ${size}`}</span>
              ) : (
                <span className="stock-out"><i />{size} is out of stock</span>
              )}
              <span>Ships from {product.sellerName.split(" ")[0]}</span>
            </div>
          </div>

          <div className="fit-card">
            <div className="fit-card-head">
              <span className="fit-card-icon"><Ruler size={17} /></span>
              <div>
                <b>Fit intelligence</b>
                <small>{fit ? `${fit.confidence} · based on your ${fitProfile.mode === "precision" ? "measurements" : "Fast Path profile"}` : "See how this piece is likely to sit on you"}</small>
              </div>
              <Badge tone="soft">Beta</Badge>
            </div>
            {fit ? (
              <>
                <div className="fit-zone-row">
                  {fit.zones.map((z) => (
                    <span key={z.zone} className={`fit-zone tone-${z.tone}`}>
                      <small>{z.zone}</small><b>{z.fit}</b>
                    </span>
                  ))}
                </div>
                <p className="fit-explain">{fit.explanation}</p>
                <div className="fit-actions">
                  <Link to="/fit" className="text-link">Edit fit profile <ArrowUpRight size={13} /></Link>
                  <span className="fit-disclaimer">Estimate, not a guarantee.</span>
                </div>
              </>
            ) : (
              <>
                <p className="fit-explain">
                  Garment measurements for every size are listed below. Add a 10-second Fast Path profile to
                  see a size suggestion with chest, waist and shoulder guidance.
                </p>
                <div className="fit-actions">
                  <Btn to="/fit" variant="outline" size="sm" icon={<Ruler size={14} />}>Find my fit</Btn>
                  <button type="button" className="text-link" onClick={() => setSizeGuide(true)}>Compare measurements</button>
                </div>
              </>
            )}
          </div>

          <div className="quantity-line">
            <div className="qty-control" aria-label="Quantity">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity"><Minus size={14} /></button>
              <span aria-live="polite">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(sizeStock || 1, q + 1))} aria-label="Increase quantity"><Plus size={14} /></button>
            </div>
            <span className="qty-note">Maximum {Math.max(1, sizeStock)} per order</span>
          </div>

          <div className="product-actions">
            <button type="button" className="btn btn-dark btn-wide" onClick={add} disabled={!sizeStock}>
              <ShoppingBag size={17} /> Add to bag
            </button>
            <button type="button" className="btn btn-accent" onClick={buyNow} disabled={!sizeStock}>
              Buy now
            </button>
            <button
              type="button"
              className={`wish-large${wished ? " active" : ""}`}
              onClick={() => toggleWish(product.id)}
              aria-label={wished ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={wished}
            >
              <Heart size={18} fill={wished ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="delivery-check">
            <div className="delivery-check-head"><Truck size={16} /><b>Delivery & serviceability</b></div>
            <form onSubmit={runPincode} className="pincode-form">
              <label htmlFor="pincode">Pincode</label>
              <input
                id="pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="e.g. 400050"
                inputMode="numeric"
                maxLength={6}
              />
              <button type="submit">Check</button>
            </form>
            {eta && <p className={`pincode-result${eta.includes("valid") ? " error" : ""}`}>{eta}</p>}
            <ul className="delivery-facts">
              <li><Truck size={14} /> Free delivery above ₹1,499 · otherwise ₹79</li>
              <li><ShieldCheck size={14} /> 7-day returns on eligible pieces, unworn with tags</li>
              <li><Store size={14} /> Sold by <Link to={`/shop?brand=${encodeURIComponent(product.brand)}`}>{seller}</Link> · KYC verified</li>
            </ul>
          </div>

          <div className="trust-inline">
            <span><BadgeCheck size={15} /> Authentic product</span>
            <span><Package size={15} /> Secure packaging</span>
            <span><Check size={15} /> Quality checked</span>
          </div>
        </section>
      </div>

      <section className="product-details">
        <Accordion
          items={[
            {
              id: "details",
              title: "Product details & specifications",
              content: (
                <div className="spec-layout">
                  <p className="spec-description">{product.description}</p>
                  <dl className="spec-table">
                    {[
                      ["Fabric", product.fabric],
                      ["Pattern", product.pattern],
                      ["Neckline", product.neckline],
                      ["Sleeve", product.sleeve],
                      ["Fit", product.fit],
                      ["Length", product.length],
                      ["Occasion", product.occasion.join(", ")],
                      ["Colour", product.color],
                      ["Care", product.care],
                      ["Country of origin", product.origin],
                      ["Seller", seller],
                    ].map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                    ))}
                  </dl>
                </div>
              ),
            },
            {
              id: "size",
              title: "Size chart & garment measurements",
              content: (
                <div className="size-chart-block">
                  <div className="measure-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>{chart.headers.map((h) => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {chart.rows.map((row, i) => (
                          <tr key={i} className={row[0] === size ? "selected-row" : ""}>
                            {row.map((cell, j) => <td key={j}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="chart-note">{chart.note} Model is 173 cm and wears size {product.sizes[Math.min(2, product.sizes.length - 1)]}. {garmentSpec(product, size).note}</p>
                </div>
              ),
            },
            {
              id: "delivery",
              title: "Delivery, returns & exchanges",
              content: (
                <div className="policy-copy">
                  <p>Dispatch within 1–2 business days. Standard delivery in 3–6 business days depending on pincode; the estimate is confirmed at checkout.</p>
                  <p>Returns accepted within 7 days of delivery on eligible pieces — unworn, unwashed and with original tags. Made-to-order lehengas and altered pieces are excluded. Refunds are issued to the original payment method after quality inspection.</p>
                  <p>Exchange for another size is free once per order where stock allows. Fit-related returns help us calibrate fit guidance, but fit suggestions remain estimates, not guarantees.</p>
                </div>
              ),
            },
            {
              id: "seller",
              title: "About the seller",
              content: (
                <div className="seller-block">
                  <span className="seller-mark">{seller.slice(0, 1)}</span>
                  <div>
                    <b>{seller}</b>
                    <small>Velora partner since 2023 · {product.origin}</small>
                    <p>{product.brand} works with small production runs. Catalogue imagery, fabric and dimensions are declared by the seller and checked by Velora catalogue operations.</p>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </section>

      <section id="reviews" className="reviews-section">
        <SectionHead eyebrow="REVIEWS & TRUST" title={<>What shoppers <em>found.</em></>} />
        <div className="reviews-layout">
          <aside className="review-summary-card">
            <div className="review-score">
              <b>{product.rating?.toFixed(1) || "—"}</b>
              <span><Stars value={product.rating} size={15} /><small>{product.reviewCount} ratings · {approved.length} written</small></span>
            </div>
            <div className="rating-bars">
              {ratingBuckets.map((b) => (
                <div key={b.star}>
                  <span>{b.star}★</span>
                  <div><i style={{ width: `${approved.length ? (b.count / approved.length) * 100 : 0}%` }} /></div>
                  <small>{b.count}</small>
                </div>
              ))}
            </div>
            {Object.keys(fitConsensus).length > 0 && (
              <div className="fit-consensus">
                <span className="eyebrow">FIT FEEDBACK</span>
                <div className="consensus-row">
                  {Object.entries(fitConsensus).sort((a, b) => b[1] - a[1]).map(([label, n]) => (
                    <span key={label}><b>{n}</b>{label}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="verified-share">
              <BadgeCheck size={14} />
              <span>{approved.filter((r) => r.verified).length} of {approved.length} written reviews are verified purchases</span>
            </div>
          </aside>

          <div className="reviews-main">
            <div className="ai-summary">
              <div className="ai-summary-head">
                <span className="ai-badge"><Sparkles size={12} /> AI-GENERATED SUMMARY</span>
                <Badge tone="neutral">Demo</Badge>
              </div>
              {summary ? (
                <>
                  <p className="ai-summary-lede">
                    Based on {summary.count} published reviews ({summary.range}). Customers describe this piece
                    as {summary.average >= 4.4 ? "consistently well made" : "well received overall"}, with fit feedback
                    tending towards “{Object.entries(fitConsensus).sort((a, b) => b[1] - a[1])[0]?.[0]?.toLowerCase() || "just right"}”.
                  </p>
                  <div className="ai-themes">
                    {summary.praises.map((p) => <span key={p.label}><Check size={12} /> {p.label} ({p.count} mentions)</span>)}
                    {summary.concerns.map((c) => <span key={c} className="concern"><AlertCircle size={12} /> {c}</span>)}
                  </div>
                  <small className="ai-grounding">
                    Generated from the review text shown below only. Conflicting opinions are kept. Recomputed when a review is published or removed.
                  </small>
                </>
              ) : (
                <p className="ai-summary-lede">
                  Not enough published reviews yet to summarise responsibly. Summaries appear once at least three
                  substantive reviews are published for this piece.
                </p>
              )}
            </div>

            <div className="review-toolbar">
              <div className="review-filters">
                {[["all", "All reviews"], ["photos", "With photos"], ["critical", "Critical"]].map(([k, label]) => (
                  <Chip key={k} active={reviewFilter === k} onClick={() => setReviewFilter(k)}>{label}</Chip>
                ))}
              </div>
              {deliveredOrder && !alreadyReviewed ? (
                <Btn size="sm" variant="dark" onClick={() => setReviewOpen((o) => !o)} icon={<Star size={14} />}>
                  Write a review
                </Btn>
              ) : (
                <span className="review-eligibility">
                  {alreadyReviewed ? "You've reviewed this piece" : "Reviews open after delivery"}
                </span>
              )}
            </div>

            {reviewOpen && deliveredOrder && (
              <ReviewForm product={product} onDone={() => setReviewOpen(false)} />
            )}

            {filterReviews.length === 0 ? (
              <EmptyState
                compact
                icon={<Star size={20} />}
                title={approved.length ? "No reviews match that filter" : "No published reviews yet"}
                body={approved.length ? "Try all reviews." : "Verified shoppers can review this piece after delivery."}
              />
            ) : (
              <div className="review-list">
                {filterReviews.map((r) => (
                  <article className="review-card" key={r.id}>
                    <div className="review-head">
                      <span className="review-avatar">{r.name.slice(0, 1)}</span>
                      <div>
                        <b>{r.name}</b>
                        <small>{r.date} · Size {r.sizeWorn || product.sizes[0]} · Fit: {r.fit}</small>
                      </div>
                      <span className="review-stars"><Stars value={r.rating} size={12} /></span>
                    </div>
                    <h3>{r.title}</h3>
                    <p>{r.body}</p>
                    {r.photo && <img className="review-photo" src={r.photo} alt={`Customer photo for ${product.name}`} loading="lazy" />}
                    <div className="review-foot">
                      {r.verified && <span className="verified"><BadgeCheck size={13} /> Verified purchase</span>}
                      <button type="button" className="helpful"><ThumbsUp size={12} /> Helpful ({r.helpful})</button>
                      <button type="button" className="report" onClick={() => setFlagOpen(true)}>Report</button>
                    </div>
                    {r.response && <div className="seller-response"><b>{seller} responded</b><p>{r.response}</p></div>}
                  </article>
                ))}
              </div>
            )}

            <div className="review-policy">
              <ShieldCheck size={15} />
              <p>Velora never removes a review for being negative. Content is removed only for abuse, spam, personal data or policy breaches, with a reason recorded. Sellers can respond publicly but cannot hide or approve reviews.</p>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="related-section">
          <SectionHead
            eyebrow="KEEP EXPLORING"
            title={<>Similar <em>pieces.</em></>}
            action={<Link to={`/shop?category=${encodeURIComponent(product.category)}`} className="text-link">Shop {product.category.toLowerCase()} <ArrowRight size={14} /></Link>}
          />
          <div className="product-grid cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      <div className="mobile-buy-bar">
        <div>
          <b>{money(product.price)}</b>
          <small>{sizeStock ? `${size} in stock` : "Select a size"}</small>
        </div>
        <button type="button" className="btn btn-dark" onClick={add} disabled={!sizeStock}>Add to bag</button>
        <button type="button" className={`wish-large${wished ? " active" : ""}`} onClick={() => toggleWish(product.id)} aria-label="Wishlist">
          <Heart size={17} fill={wished ? "currentColor" : "none"} />
        </button>
      </div>

      <Modal open={sizeGuide} onClose={() => setSizeGuide(false)} title={`Size guide — ${product.name}`}>
        <div className="measure-table-wrap">
          <table className="data-table">
            <thead><tr>{chart.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {chart.rows.map((row, i) => (
                <tr key={i} className={row[0] === size ? "selected-row" : ""}>
                  {row.map((cell, j) => <td key={j}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <InfoNote title="How to measure" tone="soft">
          <ul>
            <li>Measure over light clothing, keeping the tape level and snug — not tight.</li>
            <li>Garment measurements already include the intended ease for this silhouette.</li>
            <li>Between sizes? Size up for relaxed pieces, size down for slim fits.</li>
          </ul>
        </InfoNote>
        <p className="chart-note">{chart.note}</p>
        <Btn to="/fit" variant="dark" icon={<ScanFace size={15} />} className="mt-12">Get a personalised suggestion</Btn>
      </Modal>

      <Modal open={lightbox} onClose={() => setLightbox(false)} title={`${product.name} — ${views[activeView].label}`} wide>
        <div className="lightbox-image">
          <img src={product.image} alt={`${product.name}, enlarged ${views[activeView].label} view`} style={views[activeView].style} />
        </div>
        <div className="lightbox-thumbs">
          {views.map((v, i) => (
            <button key={v.label} type="button" className={activeView === i ? "active" : ""} onClick={() => setActiveView(i)}>{v.label}</button>
          ))}
        </div>
      </Modal>

      <Modal open={flagOpen} onClose={() => setFlagOpen(false)} title="Report this review">
        <p className="modal-lede">Trust & Safety reviews every report. A negative opinion is not a policy breach — choose the closest reason.</p>
        <Field label="Reason">
          <select value={flagReason} onChange={(e) => setFlagReason(e.target.value)}>
            {["Spam or promotional content", "Abusive or discriminatory language", "Shares personal information", "Not about this product", "Suspected fake review"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <div className="modal-actions">
          <Btn variant="ghost" onClick={() => setFlagOpen(false)}>Cancel</Btn>
          <Btn
            variant="dark"
            onClick={() => {
              flagReview(product.id, approved[0]?.id, flagReason);
              setFlagOpen(false);
            }}
          >
            Send report
          </Btn>
        </div>
      </Modal>
    </main>
  );
}
