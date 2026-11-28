import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, BadgeCheck, Building2, Check, ChevronRight, FileText, HelpCircle,
  Info, Lock, Mail, MapPin, Package, Ruler, Send, ShieldCheck, Store, Truck, User,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { categories } from "../data/catalog.js";
import { sizeChart, garmentSpec } from "../lib/fit.js";
import { products as catalogue } from "../data/catalog.js";
import { Badge, Breadcrumbs, Btn, Field, InfoNote, PageHead } from "../components/ui.jsx";

export function Login() {
  const { switchRole, role } = useApp();
  return (
    <main id="main" className="page-shell narrow-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Sign in" }]} />
      <div className="login-card">
        <span className="eyebrow">ACCOUNT</span>
        <h1>Sign in to Velora</h1>
        <p>
          This prototype does not implement authentication. There is no password field, session or
          identity verification — and you should not enter a real password here.
        </p>
        <InfoNote tone="warning" title="Production requirement">
          A real launch needs server-side authentication (OTP/email or an identity provider), secure session
          handling, role checks for Partner Hub and Operations Console, and step-up verification for bank or
          payout changes. None of that exists in this build.
        </InfoNote>
        <div className="login-actions">
          <Btn to="/account" variant="dark" icon={<User size={15} />}>Continue as demo shopper</Btn>
          <Btn variant="outline" icon={<Store size={15} />} onClick={() => switchRole("seller")}>Preview Partner Hub</Btn>
        </div>
        <p className="login-foot">Currently viewing: <b>{role}</b>. Switch at any time from the account menu.</p>
        <div className="login-links">
          <Link to="/sell">Apply to sell</Link>
          <Link to="/help">Need help?</Link>
          <Link to="/policies/privacy">Privacy</Link>
        </div>
      </div>
    </main>
  );
}

