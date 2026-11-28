import React, { useMemo, useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle, ArrowRight, ArrowUpRight, BarChart3, BadgeCheck, Banknote, Bell, Boxes,
  Check, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, CreditCard, Download, FileText,
  HelpCircle, Image as ImageIcon, Info, LayoutDashboard, Package, Percent, Plus, RotateCcw,
  Search, Settings, ShieldCheck, Sparkles, Store, Tag, TrendingDown, TrendingUp, Truck,
  Users, Wallet, X,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { stockForSize } from "../data/catalog.js";
import { money, formatDate } from "../lib/format.js";
import { floorPrice, offerPrice, tierFor, visualCompatibility } from "../lib/ctl.js";
import { sellerMetrics, sellerLiquidation, backendEnabled as sellerBackendEnabled } from "../lib/api/seller.js";
import {
  Badge, Btn, Chip, EmptyState, Field, InfoNote, Modal, PageHead, Progress, Stat,
  StatusPill, Tabs,
} from "../components/ui.jsx";

const SELLER_ID = "seller-1";

const NAV = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} /> },
  { id: "catalogue", label: "Catalogue", icon: <Package size={16} /> },
  { id: "add", label: "Add product", icon: <Plus size={16} /> },
  { id: "inventory", label: "Inventory", icon: <Boxes size={16} /> },
  { id: "orders", label: "Orders", icon: <Truck size={16} /> },
  { id: "returns", label: "Returns", icon: <RotateCcw size={16} /> },
  { id: "complete-the-look", label: "Complete the Look", icon: <Sparkles size={16} />, group: "Growth" },
  { id: "pricing", label: "Pricing & offers", icon: <Tag size={16} /> },
  { id: "payments", label: "Payments", icon: <Wallet size={16} /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={16} />, group: "Insights" },
  { id: "reviews", label: "Reviews", icon: <BadgeCheck size={16} /> },
  { id: "profile", label: "Store profile", icon: <Store size={16} />, group: "Settings" },
  { id: "documents", label: "Business documents", icon: <FileText size={16} /> },
  { id: "team", label: "Team & access", icon: <Users size={16} /> },
  { id: "help", label: "Help & support", icon: <HelpCircle size={16} /> },
  { id: "settings", label: "Settings", icon: <Settings size={16} /> },
];

const IMAGE_LIBRARY = [
  ["/images/aranya-marigold-kurta.jpg", "Marigold kurta"],
  ["/images/aranya-sage-anarkali.jpg", "Sage anarkali"],
  ["/images/aranya-chikankari-coord.jpg", "Chikankari co-ord"],
  ["/images/aranya-rani-saree.jpg", "Saree"],
  ["/images/aranya-indigo-kurta.jpg", "Indigo kurta"],
  ["/images/aranya-ivory-sharara.jpg", "Ivory sharara"],
  ["/images/meher-coord.jpg", "Linen co-ord"],
  ["/images/velora-oxford-shirt.jpg", "Oxford shirt"],
];

const statusTone = (status) => {
  const s = String(status).toLowerCase();
  if (["live", "delivered", "approved", "active", "settled"].includes(s)) return "success";
  if (["under review", "processing", "pending", "new"].includes(s)) return "warning";
  if (["rejected", "cancelled", "suspended", "suppressed"].includes(s)) return "danger";
  return "neutral";
};

