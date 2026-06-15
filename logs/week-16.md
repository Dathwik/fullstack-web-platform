# Week 16 Work Log (June 8 – June 14, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week introduced three features continuing the observability and operational intelligence theme begun in Week 15. The first was a per-order Stripe payment event history panel in the order detail view, completing the audit trail promised in the Week 15 planning notes by surfacing the webhook log filtered to each order's PaymentIntent. The second was a stock movement log — a new `stock_movements` database table that records every inventory change with a signed delta, change type, and a reference to the originating order, providing a full audit trail of where stock went and when. The third was order fulfillment time analytics — a `completed_at` timestamp column added to orders, populated automatically when an order transitions to Completed, and a new dashboard card on the Orders page showing average, median, fastest, and slowest fulfillment hours over the last 30 days.

---

## Technical Activities

### Per-Order Stripe Payment Event History (SRS Section 4.5: Reliability and Auditability)

**Problem:** The webhook event log added in Week 15 was only accessible as a global feed of the last 20 events on the Orders dashboard. When an administrator needed to diagnose a payment dispute for a specific order — for example, an order showing "Paid" in the database but with a disputed Stripe charge — there was no way to view which Stripe events were associated with that individual order without manually cross-referencing event IDs.

**Backend — payments route** (`backend/src/routes/payments.js`):

- Extended `GET /api/payments/webhook-events` to accept an optional `?payment_intent=<pi_id>` query parameter
- When `payment_intent` is provided: filters `webhook_events` using `WHERE payload->'data'->'object'->>'id' = $1 OR payload->>'id' = $1` — the first condition matches events where the PaymentIntent is the event's data object (e.g., `payment_intent.succeeded`); the second matches events where the PaymentIntent is the top-level event object itself (covering edge cases in Stripe's event schema)
- The per-order query returns events ordered `ASC` (oldest-first) so the timeline reads chronologically, unlike the global feed which is `DESC` (newest-first) for operational monitoring
- Without `payment_intent`: the original behaviour is preserved — last 20 global events, newest-first
- No new endpoint or migration required; the existing `webhook_events` table and JSONB indexes service both query shapes efficiently

**Frontend — OrderDetail page** (`frontend/src/pages/OrderDetail.jsx`):

- Added `stripeEvents` state; fetched via `useEffect` whenever `order.stripe_payment_intent` is set — the effect dependency is `order?.stripe_payment_intent` so it runs once when the order loads and does not re-run on unrelated re-renders
- The Payment section now displays the payment method label as "Online card" vs "COD" (previously hard-coded to "COD") and shows the truncated PaymentIntent ID in monospace below the payment status for quick reference
- A "Stripe payment events" section renders below the payment block when the order is a Stripe order and at least one event exists; each row shows the event type (green for `payment_intent.succeeded`), the truncated object ID, and the timestamp
- The section is hidden when `stripeEvents.length === 0`, so COD orders and Stripe orders with no logged events (e.g., test environments without Stripe configured) are unaffected

---

### Stock Movement Log (SRS Section 4.3: Inventory Management)

**Problem:** The system tracked current stock levels on each product, and orders deducted stock atomically, but there was no record of *why* stock changed or *when*. If an administrator noticed stock was lower than expected, there was no audit trail to determine whether the reduction came from an order, an order cancellation reversal, a manual restock, or a data entry error. Additionally, order cancellations previously did not restore stock at all — the `PATCH /:id/status` route only updated the order status without touching product inventory.

**Database — migration** (`database/migrations/007_add_stock_movements.sql`, `database/schema.sql`):

- New table `stock_movements`: `id UUID PK`, `product_id UUID NOT NULL FK products(ON DELETE CASCADE)`, `delta_kg DECIMAL(8,2) NOT NULL` (negative = stock removed, positive = stock returned or added), `type VARCHAR(30) NOT NULL CHECK ('order_placed' | 'order_restored' | 'manual_restock')`, `order_id UUID NULL FK orders(ON DELETE SET NULL)`, `created_at TIMESTAMPTZ DEFAULT NOW()`
- Two indexes: `stock_movements_product_id_idx` supports per-product history queries; `stock_movements_created_at_idx DESC` supports the global recent-movements feed used on the Products page
- `order_id` is nullable because `manual_restock` movements have no associated order; it uses `ON DELETE SET NULL` so a movement record is preserved in the audit log even after the originating order is deleted

**Backend — orders route** (`backend/src/routes/orders.js`):

