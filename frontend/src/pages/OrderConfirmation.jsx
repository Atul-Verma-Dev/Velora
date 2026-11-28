import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Check, Package, Printer, Truck } from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { money } from "../lib/format.js";
import { Badge, Btn, EmptyState } from "../components/ui.jsx";
import { Confetti } from "../components/fx.jsx";

export default function OrderConfirmation() {
  const { id } = useParams();
  const { orders } = useApp();
  const order = orders.find((o) => o.id === id);
  // Celebrate once per order — revisiting the page later stays calm.
  const celebrate = useMemo(() => {
    if (!order) return false;
    const key = `velora-confetti-${order.id}`;
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
    } catch { /* storage unavailable — still celebrate once per mount */ }
    return true;
  }, [order?.id]);

  if (!order) {
    return (
      <main id="main" className="page-shell">
        <EmptyState
          icon={<Package size={22} />}
          title="We couldn't find that order"
          body="It may belong to a different demo session. Try your order history."
          action={<Btn to="/account/orders" variant="dark">Go to order history</Btn>}
        />
      </main>
    );
  }

  return (
    <main id="main" className="page-shell confirmation">
      <Confetti run={celebrate} />
      <div className="confirm-mark"><Check size={26} /></div>
      <span className="eyebrow">DEMO ORDER PLACED</span>
      <h1>Good choice.<br /><em>Here's what happens next.</em></h1>
      <p className="confirm-lede">
        Order <b>{order.id}</b> has been recorded in this browser. This is a demo checkout — no payment was taken
        and no real shipment will be created.
      </p>

      <div className="confirm-layout">
        <div className="summary-card confirm-card">
          <div className="confirm-card-head">
            <div><span className="eyebrow">ORDER</span><b>{order.id}</b></div>
            <Badge tone="warning">{order.status}</Badge>
          </div>
          <div className="confirm-items">
            {order.items.map((i) => (
              <div key={`${i.id}-${i.size}`}>
                <img src={i.image} alt="" />
                <span><b>{i.name}</b><small>{i.brand} · {i.size} · ×{i.qty}</small><small>Sold by {i.sellerName}</small></span>
                <b>{money(i.price * i.qty)}</b>
              </div>
            ))}
          </div>
          <div className="summary-line"><span>Total paid at delivery / demo</span><b>{money(order.total)}</b></div>
          <div className="summary-line"><span>Payment</span><b>{order.payment}</b></div>
          <div className="summary-line"><span>Delivery</span><b>{order.delivery}</b></div>
        </div>

        <div className="confirm-side">
          <div className="confirm-next">
            <span className="eyebrow"><Truck size={12} /> DELIVERING TO</span>
            <p>{order.address}</p>
            <small>{order.contact}</small>
          </div>
          <div className="confirm-next">
            <span className="eyebrow">WHAT'S NEXT</span>
            <ul>
              <li>The seller confirms the order within 24 hours.</li>
              <li>You'll see status updates in your account.</li>
              <li>Returns are available within 7 days of delivery.</li>
            </ul>
          </div>
          <div className="confirm-actions">
            <Btn to={`/account/orders/${order.id}`} variant="dark" iconRight={<ArrowRight size={15} />}>View order details</Btn>
            <Btn to="/shop" variant="outline">Continue shopping</Btn>
          </div>
          <button type="button" className="print-link" onClick={() => window.print()}>
            <Printer size={13} /> Print this confirmation
          </button>
        </div>
      </div>
      <p className="demo-footnote">
        Demo storefront: catalogue, seller and review data are synthetic. No payment, fulfilment or stock reservation
        occurred on a server.
      </p>
    </main>
  );
}