export function Sell() {
  const { switchRole, notify } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ owner: "", brand: "", email: "", phone: "", city: "", category: "Ethnic Wear", gstin: "", consent: false });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const err = {};
    if (!form.owner.trim()) err.owner = "Your name is required.";
    if (!form.brand.trim()) err.brand = "Store or brand name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) err.email = "Enter a valid business email.";
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g, ""))) err.phone = "Enter a 10-digit mobile number.";
    if (!form.city.trim()) err.city = "City is required.";
    if (!form.gstin.trim()) err.gstin = "GSTIN is required for a GST-registered business.";
    if (!form.consent) err.consent = "Please accept the seller agreement to continue.";
    setErrors(err);
    if (Object.keys(err).length) return;
    setSubmitted(true);
    switchRole("seller");
    notify("Demo seller workspace created — no verification was performed");
  };

  if (submitted) {
    return (
      <main id="main" className="page-shell narrow-page">
        <div className="applied-card">
          <div className="confirm-mark"><Check size={24} /></div>
          <span className="eyebrow">DEMO APPLICATION SUBMITTED</span>
          <h1>Your Partner Hub preview is ready.</h1>
          <p>
            In a real marketplace, this application would now wait for business verification (PAN, GSTIN,
            bank account and brand authorisation where applicable). No documents were checked in this demo.
          </p>
          <InfoNote tone="soft" title="What is real here">
            The Partner Hub screens, catalogue states, inventory ledger and Complete the Look pricing floor are
            implemented against local demo data. Orders and settlements are simulated.
          </InfoNote>
          <Btn to="/partner" variant="dark" iconRight={<ArrowRight size={15} />}>Open Velora Partner Hub</Btn>
        </div>
      </main>
    );
  }

  return (
    <main id="main" className="page-shell sell-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Sell on Velora" }]} />
      <section className="sell-hero">
        <div>
          <span className="eyebrow">VELORA PARTNER HUB</span>
          <h1>Your label.<br /><em>A proper stage.</em></h1>
          <p>
            Bring considered clothing to shoppers who care how it is made and how it fits — with a workspace
            built around catalogue quality, honest inventory and margin-protected styling offers.
          </p>
          <div className="sell-stats">
            <div><b>18%</b><span>standard commission</span></div>
            <div><b>7 days</b><span>settlement cycle</span></div>
            <div><b>60+</b><span>days before styling offers</span></div>
          </div>
        </div>
        <div className="sell-art">
          <img src="/images/aranya-campaign-haveli.jpg" alt="Handloom studio editorial" />
          <span className="sell-art-note">House of Aranya · Jaipur</span>
        </div>
      </section>

      <section className="sell-steps">
        {[
          ["01", "Apply", "Business details, GSTIN, bank account and brand authorisation where relevant."],
          ["02", "Verify", "Velora reviews KYC and category eligibility. Restricted categories need extra documents."],
          ["03", "List", "Guided catalogue creation with image, attribute and fit-spec checks before review."],
          ["04", "Sell", "Orders, inventory, returns and settlements in one workspace — with actionable alerts."],
        ].map(([n, t, d]) => (
          <div key={n}><span>{n}</span><b>{t}</b><p>{d}</p></div>
        ))}
      </section>

      <section className="sell-form-section">
        <div className="sell-form-copy">
          <span className="eyebrow">SELLER APPLICATION · DEMO</span>
          <h2>Tell us about your store.</h2>
          <p>Submitting creates a local demo seller profile and opens the Partner Hub. No documents are uploaded or verified.</p>
          <ul className="sell-list">
            <li><BadgeCheck size={14} /> Guided listings with rejection reasons, not silent failures</li>
            <li><Package size={14} /> Variant-level inventory and stock-age visibility</li>
            <li><Truck size={14} /> Order, return and settlement workflows</li>
            <li><Lock size={14} /> Sellers can never approve their own KYC or moderate their own reviews</li>
          </ul>
          <div className="fee-table">
            <span className="eyebrow">INDICATIVE FEES · DEMO</span>
            <div><span>Commission</span><b>15–20% by category</b></div>
            <div><span>Payment fee</span><b>2%</b></div>
            <div><span>Logistics (seller-fulfilled)</span><b>₹45–₹110</b></div>
            <div><span>Settlement</span><b>Weekly, T+7</b></div>
          </div>
          <Link to="/help/seller-fees" className="text-link">Read the commission policy <ArrowUpRight size={13} /></Link>
        </div>

        <form className="onboard-card" onSubmit={submit} noValidate>
          <div className="onboard-head"><Building2 size={18} /><span><b>Seller application</b><small>All fields marked * are required</small></span></div>
          <div className="form-row">
            <Field label="Your name" required error={errors.owner}><input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} autoComplete="name" /></Field>
            <Field label="Store / brand name" required error={errors.brand}><input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field>
          </div>
          <Field label="Business email" required error={errors.email}><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></Field>
          <div className="form-row">
            <Field label="Mobile" required error={errors.phone}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="City" required error={errors.city}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="Primary category">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((c) => <option key={c.slug}>{c.label}</option>)}
                <option>Footwear</option>
              </select>
            </Field>
            <Field label="GSTIN" required error={errors.gstin} hint="15-character GST identification number">
              <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase().slice(0, 15) })} placeholder="27AAGCM4411L1Z2" />
            </Field>
          </div>
          <label className="check-inline">
            <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
            <span>I accept the seller agreement, returns SLA and marketplace policies.</span>
          </label>
          {errors.consent && <p className="field-error">{errors.consent}</p>}
          <button type="submit" className="btn btn-dark btn-wide">Submit demo application <Send size={14} /></button>
          <small className="form-disclaimer">Demo only. No KYC, GSTIN validation or bank verification is performed.</small>
        </form>
      </section>

      <section className="sell-faq">
        <span className="eyebrow">BEFORE YOU APPLY</span>
        <h2>What Velora expects from a partner</h2>
        <div className="faq-grid">
          <div><b>Accurate product facts</b><p>Composition, dimensions, origin and imagery must be yours and correct. Velora rejects listings that make unverifiable claims.</p></div>
          <div><b>Stock you can honour</b><p>Inventory is decremented at order placement. Repeated oversells lead to suppression while stock feeds are corrected.</p></div>
          <div><b>Returns, without obstruction</b><p>Eligible returns are collected and refunded under marketplace policy. Sellers can dispute condition, not deny policy.</p></div>
          <div><b>Reviews you cannot moderate</b><p>Sellers may respond publicly or report a review. Only Trust & Safety can remove content, and only with a recorded reason.</p></div>
        </div>
      </section>
    </main>
  );
}

