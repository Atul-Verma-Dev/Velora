import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight, Camera, ChevronDown, Heart, Home, LayoutGrid, Menu, Search,
  ShoppingBag, Sparkles, Store, ShieldCheck, User, X,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { categories } from "../data/catalog.js";
import { departmentHref } from "../lib/format.js";
import { Drawer, IconBtn } from "./ui.jsx";

const NAV = [
  { label: "New in", to: "/new" },
  {
    label: "Women",
    to: "/shop?gender=Women",
    children: [
      { group: "Western", links: ["Dresses", "Tops & Shirts", "Trousers & Denim", "Co-ords", "Knitwear", "Outerwear"] },
      { group: "Ethnic", links: ["Kurta Sets", "Sarees", "Lehengas", "Anarkalis", "Dupattas"] },
      { group: "More", links: ["Footwear", "Bags", "Jewellery"] },
    ],
  },
  {
    label: "Men",
    to: "/shop?gender=Men",
    children: [
      { group: "Clothing", links: ["Shirts", "Knitwear", "Trousers", "Denim", "Outerwear"] },
      { group: "More", links: ["Footwear", "Watches", "Caps & Scarves"] },
    ],
  },
  { label: "Ethnic", to: "/shop?category=Ethnic%20Wear" },
  { label: "Western", to: "/shop?category=Western%20Wear" },
  { label: "Footwear", to: "/shop?category=Footwear" },
  { label: "Accessories", to: "/shop?category=Accessories" },
];

// Mega-menu links must resolve to real catalogue filters (and respect the department).
const GROUPED = { "Trousers & Denim": ["Trousers & Denim", "Trousers", "Denim"], "Tops & Shirts": ["Tops & Shirts", "Shirts"] };
const CATEGORY_LINKS = new Set(["Footwear"]);
const megaHref = (link, gender) => {
  const p = new URLSearchParams();
  if (gender) p.set("gender", gender);
  if (CATEGORY_LINKS.has(link)) p.set("category", link);
  else (GROUPED[link] || [link]).forEach((s) => p.append("subcategory", s));
  return `/shop?${p.toString()}`;
};

function Logo({ onClick }) {
  return (
    <Link to="/" className="logo" aria-label="Velora home" onClick={onClick}>
      <span className="logo-word">VELORA</span>
    </Link>
  );
}

