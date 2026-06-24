# Week 17 Work Log (June 15 – June 21, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week introduced three features under the theme of customer intelligence and operational tuning. The first was an admin reviews dashboard — a new `/reviews` page giving the administrator a consolidated view of all customer reviews with a star-distribution chart and average rating, backed by two new API endpoints. The second was a per-product reorder point system — a new `reorder_point_kg` column that lets the administrator configure a product-specific stock alert threshold rather than relying on the global 5 kg default; the low-stock alert and product cards now use each product's own threshold when set. The third completed the Week 16 planning note for a fulfillment stats period picker — the fulfillment card on the Orders dashboard now exposes interactive 7 / 30 / 90 day selection, each re-fetching from the server, so fulfillment time can be viewed across different time horizons.

---

## Technical Activities

### Admin Reviews Dashboard (SRS Section 4.4: Usability Requirements)

**Problem:** Customer reviews were submitted via the public `TrackOrder` page and were accessible in the `OrderDetail` view for each individual order, but there was no consolidated admin view of all reviews. An administrator wanting to gauge overall customer satisfaction had to navigate to each completed order individually. There was also no aggregate data — no average rating, no distribution across star levels — making it impossible to identify patterns in feedback without manually tallying results.

**Backend — reviews route** (`backend/src/routes/reviews.js`):

- Added `GET /api/reviews/stats` — auth-protected, registered before the parameterless `GET /` route; returns `{ avg_rating, total_count, distribution }` where `distribution` is an object mapping each star value (1–5) to its count; `avg_rating` is computed with `ROUND(AVG(rating)::numeric, 1)` to ensure one decimal place regardless of PostgreSQL's default numeric precision; the `::numeric` cast before `ROUND` is required because PostgreSQL's built-in `AVG` returns a `double precision` for integer inputs, and `ROUND` with two arguments is only defined for `numeric` — attempting `ROUND(AVG(rating), 1)` without the cast produces an operator-not-found error
- Modified `GET /api/reviews` to also return `o.phone` alongside the existing `r.*` and `o.customer_name`; the `phone` field is used in the reviews dashboard to distinguish customers with the same name

**Frontend — AdminReviews page** (`frontend/src/pages/AdminReviews.jsx`):

- New page component; fetches `GET /api/reviews/stats` and `GET /api/reviews` in parallel on mount via `Promise.all`-style independent effects
- Rating distribution card: a large average rating display on the left (displayed to one decimal place, rounded to the nearest integer for the star icons) and horizontal `StarBar` sub-components on the right, one per star level from 5 down to 1; each bar's fill width is computed as `(count / total) * 100%` with a CSS `transition: width 0.3s` so the bars animate in after data loads; the raw count is shown to the right of each bar
- Review cards are full-width, tappable (navigate to the order detail page), and show customer name, phone, star rating icons (filled ★ / empty ☆), date, optional comment, and a truncated order ID for reference
- When `total_count === 0`, both the stats card and the list show an empty state rather than rendering an empty chart

**Routing** (`frontend/src/App.jsx`):

- Added `<Route path="/reviews" element={<AdminReviews />} />` inside the protected route group
- Added a "Reviews" button to the Orders page header (between "Products" and "Select") for navigation

---

### Per-Product Reorder Points (SRS Section 4.3: Inventory Management)

**Problem:** The existing low-stock alert on the dashboard used a fixed global threshold of 5 kg, treating every product identically. A high-volume product (e.g., one that sells 10 kg per day) should trigger a restock alert much earlier than a slow-moving product. Administrators working with a diverse product range had to either set the global threshold too high (producing false positives for slow products) or too low (missing genuine restock needs for fast-moving products). There was no per-product configuration.

**Database — migration** (`database/migrations/009_add_reorder_point.sql`, `database/schema.sql`):

- Added `reorder_point_kg DECIMAL(8,2) NULL` to the `products` table; null means "use the global default threshold" (5 kg unless overridden by the query parameter); a product-specific value overrides the default entirely for that product
- No index is needed — the column is only read in the `WHERE` clause via `COALESCE(reorder_point_kg, $1)`, and the table is small enough (products catalogue) that a sequential scan is always optimal

**Backend — products route** (`backend/src/routes/products.js`):

