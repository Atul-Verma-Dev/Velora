# VELORA — Indian fashion marketplace (interactive prototype)

VELORA is a product-first Indian fashion storefront with a discovery engine, fit guidance, a margin-protected **Complete the Look** bundler, a seller workspace (**Velora Partner Hub**) and an internal **Velora Operations Console**. The interface uses a dark editorial theme with animated ambient light, pointer-reactive cards and restrained motion that respects `prefers-reduced-motion`.

This repository is a **frontend prototype**: it runs entirely in the browser on Vite + React, with synthetic catalogue data and `localStorage` persistence. Nothing is charged, shipped, authenticated or inferred by a model.

## Run locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

Production build + local preview:

```bash
npm run build
npm run preview    # http://127.0.0.1:4173
```

Requires Node 18+.

## Routes

### Shopper
| Route | Screen |
| --- | --- |
| `/` | Home — editorial hero, categories, new arrivals, discovery entry point |
| `/shop` | Listing with category, colour, size, price, occasion filters and sort |
| `/new` | New arrivals listing |
| `/product/:id` | PDP — gallery, size guidance, fit, reviews with AI summary, Complete the Look |
| `/search` | Velora Discovery — text, reference image, or both; editable interpretation |
| `/fit` | Fast Path (10-second profile) and Precision Scan (manual measurements) |
| `/wishlist` | Saved pieces |
| `/cart` | Bag, quantity/stock rules, Complete the Look offers, coupon |
| `/checkout` | Address, delivery speed, payment method, review |
| `/order-confirmation/:id` | Order placed |
| `/account`, `/account/orders`, `/account/orders/:orderId`, `/account/addresses`, `/account/reviews`, `/account/profile` | Account, orders/returns, addresses, reviews, profile and fit data |
| `/sell` | Seller application (demo) |
| `/login` | Sign-in explanation (no authentication implemented) |
| `/help`, `/help/:section` | Help centre, shipping, returns, fees, grievance, Complete the Look |
| `/policies/:slug` | Returns, privacy, terms |
| `/size-guide` | Size and measurement guide |
| `/about` | Brand, studios, careers and press anchors |

### Workspaces (role-gated in the demo)
| Route | Area |
| --- | --- |
| `/partner` | Velora Partner Hub — overview, catalogue, add product wizard, inventory, orders, returns, Complete the Look rules, pricing, payments, analytics, reviews, store profile, documents, team, help, settings |
| `/operations` | Velora Operations Console — marketplace overview, seller operations, catalogue QC, trust & safety, search quality, finance, support cases, config, audit log |

Both workspaces are reachable only after switching the demo role from the account menu in the header (or from the gate screen itself). They are not linked in the shopper footer. This is a demo convenience, **not** authentication or authorisation.

## Visual system

- Near-black warm base (`#0b0d08`), layered olive surfaces, chartreuse accent for primary actions, active navigation and data highlights.
- Animated ambient glow layers behind the page and key sections, a pointer-following light on desktop, a scroll-progress bar, slow hero drift with mouse parallax, card tilt with a light sweep, button shine and staggered card entrances.
- All decorative motion is disabled under `prefers-reduced-motion`, and the cursor light is hidden on touch and narrow screens.
- Type: Manrope for UI, DM Sans for body, Playfair Display for editorial italics (locally linked Google Fonts).

## What is genuinely implemented

- **Catalogue and commerce state:** filtering, sorting, variants, stock-aware cart, coupon, address book, order creation with stock decrement, returns, review submission and moderation — all in React state persisted per browser.
- **Dual-thread discovery:** Thread A parses natural language into structured intent; Thread B computes palette/tone/pattern signals from a reference image on a canvas. A deterministic merge resolves conflicts, then hard filters run before ranking (weights 0.4 text / 0.6 image). Every step of the interpretation is visible and editable.
- **Fit guidance:** deterministic garment measurement tables with per-garment ease bands, Fast Path body estimates, and a manual Precision Scan. No accuracy percentage is claimed and the camera is never opened.
- **Complete the Look:** age ≥ 60 days, exact-size or one-size, palette/occasion compatibility, tiered discount (30/45/60%) and a hard floor of `COGS + marginal shipping`; the deepest tier is gated at a ₹2,000 bag. Offers are framed as stylist completions, never "dead stock".
- **Partner Hub:** listing editor with a price floor, 4-step add-product wizard, stock ledger with reasons, order/return handling, CTL economics, settlement view, analytics, review responses, store profile and a team permission matrix.
- **Operations Console:** application/KYC decisions, catalogue QC with reasons, review moderation, seller suspension, search-quality metrics from real local searches, finance reconciliation, marketplace config and an append-only audit log. Modules are permission-gated by admin sub-role.

## What is demo-only

- No authentication, sessions or server-side authorisation. Roles are a local switch.
- No payment gateway, tax engine, courier integration, email/SMS or real refunds. Checkout is explicitly labelled as a demo and takes no money.
- Catalogue, sellers, orders, reviews, KYC documents and economics are synthetic.
- Search does not call an LLM or an embedding model. It is a deterministic on-device approximation that preserves the production contracts.
- Fit does not use pose estimation; Precision Scan is manual measurement entry.
- No production database: state lives in `localStorage` under `velora-v1-*`.

## Data and assets

- 64 catalogue records: 60 live listings, 2 awaiting catalogue review, 1 rejected and 1 draft. 5 sellers (House of Aranya, Meher Atelier, Morrow Studio, Nila Collective, Common Thread).
- 45 seeded reviews across products; additional reviews are created in-browser.
- 6 shopper orders plus 3 seller-side orders and 2 seller applications.
- 54 local images in `public/images/` (product, editorial and campaign imagery). All studio names, product names, prices and claims are fictional.

## Reset

Account menu → **Reset demo data**, or in the console:

```js
Object.keys(localStorage).filter((k) => k.startsWith("velora-v1-")).forEach((k) => localStorage.removeItem(k));
location.reload();
```

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — search contracts, fit model, CTL economics, roles, state and styling.
- [`TESTING.md`](./TESTING.md) — manual walkthrough and known boundaries.
