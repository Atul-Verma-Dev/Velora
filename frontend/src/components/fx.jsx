/* ============================================================
   VELORA — effects library (React UI Effects Playbook, free-only)
   Everything here is dependency-free, decorative-by-default, and
   has a static fallback under prefers-reduced-motion.
   Rules followed: ≤1 animated background / headline / CTA effect
   per viewport, animations pause when off-screen, semantics kept.
   ============================================================ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUp, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

/* ---------- hooks ---------- */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Marks an element data-offscreen="true" while it is not visible so CSS can pause its animations. */
export function useOffscreenPause(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      ([entry]) => { el.dataset.offscreen = entry.isIntersecting ? "false" : "true"; },
      { rootMargin: "80px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

function useInView(ref, { once = true, threshold = 0.3 } = {}) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); if (once) io.disconnect(); }
      else if (!once) setSeen(false);
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, threshold]);
  return seen;
}

/* ---------- ambient backgrounds ---------- */
/** Slow rotating aurora — the hero's single animated background. */
export function Aurora() {
  const ref = useRef(null);
  useOffscreenPause(ref);
  return (
    <div className="aurora" ref={ref} aria-hidden="true">
      <i /><i /><i /><i /><i /><b />
    </div>
  );
}

/** Soft drifting red glow orbs for section backgrounds. */
export function GlowField({ tone = "red" }) {
  const ref = useRef(null);
  useOffscreenPause(ref);
  return (
    <div className={`glow-field glow-${tone}`} ref={ref} aria-hidden="true">
      <i /><i /><i /><i />
    </div>
  );
}

/** Concentric expanding rings. */
export function Ripple({ rings = 5 }) {
  const ref = useRef(null);
  useOffscreenPause(ref);
  return (
    <div className="ripple" ref={ref} aria-hidden="true">
      {Array.from({ length: rings }, (_, i) => <span key={i} style={{ "--i": i }} />)}
    </div>
  );
}

/** Diagonal light streaks (deterministic layout — no random re-renders). */
export function Meteors({ count = 14 }) {
  const ref = useRef(null);
  useOffscreenPause(ref);
  const items = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: `${(i * 37 + 11) % 100}%`,
      delay: `${((i * 53) % 90) / 10}s`,
      duration: `${5 + ((i * 29) % 40) / 10}s`,
      size: `${60 + ((i * 17) % 70)}px`,
    })),
    [count]
  );
  return (
    <div className="meteors" ref={ref} aria-hidden="true">
      {items.map((m, i) => (
        <span key={i} style={{ left: m.left, animationDelay: m.delay, animationDuration: m.duration, "--len": m.size }} />
      ))}
    </div>
  );
}

/* ---------- text effects ---------- */
/** Counts up once when scrolled into view. */
export function NumberTicker({ value, decimals = 0, duration = 1400, suffix = "" }) {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.4 });
  const reduced = useReducedMotion();
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduced ? target : 0);
  useEffect(() => {
    if (!seen) return undefined;
    if (reduced) { setShown(target); return undefined; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, target, duration, reduced]);
  return <span ref={ref} className="ticker">{shown.toFixed(decimals)}{suffix}</span>;
}

