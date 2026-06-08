# Week 15 Work Log (June 1 – June 7, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week introduced three features focused on operational efficiency and system observability. The first was a bulk order status update system that allows an administrator to select multiple orders from the list and advance or cancel them in a single action, replacing repetitive one-at-a-time status changes. The second was a top customers report that surfaces the highest-value customers by lifetime spend over a configurable period, using a SQL Common Table Expression with a window function to rank results. The third was a Stripe webhook event log that records every incoming webhook event in a new database table, deduplicates Stripe retries using PostgreSQL's `ON CONFLICT DO NOTHING` idempotency mechanism, and exposes the log to the admin dashboard. All three features extend the system's operational surface without adding user-facing complexity.

---

## Technical Activities

### Bulk Order Status Actions (SRS Section 4.4: Usability Requirements)

**Problem:** With a growing order volume, advancing orders from "Received" to "In Preparation" required the administrator to open each order card individually and tap "Start". On busy mornings with ten or more new orders, this was friction-heavy. There was no way to batch-acknowledge a set of orders that all arrived overnight.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Added `PATCH /api/orders/bulk-status` — auth-protected, registered before all parameterised `/:id` routes to prevent Express route shadowing
- Accepts `{ order_ids: [...uuid strings...], status: 'In Preparation' | 'Cancelled' }` in the request body; only these two target statuses are accepted for bulk operations since "Completed" requires individual verification
- SQL: `UPDATE orders SET status=$1::order_status, updated_at=NOW() WHERE id = ANY($2::uuid[]) AND status = ANY($3::order_status[]) RETURNING id` — the `ANY($n::uuid[])` clause passes the JavaScript array directly to PostgreSQL as a native array parameter; PostgreSQL evaluates it as a single `UPDATE` statement, which is atomic at the statement level without requiring an explicit transaction
- The `AND status = ANY($3::order_status[])` guard lists the valid source statuses for the requested transition — for both "In Preparation" and "Cancelled" the valid source is `['Received']` — so orders already in another status are silently excluded from the update rather than causing an error
- The `RETURNING id` clause provides the set of actually-updated order IDs; the response body `{ updated: count, skipped: count }` is computed by comparing the returned IDs against the input array, giving the frontend feedback on how many orders were processed versus skipped

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `selectMode` (bool) and `selectedIds` (`Set<string>`) state; select mode is toggled by a "Select" button in the page header that turns red with "Cancel" text when active
- In select mode, each order card renders a checkbox at the leading edge; clicking the card body also toggles selection rather than navigating to the detail page, so the administrator can select orders with a single tap rather than having to hit a small checkbox target
- Selected cards are rendered with a blue tinted background (`#f0f7ff`) and a blue border (`#93c5fd`) to provide clear visual feedback; the individual per-card "Start" and "Cancel" quick-action buttons are hidden during select mode to avoid confusion with the bulk action path
- A fixed-position floating action bar appears at the bottom of the viewport when one or more orders are selected — positioned with `position: fixed; bottom: 1.25rem; left: 50%; transform: translateX(-50%)` so it overlays the order list without shifting layout; it shows the selection count and "Start all" / "Cancel all" / dismiss controls
- After a bulk action completes the selection state is cleared, select mode exits, and the order list silently re-fetches so the updated statuses are immediately reflected

---

### Top Customers Report (SRS Section 4.4: Usability Requirements)

**Problem:** The system had no aggregate view of which customers were responsible for the most revenue or orders. An administrator managing loyalty outreach or planning capacity had to manually cross-reference the order list to identify repeat customers.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Added `GET /api/orders/top-customers?limit=10&days=90` — auth-protected, registered before the `/:id` GET to prevent route shadowing
- SQL uses a CTE (`WITH customer_totals AS (...)`) to first aggregate per phone number, then apply a `RANK() OVER (ORDER BY total_revenue DESC)` window function in the outer `SELECT`; grouping by phone is the correct identity key because phone is mandatory on every order (both guest and registered), while `customer_id` is null for guest orders — grouping by `customer_id` would treat each guest order as a different customer
- `MAX(o.customer_name)` selects the most recently used display name for each phone number rather than a fixed stored name, since guest customers may spell their name differently across orders; this is an acceptable approximation for a reporting view
- `WHERE o.status <> 'Cancelled'` excludes cancelled orders from revenue totals, consistent with the analytics endpoints added in Weeks 13 and 14
- Both `days` (capped at 365) and `limit` (capped at 50) are validated server-side to prevent runaway queries; the frontend requests `limit=5&days=90` as the default view
- The CTE encapsulates the aggregation logic in a named subquery, keeping the outer SELECT readable and allowing the window function to operate on the already-aggregated rows rather than on raw order rows

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `topCustomers` and `showTopCustomers` state; the data is fetched lazily — only when the administrator first expands the collapsible "Top customers — last 90 days" card, so it does not add a network request to the already dense page-load waterfall
- Once fetched, the data is cached in component state so subsequent expand/collapse toggles are instant; a fresh fetch would only occur on a full page reload
- Rendered as a grid (`gridTemplateColumns: '20px 1fr auto'`) showing rank, customer name with phone and last order date as secondary text, and total revenue; the rank badge reuses the `RANK()` value from the SQL response rather than deriving it client-side

