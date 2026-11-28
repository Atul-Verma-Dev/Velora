import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle, ArrowRight, BadgeCheck, BarChart3, Check, ChevronRight, ClipboardCheck,
  FileSearch, FileText, HelpCircle, LayoutDashboard, Lock, MessageSquare, Package, Plus,
  RotateCcw, Search, Shield, ShieldCheck, Store, Tag, Users, Wallet, X,
} from "lucide-react";
import { useApp, ADMIN_ROLES } from "../store/AppStore.jsx";
import { money } from "../lib/format.js";
import { stockForSize } from "../data/catalog.js";
import {
  Badge, Btn, Chip, EmptyState, Field, InfoNote, Modal, Stat, StatusPill, Tabs,
} from "../components/ui.jsx";
import { useParams } from "react-router-dom";

const NAV = [
  { id: "overview", label: "Marketplace overview", icon: <LayoutDashboard size={16} /> },
  { id: "sellers", label: "Seller operations", icon: <Store size={16} />, perm: "sellers" },
  { id: "catalogue", label: "Catalogue operations", icon: <Tag size={16} />, perm: "catalogue" },
  { id: "reviews", label: "Trust & safety", icon: <Shield size={16} />, perm: "reviews" },
  { id: "search", label: "Search quality", icon: <FileSearch size={16} /> },
  { id: "finance", label: "Finance & payouts", icon: <Wallet size={16} />, perm: "finance" },
  { id: "support", label: "Support cases", icon: <MessageSquare size={16} /> },
  { id: "config", label: "Marketplace config", icon: <ClipboardCheck size={16} />, perm: "config" },
  { id: "audit", label: "Audit log", icon: <FileText size={16} /> },
];

function ReasonModal({ open, title, actionLabel, onClose, onSubmit, children, requireReason = true }) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={title}>
      {children}
      {requireReason && (
        <Field label="Reason (recorded in the audit log)" required>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Policy reference, evidence reviewed, or corrective action required" />
        </Field>
      )}
      <div className="modal-actions">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn
          variant="dark"
          disabled={requireReason && reason.trim().length < 8}
          onClick={() => { onSubmit(reason.trim()); setReason(""); onClose(); }}
        >
          {actionLabel}
        </Btn>
      </div>
    </Modal>
  );
}