export default function Header() {
  const { cart, wishlist, role, switchRole, user, notify, products } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [openNav, setOpenNav] = useState(null);
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const fileRef = useRef(null);
  const nav = useNavigate();
  const location = useLocation();
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const suggestions = query.trim().length > 1
    ? products.filter((p) => p.status === "live" && `${p.name} ${p.brand} ${p.subcategory} ${p.color}`.toLowerCase().includes(query.toLowerCase())).slice(0, 4)
    : [];

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    setOpenNav(null);
    setSuggestOpen(false);
  }, [location.pathname, location.search]);

  // Keep the header search box in step with the page the shopper is on.
  useEffect(() => {
    setQuery(location.pathname === "/search" ? new URLSearchParams(location.search).get("q") || "" : "");
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setAccountOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [accountOpen]);

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    nav(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };

  const onImage = (file) => {
    if (!file) return;
    nav("/search", { state: { imageFile: file } });
    notify("Reference image ready — add a description or search as-is");
  };

  const accountLinks = [
    { to: "/account", label: "Your account", icon: <User size={15} /> },
    { to: "/account/orders", label: "Orders & returns", icon: <ShoppingBag size={15} /> },
    { to: "/wishlist", label: "Wishlist", icon: <Heart size={15} /> },
    { to: "/account/reviews", label: "Your reviews", icon: <Sparkles size={15} /> },
    { to: "/help", label: "Help & support", icon: <ShieldCheck size={15} /> },
  ];

  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="site-header">
        <div className="header-main">
          <IconBtn label="Open menu" className="mobile-only" onClick={() => setMenuOpen(true)}>
            <Menu size={20} />
          </IconBtn>
          <Logo />

          <nav className="main-nav" aria-label="Main navigation">
            {NAV.map((item) =>
              item.children ? (
                <div
                  className="nav-item has-menu"
                  key={item.label}
                  onMouseEnter={() => setOpenNav(item.label)}
                  onMouseLeave={() => setOpenNav(null)}
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpenNav(null); }}
                  onKeyDown={(e) => { if (e.key === "Escape") setOpenNav(null); }}
                >
                  <Link
                    to={item.to}
                    className={`nav-link${openNav === item.label ? " open" : ""}`}
                    onFocus={() => setOpenNav(item.label)}
                    aria-expanded={openNav === item.label}
                  >
                    {item.label} <ChevronDown size={12} aria-hidden="true" />
                  </Link>
                  {openNav === item.label && (
                    <div className="mega" role="group" aria-label={`${item.label} categories`}>
                      {item.children.map((col) => (
                        <div className="mega-col" key={col.group}>
                          <span className="mega-title">{col.group}</span>
                          {col.links.map((link) => (
                            <Link
                              key={link}
                              to={megaHref(link, item.label === "Women" || item.label === "Men" ? item.label : "")}
                              onClick={() => setOpenNav(null)}
                            >
                              {link}
                            </Link>
                          ))}
                        </div>
                      ))}
                      <div className="mega-feature">
                        <img src={item.label === "Men" ? "/images/velora-hero.jpg" : "/images/aranya-campaign-haveli.jpg"} alt="" loading="lazy" />
                        <span className="eyebrow">THE EDIT</span>
                        <b>{item.label === "Men" ? "Quiet tailoring" : "Festive handloom"}</b>
                        <Link to={item.label === "Men" ? "/shop?gender=Men&sort=new" : "/shop?gender=Women&subcategory=Lehengas"} onClick={() => setOpenNav(null)}>
                          Shop now <ArrowUpRight size={13} />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link key={item.label} to={item.to} className="nav-link">{item.label}</Link>
              )
            )}
          </nav>

          <form className="header-search" onSubmit={submit} role="search">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true); }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 160)}
              placeholder="Search styles, fabrics, occasions" enterKeyHint="search"
              aria-label="Search Velora"
              autoComplete="off"
            />
            {query && (
              <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery("")}>
                <X size={13} />
              </button>
            )}
            <button type="button" className="search-camera" aria-label="Search with an image" title="Search with an image" onClick={() => fileRef.current?.click()}>
              <Camera size={16} />
            </button>
            <button type="submit" className="search-go">Search</button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onImage(e.target.files?.[0])}
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="search-suggest">
                <span className="eyebrow">Products</span>
                {suggestions.map((p) => (
                  <Link key={p.id} to={`/product/${p.id}`}>
                    <img src={p.image} alt="" loading="lazy" />
                    <span><b>{p.name}</b><small>{p.brand} · {p.subcategory}</small></span>
                  </Link>
                ))}
                <button type="button" className="suggest-all" onMouseDown={(e) => e.preventDefault()} onClick={submit}>
                  See all results for “{query}”
                </button>
              </div>
            )}
          </form>

          <div className="header-actions">
            <div className="account-anchor">
              <button
                type="button"
                className="icon-btn account-btn"
                aria-label="Account and demo view"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((o) => !o)}
              >
                <User size={19} />
                <span className="action-label">{user.name.split(" ")[0]}</span>
              </button>
              {accountOpen && (
                <>
                  <div className="pop-scrim" onClick={() => setAccountOpen(false)} />
                  <div className="account-pop" role="dialog" aria-label="Account menu">
                    <div className="account-pop-head">
                      <span className="avatar">{user.name.slice(0, 1)}</span>
                      <div>
                        <b>{user.name}</b>
                        <small>{user.email}</small>
                      </div>
                    </div>
                    <div className="account-links">
                      {accountLinks.map((l) => (
                        <Link key={l.to} to={l.to} onClick={() => setAccountOpen(false)}>
                          {l.icon}{l.label}
                        </Link>
                      ))}
                      {role === "seller" && (
                        <Link to="/partner" onClick={() => setAccountOpen(false)}><Store size={15} />Velora Partner Hub</Link>
                      )}
                      {role === "admin" && (
                        <Link to="/operations" onClick={() => setAccountOpen(false)}><ShieldCheck size={15} />Velora Operations Console</Link>
                      )}
                    </div>
                    <div className="demo-switch">
                      <span className="eyebrow">Demo workspace switch</span>
                      <p>This prototype has no real authentication. Switching is local to this browser.</p>
                      <div className="role-buttons">
                        {[["user", "Shopper"], ["seller", "Partner Hub"], ["admin", "Operations"]].map(([r, label]) => (
                          <button
                            key={r}
                            type="button"
                            className={role === r ? "active" : ""}
                            onClick={() => { switchRole(r); setAccountOpen(false); }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="account-pop-foot">
                      <Link to="/login" onClick={() => setAccountOpen(false)}>Sign in / create account <ArrowUpRight size={13} /></Link>
                    </div>
                  </div>
                </>
              )}
            </div>
            <Link to="/wishlist" className="icon-btn" aria-label={`Wishlist, ${wishlist.length} items`}>
              <Heart size={19} />
              {wishlist.length > 0 && <span className="count bump" key={wishlist.length}>{wishlist.length}</span>}
            </Link>
            <Link to="/cart" className="icon-btn bag-btn" aria-label={`Shopping bag, ${cartCount} items`}>
              <ShoppingBag size={19} />
              {cartCount > 0 && <span className="count bump" key={cartCount}>{cartCount}</span>}
              <span className="action-label">Bag</span>
            </Link>
          </div>
        </div>
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Browse Velora" side="left">
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {NAV.map((item) => (
            <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
          <div className="mobile-nav-sub">
            <span className="eyebrow">Departments</span>
            {categories.map((c) => (
              <Link key={c.slug} to={departmentHref(c.label)} onClick={() => setMenuOpen(false)}>
                {c.label}<span>{c.tagline}</span>
              </Link>
            ))}
          </div>
          <div className="mobile-nav-sub">
            <span className="eyebrow">Your account</span>
            {accountLinks.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}>{l.label}</Link>
            ))}
            <Link to="/sell" onClick={() => setMenuOpen(false)}>Sell on Velora</Link>
          </div>
        </nav>
      </Drawer>

      <nav className="bottom-nav" aria-label="Quick navigation">
        <Link to="/" className={location.pathname === "/" ? "active" : ""}><Home size={19} /><span>Home</span></Link>
        <Link to="/shop" className={location.pathname === "/shop" ? "active" : ""}><LayoutGrid size={19} /><span>Shop</span></Link>
        <Link to="/search" className={location.pathname === "/search" ? "active" : ""}><Search size={19} /><span>Search</span></Link>
        <Link to="/wishlist" className={location.pathname === "/wishlist" ? "active" : ""}>
          <Heart size={19} /><span>Wishlist</span>{wishlist.length > 0 && <i>{wishlist.length}</i>}
        </Link>
        <Link to="/cart" className={location.pathname === "/cart" ? "active" : ""}>
          <ShoppingBag size={19} /><span>Bag</span>{cartCount > 0 && <i>{cartCount}</i>}
        </Link>
      </nav>
    </>
  );
}