- Modified `GET /api/products/low-stock`: changed the `WHERE` clause from `stock_kg < $1` (global threshold) to `stock_kg < COALESCE(reorder_point_kg, $1)`; `COALESCE` selects the product's own threshold when set and falls back to the `$1` parameter (defaulting to 5 if not provided); this is a single-character-per-product discrimination done in SQL without any application-layer branching
- Modified `PATCH /api/products/:id`: added `reorder_point_kg` to the dynamic field builder alongside `name`, `price_per_kg`, `is_available`, and `stock_kg`; the existing "fetch old stock before update" path is unrelated to `reorder_point_kg` since no movement log is needed for a threshold change

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- Updated `stockLabel` helper: the "Low" colour threshold now uses `COALESCE(product.reorder_point_kg, 5)` — matching the backend logic exactly — so the low stock warning on the product card is consistent with the dashboard alert
- Added `editingReorderId` and `reorderDraft` state alongside the existing stock editing state
- Added `startReorderEdit` and `saveReorder` handlers mirroring the existing `startStockEdit` / `saveStock` pattern
- Added a "Reorder" row beneath the Stock row in each product card; the row is only rendered when `product.stock_kg !== null` (reorder points are irrelevant for products without stock tracking); in display mode, shows "alert at Xkg" in amber when a reorder point is set, or "not set" in grey; in edit mode, a yellow-bordered input appears (visually distinct from the blue-bordered stock input); blank = clear the reorder point (set to null)

---

### Fulfillment Stats Period Picker (SRS Section 4.4: Usability Requirements)

**Problem:** The fulfillment time card added in Week 16 was always computed over the last 30 days. An administrator who wanted to check whether fulfillment speed had improved over the past week — or who wanted to see historical patterns over the last 90 days — had no way to adjust the window without changing the default. This was flagged in the Week 16 project planning notes as a pending improvement.

**Backend** (no changes required):

- The `GET /api/orders/fulfillment-stats?days=<n>` endpoint already accepted a `days` query parameter capped at 365; the frontend simply was not exposing a way to change it from the default of 30

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `fulfillmentDays` state (default 30)
- Separated the fulfillment stats fetch into its own `useEffect` with `[fulfillmentDays]` as the dependency array, replacing the previous single mount-only effect; when the user selects a new period, `fulfillmentStats` is reset to `null` immediately to show a "Loading…" placeholder before the new data arrives, preventing stale data from appearing under a new label
- Added three period-selector buttons (7d / 30d / 90d) inside the fulfillment card header, styled as small pill buttons consistent with the period selectors on the product analytics panel; the active period is shown with a filled black background
- The fulfillment card is now always rendered (previously hidden when `count_completed === 0`); when no completed orders exist in the selected period, it shows "No completed orders in this period" inside the card body rather than hiding the card entirely — this way the period selector remains visible so the administrator can try a wider window

---

## Frontend Architecture

### New Pages

- `src/pages/AdminReviews.jsx` — stats card with `StarBar` chart component; review cards linking to order detail; parallel data fetching

### Updated Pages

- `src/pages/Orders.jsx` — "Reviews" nav button in header; `fulfillmentDays` state; `[fulfillmentDays]` effect dependency; fulfillment card always rendered; period picker inside card header; "No completed orders" placeholder when count is zero
- `src/pages/Products.jsx` — `stockLabel` uses per-product reorder threshold; `editingReorderId` / `reorderDraft` state; `startReorderEdit` / `saveReorder` handlers; "Reorder" row in each product card; hidden for products without stock tracking

---

## Backend Architecture

### New Routes

- `GET /api/reviews/stats` — auth-protected; `AVG(rating)::numeric` with `ROUND(..., 1)` for consistent decimal precision; per-star `COUNT` via `GROUP BY rating`; distribution object keyed 1–5

### Updated Routes

- `GET /api/reviews` — now also returns `o.phone` alongside `r.*` and `o.customer_name`
- `GET /api/products/low-stock` — `WHERE stock_kg < COALESCE(reorder_point_kg, $1)` — per-product threshold with global fallback
- `PATCH /api/products/:id` — `reorder_point_kg` added to dynamic field builder

### New Migrations

- `database/migrations/009_add_reorder_point.sql` — `ALTER TABLE products ADD COLUMN reorder_point_kg DECIMAL(8,2) NULL`

---

## Project Planning

