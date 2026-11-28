# VELORA — Architecture notes

## Stack

- Vite 6 + React 19, `react-router-dom` 7, `lucide-react` icons.
- Plain CSS (`src/styles/base.css`, `store.css`, `workspace.css`) with design tokens; no Tailwind, CSS-in-JS or component library.
- Client-only state in `src/store/AppStore.jsx`, persisted to `localStorage` with the `velora-v1-` prefix.
- No backend, no network calls.

```
src/
  App.jsx                 routes, storefront layout, role gates, 404, toast, scroll restore
  main.jsx                CSS imports + BrowserRouter
  components/             ui primitives, Header, Footer, ProductCard, FilterPanel
  data/                   catalog, reviews, orders (synthetic, seeded)
  lib/                    search, fit, ctl, filters, format (pure functions)
  pages/                  storefront, PartnerHub, Operations, Static
  store/AppStore.jsx      single provider: catalogue, cart, orders, reviews, roles, config, audit
  styles/                 tokens + storefront + workspace CSS
```

## Discovery engine

`src/lib/search.js` keeps the dual-thread contract in the browser:

1. **Thread A — language.** Normalises the query, extracts garment/subcategory, colours, fabrics, occasions, fit words, price ceilings, size and explicit exclusions (`not`, `without`, `no`). Produces structured intent plus an interpretation summary.
2. **Thread B — visual.** When a reference image is supplied, draws it to a canvas, samples pixels, quantises to a small palette, and derives dominant hue family, lightness/temperature and contrast. This is a palette/tone proxy — **not** an embedding model.
3. **Merge.** Explicit text wins over conflicting image-derived attributes. Exclusions are never softened. If no text is supplied the image supplies category cues; if neither yields a signal the UI says so.
4. **Hard filters before ranking.** Price ceiling, category, size, stock, colour and exclusions remove candidates first; only survivors are scored. Text similarity and image similarity are combined `0.4 / 0.6`, with deterministic tie-breaking by rating and stock.
5. **Explainability.** The query interpretation is shown as editable chips; changing a chip re-runs discovery. Search events (query, image presence, result count, per-filter exclusions, local latency) are logged to the store, and the Operations Console reports zero-result rate and latency from those real entries.

A production implementation would replace threads A and B with service calls while keeping merge, filter and ranking contracts unchanged.

## Fit

`src/lib/fit.js`:

- **Garment specs:** per-product measurement tables by size, with category-specific ease bands (ethnic wear requires intentional ease; knits allow negative ease).
- **Fast Path:** height, weight, shape, anchor brand and usual size → estimated chest/waist/hip, then a per-zone delta against garment measurements. Confidence is presented as a qualitative band.
- **Precision Scan:** the shopper enters chest/waist/hip and optional inseam/foot length manually. No camera, no pose model, no accuracy promise.
- **Explanations:** each recommendation names the tightest zone and the intended drape so the shopper can judge the trade-off. Fit is advisory and never blocks checkout.

## Complete the Look

`src/lib/ctl.js`:

- Eligibility: stock age ≥ 60 days, available in the shopper's exact size (or one-size), not the anchor item, and visual/occasion compatibility above threshold.
- Discount tiers: 30% (60–90 days), 45% (90–120), 60% (120+). The 60% tier requires a ₹2,000 bag.
- Price = `max(tier price, COGS + marginal shipping)`. The floor can reduce the advertised discount but never the shopper's protection.
- Offers appear privately in the bag and on the PDP as "Complete the look"; COGS, ageing and margin are **never** shown to shoppers. Partner Hub exposes the same rules and economics to the seller.

## Roles and permissions

Demo users: shopper (`user-demo`), seller (`seller-1`, House of Aranya), admin (`admin-1`). The header account menu switches roles and can reset demo data; `/partner` and `/operations` show a gate when the role does not match.

