# Week 19 Work Log (June 29 – July 5, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week worked through the planning notes left at the end of Week 18, though one of the three planned items turned out to be based on a false premise once tested against real data — see Project Planning below for what changed and why. The first delivered feature moved the reviews star-rating filter from a client-side `Array.filter` over an already-fetched list to a real `?rating=` query parameter on the backend, so the dashboard only ever transfers the reviews it's displaying. The second upgraded the stock forecast's "average daily usage" from a flat 30-day mean to an exponential moving average (EMA), so a recent shift in a product's sales pace is reflected in the forecast faster than a month-long flat average allows. The third — originally planned as "net out stock already committed to pending orders" — was replaced after testing revealed `stock_kg` is already decremented at order-placement time, which would have made that adjustment double-count; the effort went instead into re-ranking the low-stock alert by projected urgency (days remaining) rather than raw kilograms, which is the improvement the pending-orders idea was actually reaching for.

---

## Technical Activities

### Server-Side Star-Rating Filter for Reviews (SRS Section 4.4: Usability Requirements)

**Problem:** The Week 18 star-rating filter fetched the entire review list once on mount and filtered it in the browser with `Array.filter`. The Week 18 planning notes flagged this as a scaling concern: once the reviews table grows large enough that shipping the full list on every page load is wasteful, the filter needs to live on the server instead.

**Backend — reviews route** (`backend/src/routes/reviews.js`):

- `GET /api/reviews` now accepts an optional `?rating=` query parameter; when present, the SQL query itself is scoped with `WHERE r.rating = $1` rather than filtering an already-fetched array in JavaScript
- Validates `rating` is between 1 and 5 when provided, returning `400` otherwise, matching the same validation already used on `POST /api/reviews`
- Omitting `rating` preserves the original all-reviews behavior, so this is backward compatible with any other caller of the endpoint

**Frontend — AdminReviews page** (`frontend/src/pages/AdminReviews.jsx`):

- The reviews-fetching `useEffect` now depends on `starFilter` and passes it through as the `rating` param, replacing the old fetch-once-then-filter-in-render approach; `reviews` itself is now always "the currently selected slice," not "the full list"
- Introduced a single `selectStarFilter(star)` handler used by both the clickable distribution bars and the filter pill row; it resets `reviews` to `null` (showing the loading state) and sets `starFilter` explicitly — deliberately *not* a toggle internally, so the "All" pill (which always means `null`) can't get stuck if clicked while already active. The rating bars still get toggle-to-clear behavior, but by computing the target value at the call site (`starFilter === s ? null : s`) rather than inside the setter
- The star filter pill row is now always rendered (previously hidden when the fetched list was empty) since an empty *filtered* result no longer implies there are no reviews at all — the row needs to stay visible so the admin can get back to "All"

### EMA-Weighted Stock Forecast (SRS Section 4.3: Inventory Management)

**Problem:** The Week 18 stock forecast (`GET /api/products/stock-forecast`) computed `avg_daily_usage_kg` as a single flat mean — total quantity sold divided by the window length. A flat mean weighs a sale from 29 days ago identically to one from yesterday, so a product whose sales pace genuinely picked up or dropped in the last week wouldn't show that shift until it had accumulated enough history to move the whole-window average. This was called out explicitly in the Week 18 planning notes as a future improvement.

**Backend — products route** (`backend/src/routes/products.js`):