---

### Stripe Webhook Event Log

**Problem:** The existing Stripe webhook handler processed `payment_intent.succeeded` events and updated the database, but never recorded that an event had been received. If a payment was marked as received but the order showed "Unpaid" due to a race condition or a retried webhook, there was no audit trail to diagnose the discrepancy. Additionally, Stripe may retry a webhook up to five times if the endpoint returns a non-2xx response; without idempotency protection, a retried event would redundantly re-run the `UPDATE orders` query.

**Database — migration** (`database/migrations/006_add_webhook_events.sql`, `database/schema.sql`):

- New table `webhook_events`: `id UUID PK`, `event_id VARCHAR(100) UNIQUE NOT NULL`, `event_type VARCHAR(50) NOT NULL`, `payload JSONB NOT NULL`, `created_at TIMESTAMPTZ DEFAULT NOW()`
- The `UNIQUE` constraint on `event_id` is the idempotency mechanism — Stripe's event ID is stable across retries, so a second attempt to insert the same event will be caught by the constraint
- `payload JSONB NOT NULL` stores the full Stripe event object for debugging; JSONB is used rather than TEXT or VARCHAR because it validates that the stored value is valid JSON at write time and enables future indexed queries against specific fields using PostgreSQL's JSON operators (`->`, `->>`, `@>`)
- A `DESC` index on `created_at` (`webhook_events_created_at_idx`) supports the `ORDER BY created_at DESC LIMIT 20` query in the admin endpoint without a sequential scan as the event log grows

**Backend — payments route** (`backend/src/routes/payments.js`):

- Modified `webhookHandler` to `INSERT INTO webhook_events (...) VALUES (...) ON CONFLICT (event_id) DO NOTHING RETURNING id` before processing the event; `RETURNING id` distinguishes a fresh insert (one row returned) from a duplicate (zero rows returned)
- If `rowCount === 0` (duplicate), `isNew` is false and the `payment_intent.succeeded` handler block is skipped entirely — the webhook is acknowledged with `{ received: true }` but no state mutation occurs; this makes the webhook handler fully idempotent without needing a separate "seen events" check
- If the `INSERT` itself throws (e.g., table not yet migrated), the error is caught and logged to `console.error` rather than letting it propagate; `isNew` defaults to `true` so the event is still processed — the log insert is best-effort and does not block the payment flow
- Added `GET /api/payments/webhook-events` — auth-protected (uses `requireAuth`); returns the last 20 events from `webhook_events` ordered newest-first; the `SELECT` extracts `payload->'data'->'object'->>'id'` as `object_id` using JSONB operators so the frontend can display the associated Stripe object ID (payment intent or charge ID) without deserialising the full payload

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Fetches `GET /api/payments/webhook-events` on page mount alongside stats; errors are silently swallowed so the dashboard renders normally when Stripe is not configured
- When the response contains at least one event, a "Recent payment events" card is rendered below the top customers panel; it shows the last five events with event type (green-highlighted for `payment_intent.succeeded`), the Stripe object ID truncated to 20 characters, and the timestamp
- The card is hidden when `webhookEvents.length === 0` so it does not appear on installations that do not use Stripe

---

## Frontend Architecture

### Updated Pages

- `src/pages/Orders.jsx` — `selectMode`, `selectedIds`, `bulkWorking` state for multi-select; `topCustomers`, `showTopCustomers` state for collapsible customer report; `webhookEvents` state; `loadTopCustomers`, `toggleSelect`, `exitSelectMode`, `bulkAdvance`, `bulkCancel` handlers; Top Customers collapsible card; Recent payment events card; floating bulk action bar; "Select" / "Cancel" toggle in header; per-card checkboxes and blue selection highlight; per-card action buttons hidden during select mode

---

## Backend Architecture

### New Routes

- `PATCH /api/orders/bulk-status` — auth-protected, batch status update using `ANY($n::uuid[])` array parameter
- `GET /api/orders/top-customers` — auth-protected, CTE + RANK window function, grouped by phone
- `GET /api/payments/webhook-events` — auth-protected, last 20 webhook events with JSONB field extraction

