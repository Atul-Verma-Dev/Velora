import React, { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, Camera, Check, Heart, Ruler, ScanFace, Sparkles, Star, Store, Truck,
} from "lucide-react";
import { useApp } from "../store/AppStore.jsx";
import { categories, featuredCollections } from "../data/catalog.js";
import { departmentHref, money } from "../lib/format.js";
import ProductCard, { ProductShelf } from "../components/ProductCard.jsx";
import { Badge, Btn, RatingPill, Reveal, SectionHead } from "../components/ui.jsx";
import {
  Aurora, GlowField, HeroCarousel, MarqueeRow, Meteors, NumberTicker, Ripple, ScrollCarousel, WordRotate,
} from "../components/fx.jsx";

const EDIT_SLIDES = [
  {
    id: "festive", tone: "rose", eyebrow: "The festive edit", tag: "House of Aranya",
    title: <>Handwork worth <em>the occasion.</em></>,
    body: "Gota patti from Jaipur, chikankari from Lucknow, Kanjivaram from the temple town — made in small numbers.",
    cta: "Shop ethnic wear", to: "/shop?category=Ethnic%20Wear", cta2: "New in", to2: "/new",
    image: "/images/aranya-campaign-haveli.jpg", alt: "Model in a hand-embroidered festive outfit at a Jaipur haveli",
  },
  {
    id: "tailoring", tone: "ivory", eyebrow: "Quiet tailoring", tag: "Menswear",
    title: <>Sharp, without <em>the noise.</em></>,
    body: "Oxford shirts, merino knits and chinos cut with real ease — fit guidance on every piece.",
    cta: "Shop menswear", to: "/shop?gender=Men", cta2: "Find my fit", to2: "/fit",
    image: "/images/velora-hero.jpg", alt: "Tailored menswear",
  },
  {
    id: "everyday", tone: "blush", eyebrow: "Everyday, considered", tag: "Meher & Co.",
    title: <>Co-ords for <em>every day.</em></>,
    body: "Relaxed linen sets, easy denim and weekend layers from independent studios.",
    cta: "Shop co-ords", to: "/shop?subcategory=Co-ords", cta2: "Western wear", to2: "/shop?category=Western%20Wear",
    image: "/images/meher-hero.jpg", alt: "Relaxed everyday co-ord set",
  },
  {
    id: "fit", tone: "crimson", eyebrow: "Fit confidence", tag: "Estimated, not guaranteed",
    title: <>Less guessing. <em>More wearing.</em></>,
    body: "Height, weight and one size you trust — about ten seconds to see how each garment is likely to sit.",
    cta: "Find my fit", to: "/fit", cta2: "How it works", to2: "/size-guide",
    image: "/images/velora-reference.jpg", alt: "Tailoring detail on a finished garment",
  },
];

const OCCASION_ROW = ["Haldi", "Sangeet", "Daytime wedding", "Workwear", "Goa weekend", "Festive", "Everyday", "Travel", "Evening"];
const CRAFT_ROW = ["Gota patti", "Chikankari", "Handblock", "Kanjivaram", "Bandhani", "Linen", "Merino", "Selvedge"];

const SAMPLE_SEARCHES = [
  "A pastel green kurta for a daytime wedding under ₹2,000",
  "An outfit for an outdoor haldi ceremony",
  "Relaxed linen co-ord for a Goa weekend",
];

