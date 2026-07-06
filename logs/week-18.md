# Week 18 Work Log (June 22 – June 28, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week closed out three improvements flagged in the Week 17 planning notes, continuing the customer intelligence and operational tuning theme. The first was star-rating filtering on the admin reviews dashboard — clicking a star bar or a filter pill now narrows the review list to just that rating, making it fast to triage negative feedback. The second was trending support for the reviews stats endpoint — the dashboard now has a 7 / 30 / 90 / All period picker, and each period comparison shows a trend badge against the equally-sized prior window so the administrator can see whether satisfaction is improving or slipping. The third was a stock-forecast feature — a new endpoint derives each product's average daily usage from recent completed orders and projects "days of stock remaining," shown alongside the existing absolute-kg reorder point on the Products page.

---

## Technical Activities

### Star-Rating Filter on Reviews Dashboard (SRS Section 4.4: Usability Requirements)

**Problem:** The reviews dashboard (added Week 17) showed every review in a single list ordered by date. An administrator wanting to triage negative feedback — e.g. "show me only the 1-star reviews" — had to scroll through the entire list manually. There was no way to isolate reviews by rating.

**Frontend — AdminReviews page** (`frontend/src/pages/AdminReviews.jsx`):

- Added `starFilter` state (`null` = all ratings); `filteredReviews` is derived from `reviews` and `starFilter` rather than stored separately, so the underlying fetched list stays intact and the filter is purely a view concern
- `StarBar` (the distribution chart component) now accepts `active` and `onClick` props — clicking a bar in the rating distribution toggles that star level as the filter, with a highlighted background (`#fffbeb`) on the active bar; clicking the same bar again clears the filter
- Added an explicit filter pill row (All / 5★ / 4★ / 3★ / 2★ / 1★) below the stats card for discoverability, since the clickable bars alone aren't an obvious affordance; both controls share the same `starFilter` state so they stay in sync
- Empty state text is filter-aware: "No reviews yet" when unfiltered vs. "No N-star reviews" when a filter yields zero results, so the admin isn't confused about whether data failed to load or the filter is just narrow

### Reviews Stats Trending (SRS Section 4.4: Usability Requirements)

**Problem:** `GET /api/reviews/stats` computed the average rating and distribution across all reviews ever submitted with no time dimension. An administrator had no way to tell whether customer satisfaction was trending up or down — a 4.2 average looks identical whether last month was a 4.5 or a 3.8.

**Backend — reviews route** (`backend/src/routes/reviews.js`):

- `GET /api/reviews/stats` now accepts an optional `?days=` query param (capped at 365, same convention as `fulfillment-stats` and `products/analytics`)
- When `days` is omitted, behavior is unchanged — stats cover all reviews ever submitted, `prev_avg_rating` is `null`
- When `days` is provided, the distribution and average are scoped to `created_at >= NOW() - (days || ' days')::interval`, and a second query computes the average rating over the *prior* equally-sized window (`NOW() - 2×days` to `NOW() - days`) as `prev_avg_rating`
- Rewrote the distribution/average computation to run as two parameterized queries reused for both windows rather than the previous fixed all-time-only pair, and simplified the total-count derivation to accumulate directly from the per-rating rows instead of a separate `COUNT(*)` pass

**Frontend — AdminReviews page** (`frontend/src/pages/AdminReviews.jsx`):

- Added a `statsDays` state (`null` = all time) and a 7d / 30d / 90d / All period picker in the stats card header, mirroring the pill-button style already used for the Orders fulfillment card and product analytics panel
- Added a `TrendBadge` component: given `avg` and `prevAvg`, shows ▲/▼ with the rounded delta in green/red, or "— flat" in grey when unchanged; only rendered when a specific period is selected (an all-time view has no "previous period" to compare against)
- Selecting a new period resets `stats` to `null` from the button's `onClick` handler (not from inside the `useEffect`) so the card shows its existing "Loading…" placeholder without triggering React's `set-state-in-effect` lint warning — the effect itself only performs the fetch and calls `setStats` from the resolved promise

### Stock Forecast: Days of Stock Remaining (SRS Section 4.3: Inventory Management)

**Problem:** The reorder point system (Week 17) stores a fixed kg threshold per product, but a fixed threshold doesn't account for how fast a product actually sells — a slow-moving product sitting at 8kg with a 5kg threshold looks "fine" even if it would take two months to sell through, while a fast-moving product at the same 8kg might run out in three days. The Week 17 planning notes flagged expressing the reorder point as "days of stock" derived from sales velocity as a future improvement.

**Backend — products route** (`backend/src/routes/products.js`):

- Added `GET /api/products/stock-forecast?days=30` (auth required): for every product with stock tracking enabled (`stock_kg IS NOT NULL`), computes `avg_daily_usage_kg` as total `quantity_kg` sold in non-cancelled orders over the trailing window divided by the window length, then `days_remaining = round(stock_kg / avg_daily_usage_kg)` — `null` when there's no usage to project from (new or slow products), rather than a division-by-zero or a misleading "infinite" value
- This is additive alongside `reorder_point_kg`, not a replacement — the absolute-kg alert stays the source of truth for the low-stock banner and product card color, while the forecast is a read-only supplementary signal
- Caught and fixed a query bug during testing: the initial version divided by `$1` (the untyped query parameter) while also using `$1` inside `($1 || ' days')::interval` in the same statement; PostgreSQL's parameter-type inference picked `text` for `$1` from the concatenation usage, producing `operator does not exist: numeric / text` on the division. Fixed by explicitly casting the division side to `$1::numeric`, leaving the interval-concatenation usage untouched

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- Added a `forecast` state populated from `GET /products/stock-forecast` on mount, keyed by product ID for O(1) lookup per card
- The Stock row now shows `· ~Xd left at current pace` in muted grey immediately after the kg figure when a forecast exists for that product; hidden entirely when there's no sales history to project from, so the row never claims false precision

