import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Check, Heart, MapPin, Package, Pencil, Plus, Ruler,
  ShieldCheck, ShoppingBag, Star, Trash2, Truck, User, Wallet,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { formatDate, money } from "../lib/format.js";
import { fitProfileFor } from "../lib/fit.js";
import {
  Badge, Breadcrumbs, Btn, EmptyState, Field, InfoNote, Modal, PageHead, StatusPill, Tabs,
} from "../components/ui.jsx";

const NAV = [
  { id: "overview", label: "Overview", to: "/account", icon: <User size={16} /> },
  { id: "orders", label: "Orders & returns", to: "/account/orders", icon: <Package size={16} /> },
  { id: "addresses", label: "Addresses", to: "/account/addresses", icon: <MapPin size={16} /> },
  { id: "reviews", label: "Your reviews", to: "/account/reviews", icon: <Star size={16} /> },
  { id: "profile", label: "Profile & fit", to: "/account/profile", icon: <Ruler size={16} /> },
];

function AddressModal({ open, onClose, initial, onSave }) {
  const [form, setForm] = useState(initial || { label: "Home", name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false });
  const [errors, setErrors] = useState({});
  const save = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) e.phone = "Enter a 10-digit mobile number.";
    if (!form.line1.trim()) e.line1 = "Address is required.";
    if (!form.city.trim()) e.city = "City is required.";
    if (!form.state.trim()) e.state = "State is required.";
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = "Enter a 6-digit pincode.";
    setErrors(e);
    if (Object.keys(e).length) return;
    onSave(form);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit address" : "Add a new address"}>
      <div className="form-row">
        <Field label="Full name" required error={errors.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Mobile" required error={errors.phone}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      </div>
      <Field label="Address line 1" required error={errors.line1}><input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} /></Field>
      <Field label="Address line 2"><input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} /></Field>
      <div className="form-row three">
        <Field label="City" required error={errors.city}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        <Field label="State" required error={errors.state}><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
        <Field label="Pincode" required error={errors.pincode}><input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Label"><select value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}><option>Home</option><option>Work</option><option>Other</option></select></Field>
        <label className="check-inline align-end"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /><span>Set as default</span></label>
      </div>
      <div className="modal-actions">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="dark" onClick={save}>Save address</Btn>
      </div>
    </Modal>
  );
}

