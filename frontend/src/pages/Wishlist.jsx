import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart, Package, ShoppingBag, Trash2 } from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { money } from "../lib/format.js";
import ProductCard from "../components/ProductCard.jsx";
import { Badge, Breadcrumbs, Btn, EmptyState, PageHead } from "../components/ui.jsx";

export default function Wishlist() {
  const { wishlist, products, toggleWish, addToCart, notify } = useApp();
  const saved = products.filter((p) => wishlist.includes(p.id));
  const available = saved.filter((p) => p.status === "live" && p.stock > 0);
  const unavailable = saved.filter((p) => p.status !== "live" || p.stock === 0);

  return (
    <main id="main" className="page-shell wishlist-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Wishlist" }]} />
      <PageHead
        eyebrow="SAVED FOR LATER"
        title={<>Your <em>wishlist.</em></>}
        caption={saved.length ? `${saved.length} saved ${saved.length === 1 ? "piece" : "pieces"} · ${available.length} available now` : "Keep pieces you're considering in one place."}
        action={saved.length > 0 && <Btn to="/shop" variant="outline" iconRight={<ArrowRight size={15} />}>Keep browsing</Btn>}
      />

      {!saved.length ? (
        <EmptyState
          icon={<Heart size={22} />}
          title="Nothing saved just yet"
          body="Tap the heart on any piece to keep it here. Wishlist items are saved in this browser."
          action={<div className="empty-actions"><Btn to="/new" variant="dark">Shop new arrivals</Btn><Btn to="/search" variant="outline">Find something specific</Btn></div>}
        />
      ) : (
        <>
          <div className="product-grid cols-4">
            {available.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>

          {unavailable.length > 0 && (
            <section className="wishlist-unavailable">
              <span className="eyebrow">NOT AVAILABLE RIGHT NOW</span>
              <div className="wishlist-rows">
                {unavailable.map((p) => (
                  <div className="wishlist-row" key={p.id}>
                    <img src={p.image} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <span>{p.brand} · {p.color}</span>
                      <Badge tone="danger">{p.status !== "live" ? "Unavailable" : "Sold out"}</Badge>
                    </div>
                    <b>{money(p.price)}</b>
                    <button type="button" className="icon-btn" aria-label={`Remove ${p.name} from wishlist`} onClick={() => toggleWish(p.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="wishlist-foot">
            <p><Package size={14} /> Prices and stock are shown live from the catalogue. Saved items can change availability.</p>
            <Btn to="/cart" variant="ghost" icon={<ShoppingBag size={14} />}>Go to bag</Btn>
          </div>
        </>
      )}
    </main>
  );
}