---

## Frontend Architecture

### Updated Pages

- `src/pages/AdminReviews.jsx` — `starFilter` state with clickable `StarBar` and filter pill row; `statsDays` period picker with `TrendBadge` trend indicator; filter-aware empty states
- `src/pages/Products.jsx` — `forecast` state from `stock-forecast` endpoint; "~Xd left at current pace" hint on the Stock row when projectable

---

## Backend Architecture

### Updated Routes

- `GET /api/reviews/stats` — now accepts `?days=`; scopes distribution/average to the trailing window and returns `prev_avg_rating` from the prior equal-length window for trend comparison
- `GET /api/products/stock-forecast` (new) — `avg_daily_usage_kg` and `days_remaining` per product, derived from `order_items` over a trailing window; `$1::numeric` cast required alongside the `($1 || ' days')::interval` usage in the same query to avoid a parameter-type inference conflict

---

## Project Planning

- The star-rating filter is client-side only (reviews are already fetched in full via `GET /api/reviews`); if the reviews table grows large enough that fetching the full list becomes slow, the filter would need to move server-side as a `?rating=` query param
- The stock forecast uses a flat 30-day trailing average; a future improvement could weight recent days more heavily (e.g. exponential moving average) so a sudden demand spike or drop is reflected faster than a month-long average allows
- `days_remaining` does not account for seasonality or already-placed pending orders that haven't shipped yet — it's a simple velocity projection, not a true depletion forecast

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- PostgreSQL Parameter Type Inference — when a single query parameter (`$1`) is used in two different operator contexts (`numeric / $1` and `$1 || ' days'`), PostgreSQL's planner infers a single type for that parameter across the whole statement; here it inferred `text` from the concatenation usage, causing the division to fail with `operator does not exist: numeric / text`. The fix (`$1::numeric` at the division site) demonstrates that parameterized query type inference is a whole-statement analysis, not a per-usage one — an important subtlety distinct from simple `COALESCE` per-row logic used elsewhere in this codebase
- Sliding Window Trend Comparison via Date Arithmetic — computing "current window" vs. "immediately preceding window of equal length" using two half-open interval bounds (`NOW() - 2N days` to `NOW() - N days`) expressed entirely in SQL, avoiding fetching all rows into the application layer just to bucket them by date in JavaScript
- Derived Rate from Aggregate Sum — `avg_daily_usage_kg = SUM(quantity_kg) / days` turns a cumulative total into a per-unit-time rate, which is then inverted (`stock_kg / avg_daily_usage_kg`) to project a remaining-time estimate; this rate-then-invert pattern is a general technique for turning any "total consumed over a period" metric into a "time until exhausted" estimate
- Derived State vs. Stored State in React — `filteredReviews` is computed on every render from `reviews` and `starFilter` rather than kept as its own `useState`, avoiding a synchronization bug class where the filtered list could drift out of sync with the source list after a background refetch
- React `set-state-in-effect` and Event-Handler-Driven Resets — moving the `setStats(null)` loading-placeholder reset out of the `useEffect` body and into the period-picker's `onClick` handler avoids a React anti-pattern where an effect unconditionally calls `setState` on every run, which the linter flags as a cascading-render risk; the corrected version keeps the effect itself purely a "fetch and store the result" subscription to `statsDays`, while the *decision* to show a loading state lives with the user action that caused it

---

## Evidence

- `backend/src/routes/reviews.js` — `GET /api/reviews/stats` accepts `?days=`; scoped distribution/average queries; `prev_avg_rating` from prior equal-length window
- `backend/src/routes/products.js` — `GET /api/products/stock-forecast` with `avg_daily_usage_kg` and `days_remaining`; `$1::numeric` cast fix for the parameter-type inference bug
- `frontend/src/pages/AdminReviews.jsx` — clickable `StarBar` with `active`/`onClick`; filter pill row; `statsDays` period picker; `TrendBadge` component; filter-aware empty states
- `frontend/src/pages/Products.jsx` — `forecast` state from `stock-forecast`; "~Xd left at current pace" hint on Stock row
- Tested via direct API calls against a local Postgres instance with seeded orders/reviews: `stock-forecast` correctly computed 40 days remaining for a product with 20kg stock and 15kg sold over 30 days (0.5kg/day); `reviews/stats?days=30` correctly scoped to a 3.5 average from two in-window reviews and returned 4.0 as `prev_avg_rating` from a review in the preceding window; caught and fixed the `numeric / text` operator error on `stock-forecast` before it reached the UI; `npm run lint` and `npm run build` both pass with zero errors on the frontend; test data was removed from the local database after verification
- **Testing limitation:** the three features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