export default function Home() {
  const { products, recentSearches } = useApp();
  const nav = useNavigate();
  const heroRef = useRef(null);
  const drift = (event) => {
    const el = heroRef.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--hpx", ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
    el.style.setProperty("--hpy", ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
  };
  const resetDrift = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty("--hpx", "0");
    el.style.setProperty("--hpy", "0");
  };
  const live = products.filter((p) => p.status === "live");
  const newIn = live.slice().sort((a, b) => a.addedDaysAgo - b.addedDaysAgo).slice(0, 4);
  const trending = live
    .filter((p) => p.unitsSold30d > 8 || p.isFeatured)
    .sort((a, b) => b.unitsSold30d - a.unitsSold30d)
    .slice(0, 10);
  const festive = live.filter((p) => p.occasion.includes("Festive") && p.category === "Ethnic Wear").slice(0, 4);
  const brands = [...new Set(live.map((p) => p.brand))];
  const partnerCount = new Set(live.map((p) => p.sellerId)).size;
  const averageRating = live.length ? (live.reduce((s, p) => s + (p.rating || 0), 0) / live.length).toFixed(1) : "—";
  const heroProduct = live.find((p) => p.id === "VLR-3009") || live[0];

  return (
    <>
      <section className="hero">
        <Aurora />
        <div className="hero-copy">
          <span className="eyebrow"><span className="dot" /> New season · Indian studios</span>
          <h1 aria-label="Fashion, found better.">
            Fashion, found <WordRotate words={["better.", "faster.", "fitted.", "yours."]} />
          </h1>
          <p className="hero-lede">
            Thoughtful clothing from independent Indian labels — with search that understands a look,
            fit guidance before you buy, and a bag that comes together properly.
          </p>
          <div className="hero-actions">
            <Btn to="/new" variant="dark" className="btn-beam" iconRight={<ArrowRight size={16} />}>Shop new arrivals</Btn>
            <Btn to="/search" variant="outline" icon={<Camera size={16} />}>Search with an image</Btn>
          </div>
          <div className="hero-proof">
            <div><b><NumberTicker value={live.length} /></b><span>curated styles</span></div>
            <div><b><NumberTicker value={partnerCount} /></b><span>partner studios</span></div>
            <div><b>{averageRating === "—" ? "—" : <NumberTicker value={averageRating} decimals={1} />}<Star size={12} fill="currentColor" /></b><span>average rating</span></div>
          </div>
        </div>
        <div className="hero-art" ref={heroRef} onMouseMove={drift} onMouseLeave={resetDrift}>
          <div className="hero-image-main">
            <img src="/images/aranya-campaign-haveli.jpg" alt="Model in a hand-embroidered festive outfit at a Jaipur haveli" fetchPriority="high" />
          </div>
          <div className="hero-image-note">
            <div className="hero-note-top">
              <span className="eyebrow">THE FESTIVE EDIT</span>
              <Badge tone="accent">New</Badge>
            </div>
            <b>{heroProduct?.name}</b>
            <span>{heroProduct?.brand}</span>
            <div className="hero-note-price">
              <b>{money(heroProduct?.price || 0)}</b>
              <RatingPill value={heroProduct?.rating} count={heroProduct?.reviewCount} />
            </div>
            <Link to={`/product/${heroProduct?.id}`} className="hero-note-link">
              Shop the look <ArrowUpRight size={14} />
            </Link>
          </div>
          <span className="hero-vertical">VELORA · HANDLOOM & TAILORING</span>
        </div>
      </section>

      <section className="service-strip" aria-label="Service promises">
        <span><Truck size={15} /> Free delivery above ₹1,499</span>
        <span><Ruler size={15} /> Fit guidance on every product</span>
        <span><Check size={15} /> 7-day easy returns</span>
        <span><Store size={15} /> Verified independent sellers</span>
      </section>

      <section className="carousel-section" aria-label="Featured edits">
        <HeroCarousel slides={EDIT_SLIDES} />
      </section>

      <section className="departments">
        <SectionHead
          eyebrow="SHOP BY DEPARTMENT"
          title={<>Where would you like to <em>start?</em></>}
          action={<Link to="/shop" className="text-link">All departments <ArrowRight size={14} /></Link>}
        />
        <div className="department-grid">
          {categories.map((c, i) => (
            <Link to={departmentHref(c.label)} className={`dept-card dept-${i + 1}`} key={c.slug}>
              <img src={c.image} alt="" loading="lazy" />
              <div className="dept-copy">
                <b>{c.label}</b>
                <small>{c.tagline}</small>
              </div>
              <span className="dept-arrow"><ArrowUpRight size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      <Reveal>
        <section className="shelf-section">
          <SectionHead
            eyebrow="JUST IN"
            title={<>New this <em>week.</em></>}
            caption="Fresh drops from studios we work with directly."
            action={<Link to="/new" className="text-link">View all new in <ArrowRight size={14} /></Link>}
          />
          <div className="product-grid cols-4">
            {newIn.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="editorial-band">
          <GlowField />
          <div className="editorial-art">
            <img src="/images/aranya-genda-lehenga.jpg" alt="Hand-embroidered marigold lehenga with gota detailing" loading="lazy" />
            <span className="editorial-tag">Editor's pick · Wedding season</span>
          </div>
          <div className="editorial-copy">
            <span className="eyebrow">THE FESTIVE EDIT</span>
            <h2>Handwork worth<br /><em>the occasion.</em></h2>
            <p>
              Gota patti from Jaipur, chikankari from Lucknow, Kanjivaram silk from the temple town.
              Pieces made in small numbers by studios we know by name.
            </p>
            <ul className="editorial-list">
              <li>Made-to-order lehengas and anarkalis</li>
              <li>Fabric and craft detail on every listing</li>
              <li>Fit guidance calibrated for ethnic ease</li>
            </ul>
            <Btn to="/shop?category=Ethnic%20Wear" variant="dark" iconRight={<ArrowRight size={15} />}>Shop ethnic wear</Btn>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="discovery-band">
          <div className="discovery-copy">
            <span className="eyebrow"><Sparkles size={12} /> VELORA DISCOVERY</span>
            <h2>Have a look in mind?<br /><em>Show us.</em></h2>
            <p>
              Describe the occasion, the fabric, the budget — or upload a photo of something you love.
              Velora reads the language and the image separately, then finds real in-stock pieces.
            </p>
            <div className="discovery-actions">
              <Btn to="/search" variant="accent" icon={<Camera size={16} />}>Start with an image</Btn>
              <Btn to="/search" variant="ghost" iconRight={<ArrowRight size={15} />}>Describe your look</Btn>
            </div>
            <div className="sample-searches">
              <span className="eyebrow">Try a search</span>
              {SAMPLE_SEARCHES.map((q) => (
                <button key={q} type="button" className="spot" onClick={() => nav(`/search?q=${encodeURIComponent(q)}`)}>
                  <i className="spot-glow" aria-hidden="true" />
                  <span>{q}</span><ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          </div>
          <div className="discovery-visual">
            <Ripple />
            <div className="search-demo">
              <div className="search-demo-bar">
                <Camera size={16} />
                <span>A pastel green kurta for a daytime wedding under ₹2,000</span>
              </div>
              <div className="search-demo-chips">
                <span>Kurta set</span><span>Sage</span><span>Wedding</span><span>Under ₹2,000</span>
              </div>
              <div className="search-demo-results">
                {live.filter((p) => p.category === "Ethnic Wear" && p.price <= 2000).slice(0, 3).map((p) => (
                  <Link to={`/product/${p.id}`} key={p.id}>
                    <img src={p.image} alt="" loading="lazy" />
                    <span><b>{p.name}</b><small>{money(p.price)} · {p.color}</small></span>
                  </Link>
                ))}
              </div>
              <small className="demo-caption">On-device demo of the search experience. Model services are not connected.</small>
            </div>
            {recentSearches.length > 0 && (
              <div className="recent-searches">
                <span className="eyebrow">Your recent searches</span>
                {recentSearches.slice(0, 3).map((q) => (
                  <Link key={q} to={`/search?q=${encodeURIComponent(q)}`}>{q}</Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="shelf-section">
          <SectionHead
            eyebrow="MOST LOVED"
            title={<>Trending <em>now.</em></>}
            caption="What shoppers are adding to their bags this week."
            action={<Link to="/shop?sort=popular" className="text-link">Shop bestsellers <ArrowRight size={14} /></Link>}
          />
          <ScrollCarousel label="Trending products">
            {trending.map((p) => <ProductCard key={p.id} product={p} />)}
          </ScrollCarousel>
        </section>
      </Reveal>

      <Reveal>
        <section className="fit-band">
          <GlowField />
          <div className="fit-band-art">
            <img src="/images/velora-reference.jpg" alt="Tailoring detail on a finished garment" loading="lazy" />
            <div className="fit-float">
              <span className="eyebrow">FIT CONFIDENCE</span>
              <b>Suggested size: M</b>
              <small>Relaxed at chest · close at shoulder</small>
              <span className="fit-float-note">Estimated, not guaranteed</span>
            </div>
          </div>
          <div className="fit-band-copy">
            <span className="eyebrow"><Ruler size={12} /> FIT INTELLIGENCE</span>
            <h2>Less guessing.<br /><em>More wearing.</em></h2>
            <p>
              Tell us your height, weight and a size you already trust — about ten seconds — and see
              how each garment is likely to sit. Want more detail? Precision Scan accepts measurements
              you enter yourself.
            </p>
            <div className="fit-options">
              <Link to="/fit" className="fit-option spot">
                <i className="spot-glow" aria-hidden="true" />
                <span className="fit-option-icon"><Ruler size={18} /></span>
                <span><b>Fast Path</b><small>Height, weight and an anchor brand size. No camera.</small></span>
                <ArrowUpRight size={15} />
              </Link>
              <Link to="/fit?mode=precision" className="fit-option spot">
                <i className="spot-glow" aria-hidden="true" />
                <span className="fit-option-icon"><ScanFace size={18} /></span>
                <span><b>Precision Scan</b><small>Optional, private and never opened automatically.</small></span>
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <Btn to="/fit" variant="dark" iconRight={<ArrowRight size={15} />}>Find my fit</Btn>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="ctl-band">
          <Meteors />
          <div>
            <span className="eyebrow"><Heart size={12} /> COMPLETE THE LOOK</span>
            <h2>The finishing piece,<br /><em>already considered.</em></h2>
            <p>
              Add a kurta and Velora looks for a dupatta that shares its palette, occasion and size —
              from partner stock that is genuinely available. No random recommendations.
            </p>
            <Btn to="/cart" variant="outline" iconRight={<ArrowRight size={15} />}>See it in your bag</Btn>
          </div>
          <div className="ctl-demo">
            <div className="ctl-base">
              <img src="/images/aranya-marigold-kurta.jpg" alt="Marigold handblock kurta" loading="lazy" />
              <span><b>Marigold Handblock Kurta</b><small>In your bag · Size M</small></span>
              <b>{money(1899)}</b>
            </div>
            <span className="ctl-plus" aria-hidden="true">+</span>
            <div className="ctl-add">
              <img src="/images/aranya-marigold-dupatta.jpg" alt="Marigold bandhani dupatta" loading="lazy" />
              <span>
                <b>Marigold Bandhani Dupatta</b>
                <small>Same palette · festive · one size</small>
              </span>
              <div><b>{money(699)}</b><del>{money(899)}</del></div>
              <button type="button" onClick={() => nav("/product/VLR-3013")}>Add <span aria-hidden="true">+</span></button>
            </div>
            <p className="ctl-caption">Illustrative pairing. Offers appear only when an item is eligible, in stock in your size and above its price floor.</p>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="shelf-section">
          <SectionHead
            eyebrow="THE FESTIVE EDIT"
            title={<>Occasion, <em>considered.</em></>}
            action={<Link to="/shop?category=Ethnic%20Wear" className="text-link">Shop all ethnic <ArrowRight size={14} /></Link>}
          />
          <div className="product-grid cols-4">
            {festive.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      </Reveal>

      <section className="brand-marquee" aria-label="Partner brands">
        <div className="marquee-track">
          {[...brands, ...brands].map((b, i) => (
            <Link key={`${b}-${i}`} to={`/shop?brand=${encodeURIComponent(b)}`}>
              {b}<span aria-hidden="true">✳</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="marquee-rows" aria-label="Occasions and crafts">
        <MarqueeRow items={OCCASION_ROW} label="Occasions" />
        <MarqueeRow items={CRAFT_ROW} reverse label="Crafts and fabrics" />
      </section>

      <section className="seller-band">
        <GlowField />
        <i className="dot-grid" aria-hidden="true" />
        <div>
          <span className="eyebrow">FOR INDEPENDENT LABELS</span>
          <h2>Your label, on a stage<br />that <em>respects the work.</em></h2>
        </div>
        <p>
          A Partner Hub built around real seller tasks: catalogue quality, inventory age, orders,
          returns, settlements — and an honest route to move slow stock without discounting it to nothing.
        </p>
        <Btn to="/sell" variant="accent" iconRight={<ArrowUpRight size={15} />}>Become a seller</Btn>
      </section>
    </>
  );
}