function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MiniBars({ data, label }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="mini-chart" role="img" aria-label={label}>
      <div className="mini-bars">
        {data.map((d) => (
          <div key={d.label} className="mini-bar">
            <span className="mini-bar-value">{d.display || d.value}</span>
            <div style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }} title={`${d.label}: ${d.display || d.value}`} />
            <small>{d.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductEditor({ product, onClose, onSave }) {
  const [price, setPrice] = useState(product.price);
  const [stock, setStock] = useState(product.stock);
  const [name, setName] = useState(product.name);
  const [error, setError] = useState("");
  const floor = floorPrice(product);
  const save = () => {
    if (!name.trim()) return setError("A product title is required.");
    if (Number(price) < floor) return setError(`Price cannot go below the contribution floor of ${money(floor)} without a finance-approved exception.`);
    if (Number(stock) < 0) return setError("Stock cannot be negative.");
    onSave({ name: name.trim(), price: Number(price), mrp: Math.max(Number(price), product.mrp), stock: Number(stock) });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${product.id}`}>
      <Field label="Product title" required><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="form-row">
        <Field label="Selling price (₹)" hint={`Floor ${money(floor)} (COGS + marginal shipping)`}>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Total sellable stock"><input type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
      </div>
      {error && <p className="inline-error"><AlertCircle size={13} /> {error}</p>}
      <InfoNote tone="soft" title="What happens next">
        Price and stock changes are recorded in the inventory and audit ledger. Material content changes on a live listing
        return it to catalogue review before republication.
      </InfoNote>
      <div className="modal-actions">
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="dark" onClick={save}>Save changes</Btn>
      </div>
    </Modal>
  );
}

function AddProductWizard() {
  const { createListing, notify } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    templateId: "VLR-3001", name: "", description: "", category: "Ethnic Wear", subcategory: "Kurta Sets",
    price: "", mrp: "", stock: "", colour: "Marigold", fabric: "Handblock cotton", pattern: "Floral block print",
    fit: "Straight", occasion: ["Festive"], sizes: ["XS", "S", "M", "L", "XL"], image: "/images/aranya-marigold-kurta.jpg",
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(null);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validateStep = () => {
    const e = {};
    if (step === 1) {
      if (!form.name.trim()) e.name = "A product title is required.";
      if (form.description.trim().length < 30) e.description = "Write at least 30 characters — shoppers need fabric and fit context.";
    }
    if (step === 2) {
      if (!form.price || Number(form.price) <= 0) e.price = "Enter a selling price.";
      if (!form.mrp || Number(form.mrp) < Number(form.price)) e.mrp = "MRP must be at or above the selling price.";
      if (!form.stock || Number(form.stock) < 1) e.stock = "Opening stock must be at least 1.";
      if (!form.sizes.length) e.sizes = "Select at least one size.";
    }
    if (step === 3) {
      if (!form.fabric.trim()) e.fabric = "Fabric composition is required.";
      if (!form.occasion.length) e.occasion = "Choose at least one occasion.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => (validateStep() ? setStep((s) => Math.min(4, s + 1)) : null);
  const submit = () => {
    const product = createListing({
      ...form,
      price: Number(form.price),
      mrp: Number(form.mrp),
      stock: Number(form.stock),
      cogs: Math.round(Number(form.price) * 0.35),
      colors: [{ name: form.colour, hex: "#dfa53c", image: form.image }],
      occasion: form.occasion,
    });
    setSubmitted(product);
    notify("Listing submitted for review");
  };

  if (submitted) {
    return (
      <div className="wizard-success">
        <span className="success-mark"><Check size={20} /></span>
        <h2>Listing submitted for review</h2>
        <p><b>{submitted.name}</b> ({submitted.id}) is now in <b>Under review</b>. Velora catalogue operations check image resolution, attributes, fit specs and duplicate identity before publication.</p>
        <div className="status-path">
          <span className="done">Draft</span><ChevronRight size={13} /><span className="active">Under review</span><ChevronRight size={13} /><span>Live</span>
        </div>
        <InfoNote tone="soft" title="Typical review">
          Most listings are reviewed within one business day. A rejection comes with a specific reason and a corrective action — the listing stays editable.
        </InfoNote>
        <div className="wizard-actions">
          <Btn to="/partner/catalogue" variant="dark">View catalogue</Btn>
          <Btn variant="outline" onClick={() => { setSubmitted(null); setStep(1); setForm({ ...form, name: "", description: "", price: "", mrp: "", stock: "" }); }}>Add another</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard">
      <ol className="wizard-steps">
        {["Basics", "Pricing & variants", "Attributes & fit", "Review"].map((label, i) => (
          <li key={label} className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}>
            <span>{step > i + 1 ? <Check size={12} /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <div className="wizard-body">
        {step === 1 && (
          <>
            <h2>What are you listing?</h2>
            <p className="wizard-lede">A clear title and an honest description reduce returns more than any discount.</p>
            <Field label="Product title" required error={errors.name} hint="Include garment type, distinguishing detail and colour. No promotional claims.">
              <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Marigold handblock cotton kurta" maxLength={90} />
            </Field>
            <div className="form-row">
              <Field label="Category">
                <select value={form.category} onChange={(e) => update("category", e.target.value)}>
                  {["Ethnic Wear", "Western Wear", "Accessories"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select value={form.subcategory} onChange={(e) => update("subcategory", e.target.value)}>
                  {["Kurta Sets", "Sarees", "Lehengas", "Anarkalis", "Dupattas", "Co-ords", "Dresses", "Shirts", "Trousers", "Denim", "Knitwear"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description" required error={errors.description} hint="Fabric, construction, how it fits, and care. Do not invent certification or origin.">
              <textarea rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} maxLength={900} />
            </Field>
            <Field label="Starting template" hint="Copies category schema and attribute options; no product facts are copied.">
              <select value={form.templateId} onChange={(e) => update("templateId", e.target.value)}>
                <option value="VLR-3001">Kurta set (ethnic)</option>
                <option value="VLR-3011">Saree</option>
                <option value="VLR-3005">Anarkali</option>
                <option value="VLR-3013">Dupatta (one size)</option>
              </select>
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Pricing, stock and variants</h2>
            <p className="wizard-lede">Every SKU needs a real price and stock. The contribution floor is COGS + marginal shipping.</p>
            <div className="form-row">
              <Field label="Selling price (₹)" required error={errors.price}><input type="number" value={form.price} onChange={(e) => update("price", e.target.value)} /></Field>
              <Field label="MRP (₹)" required error={errors.mrp}><input type="number" value={form.mrp} onChange={(e) => update("mrp", e.target.value)} /></Field>
            </div>
            <div className="form-row">
              <Field label="Opening stock" required error={errors.stock}><input type="number" value={form.stock} onChange={(e) => update("stock", e.target.value)} /></Field>
              <Field label="Colour"><input value={form.colour} onChange={(e) => update("colour", e.target.value)} /></Field>
            </div>
            <Field label="Sizes" required error={errors.sizes}>
              <div className="size-select-grid">
                {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={form.sizes.includes(s) ? "active" : ""}
                    aria-pressed={form.sizes.includes(s)}
                    onClick={() => update("sizes", form.sizes.includes(s) ? form.sizes.filter((x) => x !== s) : [...form.sizes, s])}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            {form.price && (
              <div className="floor-preview">
                <div><span>Indicative COGS (35%)</span><b>{money(Math.round(Number(form.price) * 0.35))}</b></div>
                <div><span>Marginal shipping</span><b>{money(45)}</b></div>
                <div><span>Contribution floor</span><b>{money(floorPrice({ price: Number(form.price), cogs: Math.round(Number(form.price) * 0.35), marginalShipping: 45 }))}</b></div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2>Attributes, fit and imagery</h2>
            <p className="wizard-lede">Accurate attributes make the product findable and reduce size-related returns.</p>
            <div className="form-row">
              <Field label="Fabric" required error={errors.fabric}><input value={form.fabric} onChange={(e) => update("fabric", e.target.value)} /></Field>
              <Field label="Pattern"><input value={form.pattern} onChange={(e) => update("pattern", e.target.value)} /></Field>
            </div>
            <div className="form-row">
              <Field label="Fit">
                <select value={form.fit} onChange={(e) => update("fit", e.target.value)}>
                  {["Straight", "Relaxed", "Regular", "Slim", "A-line", "Flared", "Oversized"].map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Occasion" required error={errors.occasion}>
                <select
                  value={form.occasion[0]}
                  onChange={(e) => update("occasion", [e.target.value])}
                >
                  {["Festive", "Wedding", "Haldi", "Mehendi", "Everyday", "Workwear", "Party", "Travel"].map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Main image" hint="Production uploads must be at least 1200 px on the long edge, on a plain background, with rights declared.">
              <div className="image-picker">
                {IMAGE_LIBRARY.map(([src, label]) => (
                  <button type="button" key={src} className={form.image === src ? "active" : ""} onClick={() => update("image", src)} title={label}>
                    <img src={src} alt={label} />
                  </button>
                ))}
              </div>
            </Field>
            <InfoNote tone="warning" title="Image QC is enforced">
              The rejected listing in this demo failed for a 640 px main image. AI title or attribute suggestions must never invent composition, origin or measurements.
            </InfoNote>
          </>
        )}

        {step === 4 && (
          <>
            <h2>Review before submitting</h2>
            <p className="wizard-lede">Once submitted, the listing enters catalogue review. It is not purchasable until approved.</p>
            <div className="wizard-review">
              <img src={form.image} alt="" />
              <div>
                <span className="eyebrow">{form.category} · {form.subcategory}</span>
                <h3>{form.name || "Untitled listing"}</h3>
                <p>{form.description || "No description yet."}</p>
                <div className="wizard-facts">
                  <span><b>{form.price ? money(Number(form.price)) : "—"}</b> price</span>
                  <span><b>{form.stock || 0}</b> units</span>
                  <span><b>{form.sizes.length}</b> sizes</span>
                  <span><b>{form.fabric || "—"}</b> fabric</span>
                  <span><b>{form.occasion.join(", ")}</b> occasion</span>
                </div>
              </div>
            </div>
            <div className="wizard-actions">
              <Btn variant="ghost" onClick={() => setStep(3)}>Back</Btn>
              <Btn variant="dark" onClick={submit} icon={<ClipboardCheck size={15} />}>Submit for review</Btn>
            </div>
          </>
        )}
      </div>

      {step < 4 && (
        <div className="wizard-actions">
          {step > 1 ? <Btn variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Btn> : <span />}
          <Btn variant="dark" onClick={next}>Continue</Btn>
        </div>
      )}
    </div>
  );
}

export default function PartnerHub() {
  const { section = "overview" } = useParams();
  const {
    products, orders, reviews, sellers, sellerRespond, flagReview, updateListing, submitListing,
    moderateSeller, adjustStock, ledger, config, updateSeller, notify, can, role, updateOrderStatus,
  } = useApp();
  const nav = useNavigate();
  const [backendSellerMetrics, setBackendSellerMetrics] = useState(null);
  const [backendLiquidation, setBackendLiquidation] = useState(null);
  const [backendSellerError, setBackendSellerError] = useState(null);

  // Map a backend liquidation/aging row to the frontend product shape
  // used by the PartnerHub tables and stat cards.
  function toPartnerProduct(row) {
    return {
      id: row.sku,
      name: row.name,
      brand: row.brand,
      category: row.category,
      subcategory: row.subcategory,
      color: row.colour || "",
      image: row.image_url || "",
      price: Number(row.price || 0),
      mrp: Number(row.mrp || 0),
      stock: Number(row.stock || 0),
      sellerId: row.seller_id || SELLER_ID,
      sizes: ["One size"],
      stockAgeDays: Number(row.days_in_inventory || 0),
      unitsSold30d: Number(row.units_sold_30d || 0),
      cogs: Number(row.cogs || 0),
      marginalShipping: Number(row.marginal_shipping || 45),
      colorHex: row.colour_hex || "#cccccc",
      images: row.images || [row.image_url],
    };
  }

  const seller = sellers.find((s) => s.id === SELLER_ID) || sellers[0];
  const mine = products.filter((p) => p.sellerId === SELLER_ID);
  const live = mine.filter((p) => p.status === "live");
  const sellerTotal = (o) => o.items
    .filter((i) => i.sellerId === SELLER_ID)
    .reduce((s, i) => s + i.price * i.qty, 0);
  const myOrders = orders
    .filter((o) => o.items.some((i) => i.sellerId === SELLER_ID))
    .slice()
    .sort((a, b) => String(b.placedAt || "").localeCompare(String(a.placedAt || "")));
  const newOrders = myOrders.filter((o) => o.status === "New" || o.status === "Processing");
  const returns = myOrders.filter((o) => o.returnReason || ["Return requested", "Returned"].includes(o.status));
  const lowStock = mine.filter((p) => p.stock > 0 && p.stock <= 8);
  const outOfStock = mine.filter((p) => p.stock === 0);
  const rejected = mine.filter((p) => p.status === "rejected");
  const backendAgingList = backendLiquidation ? (backendLiquidation.results || backendLiquidation || []).map(toPartnerProduct) : [];
  const aging = sellerBackendEnabled() ? backendAgingList : live.filter((p) => p.stockAgeDays >= 60 && p.stock > 0);
  const grossSales = myOrders.filter((o) => !["Cancelled"].includes(o.status)).reduce((s, o) => s + sellerTotal(o), 0);
  const myReviews = useMemo(
    () => Object.entries(reviews).flatMap(([pid, list]) =>
      list.filter((r) => mine.some((p) => p.id === pid)).map((r) => ({ ...r, product: mine.find((p) => p.id === pid) }))
    ),
    [reviews, mine]
  );
  const [editor, setEditor] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [orderTab, setOrderTab] = useState("all");
  const [catalogueFilter, setCatalogueFilter] = useState("all");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [responseDraft, setResponseDraft] = useState({});
  const [priceDraft, setPriceDraft] = useState({});
  const [profileDraft, setProfileDraft] = useState(seller);
  const [team, setTeam] = useState([
    { name: "Meera Rathore", email: "meera@aranya.demo", role: "Owner", access: "Full access" },
    { name: "Aman Joshi", email: "aman@aranya.demo", role: "Catalogue manager", access: "Catalogue + inventory" },
    { name: "Priyanka Shah", email: "priyanka@aranya.demo", role: "Order manager", access: "Orders + returns" },
  ]);
  const [newMember, setNewMember] = useState({ email: "", role: "Catalogue manager" });
  const [settingsDraft, setSettingsDraft] = useState({ orderAlerts: true, lowStockAlerts: true, payoutAlerts: true, returnAlerts: true, weeklyDigest: false });

  useEffect(() => {
    if (!sellerBackendEnabled()) return;
    let cancelled = false;
    setBackendSellerError(null);
    Promise.all([
      sellerMetrics(SELLER_ID).then((d) => { if (!cancelled) setBackendSellerMetrics(d); }),
      sellerLiquidation(SELLER_ID, 60).then((d) => { if (!cancelled) setBackendLiquidation(d); }),
    ]).catch((err) => {
      if (cancelled) return;
      // Do not present stale local metrics as current backend data.
      setBackendSellerMetrics(null);
      setBackendLiquidation(null);
      setBackendSellerError(err.message || "Backend seller data unavailable");
    });
    return () => { cancelled = true; };
  }, [SELLER_ID]);

  const filteredCatalogue = mine.filter((p) => {
    const statusOk =
      catalogueFilter === "all" ? true :
      catalogueFilter === "live" ? p.status === "live" :
      catalogueFilter === "review" ? p.status === "under_review" :
      catalogueFilter === "attention" ? ["rejected", "draft"].includes(p.status) : true;
    return statusOk && `${p.name} ${p.id} ${p.brand}`.toLowerCase().includes(catalogueQuery.toLowerCase());
  });

  const orderTabs = [
    { id: "all", label: "All", count: myOrders.length },
    { id: "new", label: "New / processing", count: newOrders.length },
    { id: "shipped", label: "Shipped", count: myOrders.filter((o) => o.status === "Shipped").length },
    { id: "delivered", label: "Delivered", count: myOrders.filter((o) => o.status === "Delivered").length },
    { id: "returns", label: "Returns", count: returns.length },
  ];
  const shownOrders = myOrders.filter((o) =>
    orderTab === "all" ? true :
    orderTab === "new" ? ["New", "Processing"].includes(o.status) :
    orderTab === "shipped" ? o.status === "Shipped" :
    orderTab === "delivered" ? o.status === "Delivered" : Boolean(o.returnReason) || ["Returned", "Return requested"].includes(o.status)
  );

  const salesChart = myOrders.slice(0, 6).reverse().map((o) => ({
    label: o.date.split(" ").slice(0, 2).join(" "),
    value: sellerTotal(o),
    display: money(sellerTotal(o)),
  }));

  const settlements = myOrders
    .filter((o) => ["Delivered", "Shipped", "Processing", "New", "Returned", "Return requested"].includes(o.status))
    .map((o) => {
      const gross = sellerTotal(o);
      const commission = Math.round(gross * (seller.commission / 100));
      const paymentFee = Math.round(gross * (config.paymentFee / 100));
      const logistics = 45;
      const refund = o.status === "Returned" ? gross : 0;
      const net = gross - commission - paymentFee - logistics - refund;
      return {
        id: `ST-${o.id.slice(-6)}`, orderId: o.id, date: o.date, gross, commission, paymentFee, logistics, refund,
        net, status: o.status === "Delivered" && !refund ? "Settled" : refund ? "Adjusted" : "Pending",
      };
    });
  const pendingPayout = settlements.filter((s) => s.status === "Pending").reduce((s, x) => s + x.net, 0);
  const settledTotal = settlements.filter((s) => s.status !== "Pending").reduce((s, x) => s + x.net, 0);

  const lowStockCount = lowStock.length + outOfStock.length;
  const counts = {
    catalogue: `${live.length}`,
    inventory: lowStockCount ? `${lowStockCount}` : null,
    orders: newOrders.length ? `${newOrders.length}` : null,
    returns: returns.length ? `${returns.length}` : null,
    reviews: myReviews.filter((r) => r.status === "pending").length || null,
  };

  const renderHeader = () => {
    const item = NAV.find((n) => n.id === section) || NAV[0];
    return (
      <div className="partner-topbar">
        <div>
          <span className="eyebrow">VELORA PARTNER HUB</span>
          <h1>{item.label}</h1>
        </div>
        <div className="partner-topbar-actions">
          <Link to="/help/seller-support" className="btn btn-ghost btn-sm"><HelpCircle size={14} /> Support</Link>
          <button type="button" className="icon-btn partner-bell" aria-label="Notices" onClick={() => notify(`${newOrders.length} orders need action · ${lowStockCount} stock alerts`)}>
            <Bell size={17} />
            {(newOrders.length > 0 || lowStockCount > 0) && <i />}
          </button>
          <span className="seller-avatar">{(seller?.name || "V")[0]}</span>
        </div>
      </div>
    );
  };

  return (
    <main id="main" className="partner-shell">
      <aside className="partner-sidebar">
        <div className="partner-brand">
          <span className="partner-brand-mark">V</span>
          <div><b>Velora</b><small>Partner Hub</small></div>
        </div>
        <div className="partner-store">
          <span className="seller-avatar">{seller.name[0]}</span>
          <div>
            <b>{seller.name}</b>
            <small>{seller.status === "active" ? "Active seller" : seller.status}</small>
          </div>
          <Badge tone={seller.kyc === "verified" ? "success" : "warning"}>{seller.kyc === "verified" ? "KYC ✓" : "KYC"}</Badge>
        </div>
        <nav aria-label="Partner Hub navigation">
          {NAV.map((n) => (
            <React.Fragment key={n.id}>
              {n.group && <span className="partner-nav-group">{n.group}</span>}
              <Link to={`/partner/${n.id}`} className={section === n.id ? "active" : ""}>
                {n.icon}
                <span>{n.label}</span>
                {counts[n.id] && <i>{counts[n.id]}</i>}
              </Link>
            </React.Fragment>
          ))}
        </nav>
        <div className="partner-side-foot">
          <Link to="/">← Back to storefront</Link>
          <small>Demo workspace · no live data</small>
        </div>
      </aside>

      <div className="partner-main">
        {renderHeader()}
        <div className="partner-content">
          {section === "overview" && (
            <>
              <div className="partner-greeting">
                <div>
                  <h2>Good morning, {seller.owner.split(" ")[0]}.</h2>
                  <p>{newOrders.length} orders need attention today · {pendingPayout > 0 ? `${money(pendingPayout)} pending payout` : "No pending payouts"}</p>
                </div>
                <Btn to="/partner/add" variant="dark" icon={<Plus size={15} />}>Add a product</Btn>
              </div>

              <div className="stat-grid partner-stats">
                {sellerBackendEnabled() && backendSellerError && (
                  <InfoNote tone="danger" title="Backend data unavailable">
                    {backendSellerError} Local figures are shown instead; they are not from the server.
                  </InfoNote>
                )}
                <Stat label="Gross sales (demo)" value={money(grossSales)} note="All non-cancelled orders" icon={<TrendingUp size={15} />} />
                <Stat label="Orders" value={myOrders.length} note={`${newOrders.length} awaiting action`} icon={<Package size={15} />} />
                <Stat label="Live listings" value={live.length} note={`${mine.filter((p) => p.status === "under_review").length} in review`} icon={<Tag size={15} />} />
                <Stat label="Low / out of stock" value={lowStockCount} note="Variants at or below 8 units" icon={<TrendingDown size={15} />} />
                <Stat label="Aging inventory" value={aging.length} note="60+ days, styleable" icon={<Clock3 size={15} />} />
                <Stat label="Pending payout" value={money(pendingPayout)} note={`${money(settledTotal)} settled`} icon={<Wallet size={15} />} />
              </div>

              <div className="partner-actions-row">
                {newOrders.length > 0 && <Link to="/partner/orders" className="action-card"><Truck size={16} /><b>Dispatch {newOrders.length} orders</b><span>Accept or pack before the SLA</span><ArrowRight size={14} /></Link>}
                {lowStock.length > 0 && <Link to="/partner/inventory" className="action-card"><Boxes size={16} /><b>Restock {lowStock.length} listings</b><span>Low stock suppresses discoverability</span><ArrowRight size={14} /></Link>}
                {rejected.length > 0 && <Link to="/partner/catalogue" className="action-card danger"><AlertCircle size={16} /><b>{rejected.length} listing rejected</b><span>Read the reason and resubmit</span><ArrowRight size={14} /></Link>}
                {returns.length > 0 && <Link to="/partner/returns" className="action-card"><RotateCcw size={16} /><b>{returns.length} return requests</b><span>Respond within 24 hours</span><ArrowRight size={14} /></Link>}
              </div>

              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Recent orders</b><Link to="/partner/orders" className="text-link">View all</Link></div>
                  {myOrders.length === 0 ? <EmptyState compact title="No orders yet" body="New orders appear here first." /> : (
                    <div className="mini-table">
                      {myOrders.slice(0, 4).map((o) => (
                        <div key={o.id}>
                          <span><b>{o.id}</b><small>{o.date} · {o.items.length} item(s)</small></span>
                          <StatusPill status={o.status} />
                          <b>{money(sellerTotal(o))}</b>
                          <Link to={`/partner/orders`} className="text-link">Open</Link>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Sales by order</b><span>Demo data</span></div>
                  {salesChart.length ? <MiniBars data={salesChart} label="Order values" /> : <EmptyState compact title="No sales data" />}
                  <p className="panel-note">Values are actual demo order totals, not projections.</p>
                </section>
              </div>

              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Stock needing attention</b><Link to="/partner/inventory" className="text-link">Inventory</Link></div>
                  {lowStockCount === 0 ? <EmptyState compact title="Stock looks healthy" /> : (
                    <div className="inventory-mini-list">
                      {[...outOfStock, ...lowStock].slice(0, 4).map((p) => (
                        <div className="inventory-mini" key={p.id}>
                          <img src={p.image} alt="" />
                          <span><b>{p.name}</b><small>{p.stock === 0 ? "Out of stock" : `${p.stock} units left`} · {p.id}</small></span>
                          <Link to={`/partner/inventory`} className="text-link">Restock</Link>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Aging stock, eligible for styling</b><Link to="/partner/complete-the-look" className="text-link">Complete the Look</Link></div>
                  {aging.length === 0 ? <EmptyState compact title="No aging stock" body="Nothing has crossed 60 days." /> : (
                    <div className="inventory-mini-list">
                      {aging.slice(0, 4).map((p) => {
                        const t = tierFor(p.stockAgeDays);
                        return (
                          <div className="inventory-mini" key={p.id}>
                            <img src={p.image} alt="" />
                            <span><b>{p.name}</b><small>{p.stockAgeDays} days · {p.stock} units</small></span>
                            <span className="aging-label">{Math.round(t.discount * 100)}% tier</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <InfoNote tone="soft">Shoppers never see stock age or margin. They see a styled completion with an honest offer price.</InfoNote>
                </section>
              </div>
            </>
          )}

          {section === "catalogue" && (
            <>
              <div className="partner-section-head">
                <div><p>{mine.length} listings · {live.length} live · {mine.filter((p) => p.status === "under_review").length} in review</p></div>
                <Btn to="/partner/add" variant="dark" icon={<Plus size={15} />}>Add product</Btn>
              </div>
              <div className="panel-card">
                <div className="catalogue-toolbar">
                  <div className="inline-search"><Search size={15} /><input value={catalogueQuery} onChange={(e) => setCatalogueQuery(e.target.value)} placeholder="Search title, ID or brand" /></div>
                  <Tabs
                    items={[
                      { id: "all", label: "All", count: mine.length },
                      { id: "live", label: "Live", count: live.length },
                      { id: "review", label: "In review", count: mine.filter((p) => p.status === "under_review").length },
                      { id: "attention", label: "Needs attention", count: rejected.length + mine.filter((p) => p.status === "draft").length },
                    ]}
                    value={catalogueFilter}
                    onChange={setCatalogueFilter}
                  />
                </div>
                {filteredCatalogue.length === 0 ? (
                  <EmptyState compact title="No listings in this view" body="Try a different status or clear the search." />
                ) : (
                  <div className="responsive-table">
                    <table className="data-table catalogue-table">
                      <thead><tr><th>Product</th><th>Status</th><th>Price</th><th>Stock</th><th>Listing health</th><th>Actions</th></tr></thead>
                      <tbody>
                        {filteredCatalogue.map((p) => {
                          const health = [
                            p.images[0] ? null : "Missing image",
                            p.description.length < 40 ? "Thin description" : null,
                            p.stock === 0 ? "Out of stock" : null,
                            p.status === "rejected" ? "Rejected" : null,
                          ].filter(Boolean);
                          return (
                            <tr key={p.id}>
                              <td>
                                <div className="table-product">
                                  <img src={p.image} alt="" />
                                  <span><b>{p.name}</b><small>{p.id} · {p.category}</small></span>
                                </div>
                              </td>
                              <td><StatusPill status={p.status.replace("_", " ")} /></td>
                              <td>{money(p.price)}<small className="block-muted">MRP {money(p.mrp)}</small></td>
                              <td>{p.stock}<small className="block-muted">{p.stock === 0 ? "Out of stock" : "sellable"}</small></td>
                              <td>{health.length === 0 ? <Badge tone="success">Good</Badge> : <span className="health-issues">{health.map((h) => <Badge key={h} tone="warning">{h}</Badge>)}</span>}</td>
                              <td>
                                <div className="table-actions">
                                  <button type="button" className="text-link" onClick={() => setEditor(p)}>Edit</button>
                                  {["draft", "rejected"].includes(p.status) && <button type="button" className="text-link" onClick={() => submitListing(p.id)}>Submit</button>}
                                  <Link to={`/product/${p.id}`} className="text-link">View</Link>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {rejected.map((p) => (
                <InfoNote key={p.id} tone="danger" title={`${p.id} was rejected`}>
                  {p.rejectionReason} <button type="button" className="text-link" onClick={() => submitListing(p.id)}>Resubmit after correction</button>
                </InfoNote>
              ))}
              <InfoNote tone="soft" title="Listing states">
                Draft → Under review → Live. Rejected and suppressed listings stay editable. A seller cannot publish directly; only Velora catalogue operations approve a listing.
              </InfoNote>
            </>
          )}

          {section === "add" && <AddProductWizard />}

          {section === "inventory" && (
            <>
              <div className="partner-section-head"><p>Stock is decremented at order placement. Manual changes require a reason and are recorded.</p></div>
              <div className="stat-grid partner-stats">
                <Stat label="Sellable units" value={mine.reduce((s, p) => s + p.stock, 0)} icon={<Boxes size={15} />} />
                <Stat label="Low stock" value={lowStock.length} note="≤ 8 units" tone="warning" icon={<TrendingDown size={15} />} />
                <Stat label="Out of stock" value={outOfStock.length} tone="danger" icon={<AlertCircle size={15} />} />
                <Stat label="Aging capital" value={money(aging.reduce((s, p) => s + p.cogs * p.stock, 0))} note="At cost, 60+ days" icon={<Clock3 size={15} />} />
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Stock by variant</b><span>Demo per-size distribution</span></div>
                <div className="responsive-table">
                  <table className="data-table inventory-table">
                    <thead><tr><th>Product</th><th>Size</th><th>Sellable</th><th>Age band</th><th>Adjust</th></tr></thead>
                    <tbody>
                      {mine.map((p) => p.sizes.map((s) => {
                        const qty = stockForSize(p, s);
                        return (
                          <tr key={`${p.id}-${s}`}>
                            <td><div className="table-product"><img src={p.image} alt="" /><span><b>{p.name}</b><small>{p.id}</small></span></div></td>
                            <td>{s}</td>
                            <td><b className={qty === 0 ? "text-danger" : qty <= 2 ? "text-warn" : ""}>{qty}</b></td>
                            <td><span className={p.stockAgeDays >= 60 ? "aging-label" : "healthy-label"}>{p.stockAgeDays >= 120 ? "120+ days" : p.stockAgeDays >= 90 ? "90–120 days" : p.stockAgeDays >= 60 ? "60–90 days" : "Healthy"}</span></td>
                            <td><button type="button" className="btn btn-outline btn-xs" onClick={() => setAdjust({ product: p, size: s })}>Adjust</button></td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Inventory ledger</b><span>{ledger.length} movement(s)</span></div>
                {ledger.length === 0 ? <EmptyState compact title="No manual movements yet" body="Adjustments you make will appear here with actor, time and reason." /> : (
                  <div className="ledger-list">
                    {ledger.slice(0, 8).map((l) => (
                      <div key={l.id}><b>{l.delta > 0 ? `+${l.delta}` : l.delta}</b><span>{products.find((p) => p.id === l.productId)?.name || l.productId} · {l.size}</span><small>{l.reason} · {l.actor} · {l.at}</small></div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {section === "orders" && (
            <>
              <Tabs items={orderTabs} value={orderTab} onChange={setOrderTab} />
              {shownOrders.length === 0 ? <EmptyState icon={<Truck size={22} />} title="No orders in this view" body="New orders appear here as shoppers check out." /> : (
                <div className="orders-panel-list">
                  {shownOrders.map((o) => (
                    <div className="panel-card seller-order" key={o.id}>
                      <div className="seller-order-head">
                        <div><b>{o.id}</b><small>{o.date} · {o.payment} · {o.address}</small></div>
                        <StatusPill status={o.status} />
                      </div>
                      <div className="seller-order-items">
                        {o.items.filter((i) => i.sellerId === SELLER_ID).map((i) => (
                          <div key={`${i.id}-${i.size}`}>
                            <img src={i.image} alt="" />
                            <span><b>{i.name}</b><small>Size {i.size} · {i.colour} · Qty {i.qty}</small></span>
                            <b>{money(i.price * i.qty)}</b>
                          </div>
                        ))}
                      </div>
                      <div className="seller-order-foot">
                        <span>{o.customer || "Velora shopper"} · {o.contact}</span>
                        <div>
                          {["New", "Processing"].includes(o.status) && <Btn size="sm" variant="dark" onClick={() => { updateOrderStatus(o.id, "Shipped", "Packed and handed to carrier (demo)"); }}>Pack & dispatch</Btn>}
                          {o.status === "Shipped" && <Btn size="sm" variant="outline" onClick={() => updateOrderStatus(o.id, "Delivered", "Delivery confirmed (demo)")}>Mark delivered</Btn>}
                          {["New", "Processing"].includes(o.status) && <Btn size="sm" variant="ghost" onClick={() => updateOrderStatus(o.id, "Cancelled", "Cancelled by seller — stock restored in demo")}>Cancel</Btn>}
                          <Link to="/partner/returns" className="text-link">Return policies</Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <InfoNote tone="soft" title="Fulfilment rules">
                Sellers must accept within 24 hours. Labels and manifests would be generated by the logistics integration; this demo
                updates status locally and does not create a shipment.
              </InfoNote>
            </>
          )}

          {section === "returns" && (
            <>
              <div className="partner-section-head"><p>Return decisions must follow marketplace policy. Sellers can dispute condition with evidence, not deny an eligible return.</p></div>
              {returns.length === 0 ? <EmptyState icon={<RotateCcw size={22} />} title="No return requests" body="Returns appear here with the reason and order context." /> : (
                <div className="returns-list">
                  {returns.map((o) => (
                    <div className="panel-card return-card" key={o.id}>
                      <div className="seller-order-head">
                        <div><b>{o.id}</b><small>{o.date} · {o.returnReason || "Returned"}</small></div>
                        <StatusPill status={o.returnStatus || o.status} />
                      </div>
                      <div className="seller-order-items">
                        {o.items.filter((i) => i.sellerId === SELLER_ID).map((i) => (
                          <div key={`${i.id}-${i.size}`}>
                            <img src={i.image} alt="" />
                            <span><b>{i.name}</b><small>Size {i.size} · Qty {i.qty}</small></span>
                            <b>{money(i.price * i.qty)}</b>
                          </div>
                        ))}
                      </div>
                      <div className="return-evidence">
                        <span className="eyebrow">CUSTOMER REASON</span>
                        <p>{o.returnReason || "Returned under marketplace policy."}</p>
                        <span className="muted">Evidence: customer photos not supplied in this demo. Pickup inspection required before stock returns to sellable.</span>
                      </div>
                      <div className="seller-order-foot">
                        <span>Refund value {money(sellerTotal(o))} after inspection</span>
                        <div>
                          <Btn size="sm" variant="dark" onClick={() => { updateOrderStatus(o.id, "Return requested", "Seller accepted return — pickup scheduled (demo)"); notify("Return accepted; pickup scheduled in demo"); }}>Accept return</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => notify("Dispute recorded with evidence request (demo)")}>Dispute condition</Btn>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="policy-cards">
                <div><b>7-day window</b><p>Eligible pieces, unworn with tags. Made-to-order and altered items are excluded before purchase.</p></div>
                <div><b>Inspection first</b><p>Returned stock enters quarantine until QC. Only then does it become sellable stock again.</p></div>
                <div><b>Audited decisions</b><p>Every accept/deny action records actor, reason and time. Sellers cannot override policy.</p></div>
              </div>
            </>
          )}

          {section === "complete-the-look" && (
            <>
              <div className="partner-section-head">
                <p>This is the seller-side view of Velora's cart styling. Shoppers never see stock age, COGS or tier names.</p>
                {!config.offersEnabled && <Badge tone="warning">Offers paused by operations</Badge>}
              </div>
              <div className="stat-grid partner-stats">
                <Stat label="Eligible candidates" value={aging.length} note="60+ days, in stock" icon={<Sparkles size={15} />} />
                <Stat label="Potential capital released" value={money(aging.reduce((s, p) => s + offerPrice(p, config).price * p.stock, 0))} note="At current offer prices" icon={<TrendingUp size={15} />} />
                <Stat label="Offers presented" value={backendSellerMetrics?.bundle_presented ?? 0} note={backendSellerMetrics ? "From server events" : "Not instrumented in this demo"} icon={<BarChart3 size={15} />} />
                <Stat label="Bundle attach rate" value={backendSellerMetrics ? `${backendSellerMetrics.bundle_attach_rate}%` : "—"} note={backendSellerMetrics ? "Accepted / presented" : "Requires server events"} />
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Eligibility & private economics</b><span>Seller-only view</span></div>
                <div className="responsive-table">
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Age</th><th>Units</th><th>COGS + ship</th><th>Tier</th><th>Offer</th><th>Contribution</th><th>Gate</th></tr></thead>
                    <tbody>
                      {aging.map((p) => {
                        const op = offerPrice(p, config);
                        const contribution = op.price - (p.cogs + p.marginalShipping);
                        return (
                          <tr key={p.id}>
                            <td><div className="table-product"><img src={p.image} alt="" /><span><b>{p.name}</b><small>{p.id}</small></span></div></td>
                            <td>{p.stockAgeDays}d</td>
                            <td>{p.stock}</td>
                            <td>{money(floorPrice(p, config))}</td>
                            <td><Badge tone="neutral">{op.tier.label}</Badge></td>
                            <td><b>{money(op.price)}</b><small className="block-muted">was {money(p.price)}</small></td>
                            <td><span className={contribution > 0 ? "text-success" : "text-danger"}>{money(contribution)}</span></td>
                            <td>{op.tier.discount >= 0.6 ? `${money(config.deepBundleGate)}+ cart` : "Standard"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ctl-rules">
                <div><Check size={14} /><b>Size match</b><p>Exact shopper size, or one-size accessories. No size guessing.</p></div>
                <div><Check size={14} /><b>Visual compatibility</b><p>Palette and occasion coherence, with a similarity threshold above 0.78 in production.</p></div>
                <div><Check size={14} /><b>Margin floor</b><p>Offer price never falls below COGS + marginal shipping. The deepest tier needs a cart-value gate.</p></div>
                <div><Check size={14} /><b>No dark patterns</b><p>Optional add-on, removable, price difference visible, never preselected.</p></div>
              </div>
              <InfoNote tone="warning" title="Honest limitation">
                The compatibility score in this prototype is a deterministic palette/occasion heuristic, not a model embedding.
                Performance metrics require server-instrumented presentation and purchase events, which this demo does not have.
              </InfoNote>
            </>
          )}

          {section === "pricing" && (
            <>
              <div className="partner-section-head"><p>Prices must clear the contribution floor. Changes are logged with the previous value.</p></div>
              <div className="panel-card">
                <div className="panel-head"><b>Catalogue pricing</b><span>{mine.length} listings</span></div>
                <div className="responsive-table">
                  <table className="data-table">
                    <thead><tr><th>Product</th><th>Current</th><th>Floor</th><th>New price</th><th>Contribution</th><th></th></tr></thead>
                    <tbody>
                      {mine.map((p) => {
                        const floor = floorPrice(p);
                        const draft = priceDraft[p.id] ?? p.price;
                        const contribution = Number(draft) - (p.cogs + p.marginalShipping);
                        const invalid = Number(draft) < floor;
                        return (
                          <tr key={p.id}>
                            <td><div className="table-product"><img src={p.image} alt="" /><span><b>{p.name}</b><small>{p.id}</small></span></div></td>
                            <td>{money(p.price)}</td>
                            <td>{money(floor)}</td>
                            <td><input className={`price-input${invalid ? " invalid" : ""}`} type="number" value={draft} onChange={(e) => setPriceDraft({ ...priceDraft, [p.id]: e.target.value })} aria-label={`New price for ${p.name}`} /></td>
                            <td className={contribution > 0 ? "text-success" : "text-danger"}>{money(contribution)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline btn-xs"
                                disabled={invalid || Number(draft) === p.price}
                                onClick={() => { updateListing(p.id, { price: Number(draft) }); notify(`Price updated for ${p.name}`); }}
                              >
                                Save
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Promotions</b><Badge tone="soft">Demo</Badge></div>
                  <Field label="Seller-funded coupon" hint="Platform-funded campaigns are configured by operations.">
                    <input defaultValue="AMEYA10" />
                  </Field>
                  <div className="form-row">
                    <Field label="Seller contribution (%)"><input defaultValue="5" type="number" /></Field>
                    <Field label="Budget (₹)"><input defaultValue="25000" type="number" /></Field>
                  </div>
                  <Btn variant="dark" size="sm" onClick={() => notify("Promotion saved in demo")}>Save promotion</Btn>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Sponsored placement</b><Badge tone="warning">Not enabled</Badge></div>
                  <p className="panel-text">Sponsored placements are not sold in this demo. Production must label every sponsored product in search and report spend separately, consistent with ranking-transparency rules.</p>
                  <Btn variant="outline" size="sm" to="/help/seller-fees">Commission & fees</Btn>
                </section>
              </div>
            </>
          )}

          {section === "payments" && (
            <>
              <div className="stat-grid partner-stats">
                <Stat label="Gross item sales" value={money(settlements.reduce((s, x) => s + x.gross, 0))} icon={<Banknote size={15} />} />
                <Stat label="Pending payout" value={money(pendingPayout)} note="After delivery, T+7" icon={<Clock3 size={15} />} />
                <Stat label="Settled" value={money(settledTotal)} icon={<CheckCircle2 size={15} />} />
                <Stat label="Commission rate" value={`${seller.commission}%`} note="Category contract rate" icon={<Percent size={15} />} />
              </div>
              <div className="panel-card">
                <div className="panel-head">
                  <b>Settlement statement</b>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => downloadCsv(
                      [["Order", "Date", "Gross", "Commission", "Payment fee", "Logistics", "Refund", "Net", "Status"], ...settlements.map((s) => [s.orderId, s.date, s.gross, s.commission, s.paymentFee, s.logistics, s.refund, s.net, s.status])],
                      "velora-settlement-demo.csv"
                    )}
                  >
                    <Download size={14} /> Download CSV
                  </button>
                </div>
                {settlements.length === 0 ? <EmptyState compact title="No settlements yet" /> : (
                  <div className="responsive-table">
                    <table className="data-table">
                      <thead><tr><th>Order</th><th>Date</th><th>Gross</th><th>Commission</th><th>Fees</th><th>Net</th><th>Status</th></tr></thead>
                      <tbody>
                        {settlements.map((s) => (
                          <tr key={s.id}>
                            <td>{s.orderId}</td><td>{s.date}</td><td>{money(s.gross)}</td>
                            <td>− {money(s.commission)}</td><td>− {money(s.paymentFee + s.logistics)}</td>
                            <td><b>{money(s.net)}</b></td><td><StatusPill status={s.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Bank account</b><Badge tone="success">Verified</Badge></div>
                  <div className="profile-grid">
                    <div><span>Account</span><b>{seller.bank}</b></div>
                    <div><span>Beneficiary</span><b>{seller.legalName}</b></div>
                    <div><span>Cycle</span><b>Weekly · T+7</b></div>
                    <div><span>Last statement</span><b>24 Nov 2026</b></div>
                  </div>
                  <InfoNote tone="soft">Changing bank details requires re-verification and step-up authentication. Not available in this demo.</InfoNote>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Deductions explained</b></div>
                  <ul className="plain-list">
                    <li><span>Commission</span><b>{seller.commission}% of item value</b></li>
                    <li><span>Payment processing</span><b>{config.paymentFee}%</b></li>
                    <li><span>Logistics</span><b>{money(config.logisticsFee)} per shipment</b></li>
                    <li><span>Return deduction</span><b>Value of refunded items</b></li>
                  </ul>
                  <p className="panel-note">All money values in this demo are synthetic. No payout is initiated.</p>
                </section>
              </div>
            </>
          )}

          {section === "analytics" && (
            <>
              <div className="partner-section-head">
                <p>Computed from demo orders and catalogue state. Where a metric needs real traffic data, it is marked unavailable rather than invented.</p>
                <label className="field compact-field"><span className="field-label">Period</span><select defaultValue="30"><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
              </div>
              <div className="stat-grid partner-stats">
                <Stat label="Units sold (30d)" value={mine.reduce((s, p) => s + p.unitsSold30d, 0)} icon={<TrendingUp size={15} />} />
                <Stat label="Average order value" value={money(myOrders.length ? grossSales / myOrders.length : 0)} icon={<Banknote size={15} />} />
                <Stat label="Fit-related returns" value={`${returns.filter((o) => /fit/i.test(o.returnReason || "")).length}`} note="From actual demo return reasons" icon={<RotateCcw size={15} />} />
                <Stat label="Average rating" value={(mine.reduce((s, p) => s + (p.rating || 0), 0) / (mine.length || 1)).toFixed(1)} note="Demo catalogue ratings" icon={<BadgeCheck size={15} />} />
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Sales by order</b><span>Demo order values</span></div>
                  <MiniBars data={salesChart} label="Sales by order" />
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Product performance</b><span>Units sold in 30 days</span></div>
                  <div className="perf-bars">
                    {mine.slice(0, 6).map((p) => {
                      const max = Math.max(...mine.map((x) => x.unitsSold30d), 1);
                      return (
                        <div key={p.id}>
                          <span>{p.name}</span>
                          <div><i style={{ width: `${(p.unitsSold30d / max) * 100}%` }} /></div>
                          <b>{p.unitsSold30d}</b>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Inventory age</b><span>Live listings</span></div>
                  <div className="age-bands">
                    {[["Healthy (<60d)", live.filter((p) => p.stockAgeDays < 60).length, "success"], ["60–90 days", live.filter((p) => p.stockAgeDays >= 60 && p.stockAgeDays < 90).length, "warning"], ["90–120 days", live.filter((p) => p.stockAgeDays >= 90 && p.stockAgeDays < 120).length, "warning"], ["120+ days", live.filter((p) => p.stockAgeDays >= 120).length, "danger"]].map(([label, count, tone]) => (
                      <div key={label}><span><i className={`dot-${tone}`} />{label}</span><b>{count}</b></div>
                    ))}
                  </div>
                  <InfoNote tone="soft">Age is derived from the demo receipt age per listing, not from listing creation date.</InfoNote>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Conversion & traffic</b><Badge tone="warning">Unavailable</Badge></div>
                  <p className="panel-text">Sessions, conversion, search-to-cart and Complete the Look attach rate require server-side event collection. This demo does not fabricate them.</p>
                  <ul className="plain-list">
                    <li><span>Store sessions</span><b>Not instrumented</b></li>
                    <li><span>Cart conversion</span><b>Not instrumented</b></li>
                    <li><span>Offer impressions</span><b>Not instrumented</b></li>
                  </ul>
                </section>
              </div>
            </>
          )}

          {section === "reviews" && (
            <>
              <div className="partner-section-head"><p>Sellers can read reviews and respond publicly. They cannot approve, hide or delete reviews.</p></div>
              <div className="stat-grid partner-stats">
                <Stat label="Published reviews" value={myReviews.filter((r) => r.status === "approved").length} icon={<BadgeCheck size={15} />} />
                <Stat label="Awaiting moderation" value={myReviews.filter((r) => r.status === "pending").length} note="Visible only to Trust & Safety" icon={<Clock3 size={15} />} />
                <Stat label="Average rating" value={(myReviews.filter((r) => r.status === "approved").reduce((s, r) => s + r.rating, 0) / (myReviews.filter((r) => r.status === "approved").length || 1)).toFixed(1)} icon={<Sparkles size={15} />} />
                <Stat label="Fit feedback" value={`${myReviews.filter((r) => r.fit === "Just right").length} just right`} note="From published reviews" icon={<CheckCircle2 size={15} />} />
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Customer feedback</b><span>Published + moderation status</span></div>
                {myReviews.length === 0 ? <EmptyState compact title="No reviews yet" body="Reviews appear after delivery and moderation." /> : (
                  <div className="seller-reviews">
                    {myReviews.map((r) => (
                      <article key={r.id} className="seller-review">
                        <div className="seller-review-head">
                          <img src={r.product?.image} alt="" />
                          <div><b>{r.product?.name}</b><small>{r.name} · {r.date} · Size {r.sizeWorn} · {r.fit}</small></div>
                          <span className="review-stars">{"★".repeat(r.rating)}</span>
                          <StatusPill status={r.status} />
                        </div>
                        <h3>{r.title}</h3>
                        <p>{r.body}</p>
                        {r.verified && <span className="verified"><BadgeCheck size={12} /> Verified purchase</span>}
                        {r.response && <div className="seller-response"><b>Your response</b><p>{r.response}</p></div>}
                        <div className="seller-review-actions">
                          <textarea
                            rows={2}
                            placeholder="Write a public response (no personal data, no incentives for rating changes)"
                            value={responseDraft[r.id] || ""}
                            onChange={(e) => setResponseDraft({ ...responseDraft, [r.id]: e.target.value })}
                          />
                          <div>
                            <Btn size="sm" variant="dark" onClick={() => { if (!responseDraft[r.id]?.trim()) return notify("Write a response first", "error"); sellerRespond(r.product.id, r.id, responseDraft[r.id]); setResponseDraft({ ...responseDraft, [r.id]: "" }); }}>Post response</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => flagReview(r.product.id, r.id, "Seller reported for policy review")}>Report for policy review</Btn>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <InfoNote tone="warning" title="Moderation boundary">
                Reporting a review sends it to Velora Trust & Safety. It does not hide the review. A negative but genuine review cannot be removed.
              </InfoNote>
            </>
          )}

          {section === "profile" && (
            <>
              <div className="partner-section-head"><p>Your public store identity. Legal entity details are verified separately and are not editable here.</p></div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Store details</b><Badge tone="success">Verified seller</Badge></div>
                  <div className="form-row">
                    <Field label="Store name"><input value={profileDraft.name} onChange={(e) => setProfileDraft({ ...profileDraft, name: e.target.value })} /></Field>
                    <Field label="Owner"><input value={profileDraft.owner} onChange={(e) => setProfileDraft({ ...profileDraft, owner: e.target.value })} /></Field>
                  </div>
                  <div className="form-row">
                    <Field label="Business email"><input value={profileDraft.email} onChange={(e) => setProfileDraft({ ...profileDraft, email: e.target.value })} /></Field>
                    <Field label="Phone"><input value={profileDraft.phone} onChange={(e) => setProfileDraft({ ...profileDraft, phone: e.target.value })} /></Field>
                  </div>
                  <Field label="City"><input value={profileDraft.city} onChange={(e) => setProfileDraft({ ...profileDraft, city: e.target.value })} /></Field>
                  <Field label="Store description" hint="Shown on product pages. Avoid unverifiable claims."><textarea rows={3} value={profileDraft.summary} onChange={(e) => setProfileDraft({ ...profileDraft, summary: e.target.value })} /></Field>
                  <Btn variant="dark" onClick={() => updateSeller(seller.id, profileDraft)}>Save store profile</Btn>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Public preview</b><span>As shoppers see it</span></div>
                  <div className="store-preview">
                    <span className="seller-avatar large">{profileDraft.name[0]}</span>
                    <div>
                      <b>{profileDraft.name}</b>
                      <small>{profileDraft.city} · Partner since {seller.since}</small>
                      <p>{profileDraft.summary}</p>
                      <div className="store-preview-facts">
                        <span><b>{live.length}</b> live listings</span>
                        <span><b>{seller.rating}</b> seller rating</span>
                        <span><b>{seller.responseRate}%</b> response rate</span>
                      </div>
                    </div>
                  </div>
                  <InfoNote tone="soft">Seller rating and response rate are demo values. In production they would be computed from post-delivery feedback and support SLAs.</InfoNote>
                </section>
              </div>
            </>
          )}

          {section === "documents" && (
            <>
              <div className="partner-section-head"><p>Documents are verified by Velora seller operations. Sellers cannot approve their own KYC.</p></div>
              <div className="panel-card">
                <div className="panel-head"><b>Business documents</b><span>Seller: {seller.legalName}</span></div>
                <div className="doc-list">
                  {[
                    ["PAN card", "Verified", "Verified 12 Jan 2024", "success"],
                    ["GST registration", seller.gstin, "Verified 12 Jan 2024", "success"],
                    ["Bank account proof", seller.bank, "Verified 14 Jan 2024", "success"],
                    ["Brand authorisation", "House of Aranya trademark", "On file", "success"],
                    ["Category declaration", "Ethnic wear, accessories", "Approved", "success"],
                  ].map(([label, value, note, tone]) => (
                    <div className="doc-row" key={label}>
                      <span className="doc-icon"><FileText size={16} /></span>
                      <div><b>{label}</b><small>{value}</small><small className="muted">{note}</small></div>
                      <Badge tone={tone}>{tone === "success" ? "Verified" : "Pending"}</Badge>
                    </div>
                  ))}
                </div>
                <InfoNote tone="soft" title="Uploading new documents">
                  Document upload requires secure storage, virus scanning and access controls. It is intentionally disabled in this
                  frontend demo; no file is accepted or stored.
                </InfoNote>
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Compliance</b></div>
                <ul className="plain-list">
                  <li><span>Legal Metrology declaration</span><b>On file</b></li>
                  <li><span>Country of origin</span><b>Declared per listing</b></li>
                  <li><span>Return & fulfilment SLA</span><b>Accepted</b></li>
                  <li><span>Next re-verification</span><b>Jan 2027</b></li>
                </ul>
              </div>
            </>
          )}

          {section === "team" && (
            <>
              <div className="partner-section-head"><p>Give employees only the access they need. Owner access cannot be granted from this screen.</p></div>
              <div className="panel-card">
                <div className="panel-head"><b>Team members</b><span>{team.length} people</span></div>
                <div className="team-list">
                  {team.map((m) => (
                    <div className="team-row" key={m.email}>
                      <span className="avatar">{m.name.slice(0, 1)}</span>
                      <div><b>{m.name}</b><small>{m.email}</small></div>
                      <Badge tone="neutral">{m.role}</Badge>
                      <span className="muted">{m.access}</span>
                      {m.role !== "Owner" && <button type="button" className="danger-link" onClick={() => setTeam(team.filter((x) => x.email !== m.email))}>Remove</button>}
                    </div>
                  ))}
                </div>
                <div className="add-team-form">
                  <Field label="Invite by email"><input value={newMember.email} onChange={(e) => setNewMember({ ...newMember, email: e.target.value })} placeholder="name@yourbrand.com" /></Field>
                  <Field label="Role">
                    <select value={newMember.role} onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}>
                      {["Catalogue manager", "Order manager", "Finance viewer", "Support agent"].map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Btn
                    variant="dark"
                    onClick={() => {
                      if (!/^\S+@\S+\.\S+$/.test(newMember.email)) return notify("Enter a valid email", "error");
                      setTeam([...team, { name: newMember.email.split("@")[0], email: newMember.email, role: newMember.role, access: newMember.role }]);
                      setNewMember({ email: "", role: "Catalogue manager" });
                      notify("Invitation recorded in demo");
                    }}
                  >
                    Send invite
                  </Btn>
                </div>
              </div>
              <InfoNote tone="warning" title="Permission boundaries">
                A team member with catalogue access still cannot approve Velora catalogue review, moderate reviews, approve KYC or change the bank account.
              </InfoNote>
            </>
          )}

          {section === "help" && (
            <>
              <div className="partner-section-head"><p>Operational help for catalogues, orders, returns and payouts.</p></div>
              <div className="help-cards">
                {[
                  ["Listing rejected?", "Read the reason in Catalogue → Needs attention. Correct the image or attribute, then resubmit. The listing keeps its identity.", "/partner/catalogue"],
                  ["Order SLA", "Accept within 24 hours, pack, print label, hand over. Late acceptance affects seller health.", "/partner/orders"],
                  ["Payout timing", "Weekly cycle, T+7 after delivery, less commission, payment fee, logistics and refunds.", "/partner/payments"],
                  ["Return disputes", "You can dispute condition with evidence. You cannot deny an eligible return under policy.", "/partner/returns"],
                ].map(([t, d, to]) => (
                  <Link to={to} className="help-card" key={t}><b>{t}</b><p>{d}</p><span>Open <ArrowRight size={13} /></span></Link>
                ))}
              </div>
              <div className="panel-card">
                <div className="panel-head"><b>Contact partner support</b><Badge tone="soft">Demo</Badge></div>
                <p className="panel-text">partner-support@velora.demo is a placeholder. In production this opens a tracked ticket with SLA timers visible to both sides.</p>
                <Btn variant="outline" onClick={() => notify("Support request recorded in demo")}>Create a support request</Btn>
              </div>
            </>
          )}

          {section === "settings" && (
            <>
              <div className="partner-section-head"><p>Notification preferences and workspace defaults. Business-critical settings are controlled by operations.</p></div>
              <div className="partner-grid-2">
                <section className="panel-card">
                  <div className="panel-head"><b>Notifications</b></div>
                  {[
                    ["orderAlerts", "New order alerts", "Immediately when an order is placed"],
                    ["lowStockAlerts", "Low stock alerts", "When a variant drops below 8 units"],
                    ["payoutAlerts", "Payout reports", "When a settlement statement is generated"],
                    ["returnAlerts", "Return requests", "When a shopper opens a return"],
                    ["weeklyDigest", "Weekly digest", "Sunday summary of sales and stock"],
                  ].map(([key, label, desc]) => (
                    <label className="check-row settings-check" key={key}>
                      <input type="checkbox" checked={settingsDraft[key]} onChange={() => setSettingsDraft({ ...settingsDraft, [key]: !settingsDraft[key] })} />
                      <span className="check-box" aria-hidden="true">{settingsDraft[key] && <Check size={11} />}</span>
                      <span className="check-label">{label}<small>{desc}</small></span>
                    </label>
                  ))}
                  <Btn variant="dark" size="sm" onClick={() => notify("Notification preferences saved in demo")}>Save preferences</Btn>
                </section>
                <section className="panel-card">
                  <div className="panel-head"><b>Marketplace settings</b><span>Read-only</span></div>
                  <ul className="plain-list">
                    <li><span>Commission</span><b>{seller.commission}%</b></li>
                    <li><span>Return window</span><b>{config.returnWindow} days</b></li>
                    <li><span>Free shipping threshold</span><b>{money(config.freeShippingThreshold)}</b></li>
                    <li><span>Complete the Look</span><b>{config.offersEnabled ? "Enabled" : "Paused"}</b></li>
                    <li><span>Deep-tier cart gate</span><b>{money(config.deepBundleGate)}</b></li>
                  </ul>
                  <InfoNote tone="soft">These are platform rules. Sellers cannot change commission, return policy or pricing floors.</InfoNote>
                </section>
              </div>
              <section className="panel-card">
                <div className="panel-head"><b>Warehouse & pickup</b></div>
                <div className="profile-grid">
                  <div><span>Pickup address</span><b>Studio 4, Amer Road, Jaipur 302002</b></div>
                  <div><span>Fulfilment</span><b>Seller-fulfilled</b></div>
                  <div><span>Dispatch SLA</span><b>2 business days</b></div>
                  <div><span>Return address</span><b>Same as pickup</b></div>
                </div>
                <Btn variant="outline" size="sm" onClick={() => notify("Pickup settings are read-only in this demo")}>Request a change</Btn>
              </section>
            </>
          )}
        </div>
      </div>

      {editor && (
        <ProductEditor
          product={editor}
          onClose={() => setEditor(null)}
          onSave={(patch) => { updateListing(editor.id, patch); if (editor.status === "live") submitListing(editor.id); }}
        />
      )}

      {adjust && (
        <Modal open onClose={() => setAdjust(null)} title={`Adjust stock — ${adjust.product.name} (${adjust.size})`}>
          <p className="modal-lede">Every manual movement needs a reason and is written to the inventory ledger.</p>
          <div className="adjust-actions">
            <button type="button" onClick={() => { adjustStock(adjust.product.id, adjust.size, 5, "Restock received"); setAdjust(null); }}>+5 received</button>
            <button type="button" onClick={() => { adjustStock(adjust.product.id, adjust.size, 1, "Restock received"); setAdjust(null); }}>+1</button>
            <button type="button" onClick={() => { adjustStock(adjust.product.id, adjust.size, -1, "Damaged / quarantine"); setAdjust(null); }}>−1 damaged</button>
          </div>
          <InfoNote tone="warning" title="Demo limitation">
            This adjusts the listing's total sellable stock. Per-size quantities shown in the table are an illustrative
            distribution for the demo, not separately addressable SKU inventory.
          </InfoNote>
          <Field label="Custom reason">
            <input placeholder="e.g. Stock count correction" onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                adjustStock(adjust.product.id, adjust.size, 0, e.currentTarget.value.trim());
                setAdjust(null);
              }
            }} />
          </Field>
        </Modal>
      )}
    </main>
  );
}
