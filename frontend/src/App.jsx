import React, { useEffect, useRef, useState } from "react";
import { Link, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { ShieldCheck, Store } from "lucide-react";
import { AppProvider, useApp } from "./store/AppStore.jsx";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import { Btn, Toast } from "./components/ui.jsx";
import { BackToTop, PointerSpotlight } from "./components/fx.jsx";
import Home from "./pages/Home.jsx";
import Listing from "./pages/Listing.jsx";
import Product from "./pages/Product.jsx";
import Search from "./pages/Search.jsx";
import Wishlist from "./pages/Wishlist.jsx";
import Cart from "./pages/Cart.jsx";
import Checkout from "./pages/Checkout.jsx";
import OrderConfirmation from "./pages/OrderConfirmation.jsx";
import Account from "./pages/Account.jsx";
import Fit from "./pages/Fit.jsx";
import PartnerHub from "./pages/PartnerHub.jsx";
import Operations from "./pages/Operations.jsx";
import { About, Help, Login, Policy, Sell, SizeGuide } from "./pages/Static.jsx";

function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const measure = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(1, doc.scrollTop / max) : 0);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return <div className="scroll-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />;
}

function CursorGlow() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!window.matchMedia("(pointer: fine)").matches) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let frame = 0;
    const render = () => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = 0;
    };
    const move = (event) => {
      x = event.clientX;
      y = event.clientY;
      el.classList.add("ready");
      if (!frame) frame = requestAnimationFrame(render);
    };
    const hide = () => el.classList.remove("ready");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", hide);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", hide);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={ref} className="cursor-glow" aria-hidden="true" />;
}

function StoreLayout() {
  const location = useLocation();
  // The header and footer persist between pages; only the page body re-enters.
  // /search is keyed per navigation (it owns its own query state); every other route by path,
  // so changing filters never remounts the page or throws away focus and scroll.
  const stageKey = location.pathname === "/search" ? `search-${location.key}` : location.pathname;
  return (
    <>
      <Header />
      <div className="route-stage" key={stageKey}>
        <Outlet />
      </div>
      <Footer />
    </>
  );
}

function RoleGate({ required, children }) {
  const { role, switchRole } = useApp();
  if (role === required) return children;
  const label = required === "admin" ? "Velora Operations Console" : "Velora Partner Hub";
  return (
    <main id="main" className="page-shell">
      <div className="empty-state">
        {required === "admin" ? <ShieldCheck size={22} /> : <Store size={22} />}
        <h2>{label} is not part of shopper navigation</h2>
        <p>
          This demo workspace is role-gated. There is no real authentication in this prototype, so the
          switch below only changes local demo state — in production this area requires a provisioned,
          strongly authenticated account.
        </p>
        <button type="button" className="btn btn-dark" onClick={() => switchRole(required)}>
          Open {required === "admin" ? "Operations Console" : "Partner Hub"} in demo mode
        </button>
        <Link to="/" className="text-link">Back to the storefront</Link>
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main id="main" className="page-shell">
      <div className="empty-state">
        <h2>That page has moved, or never existed</h2>
        <p>The link may be old. The catalogue is the best place to pick up again.</p>
        <div className="empty-actions">
          <Btn to="/" variant="dark">Back to home</Btn>
          <Btn to="/shop" variant="outline">Browse all products</Btn>
        </div>
      </div>
    </main>
  );
}

function Shell() {
  const location = useLocation();
  const { toast } = useApp();
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (location.hash) {
      let id = location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* keep raw id */ }
      const timer = setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 90);
      return () => clearTimeout(timer);
    }
    const pathChanged = lastPath.current !== location.pathname;
    lastPath.current = location.pathname;
    // Filter changes write to the URL with state.keep — those must not jump the page to the top.
    if (pathChanged || !location.state?.keep) window.scrollTo({ top: 0, behavior: "instant" });
    return undefined;
  }, [location.pathname, location.search, location.hash, location.state]);

  return (
    <>
      <ScrollProgress />
      <div className="route-root">
      <Routes>
        <Route element={<StoreLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Listing />} />
          <Route path="/new" element={<Listing mode="new" />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/search" element={<Search />} />
          <Route path="/fit" element={<Fit />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-confirmation/:id" element={<OrderConfirmation />} />
          <Route path="/account" element={<Account section="overview" />} />
          <Route path="/account/orders" element={<Account section="orders" />} />
          <Route path="/account/orders/:orderId" element={<Account section="orders" />} />
          <Route path="/account/addresses" element={<Account section="addresses" />} />
          <Route path="/account/reviews" element={<Account section="reviews" />} />
          <Route path="/account/profile" element={<Account section="profile" />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/login" element={<Login />} />
          <Route path="/about" element={<About />} />
          <Route path="/help" element={<Help />} />
          <Route path="/help/:section" element={<Help />} />
          <Route path="/policies/:slug" element={<Policy />} />
          <Route path="/size-guide" element={<SizeGuide />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route
          path="/partner"
          element={<RoleGate required="seller"><PartnerHub /></RoleGate>}
        />
        <Route
          path="/partner/:section"
          element={<RoleGate required="seller"><PartnerHub /></RoleGate>}
        />
        <Route
          path="/operations"
          element={<RoleGate required="admin"><Operations /></RoleGate>}
        />
        <Route
          path="/operations/:section"
          element={<RoleGate required="admin"><Operations /></RoleGate>}
        />

      </Routes>
      </div>
      <CursorGlow />
      <PointerSpotlight />
      <BackToTop />
      <Toast toast={toast} />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