- Modified `insertItemsWithStockCheck` helper: after each stock deduction (`UPDATE products SET stock_kg = stock_kg - $1`), inserts a row into `stock_movements` with `delta_kg = -quantity_kg` and `type = 'order_placed'`; the insert is inside the same database transaction as the stock update, so the movement record and the stock change are always consistent
- Modified `PATCH /api/orders/:id/status` to restore stock when transitioning to `Cancelled` — previously, cancelling an order left stock unchanged, which meant inventory was permanently under-reported for every cancelled order with tracked stock; now the route runs inside a transaction, iterates the order's items, restores `stock_kg + quantity_kg` for products where `stock_kg IS NOT NULL`, and inserts an `order_restored` movement record per item
- Modified `PATCH /api/orders/:id` (edit): the stock-restoration loop for old items now also inserts an `order_restored` movement per item; a conditional `INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM products WHERE id=$1 AND stock_kg IS NOT NULL)` avoids inserting movement records for products that do not use stock tracking
- Modified `DELETE /api/orders/:id`: same pattern as the edit route — each stock restoration insert is accompanied by an `order_restored` movement
- New endpoint `GET /api/orders/stock-movements` was not added; stock movements are surfaced through the products router (see below) to keep domain ownership clear

**Backend — products route** (`backend/src/routes/products.js`):

- Modified `PATCH /api/products/:id`: when `stock_kg` is present in the request body, fetches the current `stock_kg` before the update; after the update, if both old and new values are non-null and the delta is non-zero, inserts a `manual_restock` movement with `delta_kg = new_stock_kg - old_stock_kg`; movements are skipped when stock is being set from or to `null` (products switching between tracked and untracked inventory)
- New endpoint `GET /api/products/stock-movements?limit=20` — auth-protected, registered before the `/:id` GET to prevent route shadowing; JOINs `stock_movements` with `products` to return `product_name` alongside each movement; the `limit` parameter is capped at 100 server-side; returned fields: `id`, `product_name`, `delta_kg`, `type`, `order_id`, `created_at`

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- Added a `StockLog` component that fetches `GET /api/products/stock-movements?limit=30` on mount and renders a fixed-column grid (`1fr 70px 90px 90px`) showing product name, signed delta (green for positive, red for negative), movement type label, and timestamp
- Added a "Stock Log" tab alongside "Inventory" and "Sales Analytics" in the Products page tab switcher; the "+ Add" product button is hidden when the Stock Log tab is active since adding products is irrelevant there
- Movement types are mapped to human-readable labels with distinct colors: "Order placed" (red), "Stock restored" (green), "Manual restock" (blue)

---

### Order Fulfillment Time Analytics (SRS Section 4.4: Usability Requirements)

**Problem:** The dashboard provided per-day order counts and revenue over the last 7 days, but no information about how fast orders were being fulfilled. An administrator with a team handling preparation could not tell whether average fulfillment time was improving, nor identify whether a slowdown correlated with specific days or order volumes. There was also no timestamp recording when an order actually completed, making retrospective analysis impossible.

**Database — migration** (`database/migrations/008_add_completed_at.sql`, `database/schema.sql`):

- Added `completed_at TIMESTAMPTZ NULL` column to the `orders` table; null for all existing orders (their completion time is unknown) and for orders not yet completed
- Using `TIMESTAMPTZ` (timestamp with time zone) rather than `TIMESTAMP` because fulfillment time calculations use `EXTRACT(EPOCH FROM (completed_at - created_at))` — interval arithmetic in PostgreSQL correctly handles daylight saving transitions when both operands are timezone-aware

**Backend — orders route** (`backend/src/routes/orders.js`):

- Modified `PATCH /api/orders/:id/status` to conditionally set `completed_at = NOW()` when the new status is `Completed`; implemented by appending `, completed_at = NOW()` to the `UPDATE` string only for the `Completed` transition — this avoids adding a null write for other transitions and does not affect the status machine logic or the email notification flow
- New endpoint `GET /api/orders/fulfillment-stats?days=30` — auth-protected, registered before the `/:id` GET; queries `orders WHERE status = 'Completed' AND completed_at IS NOT NULL AND created_at >= CURRENT_DATE - ($1 days)::interval`; computes four statistics in a single pass using PostgreSQL aggregate functions: `AVG`, `MIN`, `MAX` of `(completed_at - created_at)` converted from seconds to hours via `EXTRACT(EPOCH FROM ...) / 3600`, and `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (completed_at - created_at))` for the median; all four values are rounded to one decimal place; the response also returns `count_completed` and the `days` parameter so the frontend can contextualise the numbers
- The `days` parameter is capped at 365 server-side; if no completed orders exist in the period, all four metric fields are `null` and `count_completed` is 0

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `fulfillmentStats` state; fetched on page mount alongside stats, analytics, and webhook events
- When `fulfillmentStats.count_completed > 0`, a fulfillment time card is rendered between the stats grid and the 7-day revenue chart — positioned there because it provides operational context alongside revenue data
- The card shows four metrics in a `1fr 1fr 1fr 1fr` grid: Avg, Median, Fastest, Slowest; each cell shows the hours value with a trailing "h" suffix, or "—" if null (which should not occur when `count_completed > 0` but is handled defensively)
- The label includes the period and order count so the administrator immediately knows the sample size: "Fulfillment time — last 30 days (12 orders)"
- The card is hidden entirely when `count_completed === 0` (no completed orders in the period) to avoid showing a card of four "—" values on a new installation