- The reviews dashboard currently shows all reviews in a single list ordered by date; a future improvement would add filtering by star rating (e.g., "show only 1-star reviews") to help triage negative feedback
- The `GET /api/reviews/stats` endpoint computes stats across all reviews ever submitted with no time filter; a `?days=` parameter would allow trending (e.g., "average rating this month vs. last month")
- The reorder point is stored as an absolute kg threshold; a future improvement could express it as "days of stock" computed from the product's average daily sales (derived from `order_items` aggregation), automatically adjusting the threshold as sales velocity changes
- The fulfillment stats card now always shows even when empty; the period picker allows finding the first window that has data, but a future improvement would show the count of completed orders alongside the period label so the administrator knows the statistical confidence level at a glance (already returned as `count_completed` by the API, but not shown in the label when the card renders empty)

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- `ROUND(AVG(rating)::numeric, 1)` — PostgreSQL's `ROUND(x, n)` function with two arguments is overloaded: for `double precision` inputs it rounds to the nearest integer only (the two-argument form is not defined for `double precision`); casting to `numeric` before calling `ROUND` enables decimal precision control; `AVG` of integer columns returns `double precision` by default, making the explicit `::numeric` cast necessary — this is a PostgreSQL type-system subtlety that produces an operator-not-found error if omitted
- `COALESCE` for Per-Row Defaults — using `COALESCE(reorder_point_kg, $1)` to express "use this row's value if set, otherwise use the parameter" in a single SQL expression; this moves the branching into the query planner rather than the application layer, allowing PostgreSQL to evaluate the condition per row without round-trips; contrasted with a two-query approach (fetch all products, filter in application code) which would require loading all rows into memory
- React `useEffect` Dependency Arrays — splitting a single mount-only `useEffect` into two effects with different dependency arrays: the stable data (stats, analytics, low-stock, webhook events) remains in the `[]`-dependency effect and runs once; the fulfillment stats fetch is in a `[fulfillmentDays]`-dependency effect and re-runs whenever the selected period changes; resetting state to `null` inside the effect before the fetch provides a loading placeholder and prevents displaying stale data under a new label
- Star Chart as a Proportion — the `StarBar` component computes `pct = Math.round((count / total) * 100)` and maps it to a `width: ${pct}%` CSS property; the chart is entirely responsive because the bar container fills its parent (no fixed pixel widths) and the percentage width scales automatically to any viewport
- SQL Aggregate `GROUP BY` vs. Per-Row Calculation — the `GET /api/reviews/stats` endpoint uses a single `GROUP BY rating` query to get per-star counts in one pass, then a second `AVG` query for the overall average (which `GROUP BY rating` would not provide directly without a subquery); this two-query approach is clearer than a single query with window functions or `FILTER` clauses and is efficient given the expected small size of the reviews table

---

## Evidence

- `backend/src/routes/reviews.js` — `GET /api/reviews/stats` with `ROUND(AVG(rating)::numeric, 1)` and `GROUP BY rating`; `GET /api/reviews` updated to return `o.phone`
- `backend/src/routes/products.js` — `GET /api/products/low-stock` with `COALESCE(reorder_point_kg, $1)`; `PATCH /api/products/:id` with `reorder_point_kg` in dynamic fields
- `database/migrations/009_add_reorder_point.sql` — `ALTER TABLE products ADD COLUMN reorder_point_kg DECIMAL(8,2) NULL`
- `database/schema.sql` — `reorder_point_kg` column in products table
- `frontend/src/pages/AdminReviews.jsx` — `StarBar` component; rating distribution card; review card list with order navigation; empty state handling
- `frontend/src/App.jsx` — `/reviews` route added to protected group; `AdminReviews` imported
- `frontend/src/pages/Orders.jsx` — "Reviews" button in header; `fulfillmentDays` state; `[fulfillmentDays]` useEffect; period picker buttons; card always rendered; "No completed orders" placeholder
- `frontend/src/pages/Products.jsx` — `stockLabel` uses per-product threshold; `editingReorderId` state; "Reorder" row with amber edit mode; hidden when stock not tracked
- Tested: reviews stats card shows correct average and bar proportions; star bars animate to correct widths; clicking a review card navigates to the order detail; empty state renders correctly before any reviews are submitted; reorder point can be set, cleared, and saved; products without stock tracking hide the reorder row; low stock alert uses per-product threshold when set; fulfillment period picker re-fetches on selection; "No completed orders" placeholder shows when switching to a window with no data; production build succeeds

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