/** Cycles the emphasised word of a headline. All words share one grid cell so width never jumps. */
export function WordRotate({ words, interval = 2600 }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced || words.length < 2) return undefined;
    const id = setInterval(() => setI((n) => (n + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [reduced, words.length, interval]);
  return (
    <em className="word-rotate" aria-hidden="true">
      {words.map((w, n) => (
        <span key={w} className={n === i ? "on" : n === (i - 1 + words.length) % words.length ? "out" : ""}>{w}</span>
      ))}
    </em>
  );
}

/* ---------- carousels ---------- */
/**
 * Accessible banner carousel. Autoplay pauses on hover / focus / off-screen / hidden tab,
 * never runs under prefers-reduced-motion, and always has a Pause control (WCAG 2.2.2).
 * The progress bar's animationend drives the next slide, so pause and timing stay in sync.
 */
export function HeroCarousel({ slides, interval = 6500, label = "Featured edits" }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [userPlaying, setUserPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const root = useRef(null);
  const drag = useRef(null);
  const count = slides.length;

  const go = useCallback((n) => setIndex(((n % count) + count) % count), [count]);
  const autoplay = userPlaying && !hovered && !focused && inView && tabVisible && !reduced;

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const on = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const onPointerDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - d.y)) go(index + (dx < 0 ? 1 : -1));
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  };

  return (
    <section
      className="cr"
      ref={root}
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}
      onKeyDown={onKeyDown}
    >
      <div className="cr-viewport" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }}>
        <div className="cr-track" style={{ transform: `translate3d(${-index * 100}%,0,0)` }} aria-live={autoplay ? "off" : "polite"}>
          {slides.map((s, n) => (
            <article
              key={s.id}
              className={`cr-slide tone-${s.tone || "rose"}${n === index ? " active" : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${n + 1} of ${count}: ${s.eyebrow}`}
              aria-hidden={n === index ? undefined : "true"}
            >
              <div className="cr-copy">
                <span className="eyebrow"><span className="dot" /> {s.eyebrow}</span>
                <h2>{s.title}</h2>
                <p>{s.body}</p>
                <div className="cr-actions">
                  <Link to={s.to} className="btn btn-dark" tabIndex={n === index ? 0 : -1}>
                    {s.cta} <ArrowRight size={15} />
                  </Link>
                  {s.to2 && <Link to={s.to2} className="btn btn-outline" tabIndex={n === index ? 0 : -1}>{s.cta2}</Link>}
                </div>
              </div>
              <div className="cr-art">
                <img src={s.image} alt={s.alt || ""} loading={n === 0 ? "eager" : "lazy"} decoding="async" draggable="false" />
                {s.tag && <span className="cr-tag">{s.tag}</span>}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="cr-controls">
        <div className="cr-arrows">
          <button type="button" className="cr-btn" onClick={() => go(index - 1)} aria-label="Previous slide"><ChevronLeft size={18} /></button>
          <button type="button" className="cr-btn" onClick={() => go(index + 1)} aria-label="Next slide"><ChevronRight size={18} /></button>
        </div>
        <div className="cr-dots">
          {slides.map((s, n) => (
            <button
              key={s.id}
              type="button"
              className={`cr-dot${n === index ? " on" : ""}`}
              onClick={() => go(n)}
              aria-label={`Go to slide ${n + 1}: ${s.eyebrow}`}
              aria-current={n === index ? "true" : undefined}
            >
              {n === index && !reduced && (
                <i
                  key={`${index}-${autoplay}`}
                  style={{ animationDuration: `${interval}ms`, animationPlayState: autoplay ? "running" : "paused" }}
                  onAnimationEnd={() => autoplay && go(index + 1)}
                />
              )}
            </button>
          ))}
        </div>
        <span className="cr-count" aria-hidden="true">{String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
        {!reduced && (
          <button type="button" className="cr-btn cr-play" onClick={() => setUserPlaying((v) => !v)} aria-label={userPlaying ? "Pause automatic slide show" : "Start automatic slide show"}>
            {userPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
        )}
      </div>
    </section>
  );
}

/** Scroll-snap carousel for product rows: arrow buttons, drag/scroll, progress line. */
export function ScrollCarousel({ children, label }) {
  const track = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: false, progress: 0 });
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= max - 2,
      progress: max > 0 ? el.scrollLeft / max : 1,
    });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, children]);
  const by = (dir) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.86), behavior: "smooth" });
  };
  return (
    <div className="sc">
      <div className="sc-head">
        <div className="sc-arrows">
          <button type="button" className="cr-btn" onClick={() => by(-1)} disabled={edge.start} aria-label={`Scroll ${label} back`}><ChevronLeft size={18} /></button>
          <button type="button" className="cr-btn" onClick={() => by(1)} disabled={edge.end} aria-label={`Scroll ${label} forward`}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="sc-track" ref={track} onScroll={measure} tabIndex={0} role="region" aria-label={label}>
        {children}
      </div>
      <div className="sc-progress" aria-hidden="true"><i style={{ transform: `scaleX(${0.12 + edge.progress * 0.88})` }} /></div>
    </div>
  );
}

/* ---------- global interaction layers ---------- */
/** One delegated listener feeds --sx/--sy to every .spot element (pointer spotlight). */
export function PointerSpotlight() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = 0;
    const onMove = (e) => {
      const el = e.target.closest?.(".spot");
      if (!el) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--sx", `${e.clientX - r.left}px`);
        el.style.setProperty("--sy", `${e.clientY - r.top}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => { document.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);
  return null;
}

/** Floating back-to-top with a scroll-progress ring. */
export function BackToTop() {
  const [state, setState] = useState({ show: false, p: 0 });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setState({ show: window.scrollY > 700, p: max > 0 ? Math.min(1, window.scrollY / max) : 0 });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const C = 2 * Math.PI * 20;
  return (
    <button
      type="button"
      className={`to-top${state.show ? " show" : ""}`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      tabIndex={state.show ? 0 : -1}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" className="to-top-track" />
        <circle cx="24" cy="24" r="20" className="to-top-bar" strokeDasharray={C} strokeDashoffset={C * (1 - state.p)} />
      </svg>
      <ArrowUp size={16} />
    </button>
  );
}

/** One-shot celebratory confetti on a fixed canvas. Skipped for reduced motion. */
export function Confetti({ run }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!run || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const c = canvas.current;
    if (!c) return undefined;
    const ctx = c.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => { c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr; };
    resize();
    const colors = ["#e11d2e", "#ff5a67", "#b4121d", "#ffffff", "#ffd5da", "#f5c26b"];
    const pieces = Array.from({ length: 140 }, (_, i) => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: window.innerHeight * 0.38,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 4,
      s: 5 + Math.random() * 6,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      c: colors[i % colors.length],
    }));
    let raf;
    const start = performance.now();
    const frame = (now) => {
      const t = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      pieces.forEach((p) => {
        p.vy += 0.34; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - t / 3200);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
        ctx.restore();
      });
      if (t < 3200) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [run]);
  return <canvas ref={canvas} className="confetti" aria-hidden="true" />;
}

/** Second, counter-moving marquee row. */
export function MarqueeRow({ items, reverse = false, label }) {
  return (
    <div className={`marquee-row${reverse ? " reverse" : ""}`} aria-label={label} role="group">
      <div className="marquee-row-track">
        {[...items, ...items].map((item, i) => (
          <span key={`${item}-${i}`} aria-hidden={i >= items.length ? "true" : undefined}>{item}<i aria-hidden="true">●</i></span>
        ))}
      </div>
    </div>
  );
}