---

## Frontend Architecture

### Updated Pages

- `src/pages/Orders.jsx` — `fulfillmentStats` state; `GET /api/orders/fulfillment-stats` fetch on mount; fulfillment time card with Avg / Median / Fastest / Slowest grid
- `src/pages/OrderDetail.jsx` — `stripeEvents` state; `GET /api/payments/webhook-events?payment_intent=<id>` fetch when order is a Stripe order; payment method label updated to "Online card" vs "COD"; PaymentIntent ID displayed below payment status; "Stripe payment events" section with chronological event timeline
- `src/pages/Products.jsx` — `StockLog` component fetching `GET /api/products/stock-movements?limit=30`; "Stock Log" tab added to tab switcher; "+ Add" button hidden when on Stock Log tab

---

## Backend Architecture

### New Routes

- `GET /api/orders/fulfillment-stats` — auth-protected; AVG / MEDIAN / MIN / MAX fulfillment hours using PERCENTILE_CONT and EXTRACT(EPOCH); results null when no completed orders in period
- `GET /api/products/stock-movements` — auth-protected; last N stock movements joined with product names; ordered newest-first

### Updated Routes

- `GET /api/payments/webhook-events` — accepts optional `?payment_intent=<pi_id>`; per-PaymentIntent query uses JSONB path operators; returns events ASC when filtered, DESC when global
- `PATCH /api/orders/:id/status` — now runs inside a transaction; sets `completed_at = NOW()` when transitioning to `Completed`; restores stock and inserts `order_restored` movements for all items when transitioning to `Cancelled`
- `PATCH /api/orders/:id` (edit) — existing stock-restoration loop now also inserts `order_restored` movements per item; conditional on `stock_kg IS NOT NULL` using a subquery to avoid spurious movement records
- `DELETE /api/orders/:id` — same as edit: each stock restoration is accompanied by an `order_restored` movement
- `PATCH /api/products/:id` — fetches old `stock_kg` before update; inserts `manual_restock` movement with signed delta after update when both old and new values are non-null and delta is non-zero
- `insertItemsWithStockCheck` (shared helper) — inserts `order_placed` stock movement after each stock deduction; movement is inside the caller's transaction

### New Tables

- `stock_movements` — `product_id NOT NULL FK`, `delta_kg DECIMAL(8,2) NOT NULL`, `type CHECK ('order_placed' | 'order_restored' | 'manual_restock')`, `order_id NULL FK (ON DELETE SET NULL)`, `created_at TIMESTAMPTZ`; indexed on `product_id` and `created_at DESC`

### New Migrations

- `database/migrations/007_add_stock_movements.sql` — creates `stock_movements` table with indexes
- `database/migrations/008_add_completed_at.sql` — adds `completed_at TIMESTAMPTZ NULL` to `orders`

---

## Project Planning