const HELP_CONTENT = {
  home: {
    title: "Help & support",
    intro: "Answers to the questions shoppers and sellers ask most. This is a demo storefront; support links explain what would happen in production.",
    sections: [
      { h: "Orders & delivery", p: "Track an order from your account. Standard delivery takes 3–6 business days after dispatch; express takes 2–3. Orders may ship separately from different sellers." },
      { h: "Returns & refunds", p: "Eligible pieces can be returned within 7 days of delivery, unworn with tags. Refunds are issued after pickup and inspection. Made-to-order pieces are excluded." },
      { h: "Fit guidance", p: "Fast Path uses height, weight, shape and an anchor brand size. Precision Scan accepts measurements you enter. Both are guidance, not a guarantee." },
    ],
    links: [["Shipping information", "/help/shipping"], ["Returns & refunds", "/help/returns"], ["Size guide", "/size-guide"], ["Grievance officer", "/help/grievance"]],
  },
  shipping: {
    title: "Shipping information",
    intro: "Delivery timelines, charges and serviceability for the Velora demo storefront.",
    sections: [
      { h: "Charges", p: "Delivery is free on orders above ₹1,499; otherwise ₹79 standard. Express delivery is ₹99 and does not change the return window." },
      { h: "Timelines", p: "Sellers dispatch within 1–2 business days. Standard delivery is 3–6 business days, express 2–3. Pincode-level estimates are shown at checkout and on the product page." },
      { h: "Split shipments", p: "If your bag contains pieces from more than one seller, they ship separately and may arrive on different days. Each shipment has its own tracking." },
      { h: "Serviceability", p: "In this demo, every six-digit pincode returns an indicative estimate. Production delivery promises depend on carrier serviceability and seller location." },
    ],
    links: [["Returns & refunds", "/help/returns"], ["Track an order", "/account/orders"]],
  },
  returns: {
    title: "Returns & refunds",
    intro: "A clear return window, and what happens to your money afterwards.",
    sections: [
      { h: "Window", p: "7 days from delivery for eligible pieces, unworn, unwashed and with original tags. Footwear must be tried indoors." },
      { h: "Exclusions", p: "Made-to-order lehengas, altered pieces, jewellery with broken seals and innerwear cannot be returned for hygiene or customisation reasons. Exclusions are stated on the product page." },
      { h: "Process", p: "Start a return from the order details page. Choose a reason, schedule a pickup, and keep the item packed. Quality inspection happens after pickup." },
      { h: "Refunds", p: "Refunds go to the original payment method within 5–7 business days after inspection. Demo orders do not involve real money, so no refund is actually processed." },
    ],
    links: [["Start a return", "/account/orders"], ["Read the returns policy", "/policies/returns"]],
  },
  grievance: {
    title: "Grievance officer",
    intro: "How a complaint is recorded, acknowledged and resolved under Indian marketplace rules.",
    sections: [
      { h: "Who to contact", p: "Grievance Officer, Velora Commerce Pvt Ltd (demo), Mumbai. Email: grievance@velora.demo. This address is a placeholder and is not monitored." },
      { h: "What to include", p: "Order ID, product, the issue, and any evidence. Do not send identity documents unless explicitly requested through a verified channel." },
      { h: "Timelines", p: "Production commitments under the amended rules: acknowledgement within 48 hours and resolution within one month of receipt. A complaint record and communication history must be exportable." },
      { h: "Escalation", p: "If unresolved, the complaint can be escalated to the National Consumer Helpline. This demo does not file real complaints." },
    ],
    links: [["Help home", "/help"], ["Privacy policy", "/policies/privacy"]],
  },
  "seller-fees": {
    title: "Commission & fees",
    intro: "What Velora charges, and what the Complete the Look price floor means for a seller.",
    sections: [
      { h: "Commission", p: "Indicative 15–20% by category, applied to the item selling price excluding shipping. Actual rates are set per category contract in production." },
      { h: "Payment and logistics", p: "A 2% payment processing fee, plus actual logistics charges where Velora arranges fulfilment (₹45–₹110 depending on weight and zone)." },
      { h: "Price floor", p: "Any Complete the Look offer must be at or above COGS + marginal shipping (+ any seller-configured incremental cost). The demo calculates this on-device; production must enforce it server-side." },
      { h: "Settlements", p: "Weekly cycle, T+7 after delivery, less refunds, return deductions and fees. Each statement is order-line level and downloadable." },
    ],
    links: [["Seller support", "/help/seller-support"], ["Partner Hub", "/partner"]],
  },
  "seller-support": {
    title: "Seller support",
    intro: "Where sellers get help with catalogues, orders, returns and payouts.",
    sections: [
      { h: "Catalogue", p: "Rejections always include a reason and a corrective action. The listing remains editable and can be resubmitted without creating a duplicate." },
      { h: "Orders", p: "Accept within 24 hours, pack, print the label and hand over. Delayed acceptance affects seller health and may trigger a stock check." },
      { h: "Returns", p: "Sellers can dispute condition with evidence. They cannot override the marketplace return policy or refuse an eligible return." },
      { h: "Contact", p: "partner-support@velora.demo (placeholder) or the Help panel inside the Partner Hub. No real ticket is created in this demo." },
    ],
    links: [["Partner Hub", "/partner"], ["Commission & fees", "/help/seller-fees"]],
  },
  "complete-the-look": {
    title: "Complete the Look",
    intro: "Why the bag sometimes suggests one more piece — and why it is never a clearance rack.",
    sections: [
      { h: "What it is", p: "A styling suggestion based on what is already in your bag: compatible palette, shared occasion and availability in your selected size." },
      { h: "Why it appears", p: "Partner stock that has been in inventory for more than 60 days can be offered as a completion. You see a normal offer price, never an internal stock label." },
      { h: "Your control", p: "Suggestions are optional. Nothing is added unless you choose it, the price difference is shown, and the suggestion can be dismissed." },
      { h: "For sellers", p: "Eligibility requires compatible stock, exact-size availability and a price at or above COGS + marginal shipping. The deepest tier requires a minimum bag value." },
    ],
    links: [["Your bag", "/cart"], ["How offers work for sellers", "/partner"]],
  },
};

