# Week 20 Work Log (July 6 – July 12, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week worked through all three items left in the Week 19 planning notes, all centered on the stock-velocity forecasting introduced over the last two weeks. The first was a refactor: the EMA calculation built for `stock-forecast` and the flat-mean calculation used separately by `low-stock` were unified into one shared service, so both endpoints now agree exactly on how "average daily usage" is computed rather than maintaining two similar-but-different formulas. The second exposed the EMA's smoothing behavior as an independent, optional query parameter separate from the lookback window, so the forecast can be tuned to react faster or slower to recent changes without changing how much history it fetches. The third used the now-shared calculation to add a genuinely new feature: a velocity trend indicator on the Products page showing whether a product's sales pace is accelerating or decelerating compared to the prior period, surfaced right next to the existing days-remaining estimate.

---

## Technical Activities

### Shared Stock-Velocity Service (SRS Section 4.3: Inventory Management)

**Problem:** After Week 19, `GET /api/products/stock-forecast` computed sales velocity as a true EMA over a `generate_series`-backed per-day series, while `GET /api/products/low-stock` computed it as a much simpler flat 30-day mean via a single SQL subquery — two different formulas answering the same underlying question ("how fast is this product selling?") with two different implementations that could silently drift out of agreement. The Week 19 planning notes flagged this explicitly: "if the two ever need to agree exactly ... they should be unified into one shared calculation."

**Backend — new service module** (`backend/src/services/stockVelocity.js`):

- Extracted the per-day usage query (the `days`/`usage` CTE pair built in Week 19) into `fetchDailyUsage(days)`, returning a `Map` keyed by product ID, each entry holding `{ stockKg, quantities }` — `quantities` is the chronologically-ordered (oldest-first) daily usage series
- Extracted the EMA recurrence into a pure function `ema(quantities, smoothingDays)`, taking the smoothing window as an explicit parameter rather than deriving it internally from the fetch window — this decoupling is what makes the independent-smoothing feature (below) possible without duplicating the recurrence
- Both routes now `require('../services/stockVelocity')` instead of each maintaining their own copy of either the SQL or the EMA math

**Backend — products route** (`backend/src/routes/products.js`):

- `GET /api/products/low-stock` no longer runs its own flat-mean subquery; it now fetches the candidate low-stock products first (a plain `WHERE stock_kg < COALESCE(reorder_point_kg, $1)` query), then calls `fetchDailyUsage(30)` and `ema(...)` per matching product to compute `days_remaining` with the exact same formula `stock-forecast` uses
- Sorting moved from SQL (`ORDER BY ... NULLS LAST`) to a JavaScript `.sort()` after the EMA is computed, since the EMA can't be expressed as a single SQL expression the way the old flat mean could — an acceptable trade-off given the product catalogue here is small enough that sorting in memory has no meaningful cost

### Independently Tunable EMA Smoothing (SRS Section 4.3: Inventory Management)

**Problem:** In the Week 19 implementation, the EMA's `alpha` was derived directly from the `days` query parameter (`alpha = 2 / (days + 1)`), so the only way to make the forecast more reactive to a recent demand spike was to also shrink the lookback window — which meant losing history rather than just re-weighting it. The Week 19 planning notes proposed exposing the smoothing behavior as its own tuning parameter, independent of how much data is fetched.

**Backend — products route** (`backend/src/routes/products.js`):

