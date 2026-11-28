# Velora — implementation tracker

_Last updated: checkpoint 4 (mobile pass, CSS cleanup, preview deployment)._


## DONE

### Bug fixes (round 1)
- [x] Search: "under ₹2,000" now parses; chip removal actually removes the filter
- [x] Complete the Look: offer price honoured in bag, one-per-order, revalidated at checkout, real per-size stock
- [x] Coupon: single shared rule (Bag/Checkout/order), Remove button, min-bag recheck
- [x] Real per-size stock + inventory ledger entry on every sale; multi-line orders decrement correctly
- [x] Reviews: verified only from the user's own delivered order, no duplicates, reporting no longer hides a review
- [x] Seller application rejection now sets status; unique listing ids; order tracking completes earlier steps
- [x] Filters live in the URL (Back button restores view); no jump-to-top on filter change
- [x] Mega-menu / department links return products; header search box syncs with /search?q=
- [x] Fit: preference now changes the pick; "Short Cotton Kurta" no longer treated as shorts
- [x] Dialogs: no focus stealing, Tab trap, focus restore; removable chips no longer nested buttons; status colours fixed
- [x] Malformed product URL no longer crashes; wishlist toast side-effect; PDP no longer resets size on stock update
- [x] `RotateCcw is not defined` crash in Operations fixed

### Theme & UI (round 2)
- [x] Full colour scheme change: dark/lime -> white & red (tokens + every hard-coded dark/lime colour remapped)
- [x] Red announcement bar, red primary actions, red focus rings, red scrollbars, red Complete-the-Look band
- [x] Mega-menu: every category link on ONE line, one consistent 13px size, hover slide + red accent
- [x] Top nav 13px; type floor raised to 11px (was ~8px in places); opaque mobile buy bar; header badge fix

### Effects & components (React UI Effects Playbook, free-only, no new dependencies) — `src/components/fx.jsx`, `src/styles/fx.css`
- [x] Aurora hero background (single animated bg for the hero viewport)
- [x] Rotating-word hero headline (WordRotate) and animated gradient text
- [x] Border-beam CTA button, shine sweep on buttons, announcement-bar sheen
- [x] Number tickers (hero stats)
- [x] Accessible autoplay HeroCarousel (4 slides): pause button, hover/focus/offscreen/hidden-tab pause, swipe, arrows, dots with progress, keyboard, reduced-motion safe
- [x] ScrollCarousel for Trending products (snap, arrows, progress line)
- [x] GlowField drifting orbs (editorial, fit band, seller band, footer), Ripple rings (discovery), Meteors (red band), dot-grid
- [x] Pointer spotlight on sample searches + fit options; cursor glow; card glare/tilt
- [x] Two counter-moving marquee rows (occasions / crafts) + pausing brand marquee
- [x] Back-to-top button with scroll-progress ring; confetti on first order confirmation
- [x] Heart pop on wishlist, bag/wishlist badge bump, department-card image zoom + arrow spin
- [x] All animations pause off-screen; full prefers-reduced-motion fallback

### Storefront polish (round 3)
- [x] Removed the top announcement bar ("Free delivery … / 7-day easy returns · Fit guidance …"); the header is now the first element
- [x] Listing category capsules render on one line each: `white-space: nowrap`, 16px inner padding, 9px gaps, 34px height, horizontal scroll instead of wrapping
- [x] Nav hover underline no longer spans the whole header: `.nav-link` is now positioned, so the rule is bounded to the link (it previously crossed the search bar on plain links)
- [x] Hover rule is a red → rose → indigo gradient matching the extended palette
- [x] Extended palette tokens: rose, marigold, teal, indigo, plum (plus soft variants)
- [x] Colour applied across: hero aurora (now five hues), section glow fields, headline italic gradient, department cards (per-department wash), hero metrics, service icons, fit options, discovery chips, scroll progress, footer textile band

### Mobile + cleanup (round 4)
- [x] Header no longer uses a fixed 62px height on phones — the wrapped search row was overflowing the header box and overlapping the page
- [x] Mobile capsule row: 32px chips, faded cut edge marks the horizontal scroll; all 22 labels stay on one line
- [x] Product cards: brand names no longer ellipsised at 1px; rating count hidden and letter-spacing tightened below 720px
- [x] Quick-add chip shows its label again instead of a lone "+"
- [x] Fixed buy bar cleared the bottom nav (64px offset, 148px page padding)
- [x] Service promises are a 2×2 grid on phones (previously the third promise was hidden)
- [x] Border-beam ring hidden under 860px — at narrow widths it read as a stray rule across the CTA
- [x] Listing head spacing tightened; scroll-padding now matches the shorter desktop header and taller mobile one
- [x] Removed dead code: unused `LogOut` import, unused `--plum-soft` token, orphaned `.announce` rules, duplicate media query and duplicated chip/transition rules
- [x] Local workerd check (wrangler dev, compatibility date 2026-11-27): `/`, `/shop`, `/product/:id` return index.html; CSS/JS/images return correct MIME types

## REMAINING (in priority order)
- [ ] Verify tickers count up on mobile (screenshot showed 0 at 0.9s) and on slow devices
- [ ] Visual review of Shop, Product, Cart, Checkout, Account, Fit, Search, Partner Hub, Operations in the new theme (leftover dark-theme artefacts)
- [ ] Add effects to inner pages: text-reveal on page headings, skeleton loaders on listing, animated underline tabs in Partner/Ops, shimmer on Add-to-bag
- [ ] Product-page extras: sticky purchase panel polish, image gallery transitions
- [ ] Performance check (Lighthouse-style): lazy-load fx on small screens, confirm CLS is flat
- [ ] Keyboard/screen-reader pass on the carousel and new controls
- [ ] Still-open items from round 1: CTL similarity threshold (0.62 vs blueprint 0.78); PDP "Detail/Fabric" views are CSS crops of one photo; Partner Hub / Operations / Account code not audited line-by-line
