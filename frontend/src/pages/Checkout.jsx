import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, CreditCard, Landmark, Lock, MapPin, Package, Plus,
  ShieldCheck, Smartphone, Truck, Wallet,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { couponValue, linePrice, money, shippingFor, FREE_SHIPPING_THRESHOLD } from "../lib/format.js";
import { isBackendEnabled } from "../lib/api/client.js";
import { Badge, Breadcrumbs, Btn, EmptyState, Field, InfoNote, PageHead } from "../components/ui.jsx";

const STEPS = [
  { id: 1, label: "Address" },
  { id: 2, label: "Delivery" },
  { id: 3, label: "Payment" },
  { id: 4, label: "Review" },
];

const DELIVERY_OPTIONS = [
  { id: "standard", label: "Standard delivery", eta: "3–6 business days", price: 0, note: "Free above ₹1,499, otherwise ₹79" },
  { id: "express", label: "Express delivery", eta: "2–3 business days", price: 99, note: "Priority handling by the seller" },
];

export default function Checkout() {
  const {
    cart, products, addresses, saveAddress, placeOrder, coupon, setCoupon, config, notify, user,
  } = useApp();
  const nav = useNavigate();
  const backendMode = isBackendEnabled();
  const [step, setStep] = useState(1);
  const [addressId, setAddressId] = useState(addresses.find((a) => a.isDefault)?.id || addresses[0]?.id || "");
  const [newAddress, setNewAddress] = useState({
    label: "Home", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false,
  });
  const [showNew, setShowNew] = useState(addresses.length === 0);
  const [addressErrors, setAddressErrors] = useState({});
  const [delivery, setDelivery] = useState("standard");
  const [payment, setPayment] = useState("upi");
  const [upiId, setUpiId] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [placing, setPlacing] = useState(false);

  const lines = cart.map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) })).filter((l) => l.product);
  const subtotal = lines.reduce((s, l) => s + linePrice(l, l.product) * l.qty, 0);
  const discount = couponValue(coupon, subtotal);
  const deliveryOption = DELIVERY_OPTIONS.find((d) => d.id === delivery);
  const shipping = delivery === "express" ? 99 : shippingFor(subtotal);
  const total = Math.max(0, subtotal - discount) + shipping;
  const selectedAddress = addresses.find((a) => a.id === addressId);
  const bySeller = useMemo(() => {
    const map = new Map();
    lines.forEach((l) => {
      const key = l.product.sellerName;
      map.set(key, [...(map.get(key) || []), l]);
    });
    return [...map.entries()];
  }, [lines]);

  if (!lines.length) {
    return (
      <main id="main" className="page-shell">
        <EmptyState
          icon={<Package size={22} />}
          title="Your bag is empty"
          body="Checkout needs at least one piece."
          action={<Btn to="/shop" variant="dark">Browse the catalogue</Btn>}
        />
      </main>
    );
  }

  const validateAddress = () => {
    const e = {};
    if (!newAddress.name.trim()) e.name = "Full name is required.";
    if (!/^\d{10}$/.test(newAddress.phone.replace(/\D/g, ""))) e.phone = "Enter a 10-digit mobile number.";
    if (!newAddress.line1.trim()) e.line1 = "Address line 1 is required.";
    if (!newAddress.city.trim()) e.city = "City is required.";
    if (!newAddress.state.trim()) e.state = "State is required.";
    if (!/^\d{6}$/.test(newAddress.pincode)) e.pincode = "Enter a valid 6-digit pincode.";
    setAddressErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === 1) {
      if (showNew) {
        if (!validateAddress()) return;
        const id = `addr-${Date.now()}`;
        saveAddress({ ...newAddress, id });
        setAddressId(id);
        setShowNew(false);
      }
      if (!addressId && !showNew) {
        notify("Choose or add a delivery address", "error");
        return;
      }
    }
    if (step === 3) {
      if (payment === "upi" && upiId && !/^[\w.-]{2,}@[\w.-]{2,}$/.test(upiId)) {
        setPaymentError("That UPI ID doesn't look right. Use the format name@bank.");
        return;
      }
      setPaymentError("");
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const submitOrder = async () => {
    if (placing) return;

    setPlacing(true);

    try {
      const addr = selectedAddress || { ...newAddress, id: "addr-new" };
      const paymentLabel =
        payment === "cod" ? "Cash on delivery (demo)" :
        payment === "upi" ? `UPI (demo${upiId ? ` · ${upiId}` : ""})` : "Card (demo)";

      // Build backend-compatible cart items with CTL offer references.
      const backendItems = lines.map((l) => ({
        sku: l.product.id,
        size: l.size,
        qty: l.qty,
      }));

      const offerRefs = lines
        .filter((l) => l.offer && l.recommendationId)
        .map((l) => ({
          recommendation_id: l.recommendationId,
          sku: l.product.id,
          size: l.size,
        }));

      const result = await placeOrder({
        user_id: user?.id || "user-demo",
        customer_name: addr.name,
        contact: addr.phone,
        address: `${addr.line1}, ${addr.line2 ? addr.line2 + ", " : ""}${addr.city}, ${addr.state} — ${addr.pincode}`,
        payment: paymentLabel,
        delivery: delivery,
        items: backendItems,
        offer_references: offerRefs,
        coupon_code: coupon?.code || null,
      });

      // Never navigate without a valid persisted order ID.
      if (!result || !result.id) {
        return;
      }

      setCoupon(null);
      nav(`/order-confirmation/${result.id}`);

    } catch (error) {
      console.error("Checkout failed:", error);
      notify(error?.message || "Unable to place your order. Please try again.", "error");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main id="main" className="page-shell checkout-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Bag", to: "/cart" }, { label: "Checkout" }]} />
      <PageHead eyebrow="SECURE CHECKOUT" title="Almost yours." caption="Four short steps. Demo checkout — no real payment is collected." />

      <ol className="checkout-steps" aria-label="Checkout steps">
        {STEPS.map((s) => (
          <li key={s.id} className={step === s.id ? "active" : step > s.id ? "done" : ""}>
            <span>{step > s.id ? <Check size={13} /> : s.id}</span>
            <b>{s.label}</b>
          </li>
        ))}
      </ol>

      <div className="checkout-layout">
        <div className="checkout-main">
          {step === 1 && (
            <section className="checkout-card">
              <div className="checkout-card-head">
                <span className="checkout-icon"><MapPin size={18} /></span>
                <div><h2>Delivery address</h2><p>Where should this order go?</p></div>
              </div>
              <div className="address-options">
                {addresses.map((a) => (
                  <label key={a.id} className={`address-option${addressId === a.id ? " selected" : ""}`}>
                    <input type="radio" name="address" checked={addressId === a.id} onChange={() => { setAddressId(a.id); setShowNew(false); }} />
                    <div>
                      <b>{a.name} <Badge tone="neutral">{a.label}</Badge>{a.isDefault && <Badge tone="soft">Default</Badge>}</b>
                      <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} — {a.pincode}</p>
                      <small>{a.phone}</small>
                    </div>
                  </label>
                ))}
                <button type="button" className="add-address-btn" onClick={() => setShowNew((s) => !s)}>
                  <Plus size={15} /> {showNew ? "Cancel new address" : "Add a new address"}
                </button>
              </div>

              {showNew && (
                <div className="new-address-form">
                  <div className="form-row">
                    <Field label="Full name" required error={addressErrors.name}>
                      <input value={newAddress.name} onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })} autoComplete="name" />
                    </Field>
                    <Field label="Mobile number" required error={addressErrors.phone}>
                      <input value={newAddress.phone} onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value.replace(/[^\d+\s]/g, "").slice(0, 14) })} inputMode="tel" autoComplete="tel" />
                    </Field>
                  </div>
                  <Field label="Address line 1" required error={addressErrors.line1}>
                    <input value={newAddress.line1} onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })} placeholder="House / flat, street" autoComplete="address-line1" />
                  </Field>
                  <Field label="Address line 2">
                    <input value={newAddress.line2} onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })} placeholder="Landmark, area (optional)" autoComplete="address-line2" />
                  </Field>
                  <div className="form-row three">
                    <Field label="City" required error={addressErrors.city}>
                      <input value={newAddress.city} onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} autoComplete="address-level2" />
                    </Field>
                    <Field label="State" required error={addressErrors.state}>
                      <input value={newAddress.state} onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })} autoComplete="address-level1" />
                    </Field>
                    <Field label="Pincode" required error={addressErrors.pincode}>
                      <input value={newAddress.pincode} onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" autoComplete="postal-code" />
                    </Field>
                  </div>
                  <label className="check-inline">
                    <input type="checkbox" checked={newAddress.isDefault} onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })} />
                    <span>Make this my default address</span>
                  </label>
                  <p className="demo-note"><Lock size={12} /> Address data in this demo is stored in your browser only.</p>
                </div>
              )}
              <div className="checkout-nav">
                <Link to="/cart" className="btn btn-ghost"><ArrowLeft size={15} /> Back to bag</Link>
                <Btn variant="dark" onClick={next} iconRight={<ArrowRight size={15} />}>Continue to delivery</Btn>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="checkout-card">
              <div className="checkout-card-head">
                <span className="checkout-icon"><Truck size={18} /></span>
                <div><h2>Delivery method</h2><p>Orders may ship separately from different sellers.</p></div>
              </div>
              <div className="delivery-options">
                {DELIVERY_OPTIONS.map((d) => {
                  const price = d.id === "express" ? 99 : shippingFor(subtotal);
                  return (
                    <label key={d.id} className={`delivery-option${delivery === d.id ? " selected" : ""}`}>
                      <input type="radio" name="delivery" checked={delivery === d.id} onChange={() => setDelivery(d.id)} />
                      <div>
                        <b>{d.label}</b>
                        <small>{d.eta} · {subtotal >= FREE_SHIPPING_THRESHOLD && d.id === "standard" ? "Free" : money(price)}</small>
                        <p>{d.note}</p>
                      </div>
                      <span className="delivery-price">{subtotal >= FREE_SHIPPING_THRESHOLD && d.id === "standard" ? "Free" : money(price)}</span>
                    </label>
                  );
                })}
              </div>

              <div className="seller-groups">
                <span className="eyebrow">SHIPPING FROM</span>
                {bySeller.map(([seller, items]) => (
                  <div key={seller} className="seller-group">
                    <b>{seller}</b>
                    <span>{items.length} {items.length === 1 ? "piece" : "pieces"} · dispatch in 1–2 business days</span>
                  </div>
                ))}
              </div>

              <InfoNote tone="soft" title="Returns with this delivery">
                Eligible pieces can be returned within 7 days of delivery, unworn with tags. Made-to-order and altered pieces are excluded.
              </InfoNote>
              <div className="checkout-nav">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={15} /> Address</button>
                <Btn variant="dark" onClick={next} iconRight={<ArrowRight size={15} />}>Continue to payment</Btn>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="checkout-card">
              <div className="checkout-card-head">
                <span className="checkout-icon"><Wallet size={18} /></span>
                <div><h2>Payment method</h2><p>No real payment is processed in this demo.</p></div>
              </div>
              <div className="payment-options">
                {[
                  { id: "upi", label: "UPI", note: "GPay, PhonePe, Paytm — demo only", icon: <Smartphone size={18} /> },
                  { id: "card", label: "Credit / debit card", note: "Visa, Mastercard, RuPay — demo only", icon: <CreditCard size={18} /> },
                  { id: "cod", label: "Cash on delivery", note: "Pay when it arrives — demo only", icon: <Landmark size={18} /> },
                ].map((p) => (
                  <label key={p.id} className={`payment-option${payment === p.id ? " selected" : ""}`}>
                    <input type="radio" name="payment" checked={payment === p.id} onChange={() => setPayment(p.id)} />
                    <span className="payment-icon">{p.icon}</span>
                    <div><b>{p.label}</b><small>{p.note}</small></div>
                  </label>
                ))}
              </div>
              {payment === "upi" && (
                <Field label="UPI ID" hint="Optional in this demo. Nothing is charged or verified." error={paymentError}>
                  <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@bank" autoComplete="off" />
                </Field>
              )}
              {payment === "card" && (
                <div className="card-demo-block">
                  <CreditCard size={22} />
                  <div>
                    <b>Card payment is not connected</b>
                    <p>A production build would open the payment provider's secure flow. This demo will not ask for card details and will not simulate a successful charge.</p>
                  </div>
                </div>
              )}
              {backendMode ? (
                <InfoNote tone="warning" title="Backend checkout">
                  Placing this order records it in PostgreSQL and decrements
                  inventory. Payment and shipment are not actually processed
                  in this demo.
                </InfoNote>
              ) : (
                <InfoNote tone="warning" title="Demo checkout">
                  Placing this order does not take a payment, reserve stock on a server or create a real shipment. It records a demo order in your browser.
                </InfoNote>
              )}
              <div className="checkout-nav">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}><ArrowLeft size={15} /> Delivery</button>
                <Btn variant="dark" onClick={next} iconRight={<ArrowRight size={15} />}>Review order</Btn>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="checkout-card">
              <div className="checkout-card-head">
                <span className="checkout-icon"><Package size={18} /></span>
                <div><h2>Review your order</h2><p>Check the details before placing a demo order.</p></div>
              </div>
              <div className="review-address-block">
                <div>
                  <span className="eyebrow">DELIVER TO</span>
                  <b>{selectedAddress?.name || newAddress.name}</b>
                  <p>{selectedAddress ? `${selectedAddress.line1}${selectedAddress.line2 ? `, ${selectedAddress.line2}` : ""}, ${selectedAddress.city}, ${selectedAddress.state} — ${selectedAddress.pincode}` : `${newAddress.line1}, ${newAddress.city} — ${newAddress.pincode}`}</p>
                  <small>{selectedAddress?.phone || newAddress.phone}</small>
                </div>
                <button type="button" className="text-link" onClick={() => setStep(1)}>Change</button>
              </div>
              <div className="review-delivery-block">
                <div>
                  <span className="eyebrow">DELIVERY</span>
                  <b>{deliveryOption.label} · {deliveryOption.eta}</b>
                  <p>{deliveryOption.id === "express" ? money(99) : shipping === 0 ? "Free" : money(shipping)}</p>
                </div>
                <button type="button" className="text-link" onClick={() => setStep(2)}>Change</button>
              </div>
              <div className="review-payment-block">
                <div>
                  <span className="eyebrow">PAYMENT</span>
                  <b>{payment === "cod" ? "Cash on delivery (demo)" : payment === "upi" ? "UPI (demo)" : "Card (demo)"}</b>
                  <p>Demo only — no charge will be made.</p>
                </div>
                <button type="button" className="text-link" onClick={() => setStep(3)}>Change</button>
              </div>

              <div className="review-items">
                <span className="eyebrow">ITEMS ({lines.length})</span>
                {lines.map((l) => (
                  <div className="review-item" key={`${l.productId}::${l.size}`}>
                    <img src={l.product.image} alt={l.product.name} />
                    <div>
                      <b>{l.product.name}</b>
                      <span>{l.product.brand} · Size {l.size} · {l.product.color}</span>
                      <small>{l.product.sellerName} · Qty {l.qty}</small>
                    </div>
                    <b>{money(linePrice(l, l.product) * l.qty)}</b>
                  </div>
                ))}
              </div>

              <div className="checkout-nav">
                <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}><ArrowLeft size={15} /> Payment</button>
                <Btn variant="accent" onClick={submitOrder} disabled={placing} icon={<ShieldCheck size={16} />}>
                  {placing ? "Placing demo order…" : `Place demo order · ${money(total)}`}
                </Btn>
              </div>
              <p className="checkout-terms">
                {backendMode ? (
                  <>
                    By placing this order you agree to Velora’s{" "}
                    <Link to="/policies/terms">terms</Link>{" "}
                    and{" "}
                    <Link to="/policies/returns">returns policy</Link>. The order is recorded in PostgreSQL and inventory is decremented, but no payment is collected and no shipment is created.
                  </>
                ) : (
                  <>
                    By placing this demo order you agree to Velora’s{" "}
                    <Link to="/policies/terms">terms</Link>{" "}
                    and{" "}
                    <Link to="/policies/returns">returns policy</Link>. This is a prototype; no contract of sale is formed.
                  </>
                )}
              </p>
            </section>
          )}
        </div>

        <aside className="summary-card checkout-summary">
          <span className="eyebrow">ORDER SUMMARY</span>
          <div className="checkout-mini-items">
            {lines.map((l) => (
              <div key={`${l.productId}::${l.size}`}>
                <img src={l.product.image} alt="" />
                <span><b>{l.product.name}</b><small>{l.size} · ×{l.qty}</small></span>
                <b>{money(linePrice(l, l.product) * l.qty)}</b>
              </div>
            ))}
          </div>
          <div className="summary-line"><span>Subtotal</span><b>{money(subtotal)}</b></div>
          {discount > 0 && <div className="summary-line"><span>Coupon {coupon.code}</span><b className="green">− {money(discount)}</b></div>}
          <div className="summary-line"><span>Delivery</span><b>{shipping === 0 ? "Free" : money(shipping)}</b></div>
          <div className="summary-line"><span>Taxes</span><b>Included</b></div>
          <div className="summary-total"><span>Total payable</span><b>{money(total)}</b></div>
          <p className="summary-note">Inclusive of all taxes. No hidden charges.</p>
          <div className="checkout-assurance">
            <span><ShieldCheck size={13} /> Stock revalidated at submission</span>
            <span><Truck size={13} /> 7-day returns on eligible pieces</span>
            <span><Lock size={13} /> Demo — no payment collected</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
