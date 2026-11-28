# VELORA — manual test walkthrough

A frontend prototype test plan. It exercises the flows that exist; it does not imply production readiness.

## Setup

```bash
npm install
npm run dev      # http://127.0.0.1:5173
```

For a production-style check: `npm run build && npm run preview`.

Fresh state: Account menu → **Reset demo data** (clears `velora-v1-*`).

## 1. Discovery and listing

1. On `/`, use the category tiles and the search field; confirm the hero, new arrivals and editorial sections render at 360 px and 1440 px without horizontal page scroll.
2. On `/shop`, combine category, colour, size, price and occasion filters. Remove chips individually and via **Clear all**. Confirm the result count updates and empty states appear for impossible combinations.
3. Sort by newest, price and rating; confirm the label reflects the active sort.
4. On `/new`, confirm only recent listings appear.

## 2. Product detail

1. Open a live product. Switch gallery images, select sizes (including a size with low stock), and confirm the stock message.
2. Use **Find my fit**; with no profile it should route to `/fit`. With a profile, confirm a size suggestion plus per-zone explanation.
3. Confirm Complete the Look shows at most a few compatible pieces with a real discount, and no internal economics.
4. Open **Reviews**: summary appears only with ≥ 3 published reviews. Submit a review — it should be pending, not published, and appear in `/account/reviews`.
5. Report a review and confirm it moves to the Trust & Safety queue in Operations.

## 3. Search (Velora Discovery)

1. `/search` with `a pastel green kurta for a daytime wedding under ₹2,000`. Confirm interpretation chips: category, colour, occasion, price, and the merge note.
2. Edit a chip (for example remove the price ceiling) and confirm results re-rank.
3. Add `not pink` (or use an exclusion chip) and confirm excluded items never reappear.
4. Upload a reference image. Confirm the palette/tone panel is populated and labelled as on-device analysis, and that the image is not uploaded.
5. Submit an impossible query and confirm the empty state explains which hard filters removed candidates.
6. Open `/operations/search` after searching and confirm searches logged, zero-result rate and measured latency.

## 4. Fit

1. `/fit` → Fast Path: complete height, weight, shape, anchor brand, usual size. Confirm a saved profile appears on `/account/profile`.
2. Precision Scan: enter manual measurements; confirm no camera permission prompt appears and the copy states measurements are manual.
3. Delete the fit profile and confirm PDP guidance reverts to the setup prompt.

## 5. Bag and checkout

1. Add two sizes of one product plus another product. Adjust quantities past available stock and confirm the guard message.
2. Apply a valid coupon and an invalid code; confirm totals and error copy.
3. Move a line to wishlist and confirm it leaves the bag.
4. Checkout: add/edit an address, change delivery speed, choose a payment method, place the order.
5. Confirm the confirmation page shows a demo payment disclaimer, stock decreased, and the order appears in `/account/orders` under the shopper only.
6. On the order, request a return (delivered orders only) and confirm the status and return reason render.

## 6. Wishlist and account

1. `/wishlist`: remove items, add one to bag, confirm the empty state after clearing.
2. `/account/addresses`: add, edit, set default, remove. Invalid phone/pincode must block save.
3. `/account/reviews`: confirm pending and published states, moderation notes and verified badges.

## 7. Velora Partner Hub (`/partner`, role = Partner Hub)

1. Account menu → **Partner Hub**. Confirm the sidebar, store identity and demo badge.
2. Overview: KPIs, attention cards and business snapshot render; **Export CSV** downloads a file.
3. Catalogue: search, filter by status, edit price below the floor (blocked with the floor value), submit a live listing for review.
4. Add product: walk all four steps; short description and MRP below price must block; submit and confirm the "Under review" success screen.
5. Inventory: adjust stock with a reason; confirm the ledger entry and that shop stock changes.
6. Orders: dispatch and deliver a seller order; confirm status and audit entries. Returns: accept a return.
7. Complete the Look: confirm tier table, floor explanation and gated deepest tier.
8. Pricing, Payments, Analytics, Reviews, Store profile, Documents, Team, Help, Settings: each renders real demo content; review replies post publicly; team permission changes persist.

## 8. Velora Operations Console (`/operations`, role = Operations)

1. Switch to Operations. Confirm overview KPIs and queues.
2. Seller operations: approve/reject an application with a reason; confirm audit entry and seller status change.
3. Catalogue operations: approve and reject a pending listing; rejection requires a reason and appears on the seller side.
4. Trust & safety: approve, reject and request edit on a review; confirm the shopper sees the new state.
5. Change the admin sub-role (for example to Finance) and confirm restricted modules show the scope panel instead of the tool.
6. Finance, Search quality, Support cases, Marketplace config (super admin only) and Audit log.
7. Audit log: filter by module; confirm actor, role, reason, timestamp and previous state are recorded.

## 9. Theme and motion

1. Load `/` at 1440 px and confirm the dark palette: no white panels, readable secondary text, chartreuse reserved for primary actions and active states.
2. Move the pointer across the hero and a product card. The hero image/note should shift slightly in opposite directions; the card should tilt a few degrees with a soft light patch; the ambient cursor glow should follow without trailing artifacts.
3. Scroll: the top progress bar should track position, and cards below the fold should fade in once.
4. Resize to 390 px: house hamburger menu, two-column product grid, no horizontal page scroll, fixed bottom navigation not covering the footer (footer has extra bottom padding).
5. Enable the OS “reduce motion” setting: glow drift, hero zoom, card entrances and cursor light should stop; content stays visible.
6. Check the Partner Hub and Operations Console in dark mode, including modals, date-free forms, tables and status pills.

## 10. Cross-cutting

- Keyboard: Tab through header, filters, PDP actions and workspace tables; focus must be visible. Escape closes dialogs and the mobile menu.
- Reduced motion: enable `prefers-reduced-motion`; reveal animations must not hide content.
- Refresh on a deep route (for example `/account/orders`), reload and confirm state persists.
- Confirm every footer, header and in-page link resolves; no dead `#` links and no decorative-only buttons.
- Confirm role areas are unreachable from shopper navigation without the demo switch.

## Current demo volumes

- 64 catalogue records (60 live), 5 studios, 45 seeded reviews, 6 shopper orders, 3 seller orders.

## Known boundaries

- No authentication, payments, email/SMS, courier, tax or server-side stock locking.
- Search and fit are deterministic demos; Precision Scan does not open the camera.
- All data is synthetic and stored in this browser. Do not use for real orders.
