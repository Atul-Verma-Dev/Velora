import React, { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Star, X } from "lucide-react";

export function Btn({ as = "button", to, href, variant = "primary", size, icon, iconRight, children, className = "", ...rest }) {
  const cls = `btn btn-${variant}${size ? ` btn-${size}` : ""} ${className}`.trim();
  const content = (
    <>
      {icon}
      <span>{children}</span>
      {iconRight}
    </>
  );
  if (as === "link" || to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <button type="button" className={cls} {...rest}>{content}</button>;
}

export function IconBtn({ label, children, className = "", ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={`icon-btn ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

export function Badge({ tone = "neutral", children, className = "" }) {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>;
}

export function Stars({ value = 0, size = 13, showValue = false, count = null }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="stars" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.6}
          className={n <= Math.floor(rounded) ? "star on" : n - 0.5 === rounded ? "star half" : "star"}
          fill={n <= Math.floor(rounded) ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
      {showValue && <b className="stars-value">{value}</b>}
      {count !== null && <span className="stars-count">({count})</span>}
    </span>
  );
}

export function RatingPill({ value, count }) {
  if (!value) return <span className="rating-pill muted">New</span>;
  return (
    <span className="rating-pill">
      {value.toFixed(1)} <Star size={10} fill="currentColor" aria-hidden="true" />
      {count ? <em>({count})</em> : null}
    </span>
  );
}

export function SectionHead({ eyebrow, title, caption, action, className = "" }) {
  return (
    <div className={`section-head ${className}`.trim()}>
      <div className="section-head-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {caption && <p>{caption}</p>}
      </div>
      {action && <div className="section-head-action">{action}</div>}
    </div>
  );
}

export function PageHead({ eyebrow, title, caption, action, children }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {caption && <p>{caption}</p>}
      </div>
      {action}
      {children}
    </header>
  );
}

export function EmptyState({ icon, title, body, action, compact = false }) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`} role="status">
      {icon && <span className="empty-icon">{icon}</span>}
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className = "", style }) {
  return <span className={`skeleton ${className}`.trim()} style={style} aria-hidden="true" />;
}

export function ProductSkeletons({ count = 4 }) {
  return (
    <div className="product-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="product-card skeleton-card" key={i}>
          <Skeleton className="skeleton-image" />
          <Skeleton style={{ height: 10, width: "45%", marginTop: 12 }} />
          <Skeleton style={{ height: 12, width: "80%", marginTop: 8 }} />
          <Skeleton style={{ height: 10, width: "55%", marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

// Shared dialog behaviour: Escape closes, focus moves in once on open, Tab stays inside,
// and focus returns to whatever opened the dialog. onClose is read through a ref so a
// parent re-render (e.g. ticking a filter) never re-runs this and steals focus.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function useDialog(open, onClose, panel) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") { closeRef.current?.(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(() => {
      const target = panel.current?.querySelector("[data-autofocus]") || panel.current?.querySelector(FOCUSABLE);
      target?.focus();
    }, 40);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
    };
  }, [open, panel]);
}

export function Drawer({ open, onClose, title, children, side = "right", footer, width }) {
  const panel = useRef(null);
  useDialog(open, onClose, panel);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className={`drawer drawer-${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panel}
        style={width ? { maxWidth: width } : undefined}
      >
        <div className="drawer-head">
          <h2>{title}</h2>
          <IconBtn label="Close panel" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const panel = useRef(null);
  useDialog(open, onClose, panel);
  if (!open) return null;
  return (
    <div className="overlay overlay-center" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <IconBtn label="Close dialog" onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, required, children, htmlFor, className = "" }) {
  return (
    <label className={`field ${className}`.trim()} htmlFor={htmlFor}>
      <span className="field-label">
        {label}
        {required && <em aria-hidden="true"> *</em>}
      </span>
      {children}
      {hint && !error && <small className="field-hint">{hint}</small>}
      {error && <small className="field-error" role="alert">{error}</small>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <div>
        <label htmlFor={id} className="toggle-label">{label}</label>
        {description && <small>{description}</small>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? " on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

export function Chip({ active, onClick, children, onRemove, tone = "neutral", ...rest }) {
  const cls = `chip${active ? " active" : ""} chip-${tone}`;
  if (!onRemove) {
    return <button type="button" className={cls} onClick={onClick} aria-pressed={typeof active === "boolean" ? active : undefined} {...rest}>{children}</button>;
  }
  // Removable chips are two sibling buttons — a button can't legally contain another button.
  return (
    <span className={`${cls} has-remove`}>
      <button type="button" className="chip-main" onClick={onClick} {...rest}>{children}</button>
      <button
        type="button"
        className="chip-x"
        aria-label={`Remove ${typeof children === "string" ? children : "filter"}`}
        onClick={onRemove}
      >
        <X size={11} />
      </button>
    </span>
  );
}

export function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const tone =
    /\b(reject\w*|suspend\w*|cancel\w*|failed|returned|flagged|inactive|deactivat\w*|unverified|blocked|expired|out of stock)\b/.test(s) ? "danger" :
    /\b(delivered|approved|live|active|verified|paid|settled|resolved)\b/.test(s) ? "success" :
    /\b(pending|processing|under review|in review|review|new|awaiting|requested|packing|onboarding)\b/.test(s) ? "warning" :
    /\b(shipped|transit|ready|packed|dispatched|out for delivery)\b/.test(s) ? "info" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function Tabs({ items, value, onChange, className = "" }) {
  return (
    <div className={`tabs ${className}`.trim()} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          aria-selected={value === item.id}
          className={value === item.id ? "tab active" : "tab"}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
          {item.to && i < items.length - 1 ? <Link to={item.to}>{item.label}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{item.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Stat({ label, value, note, icon, tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

export function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && (setShown(true), io.disconnect())),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal${shown ? " in" : ""} ${className}`.trim()} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function InfoNote({ tone = "neutral", title, children, icon }) {
  return (
    <div className={`info-note note-${tone}`}>
      {icon && <span className="note-icon">{icon}</span>}
      <div>
        {title && <b>{title}</b>}
        <div className="note-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.tone || "default"}`} role="status" aria-live="polite">
      {toast.tone === "error" ? <X size={16} /> : <Check size={16} />}
      <span>{toast.message}</span>
    </div>
  );
}

export function Progress({ value, tone = "accent", label }) {
  return (
    <div className="progress-wrap">
      {label && <span className="progress-label">{label}</span>}
      <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span className={`progress-bar progress-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function Accordion({ items }) {
  const [open, setOpen] = useState(items[0]?.id ?? null);
  return (
    <div className="accordion">
      {items.map((item) => (
        <div className={`acc-item${open === item.id ? " open" : ""}`} key={item.id}>
          <button type="button" className="acc-head" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? null : item.id)}>
            <span>{item.title}</span>
            <span className="acc-sign" aria-hidden="true">{open === item.id ? "−" : "+"}</span>
          </button>
          {open === item.id && <div className="acc-body">{item.content}</div>}
        </div>
      ))}
    </div>
  );
}
