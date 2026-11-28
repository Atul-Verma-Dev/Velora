import React, { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Check, Heart, Minus, Package, Plus, ShieldCheck, ShoppingBag, Sparkles,
  Tag, Trash2, Truck, X,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { stockForSize } from "../data/catalog.js";
import { completeTheLook } from "../lib/ctl.js";
import { shippingFor, FREE_SHIPPING_THRESHOLD, COUPON_MIN_BAG, couponValue, linePrice, money } from "../lib/format.js";
import { backendEnabled, fetchBundleRecommendations, acceptBundle } from "../lib/api/bundles.js";
import { Badge, Breadcrumbs, Btn, EmptyState, InfoNote, PageHead } from "../components/ui.jsx";

export default function Cart() {
  const { cart, products, updateQty, removeLine, moveToWishlist, addToCart, fitProfile, config, notify, coupon, setCoupon } = useApp();
  const nav = useNavigate();
  const [couponInput, setCouponInput] = useState("");
  const [dismissed, setDismissed] = useState([]);
  const [backendRecs, setBackendRecs] = useState(null);
  const [backendLoading, setBackendLoading] = useState(false);
  const [backendFailed, setBackendFailed] = useState(false);

  const lines = cart
    .map((l) => {
      const product = products.find((p) => p.id === l.productId);
      return product ? { ...l, product, unit: linePrice(l, product) } : null;
    })
    .filter(Boolean);
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);
  const couponDiscount = couponValue(coupon, subtotal);
  const blocked = lines.some((l) => l.product.status !== "live" || Math.min(l.product.stock, stockForSize(l.product, l.size)) < l.qty);
  const shipping = shippingFor(subtotal);
  const total = Math.max(0, subtotal - couponDiscount) + shipping;
  const savings = lines.reduce((s, l) => s + (l.product.mrp - l.unit) * l.qty, 0) + couponDiscount;

  // Fetch backend recommendations when the flag is enabled.
  useEffect(() => {
    if (!backendEnabled() || !lines.length) return;
    setBackendLoading(true);
    setBackendFailed(false);
    const cartItems = lines.map((l) => ({
      productId: l.productId,
      size: l.size,
      qty: l.qty,
    }));
    fetchBundleRecommendations(cartItems, subtotal, 3)
      .then((recs) => {
        setBackendRecs(recs || []);
        setBackendFailed(false);
      })
      .catch((err) => {
        console.warn("Backend recommendations unavailable, falling back to local logic:", err.message);
        setBackendFailed(true);
        // Do NOT replace valid local recommendations with an empty array.
        // Keep backendRecs null so the ctl memo falls back to local ctl.js.
      })
      .finally(() => setBackendLoading(false));
  }, [subtotal, lines]);

  const ctl = useMemo(() => {
    if (backendEnabled() && !backendFailed) {
      // Backend recommendations: merge with local product data for addToCart compatibility.
      return (backendRecs || [])
        .map((c) => {
          const localProduct = products.find((p) => p.id === c.product.id);
          const product = localProduct
            ? { ...localProduct, price: c.price, mrp: c.mrp }
            : c.product;
          return {
            product,
            size: c.size,
            compat: c.compat,
            price: c.price,
            mrp: c.mrp,
            saving: c.saving,
            reason: c.reason,
            tierLabel: c.tierLabel,
            stockAvailable: c.stockAvailable,
            recommendationId: c.recommendationId,
            _source: "backend",
          };
        })
        .filter((c) => !dismissed.includes(c.product.id));
    }
    return completeTheLook(products, cart, config, fitProfile).filter((c) => !dismissed.includes(c.product.id));
  }, [backendEnabled(), backendFailed, backendRecs, dismissed, products, cart, config, fitProfile]);

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      notify("Enter a code first", "error");
    } else if (code === "VELORA10" && subtotal >= COUPON_MIN_BAG) {
      setCoupon({ code });
      setCouponInput("");
      notify("VELORA10 applied");
    } else if (code === "VELORA10") {
      notify(`VELORA10 needs a bag value of ${money(COUPON_MIN_BAG)} or more`, "error");
    } else {
      notify("That code isn't valid on this demo storefront", "error");
    }
  };

  const addSuggestion = async (c) => {
    if (c._source === "backend") {
      const key = `${c.product.id}::${c.size}`;
      if (cart.some((l) => `${l.productId}::${l.size}` === key)) {
        notify("That offer is already in your bag.", "error");
        return;
      }
      // Confirm the backend offer before adding it to the bag: this is the link
      // between the shopper UI and the stored Complete the Look event.
      if (c.recommendationId != null) {
        try {
          await acceptBundle(c.recommendationId);
        } catch (err) {
          notify("Could not confirm offer — backend unavailable.", "error");
          return;
        }
      }
      // Add through the store so stock, floor and one-per-order rules are enforced
      // in one place (its offer price is the same tier price the backend quoted).
      if (!addToCart(c.product, c.size, 1, { offer: true })) return;
      setDismissed((d) => [...d, c.product.id]);
      return;
    }
    if (!addToCart(c.product, c.size, 1, { offer: true })) return;
    setDismissed((d) => [...d, c.product.id]);
  };

  if (!lines.length) {
    return (
      <main id="main" className="page-shell cart-page">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Bag" }]} />
        <PageHead eyebrow="YOUR SELECTION" title={<>Your bag is <em>empty.</em></>} />
        <EmptyState
          icon={<ShoppingBag size={22} />}
          title="Nothing in the bag yet"
          body="Start with new arrivals, or describe what you're after and let Velora find it."
          action={<div className="empty-actions"><Btn to="/new" variant="dark">Shop new arrivals</Btn><Btn to="/search" variant="outline">Try visual search</Btn></div>}
        />
      </main>
    );
  }

  return (
    <main id="main" className="page-shell cart-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Bag" }]} />
      <PageHead
        eyebrow="YOUR SELECTION"
        title={<>Your bag, <em>your call.</em></>}
        caption={`${itemCount} ${itemCount === 1 ? "piece" : "pieces"} · ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
      />

      <div className="cart-layout">
        <div className="cart-main">
          <div className="cart-items">
            {lines.map((l) => {
              const key = `${l.productId}::${l.size}`;
              const available = Math.min(l.product.stock, stockForSize(l.product, l.size));
              const low = available <= 4 && available >= l.qty;
              const unavailable = l.product.status !== "live" || available < l.qty;
              return (
                <article className="cart-row" key={key}>
                  <Link to={`/product/${l.product.id}`} className="cart-thumb">
                    <img src={l.product.image} alt={l.product.name} />
                  </Link>
                  <div className="cart-info">
                    <span className="cart-brand">{l.product.brand}</span>
                    <Link to={`/product/${l.product.id}`} className="cart-name">{l.product.name}</Link>
                    <div className="cart-variants">
                      <span>Size <b>{l.size}</b></span>
                      <span>Colour <b>{l.product.color}</b></span>
                      <span>Seller <b>{l.product.sellerName}</b></span>
                    </div>
                    <div className="cart-controls">
                      <div className="qty-control" aria-label={`Quantity for ${l.product.name}`}>
                        <button type="button" onClick={() => updateQty(key, l.qty - 1)} disabled={l.qty <= 1} aria-label="Decrease quantity"><Minus size={13} /></button>
                        <span>{l.qty}</span>
                        <button type="button" onClick={() => updateQty(key, l.qty + 1)} disabled={l.qty >= available || l.offer} aria-label="Increase quantity"><Plus size={13} /></button>
                      </div>
                      <button type="button" className="cart-link" onClick={() => moveToWishlist(key)}><Heart size={13} /> Move to wishlist</button>
                      <button type="button" className="cart-link danger" onClick={() => removeLine(key)}><Trash2 size={13} /> Remove</button>
                    </div>
                    {l.offer && <p className="cart-offer-tag"><Sparkles size={12} /> Complete the Look offer · one per order</p>}
                    {unavailable && <p className="cart-stock-warning is-error" role="alert"><Package size={12} /> {available > 0 ? `Only ${available} left in size ${l.size} — lower the quantity to continue.` : `Size ${l.size} is no longer available — remove it to continue.`}</p>}
                    {low && <p className="cart-stock-warning"><Package size={12} /> Only {available} left in size {l.size} — quantity is capped by available stock.</p>}
                  </div>
                  <div className="cart-price">
                    <b>{money(l.unit * l.qty)}</b>
                    {l.product.mrp > l.unit && (
                      <>
                        <del>{money(l.product.mrp * l.qty)}</del>
                        <span className="cart-saving">Save {money((l.product.mrp - l.unit) * l.qty)}</span>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {ctl.length > 0 && (
            <section className="ctl-section">
              <div className="ctl-head">
                <div>
                  <span className="eyebrow"><Sparkles size={11} /> COMPLETE THE LOOK</span>
                  <h2>{ctl[0].occasion ? `Finish the ${ctl[0].occasion.toLowerCase()} look` : "One piece away"}</h2>
                  <p>Selected for palette, occasion and the size already in your bag.</p>
                </div>
                <Badge tone="accent">In stock in your size</Badge>
              </div>
              <div className="ctl-offers">
                {ctl.map((c) => (
                  <div className="ctl-offer" key={c.product.id}>
                    <Link to={`/product/${c.product.id}`} className="ctl-offer-img">
                      <img src={c.product.image} alt={c.product.name} />
                    </Link>
                    <div className="ctl-offer-copy">
                      <span className="ctl-brand">{c.product.brand}</span>
                      <b>{c.product.name}</b>
                      <small>Size {c.size} · {c.product.color}</small>
                      <p>{c.reason}</p>
                      <div className="ctl-offer-price">
                        <b>{money(c.price)}</b>
                        <del>{money(c.mrp)}</del>
                        <span>Save {money(c.saving)}</span>
                      </div>
                      <div className="ctl-offer-actions">
                        <button type="button" className="btn btn-dark btn-sm" onClick={() => addSuggestion(c)}>
                          <Plus size={14} /> Add to bag
                        </button>
                        <button type="button" className="icon-btn" aria-label={`Dismiss ${c.product.name} suggestion`} onClick={() => setDismissed((d) => [...d, c.product.id])}>
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="ctl-note">
                Optional additions — nothing is added unless you choose it. Offer pricing comes from the seller's
                own eligible stock and cannot fall below their cost floor.
              </p>
            </section>
          )}

          <InfoNote tone="soft" icon={<ShieldCheck size={15} />} title="Stock and pricing">
            Bag quantities are checked against available stock. Stock and price are revalidated when you place the order, and you will be
            told before anything is charged if something changed. This is a demo storefront: no payment is collected.
          </InfoNote>
        </div>

        <aside className="summary-card">
          <span className="eyebrow">ORDER SUMMARY</span>
          <h3>{itemCount} {itemCount === 1 ? "piece" : "pieces"} selected</h3>
          <div className="summary-line"><span>Subtotal</span><b>{money(subtotal)}</b></div>
          <div className="summary-line"><span>Item savings</span><b className="green">− {money(savings - couponDiscount)}</b></div>
          {couponDiscount > 0 && <div className="summary-line"><span>Coupon {coupon.code}</span><b className="green">− {money(couponDiscount)}</b></div>}
          <div className="summary-line"><span>Delivery</span><b>{shipping === 0 ? "Free" : money(shipping)}</b></div>
          <div className="summary-line"><span>Taxes</span><b>Included</b></div>
          {shipping > 0 && (
            <p className="free-ship-nudge">
              <Truck size={13} /> Add {money(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal))} for free delivery.
            </p>
          )}
          <div className="summary-total"><span>Total payable</span><b>{money(total)}</b></div>
          <p className="summary-note">Inclusive of all taxes. Demo checkout — no real payment will be taken.</p>

          <div className="coupon-box">
            <label htmlFor="coupon">Have a code?</label>
            <div>
              <Tag size={14} />
              <input id="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }} placeholder="VELORA10" autoComplete="off" />
              <button type="button" onClick={applyCoupon}>Apply</button>
            </div>
            {coupon && couponDiscount > 0 && (
              <small className="coupon-ok"><Check size={12} /> {coupon.code} applied — 10% off <button type="button" className="coupon-remove" onClick={() => { setCoupon(null); notify("Code removed"); }}>Remove</button></small>
            )}
            {coupon && couponDiscount === 0 && (
              <small className="coupon-warn">{coupon.code} needs a bag of {money(COUPON_MIN_BAG)}+ — it will apply again when you reach it. <button type="button" className="coupon-remove" onClick={() => setCoupon(null)}>Remove</button></small>
            )}
          </div>

          <Btn variant="dark" className="btn-wide" disabled={blocked} onClick={() => nav("/checkout")} iconRight={<ArrowRight size={16} />}>
            Proceed to checkout
          </Btn>
          <Link to="/shop" className="continue-link">Continue shopping</Link>
          <div className="summary-trust">
            <span><ShieldCheck size={13} /> Secure demo checkout</span>
            <span><Package size={13} /> 7-day returns</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
