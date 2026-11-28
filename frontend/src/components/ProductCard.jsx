import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Plus, Ruler, ShoppingBag, Sparkles, X } from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { discountPct, money, productPath } from "../lib/format.js";
import { stockForSize } from "../data/catalog.js";
import { fitProfileFor } from "../lib/fit.js";
import { Badge, RatingPill } from "./ui.jsx";

export default function ProductCard({ product, compact = false }) {
  const { toggleWish, wishlist, addToCart, fitProfile } = useApp();
  const [sizeOpen, setSizeOpen] = useState(false);
  const mediaRef = useRef(null);
  const canHover = () => window.matchMedia("(hover: hover)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tilt = (event) => {
    const media = mediaRef.current;
    if (!media || !canHover()) return;
    const rect = media.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    media.style.setProperty("--mx", `${px * 100}%`);
    media.style.setProperty("--my", `${py * 100}%`);
    media.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 4.4}deg) rotateY(${(px - 0.5) * 5.2}deg) scale(1.012)`;
  };
  const resetTilt = () => {
    if (mediaRef.current) mediaRef.current.style.transform = "";
  };
  const wished = wishlist.includes(product.id);
  const off = discountPct(product.price, product.mrp);
  const fit = useMemo(() => fitProfileFor(product, fitProfile), [product, fitProfile]);
  const lowStock = product.stock > 0 && product.stock <= 6;
  const soldOut = product.stock === 0;

  const quickAdd = (size) => {
    addToCart(product, size, 1);
    setSizeOpen(false);
  };

  return (
    <article className={`product-card${compact ? " compact" : ""}`}>
      <div className="card-media" ref={mediaRef} onMouseMove={tilt} onMouseLeave={resetTilt}>
        <Link to={productPath(product)} aria-label={`${product.brand} ${product.name}`}>
          <img src={product.image} alt={`${product.name} by ${product.brand}`} loading="lazy" decoding="async" width="480" height="640" />
        </Link>
        <span className="card-glare" aria-hidden="true" />
        <div className="card-badges">
          {product.isFeatured && <Badge tone="ink">Bestseller</Badge>}
          {product.addedDaysAgo <= 14 && <Badge tone="light">New</Badge>}
          {off >= 30 && <Badge tone="accent">{off}% off</Badge>}
          {lowStock && !soldOut && <Badge tone="coral">Only {product.stock} left</Badge>}
          {soldOut && <Badge tone="neutral">Sold out</Badge>}
        </div>
        <button
          type="button"
          className={`wish-btn${wished ? " active" : ""}`}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={wished}
          onClick={() => toggleWish(product.id)}
        >
          <Heart size={16} fill={wished ? "currentColor" : "none"} />
        </button>
        {!soldOut && (
          <div className={`quick-add-wrap${sizeOpen ? " open" : ""}`}>
            {sizeOpen ? (
              <div className="quick-sizes" role="group" aria-label={`Choose a size for ${product.name}`}>
                <span className="quick-sizes-label">Select size</span>
                <div className="quick-size-row">
                  {product.sizes.map((s) => {
                    const out = stockForSize(product, s) === 0;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={out}
                        title={out ? "Out of stock" : `Add ${s}`}
                        onClick={() => quickAdd(s)}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="quick-close" aria-label="Close size picker" onClick={() => setSizeOpen(false)}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="quick-add"
                aria-label={`Quick add ${product.name}`}
                onClick={() => (product.sizes.length === 1 ? addToCart(product, product.sizes[0], 1) : setSizeOpen(true))}
              >
                <Plus size={16} />
                <span>Quick add</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card-body">
        <div className="card-brand-row">
          <span className="card-brand">{product.brand}</span>
          <RatingPill value={product.rating} count={product.reviewCount} />
        </div>
        <h3><Link to={productPath(product)}>{product.name}</Link></h3>
        <p className="card-sub">{product.color} · {product.fabric}</p>
        <div className="card-price">
          <b>{money(product.price)}</b>
          {product.mrp > product.price && <del>{money(product.mrp)}</del>}
          {off > 0 && <span className="off">{off}% off</span>}
        </div>
        {fit && fit.ranked?.length > 0 && (
          <div className="card-fit">
            <Ruler size={12} aria-hidden="true" />
            <span>Your size <b>{fit.size}</b> · {fit.confidence.toLowerCase()}</span>
          </div>
        )}
        {compact && (
          <div className="card-actions">
            <button type="button" onClick={() => (product.sizes.length === 1 ? addToCart(product, product.sizes[0], 1) : setSizeOpen(true))} disabled={soldOut}>
              <ShoppingBag size={13} /> Add to bag
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, columns = 4 }) {
  return (
    <div className={`product-grid cols-${columns}`}>
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

export function ProductShelf({ products, title, caption, to, actionLabel = "View all" }) {
  if (!products.length) return null;
  return (
    <section className="shelf">
      <div className="section-head">
        <div className="section-head-copy">
          {title && <span className="eyebrow"><Sparkles size={11} /> {title}</span>}
          {caption && <h2>{caption}</h2>}
        </div>
        {to && <Link to={to} className="text-link">{actionLabel} →</Link>}
      </div>
      <div className="shelf-track">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
