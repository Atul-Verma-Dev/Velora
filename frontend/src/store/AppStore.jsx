import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { products as seedProducts, defaultAddresses, sellers as seedSellers, stockForSize, ensureSizeStock, sumSizeStock } from "../data/catalog.js";
import { offerPrice, offerStillValid } from "../lib/ctl.js";
import { seedOrders, seedSellerApplications, sellerSeedOrders } from "../data/orders.js";
import { seedReviews } from "../data/reviews.js";
import { couponValue, formatDate, linePrice, shippingFor } from "../lib/format.js";
import { getProducts, toFrontendProduct, backendEnabled as productsBackendEnabled } from "../lib/api/products.js";
import { placeOrder as placeOrderApi } from "../lib/api/orders.js";

const KEY = "velora-v1";
const load = (name, fallback) => {
  try {
    const raw = localStorage.getItem(`${KEY}-${name}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const save = (name, value) => {
  try {
    localStorage.setItem(`${KEY}-${name}`, JSON.stringify(value));
  } catch {
    /* storage unavailable — session state still works */
  }
};

const DEMO_USERS = {
  user: { id: "user-demo", name: "Aarav Mehta", email: "aarav@example.com" },
  seller: { id: "seller-1", name: "Meera Rathore", email: "studio@aranya.demo", org: "House of Aranya" },
  admin: { id: "admin-1", name: "Priya Nair", email: "priya@velora.demo", org: "Velora Operations" },
};

export const ADMIN_ROLES = [
  { id: "super", label: "Super Admin", scope: "All modules · high-risk actions need a reason" },
  { id: "seller_ops", label: "Seller Operations", scope: "Applications, KYC, seller status" },
  { id: "catalogue", label: "Catalogue Operations", scope: "Listing QC, image review, suppression" },
  { id: "trust", label: "Trust & Safety", scope: "Review moderation, flags, abuse" },
  { id: "finance", label: "Finance", scope: "Settlements, refunds, reconciliation" },
];

export const PERMISSIONS = {
  reviews: ["super", "trust"],
  catalogue: ["super", "catalogue"],
  sellers: ["super", "seller_ops"],
  finance: ["super", "finance"],
  config: ["super"],
};

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [products, setProducts] = useState(() =>
    productsBackendEnabled() ? [] : load("products", seedProducts)
  );
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(null);
  const [cart, setCart] = useState(() => load("cart", []));
  const [wishlist, setWishlist] = useState(() => load("wishlist", []));
  const [orders, setOrders] = useState(() => load("orders", [...seedOrders, ...sellerSeedOrders]));
  const [reviews, setReviews] = useState(() => load("reviews", seedReviews));
  const [role, setRole] = useState(() => load("role", "user"));
  const [adminRole, setAdminRole] = useState(() => load("adminRole", "super"));
  const [user, setUser] = useState(() => load("user", DEMO_USERS.user));
  const [fitProfile, setFitProfile] = useState(() => load("fit", null));
  const [addresses, setAddresses] = useState(() => load("addresses", defaultAddresses));
  const [sellers, setSellers] = useState(() =>
    load("sellers", seedSellers.map((s) => ({ ...s, status: s.kyc === "verified" ? "active" : "onboarding" })))
  );
  const [applications, setApplications] = useState(() => load("applications", seedSellerApplications));
  const [config, setConfig] = useState(() =>
    load("config", {
      commission: 18,
      paymentFee: 2,
      logisticsFee: 45,
      deepBundleGate: 2000,
      freeShippingThreshold: 1499,
      returnWindow: 7,
      offersEnabled: true,
    })
  );
  const [audit, setAudit] = useState(() => load("audit", [
    { id: "a1", at: "24 Nov 2026, 18:12", actor: "Priya Nair", role: "Trust & Safety", action: "Review approved", object: "VLR-3001 · rv-306", detail: "Standard policy check passed." },
    { id: "a2", at: "24 Nov 2026, 16:40", actor: "Priya Nair", role: "Catalogue Operations", action: "Listing rejected", object: "VLR-9003", detail: "Main image below 1200 px." },
    { id: "a3", at: "23 Nov 2026, 11:05", actor: "System", role: "System", action: "Search index refreshed", object: "Catalogue", detail: "Demo index rebuilt for the live catalogue." },
  ]));
  const [searchLog, setSearchLog] = useState(() => load("searchLog", []));
  const [ledger, setLedger] = useState(() => load("ledger", []));
  const [recentlyViewed, setRecentlyViewed] = useState(() => load("recent", []));
  const [recentSearches, setRecentSearches] = useState(() => load("recentSearches", []));
  const [toast, setToast] = useState(null);
  const [coupon, setCoupon] = useState(() => load("coupon", null));
  const toastTimer = useRef(null);

  useEffect(() => save("products", products), [products]);
  useEffect(() => save("cart", cart), [cart]);
  useEffect(() => save("wishlist", wishlist), [wishlist]);
  useEffect(() => save("orders", orders), [orders]);
  useEffect(() => save("reviews", reviews), [reviews]);
  useEffect(() => save("role", role), [role]);
  useEffect(() => save("adminRole", adminRole), [adminRole]);
  useEffect(() => save("user", user), [user]);
  useEffect(() => save("fit", fitProfile), [fitProfile]);
  useEffect(() => save("addresses", addresses), [addresses]);
  useEffect(() => save("sellers", sellers), [sellers]);
  useEffect(() => save("applications", applications), [applications]);
  useEffect(() => save("config", config), [config]);
  useEffect(() => save("audit", audit), [audit]);
  useEffect(() => save("searchLog", searchLog), [searchLog]);
  useEffect(() => save("ledger", ledger), [ledger]);
  useEffect(() => save("recent", recentlyViewed), [recentlyViewed]);
  useEffect(() => save("recentSearches", recentSearches), [recentSearches]);
  useEffect(() => save("coupon", coupon), [coupon]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Backend product catalogue — loads live listings from the API when the
  // flag is enabled. On failure, shows a visible error instead of silently
  // substituting seed data. Local fallback only applies when the flag is off.
  useEffect(() => {
    if (!productsBackendEnabled()) return;
    let cancelled = false;
    setProductsLoading(true);
    setProductsError(null);
    getProducts({ status: "live", limit: 200 }).then((data) => {
      if (cancelled) return;
      const items = (data && data.items) || [];
      setProducts(items.map(toFrontendProduct));
      setProductsLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setProductsError(err.message || "Backend catalogue unavailable");
      setProductsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const notify = useCallback((message, tone = "default") => {
    setToast({ message, tone, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const log = useCallback((action, object, detail, actorRole) => {
    setAudit((old) =>
      [
        {
          id: `a-${Date.now()}-${Math.round(Math.random() * 999)}`,
          at: `${formatDate()}, ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
          actor: actorRole ? DEMO_USERS[role].name : user.name,
          role: actorRole || (role === "admin" ? ADMIN_ROLES.find((r) => r.id === adminRole)?.label : role === "seller" ? "Seller" : "Shopper"),
          action,
          object,
          detail,
        },
        ...old,
      ].slice(0, 80)
    );
  }, [role, user, adminRole]);

  // ---- cart ------------------------------------------------------------
  const addToCart = useCallback((productOrId, size, qty = 1, opts = {}) => {
    const id = typeof productOrId === "string" ? productOrId : productOrId.id;
    const product = products.find((p) => p.id === id);
    if (!product) return false;
    if (product.status !== "live") {
      notify("This listing is not available to purchase.", "error");
      return false;
    }
    const chosen = size || product.sizes[0];
    const key = `${id}::${chosen}`;
    const existing = cart.find((l) => `${l.productId}::${l.size}` === key);
    if (existing?.offer && !opts.offer) {
      notify("This piece is already in your bag as a Complete the Look offer (one per order).", "error");
      return false;
    }
    let unitPrice = product.price;
    if (opts.offer) {
      const quote = offerPrice(product, config);
      if (!offerStillValid(product, { price: quote.price }, config)) {
        notify("That offer is no longer available.", "error");
        return false;
      }
      if (existing) {
        notify("That offer is already in your bag.", "error");
        return false;
      }
      unitPrice = quote.price;
      qty = 1;
    }
    const wanted = (existing?.qty || 0) + qty;
    const available = Math.min(product.stock, stockForSize(product, chosen));
    if (available === 0) {
      notify(`Size ${chosen} is out of stock.`, "error");
      return false;
    }
    if (wanted > available) {
      notify(`Only ${available} left in size ${chosen}.`, "error");
      return false;
    }
    setCart((old) =>
      existing
        ? old.map((l) => (`${l.productId}::${l.size}` === key ? { ...l, qty: wanted } : l))
        : [...old, { productId: id, size: chosen, qty, price: unitPrice, ...(opts.offer ? { offer: true } : {}) }]
    );
    notify(opts.offer ? `Added at your offer price · ${product.name}` : `Added to bag · ${product.name}`);
    return true;
  }, [products, cart, config, notify]);

  const updateQty = useCallback((key, qty) => {
    const [id, size] = key.split("::");
    const product = products.find((p) => p.id === id);
    if (!product) return;
    if (qty < 1) return;
    if (cart.find((l) => `${l.productId}::${l.size}` === key)?.offer && qty > 1) {
      notify("Offer pieces are limited to one per order.", "error");
      return;
    }
    const available = Math.min(product.stock, stockForSize(product, size));
    if (qty > available) {
      notify(`Only ${available} left in size ${size}.`, "error");
      return;
    }
    setCart((old) => old.map((l) => (`${l.productId}::${l.size}` === key ? { ...l, qty } : l)));
  }, [products, cart, notify]);

  const removeLine = useCallback((key) => {
    setCart((old) => old.filter((l) => `${l.productId}::${l.size}` !== key));
    notify("Removed from your bag");
  }, [notify]);

  const toggleWish = useCallback((id) => {
    const has = wishlist.includes(id);
    setWishlist((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
    notify(has ? "Removed from wishlist" : "Saved to wishlist");
  }, [wishlist, notify]);

  const moveToWishlist = useCallback((key) => {
    const line = cart.find((l) => `${l.productId}::${l.size}` === key);
    if (!line) return;
    setWishlist((old) => (old.includes(line.productId) ? old : [...old, line.productId]));
    setCart((old) => old.filter((l) => `${l.productId}::${l.size}` !== key));
    notify("Moved to wishlist");
  }, [cart, notify]);

  const clearCart = useCallback(() => setCart([]), []);

  const markViewed = useCallback((id) => {
    setRecentlyViewed((old) => [id, ...old.filter((x) => x !== id)].slice(0, 8));
  }, []);

  // ---- checkout --------------------------------------------------------
  const placeOrder = useCallback(async ({ address, payment, delivery, contact, coupon: couponArg, offerReferences }) => {
    if (!cart.length) return null;

    if (productsBackendEnabled()) {

  // ---------------------------------------------------------
  // BACKEND CHECKOUT
  // PostgreSQL is authoritative for pricing and inventory.
  // ---------------------------------------------------------

  // Ensure every cart product exists in the backend catalogue.
  const invalidProduct = cart.find(
    (line) => !products.find(
      (product) => product.id === line.productId
    )
  );

  if (invalidProduct) {
    notify(
      "A product in your bag is unavailable. Please review your bag.",
      "error"
    );
    return null;
  }

  // Validate CTL offers before submitting them.
  // Backend recommendations must have a real persisted ID.
  const invalidOffer = cart.find((line) => {
    if (!line.offer) return false;

    const recommendationId = Number(line.recommendationId);

    return (
      !Number.isInteger(recommendationId) ||
      recommendationId <= 0 ||
      line.qty !== 1
    );
  });

  if (invalidOffer) {
    notify(
      "A Complete the Look offer could not be validated. Remove it and add the offer again.",
      "error"
    );
    return null;
  }

  // Keep the existing client-side expiry check as an early warning.
  // The backend independently validates the recommendation.
  const staleOffer = cart.find((line) =>
    line.offer &&
    !offerStillValid(
      products.find((product) => product.id === line.productId),
      line,
      config
    )
  );

  if (staleOffer) {
    notify(
      "A Complete the Look offer in your bag has expired. Remove it and try again.",
      "error"
    );
    return null;
  }

  // Convert the cart into the backend's expected item format.
  const backendItems = cart.map((line) => {
    const product = products.find(
      (item) => item.id === line.productId
    );

    return {
      sku: product.id,
      size: line.size,
      qty: line.qty,
    };
  });

  // Send only persisted recommendation references.
  // Never send a client-controlled offer price.
  const offerReferences = cart
    .filter((line) => line.offer)
    .map((line) => {
      const product = products.find(
        (item) => item.id === line.productId
      );

      return {
        recommendation_id: Number(line.recommendationId),
        sku: product.id,
        size: line.size,
      };
    });

  // Convert the UI delivery object into the backend allowlist.
  const deliveryMethod =
    delivery?.id === "express"
      ? "express"
      : "standard";

  // Address formatting happens here, not in Checkout.jsx.
  const addressText = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  try {

    const placed = await placeOrderApi({

      user_id: user.id,

      customer_name: address.name || user.name,

      contact: contact || address.phone,

      address: addressText,

      payment: payment || "Cash on delivery (demo)",

      delivery: deliveryMethod,

      items: backendItems,

      offer_references: offerReferences || [],

      // The backend validates the coupon and calculates
      // the discount independently.
      coupon_code: couponArg?.code || null,

    });

    if (!placed || !placed.id) {
      throw new Error(
        "The backend did not return a valid order ID."
      );
    }

    const orderId = placed.id;

    // Build a lookup of server-returned order items keyed by sku::size.
    const serverItemsByKey = new Map(
      (placed.items || []).map((item) => [
        `${item.sku}::${item.size}`,
        item,
      ])
    );

    // Reconcile the frontend with the successful backend order.
    setCart([]);
    setCoupon(null);

    setOrders((old) => [
      {
        id: orderId,

        date: formatDate(),

        placedAt:
          placed.placed_at ||
          new Date().toISOString().slice(0, 10),

        status: placed.status || "Processing",

        payment: placed.payment,

        address: placed.address,

        contact: placed.contact,

        delivery: placed.delivery_label,

        subtotal: placed.subtotal,

        discount: placed.discount,

        shipping: placed.shipping,

        total: placed.total,

        userId: user.id,

        items: cart.map((line) => {
          const product = products.find(
            (item) => item.id === line.productId
          );

          // Use the server-returned price when available; fall back to the
          // client-side line price for the local demo path.
          const serverItem = serverItemsByKey.get(
            `${line.productId}::${line.size}`
          );

          return {
            id: product.id,
            name: product.name,
            brand: product.brand,

            // Preserve the confirmed offer price from the backend when present.
            price: serverItem ? Number(serverItem.price) : linePrice(line, product),

            qty: line.qty,

            offer: Boolean(line.offer),

            size: line.size,

            colour: product.color,

            image: product.image,

            sellerId: product.sellerId,

            sellerName: product.sellerName,

            ...(line.recommendationId
              ? {
                  recommendationId: line.recommendationId,
                }
              : {}),
          };
        }),

        tracking: [
          {
            label: "Order placed",
            date: `${formatDate()}, now`,
            done: true,
          },
          {
            label: "Awaiting seller acceptance",
            date: "Within 24 hours",
            done: false,
          },
          {
            label: "Packed",
            date: "—",
            done: false,
          },
          {
            label: "Shipped",
            date: "—",
            done: false,
          },
          {
            label: "Delivered",
            date: "—",
            done: false,
          },
        ],
      },

      ...old,
    ]);

    log(
      "Order placed",
      orderId,
      `${cart.length} line(s) · ${placed.payment}`,
      "Shopper"
    );

    notify(
      "Order placed — recorded in PostgreSQL. Inventory decremented. Payment and shipment are not processed in this demo."
    );

    return {
      id: orderId,
    };

  } catch (err) {

    console.error("Backend order placement failed:", err);

    notify(
      `Order failed: ${err.message}`,
      "error"
    );

    return null;
  }
}

    // Local path — unchanged demo behaviour.
    const invalid = cart.find((line) => {
      const p = products.find((x) => x.id === line.productId);
      return !p || p.status !== "live" || Math.min(p.stock, stockForSize(p, line.size)) < line.qty;
    });
    if (invalid) {
      notify("Stock changed while you were checking out. Please review your bag.", "error");
      return null;
    }
    const staleOffer = cart.find((line) => line.offer && !offerStillValid(products.find((x) => x.id === line.productId), line, config));
    if (staleOffer) {
      notify("A Complete the Look offer in your bag has expired. Remove it and try again.", "error");
      return null;
    }
    const subtotal = cart.reduce((s, l) => s + linePrice(l, products.find((x) => x.id === l.productId)) * l.qty, 0);
    const discount = couponValue(couponArg || coupon, subtotal);
    const ship = delivery?.price ?? shippingFor(subtotal);
    const items = cart.map((l) => {
      const p = products.find((x) => x.id === l.productId);
      return {
        id: p.id, name: p.name, brand: p.brand, price: linePrice(l, p), qty: l.qty, offer: Boolean(l.offer),
        size: l.size, colour: p.color, image: p.image,
        sellerId: p.sellerId, sellerName: p.sellerName,
      };
    });
    const order = {
      id: `VLR-${Date.now().toString().slice(-8)}`,
      date: formatDate(),
      placedAt: new Date().toISOString().slice(0, 10),
      status: "Processing",
      payment: payment || "Cash on delivery (demo)",
      address: `${address.line1}, ${address.line2 ? address.line2 + ", " : ""}${address.city} ${address.pincode}`,
      contact: contact || address.phone,
      delivery: delivery?.label || "Standard delivery · free",
      subtotal,
      discount,
      shipping: ship,
      total: subtotal - discount + ship,
      userId: user.id,
      items,
      tracking: [
        { label: "Order placed", date: `${formatDate()}, now`, done: true },
        { label: "Awaiting seller acceptance", date: "Within 24 hours", done: false },
        { label: "Packed", date: "—", done: false },
        { label: "Shipped", date: "—", done: false },
        { label: "Delivered", date: "—", done: false },
      ],
    };
    // Decrement real per-size stock, summing every line of the same product.
    setProducts((old) =>
      old.map((p) => {
        const lines = items.filter((i) => i.id === p.id);
        if (!lines.length) return p;
        const sizeStock = ensureSizeStock(p);
        lines.forEach((i) => { sizeStock[i.size] = Math.max(0, (sizeStock[i.size] || 0) - i.qty); });
        const sold = lines.reduce((s, i) => s + i.qty, 0);
        return { ...p, sizeStock, stock: sumSizeStock(sizeStock), unitsSold30d: (p.unitsSold30d || 0) + sold };
      })
    );
    const stamp = `${formatDate()}, ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
    setLedger((old) => [
      ...items.map((i, n) => ({ id: `lg-${Date.now()}-${n}`, at: stamp, productId: i.id, size: i.size, delta: -i.qty, reason: `Sale · order ${order.id}`, actor: "System" })),
      ...old,
    ]);
    setOrders((old) => [order, ...old]);
    setCart([]);
    setCoupon(null);
    log("Order placed", order.id, `${items.length} line(s) · ${order.payment}`, "Shopper");
    notify("Order placed — demo checkout, no payment was taken.");
    return order;
  }, [cart, products, config, coupon, user, notify, log, productsBackendEnabled, placeOrderApi]);

  const updateOrderStatus = useCallback((orderId, status, note) => {
    setOrders((old) =>
      old.map((o) => {
        if (o.id !== orderId) return o;
        const needle = status.toLowerCase().slice(0, 5);
        const hit = o.tracking.findIndex((t) => t.label.toLowerCase().includes(needle));
        const tracking = o.tracking.map((t, i) =>
          hit >= 0 && i <= hit && !t.done ? { ...t, done: true, date: formatDate() } : t
        );
        return { ...o, status, tracking };
      })
    );
    log("Order status updated", orderId, `${status}${note ? ` · ${note}` : ""}`);
    notify(`Order ${orderId} marked ${status}`);
  }, [log, notify]);

  const requestReturn = useCallback((orderId, reason) => {
    setOrders((old) =>
      old.map((o) =>
        o.id === orderId
          ? { ...o, status: "Return requested", returnReason: reason, returnStatus: "Pickup scheduled" }
          : o
      )
    );
    log("Return requested", orderId, reason, "Shopper");
    notify("Return requested — pickup details will follow.");
  }, [log, notify]);

  // ---- reviews ---------------------------------------------------------
  const addReview = useCallback((productId, payload) => {
    if ((reviews[productId] || []).some((r) => r.userId === user.id)) {
      notify("You've already reviewed this piece.", "error");
      return null;
    }
    const eligibleOrder = orders.find(
      (o) => o.userId === user.id && o.status === "Delivered" && o.items.some((i) => i.id === productId)
    );
    const entry = {
      id: `rv-${Date.now()}`,
      productId,
      userId: user.id,
      name: payload.anonymous ? "Anonymous shopper" : user.name,
      rating: payload.rating,
      title: payload.title || "My review",
      body: payload.body,
      fit: payload.fit || "Just right",
      sizeWorn: payload.sizeWorn || "",
      photo: payload.photo || "",
      date: formatDate(),
      verified: Boolean(eligibleOrder),
      status: "pending",
      helpful: 0,
    };
    setReviews((old) => ({ ...old, [productId]: [entry, ...(old[productId] || [])] }));
    notify("Review submitted for moderation");
    return entry;
  }, [orders, reviews, user, notify]);

  const moderateReview = useCallback(({ productId, reviewId, status, reason }) => {
    setReviews((old) => ({
      ...old,
      [productId]: (old[productId] || []).map((r) => (r.id === reviewId ? { ...r, status, moderationReason: reason, flagged: false } : r)),
    }));
    log(`Review ${status}`, `${productId} · ${reviewId}`, reason || "Policy review completed.");
    notify(`Review ${status}`);
  }, [log, notify]);

  const flagReview = useCallback((productId, reviewId, reason) => {
    setReviews((old) => ({
      ...old,
      [productId]: (old[productId] || []).map((r) =>
        r.id === reviewId ? { ...r, flagged: true, flagReason: reason } : r
      ),
    }));
    notify("Reported for review by Velora Trust & Safety");
  }, [notify]);

  const sellerRespond = useCallback((productId, reviewId, response) => {
    setReviews((old) => ({
      ...old,
      [productId]: (old[productId] || []).map((r) => (r.id === reviewId ? { ...r, response } : r)),
    }));
    notify("Public response posted");
  }, [notify]);

  // ---- seller operations ----------------------------------------------
  const adjustStock = useCallback((productId, size, delta, reason) => {
    setProducts((old) =>
      old.map((p) => {
        if (p.id !== productId) return p;
        const sizeStock = ensureSizeStock(p);
        const target = p.sizes.includes(size) ? size : p.sizes[0];
        sizeStock[target] = Math.max(0, (sizeStock[target] || 0) + delta);
        return { ...p, sizeStock, stock: sumSizeStock(sizeStock) };
      })
    );
    setLedger((old) => [
      {
        id: `lg-${Date.now()}`,
        at: `${formatDate()}, ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
        productId,
        size,
        delta,
        reason: reason || "Manual adjustment",
        actor: user.name,
      },
      ...old,
    ]);
    log("Stock adjusted", productId, `${delta > 0 ? "+" : ""}${delta} · ${size} · ${reason || "Manual"}`);
    notify("Stock updated");
  }, [log, notify, user]);

  const updateListing = useCallback((productId, patch) => {
    setProducts((old) => old.map((p) => (p.id === productId ? { ...p, ...patch } : p)));
    notify("Listing updated");
  }, [notify]);

  const submitListing = useCallback((productId) => {
    setProducts((old) =>
      old.map((p) => (p.id === productId ? { ...p, status: "under_review", submittedAt: formatDate() } : p))
    );
    log("Listing submitted for review", productId, "Seller submitted catalogue changes.");
    notify("Sent to Velora catalogue review");
  }, [log, notify]);

  const createListing = useCallback((payload) => {
    let id = `VLR-${Math.floor(8000 + Math.random() * 900)}`;
    while (products.some((x) => x.id === id)) id = `VLR-${Math.floor(8000 + Math.random() * 900)}`;
    const base = seedProducts.find((p) => p.id === payload.templateId) || seedProducts[0];
    const product = {
      ...base,
      ...payload,
      id,
      sellerId: role === "seller" ? "seller-1" : base.sellerId,
      sellerName: role === "seller" ? "House of Aranya" : base.sellerName,
      rating: 0,
      reviewCount: 0,
      images: [payload.image || base.image],
      image: payload.image || base.image,
      status: "under_review",
      addedDaysAgo: 0,
      stockAgeDays: 0,
      unitsSold30d: 0,
      cogs: Math.round((payload.price || base.price) * 0.35),
      marginalShipping: 45,
    };
    setProducts((old) => [product, ...old]);
    log("Listing created", id, payload.name || "New listing");
    notify("Listing submitted for catalogue review");
    return product;
  }, [role, products, log, notify]);

  const moderateListing = useCallback((productId, decision, reason) => {
    setProducts((old) =>
      old.map((p) =>
        p.id === productId
          ? { ...p, status: decision, rejectionReason: decision === "rejected" ? reason : undefined }
          : p
      )
    );
    log(
      decision === "live" ? "Listing approved" : decision === "rejected" ? "Listing rejected" : "Listing sent back",
      productId,
      reason || "Catalogue QC completed."
    );
    notify(`Listing ${decision === "live" ? "approved and published" : decision}`);
  }, [log, notify]);

  const updateSeller = useCallback((sellerId, patch) => {
    setSellers((old) => old.map((s) => (s.id === sellerId ? { ...s, ...patch } : s)));
    notify("Store profile updated");
  }, [notify]);

  const moderateSeller = useCallback((sellerId, decision, reason) => {
    setSellers((old) => old.map((s) => (s.id === sellerId ? { ...s, status: decision } : s)));
    setApplications((old) =>
      old.map((a) =>
        a.sellerId === sellerId
          ? { ...a, status: decision === "active" ? "approved" : decision === "suspended" || decision === "onboarding" ? "rejected" : a.status, decisionReason: reason }
          : a
      )
    );
    log(
      decision === "active" ? "Seller approved" : decision === "suspended" ? "Seller suspended" : "Seller application rejected",
      sellerId,
      reason || "Seller operations review."
    );
    notify(decision === "active" ? "Seller approved" : decision === "suspended" ? "Seller suspended" : "Seller application rejected");
  }, [log, notify]);

  const recordSearch = useCallback((entry) => {
    setSearchLog((old) => [entry, ...old].slice(0, 60));
    if (entry.query) setRecentSearches((old) => [entry.query, ...old.filter((q) => q !== entry.query)].slice(0, 6));
  }, []);

  const switchRole = useCallback((next) => {
    setRole(next);
    setUser(DEMO_USERS[next]);
    notify(`Demo view: ${next === "user" ? "shopper" : next === "seller" ? "Partner Hub" : "Operations Console"}`);
  }, [notify]);

  // ---- addresses -------------------------------------------------------
  const saveAddress = useCallback((addr) => {
    setAddresses((old) => {
      const withDefault = old.map((a) => ({ ...a, isDefault: addr.isDefault ? false : a.isDefault }));
      const existing = withDefault.find((a) => a.id === addr.id);
      if (existing) return withDefault.map((a) => (a.id === addr.id ? { ...addr } : a));
      return [...withDefault, { ...addr, id: addr.id || `addr-${Date.now()}` }];
    });
    notify("Address saved");
  }, [notify]);

  const deleteAddress = useCallback((id) => {
    setAddresses((old) => old.filter((a) => a.id !== id));
    notify("Address removed");
  }, [notify]);

  const value = useMemo(() => ({
    products, productsLoading, productsError, setProducts, cart, wishlist, orders, reviews, role, adminRole, setAdminRole,
    user, fitProfile, addresses, sellers, applications, config, audit, searchLog, ledger,
    recentlyViewed, recentSearches, toast, notify, log,
    addToCart, updateQty, removeLine, toggleWish, moveToWishlist, clearCart, markViewed,
    placeOrder, updateOrderStatus, requestReturn,
    addReview, moderateReview, flagReview, sellerRespond,
    adjustStock, updateListing, submitListing, createListing, moderateListing, moderateSeller,
    recordSearch, switchRole, saveAddress, deleteAddress, updateSeller,
    coupon, setCoupon,
    setFitProfile, setConfig, can: (perm) => (PERMISSIONS[perm] || []).includes(adminRole),
    resetDemo: () => {
      Object.keys(localStorage).filter((k) => k.startsWith(KEY)).forEach((k) => localStorage.removeItem(k));
      window.location.href = "/";
    },
  }), [
    products, productsLoading, productsError, cart, wishlist, orders, reviews, role, adminRole, user, fitProfile, addresses,
    sellers, applications, config, audit, searchLog, ledger, recentlyViewed, recentSearches,
    toast, notify, log, addToCart, updateQty, removeLine, toggleWish, moveToWishlist, clearCart,
    markViewed, placeOrder, updateOrderStatus, requestReturn, addReview, moderateReview,
    flagReview, sellerRespond, adjustStock, updateListing, submitListing, createListing,
    moderateListing, moderateSeller, recordSearch, switchRole, saveAddress, deleteAddress,
    updateSeller, coupon,
  ]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