Admin sub-roles: `super`, `seller_ops`, `catalogue`, `trust`, `finance`. `can(permission)` gates modules and actions:

| Permission | Allowed sub-roles |
| --- | --- |
| `reviews` | super, trust |
| `catalogue` | super, catalogue |
| `sellers` | super, seller_ops |
| `finance` | super, finance |
| `config` | super |

Restricted modules render an explanatory panel rather than disappearing, so the scope of each role is legible. High-risk actions (reject listing, suspend seller, reject review, change marketplace config) require a written reason and append an audit record with actor, role, action, object, reason and timestamp.

**This is presentation-level RBAC only.** A production system must enforce every rule server-side against an authenticated principal.

## Reviews

New reviews enter `pending`; only `approved` reviews are published and counted. A summary appears only with ≥ 3 published reviews. Verified-purchase is derived from a delivered order in the local store. Sellers can reply publicly but cannot edit, hide or approve reviews — the Partner Hub states this and links to policy.

## State and persistence

`AppStore.jsx` exposes one context with catalogue, cart, wishlist, orders, reviews, fit profile, addresses, sellers, applications, config, audit log, search log, stock ledger and coupon. Each slice is written to `localStorage` on change. Order placement re-validates stock and listing status, decrements stock and appends to the ledger and audit trail. Persistence is browser-local and disposable; there is no cross-device sync.

## Theme and motion

- **Tokens:** `src/styles/base.css` defines the dark palette (`--paper`, `--surface`, `--ink`, `--line`, `--accent`) and semantic status colours. `--ink` is the light text colour; `--on-ink` is used for text placed on light-filled chips and buttons.
- **Composition:** `base.css` → `store.css` → `workspace.css` → `effects.css`. The final layer holds theme corrections, ambient glow, pointer effects and reduced-motion overrides.
- **Ambient light:** two fixed, heavily blurred radial gradient fields behind the page plus section-level glow orbs that drift on long, offset keyframes. They are decorative, `pointer-events: none`, and do not affect layout.
- **Pointer:** a `requestAnimationFrame`-throttled fixed glow follows the cursor on fine pointers; product cards tilt a few degrees via inline transforms and a radial glare tied to pointer position; the hero image and note shift on opposite axes.
- **Feedback:** scroll-progress bar, route fade, staggered card entrance, button light sweep, nav underline glow, pulsing eyebrow dot, mini-bar hover states.
- **Restraint:** all motion is short and low-amplitude; the full set is disabled under `prefers-reduced-motion`, and the cursor layer is hidden on touch and below 860 px. The fixed glows are clipped horizontally to prevent scrollbar overflow.

## Styling and accessibility

- Identity: near-black warm base, olive surfaces, one bright chartreuse accent; serif display for editorial headings, clean sans for UI.
- Tokens in `base.css` cover colour, type scale, spacing, radii and shadows.
- Focus-visible rings on interactive elements; semantic landmarks, labelled forms, `aria-live` toast, dialog semantics with Escape handling, switch/tab roles for custom controls, `aria-current` breadcrumbs.
- Motion is limited to short opacity/transform transitions, disabled under `prefers-reduced-motion`.
- Responsive targets 360–1440 px: two-column product grid on phones, collapsing workspace sidebars into scrollable pill navigation, horizontally scrollable data tables inside their own container.
- Touch targets are at least ~36 px in workspace toolbars and 44 px for primary storefront actions.

## Deliberate limitations

- Deterministic demo ranking, palette-proxy image analysis, estimated body measurements and synthetic economics.
- Client-side role switch and client-side audit log — tamperable by design in a prototype.
- No tax computation, address validation service, payment authorisation, inventory reservation or fulfilment events.
- Bundle is a single JS chunk (~693 kB minified); route-level code splitting is the obvious next step.
- The ambient/pointer effects are CSS filters and transforms rather than canvas/WebGL, chosen to stay cheap and degrade cleanly on low-power devices.