- Rewrote `GET /api/products/stock-forecast` around a per-day usage series instead of a single aggregate: a `days` CTE generates one row per day in the trailing window via `generate_series`, a `usage` CTE pre-aggregates real `order_items`/`orders` data by product and day (excluding cancelled orders), and the two are combined with a `LEFT JOIN` so every day in the window is represented even when it had zero sales
- The per-day quantities are then folded into an exponential moving average in JavaScript: `ema = alpha * qty + (1 - alpha) * ema`, seeded with the earliest day's quantity and iterated forward in chronological order so the most recent days have the most influence on the final value; `alpha = 2 / (days + 1)` is the standard N-day EMA smoothing constant (the same convention used for N-day EMAs in time-series/trading contexts)
- `days_remaining` is computed the same way as before (`stock_kg / avg_daily_usage_kg`, rounded, `null` when there's no usage to project from) — only the usage-rate calculation changed, not the projection formula
- Note on the earlier version's structure: the previous single-aggregate query is gone entirely, since computing a genuine day-by-day series requires the pre-aggregation step (`usage` CTE) to happen *before* the cross join with `days` — an earlier draft of this query joined `order_items` directly against the day/product cross join and produced wildly inflated sums, because an unmatched day would still carry the order item's raw quantity through the `SELECT` list unless the order-items-to-orders join had already been resolved in its own step

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- No changes required — the endpoint's response shape (`avg_daily_usage_kg`, `days_remaining`) is unchanged, only how those values are derived server-side

### Urgency-Ranked Low-Stock Alert (SRS Section 4.3: Inventory Management)

**Problem:** `GET /api/products/low-stock` ordered results by raw `stock_kg ASC`, so a slow-moving product sitting at 2kg would always outrank a fast-moving product at 4kg in the alert, even if the 4kg product would run out first. The Week 18 planning notes had proposed netting out pending-order quantities from `stock_kg` as the fix for a related concern, but testing that against the actual order-creation code (`backend/src/routes/orders.js`) showed `stock_kg` is already decremented at order-placement time (the `order_placed` stock movement fires on `POST /api/orders`, not on completion) — so subtracting pending-order quantities again would have double-counted stock that was already removed from the balance. The real gap wasn't accounting for pending orders a second time; it was that the alert's *ordering* ignored sales velocity entirely.

**Backend — products route** (`backend/src/routes/products.js`):

- `GET /api/products/low-stock` now `LEFT JOIN`s a subquery computing each product's flat 30-day average daily usage (a lighter-weight calculation than the full EMA in `stock-forecast`, since this is only used for sort order on a banner, not displayed as a precise figure) and orders by `stock_kg / avg_daily_usage_kg ASC NULLS LAST`, falling back to `stock_kg ASC` as a secondary sort and for products with no recent sales to project from
- Each returned product now includes a `days_remaining` field alongside the existing columns

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- The low-stock banner's product list now appends `, ~Xd left` after the kg figure for each product when `days_remaining` is available, e.g. "Spicy Mixture (3kg, ~11d left) · Khara Boondi (4kg)" — and since the list itself now arrives pre-sorted by urgency from the backend, the most time-critical restock consistently appears first regardless of which product has the lower raw kg figure

---

## Frontend Architecture

### Updated Pages

- `src/pages/AdminReviews.jsx` — reviews fetch now scoped by `?rating=` via `starFilter`-dependent effect; unified `selectStarFilter` handler for both the distribution bars and filter pills; filter row always visible
- `src/pages/Orders.jsx` — low-stock banner shows `~Xd left` per product using the newly urgency-sorted `days_remaining` field

---

## Backend Architecture

### Updated Routes

- `GET /api/reviews` — now accepts `?rating=` (1–5) to filter server-side; validated the same way as `POST /api/reviews`'s rating field
- `GET /api/products/stock-forecast` — `avg_daily_usage_kg` is now an EMA over a generated per-day series (`alpha = 2 / (days + 1)`) instead of a flat mean; response shape unchanged
- `GET /api/products/low-stock` — now orders by projected `days_remaining` (flat 30-day velocity) instead of raw `stock_kg`; each row includes the computed `days_remaining`

---

## Project Planning

- The originally-planned "net out pending orders from stock_kg" feature was dropped after testing showed it was based on a misunderstanding of how `stock_kg` already works in this codebase (decremented at order-placement, not completion); worth remembering for future planning notes written from theory rather than from reading the order-creation code first
- The low-stock alert's velocity calculation is a flat 30-day average, not the EMA used in `stock-forecast` — intentionally simpler since it's only used for sort order on a banner; if the two ever need to agree exactly (e.g. a future feature shows the same days-remaining figure in both places) they should be unified into one shared calculation
- The EMA's `alpha` is derived purely from the requested `days` window; a future improvement could expose it as an independent tuning parameter so an administrator could make the forecast more or less reactive to short-term spikes without changing the window length used for other stats

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Exponential Moving Average as a Recency-Weighted Aggregate — `ema = alpha * qty + (1 - alpha) * ema` is a linear recurrence where each new term folds in the entire history exponentially decayed, giving a smooth, O(n)-to-compute alternative to a flat mean that responds faster to recent changes without needing to store or re-scan the full window on every update; `alpha = 2 / (N + 1)` is the closed-form constant that makes an EMA's effective "look-back" comparable to an N-day simple moving average
- SQL CTE Ordering as a Correctness Requirement, Not Just Style — the bug caught while building the per-day usage series (order_items joined directly against a product×day cross join produced inflated sums) demonstrates that in a multi-table `LEFT JOIN`, pre-aggregating a subquery (the `usage` CTE) before joining it to an unrelated cross product is not just cleaner SQL — moving the join condition earlier changes which rows exist to be joined against in the first place, and skipping that step silently produces wrong numbers rather than an error
- `generate_series` for Filling Sparse Time Series — real order data only has rows for days with actual sales; `generate_series(start_date, end_date, interval '1 day')` combined with a `LEFT JOIN` guarantees a row for every day including zero-sales days, which is required for a correct EMA (skipping zero days would silently treat "day had no sales" the same as "day didn't happen," inflating the average)
- Multi-Column `ORDER BY` with `NULLS LAST` for Tiered Ranking — `ORDER BY days_remaining ASC NULLS LAST, stock_kg ASC` expresses a two-tier sort in one clause: rank by urgency when it's computable, then fall back to a secondary criterion for rows where the primary metric doesn't apply, avoiding a `CASE`-based sort key or post-query re-sorting in JavaScript
- Testing Assumptions Against Implementation Before Building on Them — the pending-orders feature was abandoned specifically because reading `backend/src/routes/orders.js`'s stock-decrement logic revealed the planning note's premise was already false; this is the same "verify before recommending" discipline applied to planning notes as to any other claim about what the code does

---

## Evidence

- `backend/src/routes/reviews.js` — `GET /api/reviews` accepts `?rating=` with validation; behavior unchanged when omitted
- `backend/src/routes/products.js` — `GET /api/products/stock-forecast` rewritten around a `generate_series`-backed per-day usage CTE and JS-side EMA; `GET /api/products/low-stock` reordered by projected `days_remaining` with a `NULLS LAST` fallback
- `frontend/src/pages/AdminReviews.jsx` — `starFilter`-dependent reviews fetch; unified `selectStarFilter` handler; always-visible filter row
- `frontend/src/pages/Orders.jsx` — low-stock banner shows `~Xd left` per product
- Tested against a local Postgres instance with seeded orders across multiple products and dates: `reviews?rating=5` and `?rating=2` each correctly isolated their star level while `?rating=3` correctly returned an empty array against non-matching data; `?rating=6` correctly returned a 400; `stock-forecast` produced a materially different (and correctly weighted-toward-recent-days) `avg_daily_usage_kg` than the prior flat-average version on the same seeded data; `low-stock` correctly ranked a fast-moving 3kg product (11 days remaining) ahead of a slower-moving 4kg product (no projectable usage, sorted last via `NULLS LAST`) — confirming raw kg alone would have ranked them the other way; `npm run lint` and `npm run build` both pass with zero errors on the frontend; all seeded test data was removed from the local database after verification
- **Testing limitation:** as in Week 18, all three features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