- The fulfillment stats endpoint currently uses a 30-day default window; a future improvement would expose a period picker on the frontend (7 / 30 / 90 days) consistent with the product analytics UI
- The stock movement log records events going forward from Week 16; historical orders placed in Weeks 1–15 have no corresponding movement records since the table did not exist; a future improvement would backfill movements from `order_items` for historical completed and active orders
- The `PATCH /api/orders/:id/status` route now restores stock on cancellation; existing cancelled orders (placed before this week) did not have their stock restored when they were cancelled, so the `stock_kg` values for products may understate available inventory for any product that had cancelled orders in prior weeks; a one-time correction query would be: `UPDATE products SET stock_kg = stock_kg + (SELECT COALESCE(SUM(oi.quantity_kg), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'Cancelled' AND oi.product_id = products.id) WHERE stock_kg IS NOT NULL`
- The Stripe payment history in OrderDetail only covers events in the local `webhook_events` table; a future improvement would fall back to the Stripe API (using `stripe.paymentIntents.retrieve()`) to surface the full Stripe-side event history even if local webhook delivery was missed

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ...)` — an ordered-set aggregate function that computes the exact median (50th percentile) of an interval distribution using linear interpolation between the two middle values when the count is even; contrasted with `PERCENTILE_DISC`, which returns the nearest actual value rather than interpolating — `CONT` is preferred here because fulfillment hours can take any real value and an interpolated median is more representative than a discrete one
- Signed Deltas in Audit Logs — representing stock changes as signed `delta_kg` values (negative for deductions, positive for restorations) rather than as separate `deducted` and `restored` columns; a signed delta can be summed directly over any time window to derive the net inventory change (`SELECT SUM(delta_kg) AS net_change FROM stock_movements WHERE product_id = $1`) without needing to distinguish event types in the aggregation
- `INTERVAL` Arithmetic on Timestamps — subtracting two `TIMESTAMPTZ` columns (`completed_at - created_at`) produces a PostgreSQL `INTERVAL` value; `EXTRACT(EPOCH FROM interval)` converts it to fractional seconds as a float, which can then be divided by 3600 to get hours; this is more precise than `DATE_PART` (which truncates to integer for some units) and timezone-aware because both operands are `TIMESTAMPTZ`
- Conditional SQL Clauses in Application Code — appending `, completed_at = NOW()` to the UPDATE string only when transitioning to `Completed` avoids a null write for other transitions; this pattern avoids the alternative of adding `completed_at = CASE WHEN $1 = 'Completed' THEN NOW() END` to every status update, which would always write the column (with null for non-Completed statuses)
- JSONB Path Operators for Webhook Filtering — `payload->'data'->'object'->>'id'` traverses the nested Stripe event JSON using the `->` operator (returns JSONB) and `->>` (returns text for the final key) to extract the PaymentIntent ID from the event's data object without deserialising the full payload in application code; the `OR payload->>'id' = $1` clause handles the case where the PaymentIntent is the root-level object of the event
- `ON DELETE SET NULL` vs `ON DELETE CASCADE` — `stock_movements.order_id` uses `ON DELETE SET NULL` rather than `CASCADE` because the movement record itself is the audit evidence; deleting the order should not delete the record of the stock change, only the reference to which order caused it; contrasted with `order_items` which uses `CASCADE` because an item with no parent order has no meaning and should not be retained

---

## Evidence

- `backend/src/routes/payments.js` — `GET /api/payments/webhook-events` extended with `?payment_intent=` filter; JSONB path query with `->` and `->>` operators; ASC ordering for per-order timeline
- `backend/src/routes/orders.js` — `insertItemsWithStockCheck` inserts `order_placed` movements; `PATCH /:id/status` runs in transaction, sets `completed_at`, restores stock on Cancelled; `PATCH /:id` (edit) inserts `order_restored` movements; `DELETE /:id` inserts `order_restored` movements; `GET /api/orders/fulfillment-stats` with PERCENTILE_CONT and EXTRACT(EPOCH)
- `backend/src/routes/products.js` — `PATCH /:id` pre-fetches old stock, inserts `manual_restock` movement; `GET /api/products/stock-movements` endpoint with JOIN
- `database/migrations/007_add_stock_movements.sql` — `stock_movements` table with CHECK constraint, nullable FK, dual indexes
- `database/migrations/008_add_completed_at.sql` — `ALTER TABLE orders ADD COLUMN completed_at TIMESTAMPTZ NULL`
- `database/schema.sql` — `completed_at` column in orders; `stock_movements` table definition
- `frontend/src/pages/Orders.jsx` — `fulfillmentStats` state; `GET /api/orders/fulfillment-stats` fetch; fulfillment card with Avg/Median/Fastest/Slowest grid; card hidden when count_completed === 0
- `frontend/src/pages/OrderDetail.jsx` — `stripeEvents` state; conditional fetch on `stripe_payment_intent`; payment label shows method; truncated intent ID in monospace; Stripe payment events timeline section
- `frontend/src/pages/Products.jsx` — `StockLog` component; movement type labels and colors; "Stock Log" tab; Add button hidden on Stock Log tab
- Tested: fulfillment card hidden on fresh install with no completed orders; appears with correct counts and hours after completing a test order; per-order Stripe events section hidden for COD orders; stock movement log populates correctly when creating and editing orders; cancelling an order via status transition now restores stock and creates an order_restored movement; manual stock edit creates a manual_restock movement with signed delta; production build succeeds

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