export function OrderDetail() {
  const { orderId } = useParams();
  const { orders, requestReturn, updateOrderStatus, products, notify } = useApp();
  const order = orders.find((o) => o.id === orderId);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState("Fit — too small");
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!order) {
    return (
      <main id="main" className="page-shell">
        <EmptyState icon={<Package size={22} />} title="Order not found" body="This order isn't in your history." action={<Btn to="/account/orders" variant="dark">Back to orders</Btn>} />
      </main>
    );
  }

  return (
    <div className="order-detail">
      <Breadcrumbs items={[{ label: "Account", to: "/account" }, { label: "Orders", to: "/account/orders" }, { label: order.id }]} />
      <div className="order-detail-head">
        <div>
          <span className="eyebrow">ORDER {order.id}</span>
          <h1>{order.status}</h1>
          <p>Placed {order.date} · {order.items.length} {order.items.length === 1 ? "item" : "items"} · {money(order.total)}</p>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="order-detail-layout">
        <div>
          <section className="panel-card order-timeline-card">
            <div className="panel-head"><b>Order status</b><span>{order.delivery}</span></div>
            <ol className="timeline">
              {order.tracking.map((t, i) => (
                <li key={t.label} className={t.done ? "done" : ""}>
                  <span className="timeline-dot">{t.done ? <Check size={11} /> : i + 1}</span>
                  <div><b>{t.label}</b><small>{t.date}</small></div>
                </li>
              ))}
            </ol>
            {order.returnReason && (
              <InfoNote tone="warning" title="Return in progress">
                Reason: {order.returnReason}. Status: {order.returnStatus || "Return requested"}. Refund is issued after pickup and inspection.
              </InfoNote>
            )}
          </section>

          <section className="panel-card">
            <div className="panel-head"><b>Items</b><span>Sold by {[...new Set(order.items.map((i) => i.sellerName))].join(", ")}</span></div>
            <div className="order-items">
              {order.items.map((i) => (
                <div className="order-item" key={`${i.id}-${i.size}`}>
                  <img src={i.image} alt="" />
                  <div>
                    <Link to={`/product/${i.id}`}><b>{i.name}</b></Link>
                    <span>{i.brand} · Size {i.size} · {i.colour}</span>
                    <small>Qty {i.qty} · {money(i.price)}</small>
                  </div>
                  <div className="order-item-actions">
                    <b>{money(i.price * i.qty)}</b>
                    {order.status === "Delivered" && <Link className="text-link" to={`/product/${i.id}#reviews`}>Write a review</Link>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="panel-head"><b>Delivery & payment</b></div>
            <div className="order-meta-grid">
              <div><span>Deliver to</span><b>{order.address}</b><small>{order.contact}</small></div>
              <div><span>Payment</span><b>{order.payment}</b><small>Demo — no charge was made</small></div>
              <div><span>Delivery</span><b>{order.delivery}</b><small>Tracking is simulated in this demo</small></div>
            </div>
          </section>

          <div className="order-actions">
            {order.status === "Processing" && (
              <Btn variant="outline" onClick={() => setCancelOpen(true)}>Cancel order</Btn>
            )}
            {order.status === "Delivered" && !order.returnReason && (
              <Btn variant="outline" onClick={() => setReturnOpen(true)}>Request a return</Btn>
            )}
            {order.status === "Shipped" && (
              <Btn variant="outline" onClick={() => updateOrderStatus(order.id, "Delivered", "Demo delivery confirmation")}>Mark as received (demo)</Btn>
            )}
            <Btn to="/help/returns" variant="ghost">Return policy</Btn>
          </div>
        </div>

        <aside className="summary-card">
          <span className="eyebrow">PAYMENT SUMMARY</span>
          <div className="summary-line"><span>Subtotal</span><b>{money(order.subtotal || order.total)}</b></div>
          {order.discount > 0 && <div className="summary-line"><span>Discount</span><b className="green">− {money(order.discount)}</b></div>}
          <div className="summary-line"><span>Delivery</span><b>{order.shipping ? money(order.shipping) : "Free"}</b></div>
          <div className="summary-total"><span>Total</span><b>{money(order.total)}</b></div>
          <p className="summary-note">Taxes included. Prices are demo values.</p>
          <div className="order-help">
            <ShieldCheck size={15} />
            <p>Need help with this order? <Link to="/help">Contact support</Link> and quote {order.id}.</p>
          </div>
        </aside>
      </div>

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Request a return">
        <p className="modal-lede">Eligible pieces can be returned within 7 days of delivery, unworn with tags. Refunds are issued after pickup and inspection.</p>
        <Field label="Reason for return">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {["Fit — too small", "Fit — too large", "Not as described", "Colour differs", "Quality issue", "Changed my mind"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <InfoNote tone="soft">Pickup is scheduled within 2–4 business days. This creates a demo return request only.</InfoNote>
        <div className="modal-actions">
          <Btn variant="ghost" onClick={() => setReturnOpen(false)}>Cancel</Btn>
          <Btn variant="dark" onClick={() => { requestReturn(order.id, reason); setReturnOpen(false); }}>Submit request</Btn>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?">
        <p className="modal-lede">You can cancel before the seller packs the order. This demo will mark it cancelled; no real refund is processed.</p>
        <div className="modal-actions">
          <Btn variant="ghost" onClick={() => setCancelOpen(false)}>Keep order</Btn>
          <Btn
            variant="dark"
            onClick={() => {
              updateOrderStatus(order.id, "Cancelled", "Cancelled by shopper before dispatch");
              notify("Order cancelled in this demo");
              setCancelOpen(false);
            }}
          >
            Cancel order
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

export default function Account({ section = "overview" }) {
  const {
    user, orders, addresses, wishlist, reviews, fitProfile, setFitProfile, saveAddress, deleteAddress,
    products, notify, role,
  } = useApp();
  const { orderId } = useParams();
  const nav = useNavigate();
  const [addressModal, setAddressModal] = useState(null);
  const [orderFilter, setOrderFilter] = useState("all");

  const myOrders = orders
    .filter((o) => o.userId === user.id)
    .slice()
    .sort((a, b) => String(b.placedAt || "").localeCompare(String(a.placedAt || "")));
  const myReviews = useMemo(
    () => Object.entries(reviews).flatMap(([pid, list]) =>
      list.filter((r) => r.name === user.name).map((r) => ({ ...r, product: products.find((p) => p.id === pid) }))
    ),
    [reviews, user.name, products]
  );
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];
  const fitProduct = products.find((p) => p.status === "live" && p.category !== "Accessories");
  const fit = fitProfileFor(fitProduct, fitProfile);
  const filteredOrders = myOrders.filter((o) =>
    orderFilter === "all" ? true :
    orderFilter === "progress" ? ["Processing", "Shipped"].includes(o.status) :
    orderFilter === "delivered" ? o.status === "Delivered" :
    ["Returned", "Return requested"].includes(o.status)
  );

  const tabs = [
    { id: "all", label: "All", count: myOrders.length },
    { id: "progress", label: "In progress", count: myOrders.filter((o) => ["Processing", "Shipped"].includes(o.status)).length },
    { id: "delivered", label: "Delivered", count: myOrders.filter((o) => o.status === "Delivered").length },
    { id: "returns", label: "Returns", count: myOrders.filter((o) => ["Returned", "Return requested"].includes(o.status)).length },
  ];

  return (
    <main id="main" className="page-shell account-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Account", to: "/account" }, ...(section !== "overview" ? [{ label: NAV.find((n) => n.id === section)?.label }] : [])]} />

      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="account-identity">
            <span className="avatar large">{user.name.slice(0, 1)}</span>
            <div><b>{user.name}</b><small>{user.email}</small><Badge tone="soft">{role === "seller" ? "Seller demo" : role === "admin" ? "Operations demo" : "Shopper demo"}</Badge></div>
          </div>
          <nav aria-label="Account navigation">
            {NAV.map((n) => <Link key={n.id} to={n.to} className={section === n.id ? "active" : ""}>{n.icon}{n.label}</Link>)}
            <Link to="/wishlist"><Heart size={16} /> Wishlist <span>{wishlist.length}</span></Link>
            <Link to="/help"><ShieldCheck size={16} /> Help & support</Link>
            {role === "seller" && <Link to="/partner"><BadgeCheck size={16} /> Partner Hub</Link>}
            {role === "admin" && <Link to="/operations"><ShieldCheck size={16} /> Operations Console</Link>}
          </nav>
          <div className="account-demo-note">
            <b>Demo account</b>
            <p>There is no real sign-in. Orders, reviews and addresses live in this browser.</p>
            <Link to="/login" className="text-link">About sign-in <ArrowUpRight size={13} /></Link>
          </div>
        </aside>

        <div className="account-content">
          {section === "overview" && (
            <>
              <PageHead eyebrow="YOUR ACCOUNT" title={<>Hello, <em>{user.name.split(" ")[0]}.</em></>} caption="Orders, fit profile and saved pieces in one place." />
              <div className="account-cards">
                <Link to="/account/orders" className="account-card">
                  <span className="account-icon"><Package size={18} /></span>
                  <div><small>ORDERS</small><b>{myOrders.length} {myOrders.length === 1 ? "order" : "orders"}</b><span>{myOrders.filter((o) => ["Processing", "Shipped"].includes(o.status)).length} in progress</span></div>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/account/profile" className="account-card">
                  <span className="account-icon"><Ruler size={18} /></span>
                  <div><small>FIT PROFILE</small><b>{fitProfile ? "Set up" : "Not set up yet"}</b><span>{fitProfile ? `Suggests ${fit?.size || "—"} · ${fitProfile.mode === "precision" ? "measured" : "Fast Path"}` : "About 10 seconds"}</span></div>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/wishlist" className="account-card">
                  <span className="account-icon"><Heart size={18} /></span>
                  <div><small>WISHLIST</small><b>{wishlist.length} saved</b><span>Pieces you're considering</span></div>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/account/addresses" className="account-card">
                  <span className="account-icon"><MapPin size={18} /></span>
                  <div><small>ADDRESSES</small><b>{addresses.length} saved</b><span>{defaultAddress ? `${defaultAddress.city} ${defaultAddress.pincode}` : "Add one at checkout"}</span></div>
                  <ArrowRight size={15} />
                </Link>
              </div>

              <section className="account-section">
                <div className="section-head">
                  <div className="section-head-copy"><span className="eyebrow">RECENT</span><h2>Your latest order</h2></div>
                  <Link to="/account/orders" className="text-link">All orders <ArrowRight size={14} /></Link>
                </div>
                {myOrders.length ? (
                  <div className="order-card">
                    <div className="order-card-top">
                      <div><b>{myOrders[0].id}</b><small>{myOrders[0].date} · {myOrders[0].items.length} items · {money(myOrders[0].total)}</small></div>
                      <StatusPill status={myOrders[0].status} />
                    </div>
                    <div className="order-card-items">
                      {myOrders[0].items.map((i) => <img key={i.id} src={i.image} alt="" />)}
                      <div>{[...new Set(myOrders[0].items.map((i) => i.sellerName))].join(", ")}</div>
                      <Btn to={`/account/orders/${myOrders[0].id}`} variant="outline" size="sm">View details</Btn>
                    </div>
                  </div>
                ) : (
                  <EmptyState compact icon={<ShoppingBag size={20} />} title="No orders yet" body="Your first order will appear here." action={<Btn to="/shop" variant="dark" size="sm">Start shopping</Btn>} />
                )}
              </section>

              <section className="account-section">
                <div className="section-head"><div className="section-head-copy"><span className="eyebrow">FIT</span><h2>Your fit profile</h2></div></div>
                <div className="fit-inline-card">
                  <div>
                    <b>{fitProfile ? `Fast Path profile saved` : "No fit profile yet"}</b>
                    <p>{fitProfile ? `Suggested size for ${fitProduct.name}: ${fit?.size}. ${fit?.explanation}` : "Add height, weight and an anchor size to see garment-specific suggestions."}</p>
                  </div>
                  {fitProfile ? (
                    <div className="fit-inline-actions">
                      <Badge tone="success">{fit?.confidence}</Badge>
                      <Btn to="/fit" variant="outline" size="sm">Review profile</Btn>
                      <button type="button" className="danger-link" onClick={() => { setFitProfile(null); notify("Fit profile deleted from this browser"); }}>Delete</button>
                    </div>
                  ) : (
                    <Btn to="/fit" variant="dark" size="sm">Set up Fast Path</Btn>
                  )}
                </div>
              </section>
            </>
          )}

          {section === "orders" && (orderId ? <OrderDetail /> : (
            <>
              <PageHead eyebrow="YOUR ORDERS" title={<>Orders & <em>returns.</em></>} caption="Track what's on its way, start a return, or review something you've kept." />
              <Tabs items={tabs} value={orderFilter} onChange={setOrderFilter} />
              {filteredOrders.length === 0 ? (
                <EmptyState icon={<Package size={22} />} title="No orders in this view" body={orderFilter === "all" ? "Once you place an order it will appear here." : "Try another filter."} action={<Btn to="/shop" variant="dark">Browse the catalogue</Btn>} />
              ) : (
                <div className="orders-list">
                  {filteredOrders.map((o) => (
                    <article className="order-card" key={o.id}>
                      <div className="order-card-top">
                        <div><b>{o.id}</b><small>Placed {o.date} · {o.payment}</small></div>
                        <StatusPill status={o.status} />
                      </div>
                      <div className="order-card-items">
                        <div className="order-thumbs">{o.items.map((i) => <img key={`${i.id}-${i.size}`} src={i.image} alt="" />)}</div>
                        <div className="order-card-copy">
                          <b>{o.items.map((i) => i.name).join(", ")}</b>
                          <small>Size {o.items.map((i) => i.size).join(", ")} · {o.items.reduce((s, i) => s + i.qty, 0)} items</small>
                        </div>
                        <b className="order-total">{money(o.total)}</b>
                        <div className="order-card-actions">
                          <Btn to={`/account/orders/${o.id}`} variant="outline" size="sm">View details</Btn>
                          {o.status === "Delivered" && <Link className="text-link" to={`/product/${o.items[0].id}#reviews`}>Review</Link>}
                        </div>
                      </div>
                      {o.returnReason && <p className="order-card-note"><Truck size={13} /> Return: {o.returnReason} · {o.returnStatus || "Requested"}</p>}
                    </article>
                  ))}
                </div>
              )}
            </>
          ))}

          {section === "addresses" && (
            <>
              <PageHead eyebrow="DELIVERY" title={<>Saved <em>addresses.</em></>} caption="Used at checkout. Stored in this browser only." action={<Btn variant="dark" onClick={() => setAddressModal({})} icon={<Plus size={15} />}>Add address</Btn>} />
              <div className="address-grid">
                {addresses.map((a) => (
                  <div className={`address-card${a.isDefault ? " default" : ""}`} key={a.id}>
                    <div className="address-card-head">
                      <b>{a.name}</b>
                      <Badge tone="neutral">{a.label}</Badge>
                      {a.isDefault && <Badge tone="soft">Default</Badge>}
                    </div>
                    <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />{a.city}, {a.state} — {a.pincode}</p>
                    <small>{a.phone}</small>
                    <div className="address-card-actions">
                      <button type="button" className="text-link" onClick={() => setAddressModal({ ...a, id: a.id })}><Pencil size={13} /> Edit</button>
                      {!a.isDefault && <button type="button" className="text-link" onClick={() => saveAddress({ ...a, isDefault: true })}>Set default</button>}
                      <button type="button" className="danger-link" onClick={() => deleteAddress(a.id)}><Trash2 size={13} /> Remove</button>
                    </div>
                  </div>
                ))}
                <button type="button" className="address-add-card" onClick={() => setAddressModal({})}><Plus size={18} /><span>Add a new address</span></button>
              </div>
            </>
          )}

          {section === "reviews" && (
            <>
              <PageHead eyebrow="YOUR VOICE" title={<>Your <em>reviews.</em></>} caption="Reviews are published after moderation. You can review a piece once it has been delivered." />
              {myReviews.length === 0 ? (
                <EmptyState icon={<Star size={22} />} title="You haven't reviewed anything yet" body="After a delivery, open the product page to share fit, fabric and finish feedback." action={<Btn to="/account/orders" variant="dark">See delivered orders</Btn>} />
              ) : (
                <div className="my-reviews">
                  {myReviews.map((r) => (
                    <article className="my-review" key={r.id}>
                      <div className="my-review-head">
                        <img src={r.product?.image} alt="" />
                        <div><b>{r.product?.name || r.productId}</b><small>{r.date} · Size {r.sizeWorn} · Fit: {r.fit}</small></div>
                        <StatusPill status={r.status} />
                      </div>
                      <h3>{r.title}</h3>
                      <p>{r.body}</p>
                      <div className="my-review-foot">
                        <span><Star size={12} fill="currentColor" /> {r.rating}/5</span>
                        {r.verified && <span><BadgeCheck size={12} /> Verified purchase</span>}
                        {r.status === "pending" && <span className="muted">Awaiting moderation</span>}
                        {r.moderationReason && <span className="muted">Moderator note: {r.moderationReason}</span>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {section === "profile" && (
            <>
              <PageHead eyebrow="ACCOUNT DETAILS" title={<>Profile & <em>fit.</em></>} caption="This demo stores everything in your browser; there is no server account." />
              <section className="panel-card">
                <div className="panel-head"><b>Profile</b><Badge tone="soft">Demo</Badge></div>
                <div className="profile-grid">
                  <div><span>Name</span><b>{user.name}</b></div>
                  <div><span>Email</span><b>{user.email}</b></div>
                  <div><span>Demo role</span><b>{role}</b></div>
                  <div><span>Member since</span><b>Nov 2026</b></div>
                </div>
                <InfoNote tone="soft" title="Authentication is not implemented">
                  There is no password, session or identity verification in this prototype. Sign-in and account security must be
                  implemented server-side before any public launch. <Link to="/login">Read more</Link>.
                </InfoNote>
              </section>
              <section className="panel-card">
                <div className="panel-head"><b>Fit profile</b>{fitProfile ? <Badge tone="success">Saved · {fitProfile.updatedAt}</Badge> : <Badge tone="warning">Not set</Badge>}</div>
                {fitProfile ? (
                  <>
                    <div className="profile-grid">
                      <div><span>Height</span><b>{fitProfile.height} cm</b></div>
                      <div><span>Weight</span><b>{fitProfile.weight} kg</b></div>
                      <div><span>Body shape</span><b>{fitProfile.shape}</b></div>
                      <div><span>Usual size</span><b>{fitProfile.usualSize}</b></div>
                      <div><span>Anchor brand</span><b>{fitProfile.anchorBrand}</b></div>
                      <div><span>Mode</span><b>{fitProfile.mode === "precision" ? "Precision (manual)" : "Fast Path"}</b></div>
                    </div>
                    <div className="panel-actions">
                      <Btn to="/fit" variant="outline" size="sm">Edit profile</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => { setFitProfile(null); notify("Fit profile deleted"); }}>Delete fit data</Btn>
                    </div>
                  </>
                ) : (
                  <EmptyState compact icon={<Ruler size={20} />} title="No fit profile" body="A 10-second Fast Path makes size suggestions garment-specific." action={<Btn to="/fit" variant="dark" size="sm">Set up Fast Path</Btn>} />
                )}
              </section>
              <section className="panel-card">
                <div className="panel-head"><b>Notifications & privacy</b></div>
                <p className="panel-text">Order updates are shown in this account. No email or SMS is sent by this demo. Deleting your browser data clears all demo orders, reviews and fit inputs.</p>
                <div className="panel-actions"><Btn to="/policies/privacy" variant="outline" size="sm">Privacy policy</Btn></div>
              </section>
            </>
          )}
        </div>
      </div>

      <AddressModal
        key={addressModal?.id || (addressModal ? "new" : "closed")}
        open={Boolean(addressModal)}
        initial={addressModal?.id ? addressModal : null}
        onClose={() => setAddressModal(null)}
        onSave={saveAddress}
      />
    </main>
  );
}