### Updated Routes

- `POST /api/payments/webhook` (handler function) — idempotent event log insert with `ON CONFLICT (event_id) DO NOTHING` before processing; skips processing on duplicate events

### New Tables

- `webhook_events` — `event_id UNIQUE`, `payload JSONB`, `created_at` index; idempotency store and audit log for all Stripe webhook events

### New Migrations

- `database/migrations/006_add_webhook_events.sql` — creates `webhook_events` table and `created_at DESC` index

---

## Project Planning

- The bulk status action currently supports only "In Preparation" and "Cancelled" as targets; a future improvement could allow bulk completion of "In Preparation" orders for high-throughput days
- The top customers query groups by phone number; a future improvement would merge phone-identified guests with registered customer accounts using a `COALESCE(customer_id, phone)` identity strategy so repeat customers who later register are counted as a single identity
- The webhook event log retains all events indefinitely; a future improvement would add a scheduled cleanup job to delete events older than 90 days to prevent unbounded table growth
- With the webhook log in place, the system now has an audit trail for all payment events; a future improvement would surface per-order Stripe event history in `OrderDetail.jsx` for the admin to diagnose payment disputes

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- PostgreSQL Array Parameters (`ANY($n::uuid[])`) — passing a JavaScript array directly as a typed PostgreSQL array parameter to express a multi-value `WHERE id IN (...)` predicate in a single parameterised query; `ANY` with a cast to `uuid[]` avoids the dynamic string interpolation of `IN (id1, id2, ...)` which would be vulnerable to injection and cannot be parameterised with the standard placeholder syntax
- Statement-Level Atomicity — a single `UPDATE ... WHERE id = ANY(...)` statement is atomic at the statement level in PostgreSQL without an explicit `BEGIN/COMMIT`; either all qualifying rows are updated or none are, so there is no partial failure state where some orders advance and others do not within the same batch request
- Common Table Expressions (CTEs) — using `WITH customer_totals AS (SELECT ... GROUP BY phone)` to name and materialise an intermediate aggregation result; the outer `SELECT` then applies the `RANK()` window function over the CTE's output, separating the aggregation logic from the ranking logic and making both independently readable
- Window Functions (`RANK() OVER`) — applying `RANK() OVER (ORDER BY total_revenue DESC)` to assign a rank to each customer without collapsing rows the way `GROUP BY` does; `RANK()` assigns the same rank to ties and skips subsequent ranks (e.g. 1, 2, 2, 4), contrasted with `ROW_NUMBER()` which assigns unique sequential numbers regardless of ties
- PostgreSQL JSONB Type — storing the full Stripe event object as `JSONB` rather than `TEXT`; JSONB validates JSON at write time, stores a binary-parsed representation for faster read access, and supports indexed path operators (`->`, `->>`, `@>`) that allow future queries against specific fields without deserialising the string on the application side
- `INSERT ... ON CONFLICT DO NOTHING` — using a `UNIQUE` constraint on `event_id` as the idempotency key; `ON CONFLICT DO NOTHING` suppresses the unique-violation error and returns `rowCount = 0` rather than throwing, allowing the application to distinguish "new event" (rowCount = 1) from "duplicate event" (rowCount = 0) and skip re-processing accordingly; this is the standard pattern for at-least-once delivery with exactly-once semantics

---

## Evidence

- `backend/src/routes/orders.js` — `PATCH /api/orders/bulk-status` with `ANY($n::uuid[])` batch update; `GET /api/orders/top-customers` with CTE and RANK window function
- `backend/src/routes/payments.js` — `webhookHandler` modified to log events with `ON CONFLICT (event_id) DO NOTHING`; `GET /api/payments/webhook-events` endpoint
- `database/migrations/006_add_webhook_events.sql` — `webhook_events` table with UNIQUE `event_id`, JSONB `payload`, and `created_at DESC` index
- `database/schema.sql` — `webhook_events` table added
- `frontend/src/pages/Orders.jsx` — multi-select mode with checkboxes, selection highlight, floating bulk action bar; Top Customers collapsible card; Recent payment events card
- Tested: select mode toggles correctly; selecting orders highlights them with blue border; floating bar shows correct count; "Start all" advances all Received orders in the selection and skips non-Received; "Cancel all" requires confirmation; top customers card fetches lazily on first expand and caches data; customers ranked by revenue descending; webhook events card renders only when events exist; `payment_intent.succeeded` events highlighted in green; duplicate webhook event with the same event_id is rejected by the UNIQUE constraint and returns rowCount=0, skipping re-processing; frontend production build succeeds

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