- `GET /api/products/stock-forecast` now accepts an optional `?smoothing=` query parameter, clamped to `[1, days]`; when omitted, it defaults to `days` (identical to Week 19's behavior, so this is backward compatible)
- `days` now controls only how much history is fetched (capped at 180, reduced from 365, since the route now internally fetches `days * 2` to support the trend comparison below — keeping the cap here bounds that to a year of history); `smoothing` controls only how fast the EMA reacts, via `alpha = 2 / (smoothing + 1)`
- Example: `?days=90&smoothing=7` looks back over 90 days of history but weights the last week much more heavily than a `smoothing=90` value would, letting a genuine short-term demand shift show up in the forecast without discarding the longer view entirely

### Sales-Velocity Trend Indicator (new feature, SRS Section 4.4: Usability Requirements)

**Problem:** With the EMA-based forecast in place since Week 19, an administrator could see a single point-in-time "days remaining" figure but had no way to tell whether a product's sales pace was speeding up or slowing down — the same blind spot the reviews-rating trend badge (Week 18) addressed for customer satisfaction, now showing up for inventory velocity instead.

**Backend — products route** (`backend/src/routes/products.js`):

- `GET /api/products/stock-forecast` now fetches `days * 2` worth of daily usage in one query, then splits each product's quantity series into `prevQuantities` (the older half) and `currQuantities` (the newer half) via `Array.slice`, computing the EMA separately for each half
- Response now includes `prev_avg_daily_usage_kg` alongside the existing `avg_daily_usage_kg`, giving the frontend both the current velocity and the immediately preceding period's velocity to compare

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- Added a `VelocityTrend` component: given `avg` and `prevAvg`, computes a percent change and renders `▲ N%` or `▼ N%` next to the existing "~Xd left" text on each product's Stock row; renders nothing when either value is missing or unchanged
- Colored the opposite way from the reviews `TrendBadge`: faster selling (▲) is amber, since a product depleting more quickly is the more urgent state for a restock alert, while slower selling (▼) is green — deliberately the inverse of the reviews badge's green-is-good convention, because "up" means something different for satisfaction versus depletion risk

---

## Frontend Architecture

### Updated Pages

- `src/pages/Products.jsx` — new `VelocityTrend` component rendering `▲/▼ N%` next to the stock-forecast hint, using the newly added `prev_avg_daily_usage_kg` field; no changes to the data-fetching effect since the endpoint path and base contract are unchanged

---

## Backend Architecture

### New Files

- `backend/src/services/stockVelocity.js` — `fetchDailyUsage(days)` (per-day usage series via `generate_series` + pre-aggregated CTE) and `ema(quantities, smoothingDays)` (pure EMA recurrence), shared by both `stock-forecast` and `low-stock`

### Updated Routes

- `GET /api/products/stock-forecast` — now accepts an independent `?smoothing=` parameter (defaults to `days`); returns `prev_avg_daily_usage_kg` for trend comparison; `days` capped at 180 (down from 365) since the route now fetches `days * 2` internally
- `GET /api/products/low-stock` — velocity/urgency ranking now uses the shared EMA service instead of a separate flat-mean SQL subquery, so it agrees exactly with `stock-forecast`'s numbers

---

## Project Planning

- The low-stock endpoint always uses a fixed 30-day EMA (not configurable via query param, unlike `stock-forecast`) since it's a banner needing a single "how urgent is this" signal, not a tunable report — if a future feature needs the two to expose the same smoothing knob, `LOW_STOCK_VELOCITY_DAYS` would need to become a query parameter too
- `stock-forecast`'s `days` cap dropped from 365 to 180 as a side effect of now fetching `days * 2` internally for the trend comparison; if a future need arises for forecasting over more than a year of history, the trend-comparison fetch would need to become optional (e.g. a `?compare=false` flag) rather than always doubling the window
- The velocity trend's percent-change calculation divides by `prevAvg`, so a product with literally zero sales in the entire prior window (not just a low but nonzero rate) shows no trend badge at all rather than an undefined/infinite percentage — this is a deliberate choice (silence over a misleading number) but means genuinely new fast-sellers won't get a trend indicator until they have at least one full prior window of data

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Don't Repeat Yourself via Shared Pure Functions — extracting `fetchDailyUsage` and `ema` into `stockVelocity.js` turned two routes that separately encoded "how do we measure sales velocity" into one canonical implementation; the JS `ema` function in particular is a pure function (same series and smoothing in, same number out, no side effects), which made it trivial to reuse for `low-stock`'s single-value case and `stock-forecast`'s split-series trend case without adapting either call site to the other's needs
- Parameterizing an Algorithm's Constants Independently from Its Inputs — separating `smoothing` (which determines `alpha`, the EMA's decay rate) from `days` (which determines how much raw data is fetched) is the same principle as separating a numerical algorithm's convergence/tuning parameters from its input size; conflating the two in Week 19 meant one couldn't be changed without affecting the other
- Array Slicing to Derive Comparable Sub-Windows — `quantities.slice(0, days)` / `quantities.slice(days)` splits one chronologically-ordered fetch into two equal-length, non-overlapping windows for a fair trend comparison, avoiding a second round-trip to the database for the "previous period" data that Week 18's reviews-trend feature needed a second SQL query to obtain
- Trading a Database-Level Sort for an Application-Level One When the Metric Isn't Expressible in SQL — `low-stock`'s ranking moved from `ORDER BY` (Week 19) to a JavaScript `.sort()` (this week) because an EMA's iterative recurrence has no closed-form SQL expression the way a flat mean's division does; recognizing when a computation's structure forces a shift in *where* it can run (query planner vs. application code) is a recurring systems-design judgment call, not just a style preference
- Percent Change as a Scale-Invariant Trend Signal — `(avg - prevAvg) / prevAvg` normalizes an absolute kg/day difference into a relative signal that's comparable across products selling at very different volumes (a 0.2kg/day swing means something very different for a product averaging 0.3kg/day versus one averaging 5kg/day), which a raw difference alone wouldn't communicate

---

## Evidence

- `backend/src/services/stockVelocity.js` (new) — `fetchDailyUsage` and `ema` shared by both routes below
- `backend/src/routes/products.js` — `GET /api/products/stock-forecast` accepts `?smoothing=`, returns `prev_avg_daily_usage_kg`; `GET /api/products/low-stock` now uses the shared EMA service and an in-memory sort
- `frontend/src/pages/Products.jsx` — `VelocityTrend` component showing `▲/▼ N%` next to the stock-forecast hint
- Tested against a local Postgres instance with two products seeded with opposite velocity patterns: a product with 1kg/day sales 35–45 days ago and 3kg/day sales in the last 15 days correctly showed `avg_daily_usage_kg: 0.31` vs. `prev_avg_daily_usage_kg: 0.1` (accelerating); a second product with the sales pattern reversed correctly showed the opposite (`0.1` vs. `0.31`, decelerating); passing `?smoothing=7` alongside `?days=30` produced measurably different, more recency-weighted values than the default (`smoothing` = `days`) on the same data, confirming the two parameters are now independently effective; the low-stock endpoint correctly ranked the accelerating product (32 days remaining) ahead of the decelerating one (116 days remaining) even though the decelerating product had more kg in absolute stock; `npm run lint` and `npm run build` both pass with zero errors on the frontend; all seeded test data was removed from the local database after verification
- **Testing limitation:** as in prior weeks, all three features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