export default function Operations() {
  const { section = "overview" } = useParams();
  const {
    products, orders, reviews, sellers, applications, config, setConfig, audit, searchLog,
    moderateListing, moderateSeller, moderateReview, can, adminRole, setAdminRole, notify, log, user,
  } = useApp();
  const [sellerTab, setSellerTab] = useState("applications");
  const [reviewTab, setReviewTab] = useState("queue");
  const [reason, setReason] = useState(null);
  const [configDraft, setConfigDraft] = useState(config);
  const [configReason, setConfigReason] = useState("");
  const [query, setQuery] = useState("");

  const pendingListings = products.filter((p) => p.status === "under_review");
  const flaggedReviews = useMemo(
    () => Object.entries(reviews).flatMap(([pid, list]) =>
      list.filter((r) => r.status === "pending" || r.flagged).map((r) => ({ ...r, productId: pid, product: products.find((p) => p.id === pid) }))
    ),
    [reviews, products]
  );
  const publishedReviews = useMemo(
    () => Object.entries(reviews).flatMap(([pid, list]) => list.filter((r) => r.status === "approved").map((r) => ({ ...r, productId: pid }))),
    [reviews]
  );
  const gmv = orders.filter((o) => !["Cancelled"].includes(o.status)).reduce((s, o) => s + o.total, 0);
  const activeSellers = sellers.filter((s) => s.status === "active").length;
  const openApplications = applications.filter((a) => a.status === "pending");
  const returnOrders = orders.filter((o) => o.returnReason || ["Return requested", "Returned"].includes(o.status));
  const settlements = orders.map((o) => {
    const commission = Math.round(o.total * (config.commission / 100));
    const fees = Math.round(o.total * (config.paymentFee / 100)) + config.logisticsFee;
    return { ...o, commission, fees, net: o.total - commission - fees - (o.status === "Returned" ? o.total : 0) };
  });

  const searchMetrics = useMemo(() => {
    const total = searchLog.length;
    const zero = searchLog.filter((s) => s.resultCount === 0).length;
    const avg = total ? Math.round(searchLog.reduce((s, x) => s + (x.durationMs || 0), 0) / total) : 0;
    const withImage = searchLog.filter((s) => s.hasImage).length;
    const excluded = searchLog.reduce((s, x) => s + (x.excluded?.price || 0) + (x.excluded?.category || 0) + (x.excluded?.colour || 0) + (x.excluded?.stock || 0), 0);
    return { total, zero, avg, withImage, excluded };
  }, [searchLog]);

  const permFor = (id) => NAV.find((n) => n.id === id)?.perm;
  const allowed = (id) => {
    const perm = permFor(id);
    return !perm || can(perm);
  };
  const currentNav = NAV.find((n) => n.id === section) || NAV[0];

  const approveSeller = (app, decision) => {
    if (decision === "active" && app.missing?.length) {
      notify("Cannot approve: required documents are missing", "error");
      return;
    }
    moderateSeller(app.sellerId, decision, decision === "active" ? "KYC and documents verified in demo review." : "Application could not be verified with the documents supplied.");
  };

  const updateConfig = () => {
    if (configReason.trim().length < 10) {
      notify("Add an audit reason of at least 10 characters", "error");
      return;
    }
    setConfig({ ...configDraft, ...Object.fromEntries(Object.entries(configDraft).map(([k, v]) => [k, typeof v === "number" ? Number(v) : v])) });
    log("Marketplace configuration updated", "Platform", configReason.trim(), "Super Admin");
    setConfigReason("");
    notify("Configuration saved and audit event recorded");
  };

  return (
    <main id="main" className="ops-shell">
      <aside className="ops-sidebar">
        <div className="partner-brand">
          <span className="partner-brand-mark ops">V</span>
          <div><b>Velora</b><small>Operations Console</small></div>
        </div>
        <div className="ops-identity">
          <span className="avatar">{user.name[0]}</span>
          <div><b>{user.name}</b><small>{ADMIN_ROLES.find((r) => r.id === adminRole)?.label}</small></div>
        </div>
        <label className="ops-role-switch">
          <span>Acting as</span>
          <select value={adminRole} onChange={(e) => setAdminRole(e.target.value)}>
            {ADMIN_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <p className="ops-role-scope">{ADMIN_ROLES.find((r) => r.id === adminRole)?.scope}</p>
        <nav aria-label="Operations navigation">
          {NAV.map((n) => (
            <Link key={n.id} to={`/operations/${n.id}`} className={`${section === n.id ? "active" : ""}${!allowed(n.id) ? " restricted" : ""}`}>
              {n.icon}<span>{n.label}</span>
              {!allowed(n.id) && <Lock size={12} />}
              {n.id === "catalogue" && pendingListings.length > 0 && <i>{pendingListings.length}</i>}
              {n.id === "reviews" && flaggedReviews.length > 0 && <i>{flaggedReviews.length}</i>}
              {n.id === "sellers" && openApplications.length > 0 && <i>{openApplications.length}</i>}
            </Link>
          ))}
        </nav>
        <div className="partner-side-foot">
          <Link to="/">← Back to storefront</Link>
          <small>Internal demo · role-gated</small>
        </div>
      </aside>

      <div className="ops-main">
        <div className="partner-topbar">
          <div>
            <span className="eyebrow">VELORA OPERATIONS CONSOLE</span>
            <h1>{currentNav.label}</h1>
          </div>
          <div className="partner-topbar-actions">
            <Badge tone="soft">{ADMIN_ROLES.find((r) => r.id === adminRole)?.label}</Badge>
            <Link to="/operations/audit" className="btn btn-ghost btn-sm">Audit log</Link>
          </div>
        </div>

        <div className="partner-content">
          {!allowed(section) && (
            <div className="restricted-panel">
              <span className="restricted-icon"><Lock size={20} /></span>
              <h2>Your sub-role does not include this module</h2>
              <p>
                {ADMIN_ROLES.find((r) => r.id === adminRole)?.label} can work only inside its assigned scope. Velora separates duties so
                that catalogue reviewers cannot change payouts, and finance cannot moderate reviews. Switch the demo sub-role to inspect
                another module, or ask a Super Admin for scoped access.
              </p>
              <div className="restricted-actions">
                {["super", "seller_ops", "catalogue", "trust", "finance"].filter((r) => r !== adminRole).slice(0, 3).map((r) => (
                  <Btn key={r} variant="outline" size="sm" onClick={() => setAdminRole(r)}>Act as {ADMIN_ROLES.find((x) => x.id === r).label}</Btn>
                ))}
              </div>
            </div>
          )}

          {section === "overview" && (
            <>
              <div className="stat-grid partner-stats">
                <Stat label="Demo GMV" value={money(gmv)} note={`${orders.length} orders`} icon={<BarChart3 size={15} />} />
                <Stat label="Active sellers" value={activeSellers} note={`${openApplications.length} applications pending`} icon={<Store size={15} />} />
                <Stat label="Live listings" value={products.filter((p) => p.status === "live").length} note={`${pendingListings.length} awaiting review`} icon={<Tag size={15} />} />
                <Stat label="Reviews in queue" value={flaggedReviews.length} note={`${publishedReviews.length} published`} icon={<Shield size={15} />} />
                <Stat label="Returns / refunds" value={returnOrders.length} note="Demo orders" icon={<Package size={15} />} />
                <Stat label="Payout exposure" value={money(settlements.filter((s) => s.status !== "Delivered").reduce((s, x) => s + x.net, 0))} note="Pending T+7" icon={<Wallet size={15} />} />
              </div>

              <div className="ops-queues">
                <Link to="/operations/sellers" className="queue-card">
                  <span className="queue-icon"><Users size={18} /></span>
                  <div><b>{openApplications.length} seller application(s)</b><p>Review KYC, brand rights and bank verification. Velora has no self-approval.</p></div>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/operations/catalogue" className="queue-card">
                  <span className="queue-icon"><Tag size={18} /></span>
                  <div><b>{pendingListings.length} listing(s) awaiting QC</b><p>Images, attributes, duplicate identity and category eligibility.</p></div>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/operations/reviews" className="queue-card">
                  <span className="queue-icon"><Shield size={18} /></span>
                  <div><b>{flaggedReviews.length} review(s) flagged or pending</b><p>Moderate against policy — never because a review is negative.</p></div>
                  <ArrowRight size={15} />
                </Link>
                <Link to="/operations/search" className="queue-card">
                  <span className="queue-icon"><Search size={18} /></span>
                  <div><b>{searchLog.length} search event(s) logged</b><p>Real on-device demo events: queries, exclusions and result counts.</p></div>
                  <ArrowRight size={15} />
                </Link>
              </div>

              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Platform health</b><span>Demo</span></div>
                  <ul className="plain-list">
                    <li><span>Search engine</span><b className="text-success">On-device demo operational</b></li>
                    <li><span>Model services</span><b className="text-warn">Not connected</b></li>
                    <li><span>Payments</span><b className="text-warn">Not connected</b></li>
                    <li><span>Inventory consistency</span><b className="text-warn">Browser-only, no server lock</b></li>
                    <li><span>Review summariser</span><b className="text-success">Deterministic from published reviews</b></li>
                  </ul>
                  <InfoNote tone="warning" title="Truthful status">
                    This console does not claim a production service level. Any metric requiring real traffic, payment or model
                    telemetry is marked unavailable rather than fabricated.
                  </InfoNote>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Recent administrative activity</b><Link to="/operations/audit" className="text-link">Full log</Link></div>
                  <div className="audit-mini">
                    {audit.slice(0, 5).map((a) => (
                      <div key={a.id}><b>{a.action}</b><span>{a.object}</span><small>{a.actor} · {a.at}</small></div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="panel-card">
                <div className="panel-head"><b>Search interpretation health</b><span>Last {searchLog.length} searches</span></div>
                {searchLog.length === 0 ? (
                  <EmptyState compact title="No searches logged yet" body="Run a search in the storefront and its real demo metrics will appear here." action={<Btn to="/search" variant="dark" size="sm">Open search</Btn>} />
                ) : (
                  <div className="search-health">
                    <div><span>Queries</span><b>{searchMetrics.total}</b></div>
                    <div><span>Zero-result rate</span><b>{Math.round((searchMetrics.zero / searchMetrics.total) * 100)}%</b></div>
                    <div><span>Reference-image share</span><b>{Math.round((searchMetrics.withImage / searchMetrics.total) * 100)}%</b></div>
                    <div><span>Avg local latency</span><b>{searchMetrics.avg} ms</b></div>
                    <div><span>Hard-filter exclusions</span><b>{searchMetrics.excluded}</b></div>
                  </div>
                )}
              </section>
            </>
          )}

          {section === "sellers" && allowed("sellers") && (
            <>
              <Tabs
                items={[
                  { id: "applications", label: "Applications", count: openApplications.length },
                  { id: "sellers", label: "All sellers", count: sellers.length },
                ]}
                value={sellerTab}
                onChange={setSellerTab}
              />
              {sellerTab === "applications" && (
                <div className="ops-stack">
                  {openApplications.length === 0 ? <EmptyState compact title="No pending applications" body="New seller applications appear here for KYC review." /> : openApplications.map((app) => (
                    <article className="panel-card application-card" key={app.id}>
                      <div className="application-head">
                        <span className="avatar large">{app.name[0]}</span>
                        <div><b>{app.name}</b><small>{app.owner} · {app.city} · submitted {app.submitted}</small></div>
                        <StatusPill status={app.status} />
                      </div>
                      <div className="application-grid">
                        <div><span className="eyebrow">DOCUMENTS</span>{app.documents.map((d) => <p key={d}><FileText size={13} /> {d}</p>)}{app.missing.map((d) => <p key={d} className="text-danger"><AlertCircle size={13} /> {d} — missing</p>)}</div>
                        <div><span className="eyebrow">CATEGORIES</span><p>{app.categories.join(", ")}</p><span className="eyebrow">KYC</span><p className="capitalise">{app.kyc.replace("_", " ")}</p></div>
                        <div><span className="eyebrow">REVIEW NOTE</span><p>{app.note}</p></div>
                      </div>
                      <div className="application-actions">
                        <Btn
                          variant="dark"
                          size="sm"
                          onClick={() => {
                            if (app.missing.length) return notify("Resolve missing documents before approval", "error");
                            setReason({
                              title: `Approve ${app.name}?`,
                              action: "Approve seller",
                              children: <InfoNote tone="soft" title="Approval">Approving unlocks catalogue creation for the declared categories. KYC is recorded as verified and the seller cannot alter that record.</InfoNote>,
                              onSubmit: (r) => { moderateSeller(app.sellerId, "active", r); },
                            });
                          }}
                        >
                          Approve seller
                        </Btn>
                        <Btn
                          variant="outline"
                          size="sm"
                          onClick={() => setReason({
                            title: `Reject ${app.name}?`,
                            action: "Reject application",
                            children: <InfoNote tone="warning" title="Rejection">The seller will see the reason and can reapply with corrected documents.</InfoNote>,
                            onSubmit: (r) => moderateSeller(app.sellerId, "onboarding", r),
                          })}
                        >
                          Reject with reason
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={() => setReason({ title: `Request documents from ${app.name}`, action: "Request documents", children: <p className="modal-lede">Describe exactly which documents are missing and why.</p>, onSubmit: (r) => log("Documents requested", app.id, r, "Seller Operations") })}>Request documents</Btn>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {sellerTab === "sellers" && (
                <div className="panel-card">
                  <div className="panel-head"><b>Seller accounts</b><span>{sellers.length} records</span></div>
                  <div className="responsive-table">
                    <table className="data-table">
                      <thead><tr><th>Seller</th><th>KYC</th><th>Status</th><th>Categories</th><th>Commission</th><th>Listings</th><th></th></tr></thead>
                      <tbody>
                        {sellers.map((s) => (
                          <tr key={s.id}>
                            <td><div className="table-product"><span className="seller-avatar small">{s.name[0]}</span><span><b>{s.name}</b><small>{s.legalName} · {s.city}</small></span></div></td>
                            <td><StatusPill status={s.kyc} /></td>
                            <td><StatusPill status={s.status} /></td>
                            <td>{s.categories.join(", ")}</td>
                            <td>{s.commission}%</td>
                            <td>{products.filter((p) => p.sellerId === s.id).length}</td>
                            <td>
                              {s.status === "active" ? (
                                <button type="button" className="danger-link" onClick={() => setReason({ title: `Suspend ${s.name}?`, action: "Suspend seller", children: <InfoNote tone="danger" title="High-risk action">Suspension hides all listings and blocks fulfilment actions. Finance and Super Admin approval should be required in production.</InfoNote>, onSubmit: (r) => moderateSeller(s.id, "suspended", r) })}>Suspend</button>
                              ) : (
                                <button type="button" className="text-link" onClick={() => setReason({ title: `Reactivate ${s.name}?`, action: "Reactivate seller", onSubmit: (r) => moderateSeller(s.id, "active", r) })}>Reactivate</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <InfoNote tone="soft" title="Separation of duties">
                Seller Operations may review applications and status, but cannot edit payouts or catalogue content. A seller can never
                approve its own KYC, listings or reviews.
              </InfoNote>
            </>
          )}

          {section === "catalogue" && allowed("catalogue") && (
            <>
              <div className="ops-stack">
                {pendingListings.length === 0 ? <EmptyState compact icon={<Tag size={20} />} title="No listings awaiting review" body="Seller submissions appear here before publication." /> : pendingListings.map((p) => (
                  <article className="panel-card review-product-card" key={p.id}>
                    <div className="review-product-main">
                      <img src={p.image} alt={p.name} />
                      <div>
                        <div className="review-product-head"><b>{p.name}</b><StatusPill status="Under review" /></div>
                        <small>{p.id} · {p.brand} · submitted {p.submittedAt || "recently"}</small>
                        <p>{p.description}</p>
                        <div className="review-attributes">
                          <span><small>Category</small>{p.category} / {p.subcategory}</span>
                          <span><small>Price</small>{money(p.price)} <em>MRP {money(p.mrp)}</em></span>
                          <span><small>Fabric</small>{p.fabric}</span>
                          <span><small>Fit</small>{p.fit}</span>
                          <span><small>Sizes</small>{p.sizes.join(", ")}</span>
                          <span><small>Stock</small>{p.stock}</span>
                        </div>
                        <div className="qc-checks">
                          <span className="ok"><Check size={12} /> Attributes complete</span>
                          <span className={p.image.includes("reference") ? "warn" : "ok"}><Check size={12} /> Image resolution (demo)</span>
                          <span className="ok"><Check size={12} /> No duplicate identity found</span>
                          <span className="warn"><AlertCircle size={12} /> Manual fit-spec verification recommended</span>
                        </div>
                      </div>
                    </div>
                    <div className="review-product-actions">
                      <Btn variant="dark" size="sm" onClick={() => setReason({ title: `Approve ${p.name}?`, action: "Approve & publish", onSubmit: (r) => moderateListing(p.id, "live", r) })}>Approve & publish</Btn>
                      <Btn variant="outline" size="sm" onClick={() => setReason({ title: `Reject ${p.name}?`, action: "Reject listing", children: <p className="modal-lede">The seller sees this reason and can correct and resubmit. Be specific: image resolution, attribute, rights, compliance.</p>, onSubmit: (r) => moderateListing(p.id, "rejected", r) })}>Reject with reason</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setReason({ title: `Request changes to ${p.name}`, action: "Send back for correction", onSubmit: (r) => moderateListing(p.id, "draft", r) })}>Request correction</Btn>
                    </div>
                  </article>
                ))}
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Rejected & suppressed listings</b><span>{products.filter((p) => ["rejected", "suppressed"].includes(p.status)).length}</span></div>
                {products.filter((p) => ["rejected", "suppressed"].includes(p.status)).length === 0 ? <EmptyState compact title="Nothing rejected" /> : (
                  products.filter((p) => ["rejected", "suppressed"].includes(p.status)).map((p) => (
                    <div className="suppressed-row" key={p.id}>
                      <img src={p.image} alt="" />
                      <div><b>{p.name}</b><small>{p.id} · {p.rejectionReason || "Suppressed for policy or stock integrity"}</small></div>
                      <StatusPill status={p.status} />
                      <Link to={`/product/${p.id}`} className="text-link">Preview</Link>
                    </div>
                  ))
                )}
              </div>
              <InfoNote tone="soft" title="Catalogue policy">
                Rejection requires a specific, actionable reason. Image standards, attribute accuracy, brand authorisation and
                duplicate product identity are checked before publication. Approval is not available to the seller.
              </InfoNote>
            </>
          )}

          {section === "reviews" && allowed("reviews") && (
            <>
              <Tabs
                items={[
                  { id: "queue", label: "Moderation queue", count: flaggedReviews.length },
                  { id: "published", label: "Published", count: publishedReviews.length },
                ]}
                value={reviewTab}
                onChange={setReviewTab}
              />
              {reviewTab === "queue" && (flaggedReviews.length === 0 ? (
                <EmptyState icon={<ShieldCheck size={22} />} title="Queue is clear" body="Flagged and pending reviews appear here. New shopper reviews wait for moderation before publication." />
              ) : (
                <div className="ops-stack">
                  {flaggedReviews.map((r) => (
                    <article className="panel-card moderation-card" key={r.id}>
                      <div className="moderation-main">
                        {r.product && <img src={r.product.image} alt="" />}
                        <div>
                          <div className="moderation-title">
                            <b>{r.title}</b>
                            <span className="review-stars">{"★".repeat(r.rating)}</span>
                            {r.flagged && <Badge tone="danger">Flagged</Badge>}
                            <Badge tone="warning">{r.status}</Badge>
                          </div>
                          <p>{r.body}</p>
                          <small>{r.name} · {r.date} · {r.verified ? "Verified purchase" : "Unverified"} · {r.product?.name}</small>
                          {r.flagReason && <p className="flag-reason"><AlertCircle size={13} /> {r.flagReason}</p>}
                          {r.moderationReason && <p className="flag-reason">Previous decision: {r.moderationReason}</p>}
                        </div>
                      </div>
                      <div className="moderation-actions">
                        <Btn
                          size="sm"
                          variant="dark"
                          onClick={() => setReason({
                            title: "Publish this review?",
                            action: "Approve review",
                            children: <p className="modal-lede">Approve only when the review complies with policy. Negative opinions are not a reason to reject.</p>,
                            onSubmit: (reason) => moderateReview({ productId: r.productId, reviewId: r.id, status: "approved", reason }),
                          })}
                        >
                          Approve
                        </Btn>
                        <Btn
                          size="sm"
                          variant="outline"
                          onClick={() => setReason({
                            title: "Remove this review?",
                            action: "Remove review",
                            children: <InfoNote tone="danger" title="Policy required">Removal must cite abuse, spam, personal data, irrelevance or fraud. Criticism of the product is not a valid reason. The seller will see an audit record.</InfoNote>,
                            onSubmit: (reason) => moderateReview({ productId: r.productId, reviewId: r.id, status: "rejected", reason }),
                          })}
                        >
                          Remove with policy reason
                        </Btn>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => setReason({
                            title: "Request an edit?",
                            action: "Send back",
                            children: <p className="modal-lede">Ask the shopper to remove personal data or clarify the relevant product issue.</p>,
                            onSubmit: (reason) => moderateReview({ productId: r.productId, reviewId: r.id, status: "pending", reason }),
                          })}
                        >
                          Request edit
                        </Btn>
                        <span className="moderation-hint">Seller: {r.product?.sellerName || "—"} · cannot moderate</span>
                      </div>
                    </article>
                  ))}
                </div>
              ))}
              {reviewTab === "published" && (
                <div className="panel-card">
                  <div className="panel-head"><b>Published reviews</b><span>{publishedReviews.length}</span></div>
                  <div className="responsive-table">
                    <table className="data-table">
                      <thead><tr><th>Product</th><th>Rating</th><th>Review</th><th>Verified</th><th>Helpful</th></tr></thead>
                      <tbody>
                        {publishedReviews.map((r) => (
                          <tr key={r.id}>
                            <td>{r.product?.name || r.productId}</td>
                            <td>{r.rating}★</td>
                            <td><b>{r.title}</b><small className="block-muted">{r.body.slice(0, 80)}…</small></td>
                            <td>{r.verified ? <Badge tone="success">Yes</Badge> : <Badge tone="neutral">No</Badge>}</td>
                            <td>{r.helpful}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <InfoNote tone="warning" title="Review integrity">
                A seller cannot hide, edit or approve reviews. Every moderation action records the reviewer, time, reason and previous
                state. The AI summary is recomputed only from published reviews and is not editable by sellers.
              </InfoNote>
            </>
          )}

          {section === "search" && (
            <>
              <div className="stat-grid partner-stats">
                <Stat label="Searches logged" value={searchMetrics.total} note="This browser only" icon={<Search size={15} />} />
                <Stat label="Zero-result rate" value={searchMetrics.total ? `${Math.round((searchMetrics.zero / searchMetrics.total) * 100)}%` : "—"} icon={<AlertCircle size={15} />} />
                <Stat label="With reference image" value={searchMetrics.withImage} note={`${searchMetrics.total ? Math.round((searchMetrics.withImage / searchMetrics.total) * 100) : 0}% of searches`} icon={<FileSearch size={15} />} />
                <Stat label="Avg local latency" value={`${searchMetrics.avg} ms`} note="Actual measured demo time" icon={<BarChart3 size={15} />} />
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Recent search requests</b><span>No customer identity exposed</span></div>
                {searchLog.length === 0 ? (
                  <EmptyState compact title="No searches logged in this browser" body="Search events are recorded when you use Velora Discovery." action={<Btn to="/search" variant="dark" size="sm">Run a demo search</Btn>} />
                ) : (
                  <div className="responsive-table">
                    <table className="data-table">
                      <thead><tr><th>Time</th><th>Query</th><th>Image</th><th>Results</th><th>Excluded (price / category / colour / stock)</th><th>Latency</th></tr></thead>
                      <tbody>
                        {searchLog.map((s) => (
                          <tr key={s.id}>
                            <td>{s.at}</td>
                            <td><b>{s.query}</b></td>
                            <td>{s.hasImage ? <Badge tone="info">Reference</Badge> : <span className="muted">Text only</span>}</td>
                            <td>{s.resultCount === 0 ? <Badge tone="danger">0 — no result</Badge> : s.resultCount}</td>
                            <td>{s.excluded.price} / {s.excluded.category} / {s.excluded.colour} / {s.excluded.stock}</td>
                            <td>{s.durationMs} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Pipeline status</b><Badge tone="warning">Demo engine</Badge></div>
                  <ul className="plain-list">
                    <li><span>Thread A — language interpretation</span><b className="text-success">On-device, deterministic</b></li>
                    <li><span>Thread B — visual encoder</span><b className="text-warn">Canvas palette proxy, no embedding</b></li>
                    <li><span>Hard filters</span><b className="text-success">Applied before ranking</b></li>
                    <li><span>Fusion weights</span><b>0.4 text / 0.6 image (with image)</b></li>
                    <li><span>Index age</span><b>Not applicable</b></li>
                  </ul>
                  <InfoNote tone="soft" title="Model services are not connected">
                    No parsing failures, embedding failures, drift or index staleness can be reported because no model is called. Those
                    monitors must be built alongside the production pipeline.
                  </InfoNote>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Ranking weights</b><span>Configuration</span></div>
                  <div className="weight-row"><span>Text similarity</span><b>0.40</b></div>
                  <div className="weight-row"><span>Visual similarity</span><b>0.60</b></div>
                  <p className="panel-note">Starting values from the product blueprint; must be tuned against a labelled fashion-matching set before launch. Changing weights is a high-risk action and requires Super Admin plus an audit reason.</p>
                  <Btn variant="outline" size="sm" to="/operations/config" disabled={!can("config")}>Configure weights</Btn>
                </section>
              </div>
              <InfoNote tone="soft" title="Ranking transparency">
                Velora applies hard constraints before relevance ranking. Sponsored placements must be labelled, and ranking parameters
                must be explainable in plain language. This demo does not sell placement.
              </InfoNote>
            </>
          )}

          {section === "finance" && allowed("finance") && (
            <>
              <div className="stat-grid partner-stats">
                <Stat label="GMV" value={money(gmv)} icon={<BarChart3 size={15} />} />
                <Stat label="Commission earned" value={money(settlements.reduce((s, x) => s + x.commission, 0))} icon={<Wallet size={15} />} />
                <Stat label="Fees collected" value={money(settlements.reduce((s, x) => s + x.fees, 0))} icon={<BadgeCheck size={15} />} />
                <Stat label="Refunds issued" value={money(orders.filter((o) => o.status === "Returned").reduce((s, o) => s + o.total, 0))} icon={<Package size={15} />} />
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Order-level reconciliation</b><span>Demo orders</span></div>
                <div className="responsive-table">
                  <table className="data-table">
                    <thead><tr><th>Order</th><th>Date</th><th>Gross</th><th>Commission</th><th>Fees</th><th>Refund</th><th>Seller net</th><th>Status</th></tr></thead>
                    <tbody>
                      {settlements.map((s) => (
                        <tr key={s.id}>
                          <td>{s.id}</td><td>{s.date}</td><td>{money(s.total)}</td><td>− {money(s.commission)}</td>
                          <td>− {money(s.fees)}</td><td>{s.status === "Returned" ? `− ${money(s.total)}` : "—"}</td>
                          <td><b>{money(s.net)}</b></td><td><StatusPill status={s.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Payout holds</b><Badge tone="success">None</Badge></div>
                  <p className="panel-text">No payout holds are active. Finance can place a hold only with a reason and a second approver; the action is audited.</p>
                  <Btn variant="outline" size="sm" onClick={() => setReason({ title: "Place a payout hold", action: "Request hold", children: <p className="modal-lede">Production requires a second approver before a hold takes effect.</p>, onSubmit: (r) => { log("Payout hold requested", "Settlement run", r, "Finance"); notify("Hold request recorded (demo)"); } })}>Request a payout hold</Btn>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Commission rules</b><span>Read-only in finance</span></div>
                  <ul className="plain-list">
                    <li><span>Standard apparel commission</span><b>{config.commission}%</b></li>
                    <li><span>Payment processing</span><b>{config.paymentFee}%</b></li>
                    <li><span>Logistics (managed)</span><b>{money(config.logisticsFee)}</b></li>
                    <li><span>Settlement cycle</span><b>Weekly · T+7</b></li>
                  </ul>
                  <InfoNote tone="soft">Commission changes belong to Super Admin configuration, not Finance.</InfoNote>
                </section>
              </div>
              <InfoNote tone="warning" title="No real money">
                Figures are computed from local demo orders. No payment, refund, hold or settlement is executed.
              </InfoNote>
            </>
          )}

          {section === "support" && (
            <>
              <div className="stat-grid partner-stats">
                <Stat label="Open cases" value={orders.filter((o) => o.returnReason).length} note="Demo return cases" icon={<MessageSquare size={15} />} />
                <Stat label="Flagged reviews" value={flaggedReviews.length} note="Trust & Safety queue" icon={<Shield size={15} />} />
                <Stat label="Grievances" value="0" note="No real complaints in demo" icon={<FileText size={15} />} />
                <Stat label="SLA breaches" value="Not measured" note="No server timers" icon={<AlertCircle size={15} />} />
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Cases from demo orders</b><span>Order-linked</span></div>
                {returnOrders.length === 0 ? <EmptyState compact title="No open cases" /> : (
                  <div className="case-list">
                    {returnOrders.map((o) => (
                      <div className="case-row" key={o.id}>
                        <span className="case-icon"><RotateCcw size={15} /></span>
                        <div><b>{o.id} · {o.returnReason || "Return requested"}</b><small>{o.customer || "Aarav Mehta"} · {o.date} · {money(o.total)}</small></div>
                        <StatusPill status={o.returnStatus || o.status} />
                        <Btn size="sm" variant="outline" onClick={() => notify("Case note saved in demo")}>Add note</Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Grievance workflow</b><Badge tone="warning">Not implemented</Badge></div>
                  <p className="panel-text">The 2026 e-commerce rules require a grievance workflow with acknowledgement within 48 hours and resolution within one month. This demo has no real ticket store, SLA timer or exportable communication history.</p>
                  <Btn variant="outline" size="sm" to="/help/grievance">Read the published policy</Btn>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Support macro</b><span>Demo</span></div>
                  <p className="panel-text">Return window reminders, fit guidance caveats and payment-demo clarifications are the three most common reply templates. Production would store them in a support system with audit.</p>
                </section>
              </div>
            </>
          )}

          {section === "config" && allowed("config") && (
            <>
              <InfoNote tone="warning" title="High-risk configuration">
                Commission, fees, return windows and bundle gates affect shoppers and sellers directly. Every change requires an audit
                reason; production also requires two-person approval.
              </InfoNote>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Marketplace economics</b><Badge tone="soft">Editable</Badge></div>
                  <div className="form-row">
                    <Field label="Commission (%)"><input type="number" value={configDraft.commission} onChange={(e) => setConfigDraft({ ...configDraft, commission: e.target.value })} /></Field>
                    <Field label="Payment fee (%)"><input type="number" value={configDraft.paymentFee} onChange={(e) => setConfigDraft({ ...configDraft, paymentFee: e.target.value })} /></Field>
                  </div>
                  <div className="form-row">
                    <Field label="Logistics fee (₹)"><input type="number" value={configDraft.logisticsFee} onChange={(e) => setConfigDraft({ ...configDraft, logisticsFee: e.target.value })} /></Field>
                    <Field label="Free shipping threshold (₹)"><input type="number" value={configDraft.freeShippingThreshold} onChange={(e) => setConfigDraft({ ...configDraft, freeShippingThreshold: e.target.value })} /></Field>
                  </div>
                  <div className="form-row">
                    <Field label="Return window (days)"><input type="number" value={configDraft.returnWindow} onChange={(e) => setConfigDraft({ ...configDraft, returnWindow: e.target.value })} /></Field>
                    <Field label="Deep bundle cart gate (₹)"><input type="number" value={configDraft.deepBundleGate} onChange={(e) => setConfigDraft({ ...configDraft, deepBundleGate: e.target.value })} /></Field>
                  </div>
                  <Field label="Complete the Look offers">
                    <select value={configDraft.offersEnabled ? "on" : "off"} onChange={(e) => setConfigDraft({ ...configDraft, offersEnabled: e.target.value === "on" })}>
                      <option value="on">Enabled</option>
                      <option value="off">Paused</option>
                    </select>
                  </Field>
                  <Field label="Audit reason (required)">
                    <textarea rows={2} value={configReason} onChange={(e) => setConfigReason(e.target.value)} placeholder="Why is this change being made?" />
                  </Field>
                  <Btn variant="dark" onClick={updateConfig}>Save configuration</Btn>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Current live values</b><span>Audited</span></div>
                  <ul className="plain-list">
                    <li><span>Commission</span><b>{config.commission}%</b></li>
                    <li><span>Payment fee</span><b>{config.paymentFee}%</b></li>
                    <li><span>Logistics fee</span><b>{money(config.logisticsFee)}</b></li>
                    <li><span>Free shipping</span><b>{money(config.freeShippingThreshold)}</b></li>
                    <li><span>Return window</span><b>{config.returnWindow} days</b></li>
                    <li><span>Deep bundle gate</span><b>{money(config.deepBundleGate)}</b></li>
                    <li><span>Offers</span><b>{config.offersEnabled ? "Enabled" : "Paused"}</b></li>
                  </ul>
                  <InfoNote tone="soft" title="Category & attribute schemas">
                    Category trees and attribute schemas are not editable in this demo. They are versioned configuration in production,
                    with migration plans for existing listings.
                  </InfoNote>
                </section>
              </div>
            </>
          )}

          {section === "audit" && (
            <>
              <div className="panel-head audit-head">
                <b>Immutable action log · demo</b>
                <div className="audit-filters">
                  <Chip active>All actions</Chip>
                  <Chip>Listings</Chip>
                  <Chip>Reviews</Chip>
                  <Chip>Finance</Chip>
                </div>
              </div>
              <div className="panel-card">
                <div className="audit-table">
                  {audit.length === 0 ? <EmptyState compact title="No audit events yet" /> : audit.map((a) => (
                    <div className="audit-row" key={a.id}>
                      <span className="audit-time">{a.at}</span>
                      <div><b>{a.action}</b><small>{a.detail}</small></div>
                      <span>{a.object}</span>
                      <span className="audit-actor">{a.actor}<small>{a.role}</small></span>
                    </div>
                  ))}
                </div>
              </div>
              <InfoNote tone="soft" title="Retention">
                Production must store audit events immutably, with export permissioned and itself logged. This demo keeps the last 80
                events in localStorage.
              </InfoNote>
            </>
          )}
        </div>
      </div>

      <ReasonModal
        open={Boolean(reason)}
        title={reason?.title}
        actionLabel={reason?.action}
        onClose={() => setReason(null)}
        onSubmit={(r) => { reason?.onSubmit(r); }}
      >
        {reason?.children}
      </ReasonModal>
    </main>
  );
}