export function Help() {
  const { section = "home" } = useParams();
  const content = HELP_CONTENT[section] || HELP_CONTENT.home;
  return (
    <main id="main" className="page-shell help-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Help", to: "/help" }, ...(section !== "home" ? [{ label: content.title }] : [])]} />
      <div className="help-layout">
        <aside className="help-nav">
          <span className="eyebrow">HELP CENTRE</span>
          <Link to="/help" className={section === "home" ? "active" : ""}>Overview</Link>
          <Link to="/help/shipping" className={section === "shipping" ? "active" : ""}>Shipping</Link>
          <Link to="/help/returns" className={section === "returns" ? "active" : ""}>Returns & refunds</Link>
          <Link to="/help/complete-the-look" className={section === "complete-the-look" ? "active" : ""}>Complete the Look</Link>
          <Link to="/size-guide">Size guide</Link>
          <Link to="/help/grievance" className={section === "grievance" ? "active" : ""}>Grievance officer</Link>
          <span className="eyebrow">FOR SELLERS</span>
          <Link to="/help/seller-fees" className={section === "seller-fees" ? "active" : ""}>Commission & fees</Link>
          <Link to="/help/seller-support" className={section === "seller-support" ? "active" : ""}>Seller support</Link>
          <Link to="/sell">Become a seller</Link>
        </aside>
        <div className="help-content">
          <PageHead eyebrow="CUSTOMER CARE" title={content.title} caption={content.intro} />
          {content.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              <p>{s.p}</p>
            </section>
          ))}
          <div className="help-links">
            {content.links.map(([label, to]) => <Link key={to} to={to}>{label} <ArrowRight size={14} /></Link>)}
          </div>
          <div className="help-contact">
            <HelpCircle size={18} />
            <div>
              <b>Still stuck?</b>
              <p>Email care@velora.demo (placeholder) or start a support case from your account. In a production build this creates a tracked ticket with SLA timers.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function About() {
  return (
    <main id="main" className="page-shell about-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "About Velora" }]} />
      <section className="about-hero">
        <span className="eyebrow">ABOUT VELORA</span>
        <h1>Fashion commerce,<br /><em>with better evidence.</em></h1>
        <p>
          Velora is an Indian fashion marketplace for considered clothing, built around three ideas: discover a look
          the way you actually think about it, understand how a garment will fit before it arrives, and let good
          inventory find a shopper instead of a landfill.
        </p>
      </section>
      <div className="about-art">
        <img src="/images/aranya-campaign-haveli.jpg" alt="Editorial campaign at a Jaipur haveli" />
        <img src="/images/meher-hero.jpg" alt="Studio editorial for womenswear" />
        <img src="/images/velora-hero.jpg" alt="Menswear tailoring editorial" />
      </div>
      <section className="about-values">
        <div><span>01</span><h2>The marketplace comes first</h2><p>Shoppers arrive to shop. Search, fit and styling assist the catalogue; they do not replace it or gate it.</p></div>
        <div><span>02</span><h2>Fit is a decision aid</h2><p>Garment measurements, intended ease and fabric behaviour — explained in words, without fabricated accuracy claims.</p></div>
        <div><span>03</span><h2>Reviews belong to shoppers</h2><p>Sellers can respond, never suppress. Moderation is policy-based and audited by Trust & Safety.</p></div>
        <div><span>04</span><h2>Slow stock, honestly sold</h2><p>Aging inventory can complete a look at a price that still respects the seller's cost floor. It is never labelled clearance.</p></div>
      </section>
      <section className="about-note" id="careers">
        <h2>Careers</h2>
        <p>No roles are open in this prototype. In production, Velora would hire across catalogue operations, trust & safety, fit research and partner success. Write to careers@velora.demo (placeholder).</p>
      </section>
      <section className="about-note" id="press">
        <h2>Press</h2>
        <p>For press enquiries contact press@velora.demo (placeholder). Brand assets and founder details are not part of this demo.</p>
      </section>
      <section className="about-note about-demo">
        <h2>About this build</h2>
        <p>This is a frontend prototype. The catalogue, sellers, ratings, reviews and orders are synthetic demo data. There is no authentication, payment processing, server-side stock reservation or AI model service connected. Actions labelled “demo” have no real-world effect.</p>
      </section>
    </main>
  );
}

const POLICIES = {
  privacy: {
    title: "Privacy policy",
    updated: "24 November 2026",
    sections: [
      ["What this demo stores", "Cart, wishlist, orders, addresses, reviews and fit inputs are stored in your browser's localStorage. Nothing is sent to a server. Clearing site data removes all of it."],
      ["Fit data", "Height, weight, body shape, anchor size and any measurements you enter are treated as sensitive personal data. This demo keeps them on-device and lets you delete them from the Fit page or your account."],
      ["Reference images", "An uploaded search image is read in your browser with a canvas to sample palette and tone. It is not uploaded, stored or added to the catalogue."],
      ["What production requires", "A real service needs a lawful basis for processing, data minimisation, encryption in transit and at rest, access controls, retention limits, deletion workflows, a grievance contact and a documented notice under applicable Indian law."],
      ["Cookies and analytics", "No analytics, advertising or third-party trackers are included in this build."],
    ],
  },
  terms: {
    title: "Terms of use",
    updated: "24 November 2026",
    sections: [
      ["Prototype status", "Velora as delivered here is a demonstration frontend. It does not form contracts of sale, does not process payments and does not guarantee availability, delivery or fit."],
      ["Accounts and roles", "There is no authentication. Role switching is a local demo affordance and must never be treated as authorization."],
      ["Product information", "Catalogue copy, fabric details, measurements, ratings and reviews are synthetic sample data. Do not rely on them for a purchase decision."],
      ["Marketplace conduct", "A production marketplace needs published policies on prohibited products, seller conduct, review integrity, IP complaints, cancellations and dispute resolution."],
      ["Liability", "Nothing here constitutes legal advice. Obtain Indian legal review before launch, including for consumer protection, e-commerce rules and data protection."],
    ],
  },
  returns: {
    title: "Returns policy",
    updated: "24 November 2026",
    sections: [
      ["Window", "7 days from delivery for eligible pieces, unworn, unwashed and with original tags."],
      ["Exclusions", "Made-to-order, altered, used or hygienically restricted items. Exclusions must be shown on the product page before purchase."],
      ["Process", "Request from the order page, select a reason, schedule pickup, and retain packaging until inspection. Return shipping is free for eligible quality or description issues."],
      ["Refunds", "Issued to the original payment method after inspection, typically within 5–7 business days. In this demo no money moves."],
      ["Seller obligations", "Sellers cannot refuse an eligible return under marketplace policy. They may dispute condition with evidence through Partner Hub."],
    ],
  },
};

export function Policy() {
  const { slug = "privacy" } = useParams();
  const policy = POLICIES[slug] || POLICIES.privacy;
  return (
    <main id="main" className="page-shell narrow-page policy-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Policies" }, { label: policy.title }]} />
      <PageHead eyebrow="VELORA POLICIES" title={policy.title} caption={`Last updated ${policy.updated} · Demo text, not legal advice`} />
      {policy.sections.map(([h, p]) => (
        <section key={h}><h2>{h}</h2><p>{p}</p></section>
      ))}
      <div className="help-links">
        <Link to="/policies/privacy">Privacy</Link>
        <Link to="/policies/terms">Terms</Link>
        <Link to="/policies/returns">Returns</Link>
        <Link to="/help/grievance">Grievance</Link>
      </div>
    </main>
  );
}

export function SizeGuide() {
  const sample = catalogue.find((p) => p.id === "VLR-1001");
  const ethnic = catalogue.find((p) => p.id === "VLR-3001");
  const chart = sizeChart(sample);
  return (
    <main id="main" className="page-shell size-guide-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Size guide" }]} />
      <PageHead
        eyebrow="SIZE & FIT"
        title={<>Measure once.<br /><em>Shop with context.</em></>}
        caption="Every Velora product page carries its own garment measurements. These are general starting points, not a substitute for the product's size chart."
        action={<Btn to="/fit" variant="dark" icon={<Ruler size={15} />}>Build my fit profile</Btn>}
      />
      <div className="size-guide-layout">
        <div>
          <h2>Apparel — finished garment measurements</h2>
          <p className="size-guide-lede">Example: {sample.name} ({sample.fit.toLowerCase()} fit). Garment measurements include the intended ease.</p>
          <div className="measure-table-wrap">
            <table className="data-table">
              <thead><tr>{chart.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{chart.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <InfoNote tone="soft" title="Ethnic wear has intentional ease">
            A relaxed kurta is designed with more room than a fitted shirt. {ethnic.name} is cut as a {ethnic.fit.toLowerCase()} silhouette with{" "}
            {garmentSpec(ethnic, "M").chestIn} in finished chest at size M — the extra room is the design, not a sizing error.
          </InfoNote>
        </div>
        <aside>
          <h2>How to measure</h2>
          <ol className="measure-steps">
            <li><b>Chest</b><span>Around the fullest point, tape level under the arms.</span></li>
            <li><b>Waist</b><span>At the narrowest point, relaxed — don't pull the tape in.</span></li>
            <li><b>Hip</b><span>Around the widest point, feet together.</span></li>
            <li><b>Inseam</b><span>From crotch to the ankle bone on a trouser that fits.</span></li>
            <li><b>Foot</b><span>Heel to longest toe, standing, measured in the evening.</span></li>
          </ol>
          <div className="size-tip"><Info size={15} /><p>Between two sizes? Choose the larger for relaxed and ethnic silhouettes, the smaller for slim knits and stretch fabrics.</p></div>
          <Btn to="/fit" variant="outline" className="btn-wide">Get a garment-specific suggestion</Btn>
        </aside>
      </div>
    </main>
  );
}
