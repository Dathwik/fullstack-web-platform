# Week 10 Work Log (Apr 27 – May 3, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week continued Phase 2 development with three features: a customer review system, a low stock alert panel on the admin dashboard, and a printable packing slip from the order detail page. The review system addresses the last named enhancement from SRS Section 5. The low stock panel and packing slip improve daily operational workflow by surfacing inventory warnings without navigation and enabling physical order fulfilment directly from the web interface.

---

## Technical Activities

### Customer Review System (SRS Section 5: Customer reviews)

**Database migration** (`database/migrations/003_add_reviews.sql`):

- Created a `reviews` table with columns: `id UUID` (primary key, generated), `order_id UUID` (foreign key referencing `orders(id)` with `ON DELETE CASCADE`), `rating SMALLINT` with a `CHECK (rating >= 1 AND rating <= 5)` constraint, `comment TEXT` (nullable), and `created_at TIMESTAMP`
- Added a `UNIQUE (order_id)` constraint so each order can receive at most one review — enforced at the database level, not only in application logic
- The `ON DELETE CASCADE` means reviews are automatically removed when the parent order is deleted, maintaining referential integrity without orphaned records
- `database/schema.sql` updated to include the `reviews` table definition for fresh installations

**Backend — reviews route** (`backend/src/routes/reviews.js`):

- Created a new router mounted at `/api/reviews` in `app.js`
- `POST /api/reviews` — public endpoint (no auth required):
  - Validates that `order_id` and `rating` are present and rating is between 1 and 5
  - Queries the `orders` table to confirm the order exists and has status `Completed`; returns a `400` if the order is still active or a `404` if it does not exist
  - Inserts the review and returns the created record as `201`
  - Catches PostgreSQL error code `23505` (unique constraint violation) and returns a clean `409 Conflict` response instead of leaking a raw database error
- `GET /api/reviews/order/:order_id` — public endpoint that returns the review for a given order or `404` if none exists
- `GET /api/reviews` — auth-protected admin endpoint that joins the `orders` table to return all reviews with `customer_name`, ordered by `created_at DESC`
- Router registered in `backend/src/app.js` after the existing routes via `app.use('/api/reviews', require('./routes/reviews'))`

**Backend — orders route** (`backend/src/routes/orders.js`):

- Updated `GET /api/orders/track/:id` to `LEFT JOIN reviews r ON r.order_id = o.id` and include `row_to_json(r.*) AS review` in the `SELECT` list, so the public tracking endpoint returns any existing review in a single query
- The `GROUP BY` clause was extended to `GROUP BY o.id, r.id` to satisfy the aggregation requirement when joining the reviews table

**Frontend — TrackOrder page** (`frontend/src/pages/TrackOrder.jsx`):

- Added a `StarPicker` sub-component that renders five clickable star buttons and tracks a hovered state for visual feedback; stars fill amber (`#f59e0b`) up to the hovered or selected index, and grey beyond it
- When an order's status is `Completed` and `order.review` is `null`, a review form is shown below the order summary: the `StarPicker`, an optional comment textarea, a submit button, and an error message area
- On submit, `POST /api/reviews` is called with `{ order_id, rating, comment }`; on success the component calls `lookupOrder` again so the order data refreshes and the review section switches from form to "thank you" view automatically
- When `order.review` is already set (returned from the `/track/:id` endpoint), the section instead displays the existing star rating rendered as filled/empty Unicode stars and the comment text
- Review state (`rating`, `comment`, `reviewSubmitting`, `reviewError`) is reset whenever a new order lookup is triggered, preventing stale state from a previous search

**Frontend — OrderDetail page** (`frontend/src/pages/OrderDetail.jsx`):

- Added `review` state (initially `null`) and a `useEffect` that calls `GET /api/reviews/order/:id` on mount; on success the review is stored, on failure (404 or network error) the state remains `null`
- In the read-only view, a "Customer review" section renders below the Payment section when `review` is non-null, showing filled/empty stars, the numeric rating out of 5, the comment text (if any), and the submission date
- The review section is visible to admins only (it is in the protected `OrderDetail` page, not the public `TrackOrder` page)

---

### Low Stock Alerts on Admin Dashboard

**Problem:** Admins could see stock levels by navigating to the Products page, but there was no proactive warning when items were critically low. A busy admin could miss restocking needs until an order was rejected for insufficient stock.

**Backend — products route** (`backend/src/routes/products.js`):

- Added `GET /api/products/low-stock?threshold=5` — an auth-protected endpoint registered before `GET /` to prevent route shadowing
- Queries products where `stock_kg IS NOT NULL AND stock_kg < $1`, parameterised with the threshold value (defaults to 5kg if not supplied)
- Results are ordered by `stock_kg ASC` so the most critically low items appear first
- The threshold is passed as a query parameter rather than hardcoded so it can be adjusted per deployment without code changes

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `lowStock` state (initially an empty array) and fetched it alongside `GET /api/orders/stats` in the same mount `useEffect` using two independent `api.get` calls
- When `lowStock.length > 0`, an amber warning panel renders at the very top of the dashboard (above the stats tiles), listing each low-stock product with its current quantity inline: e.g. `Spicy Mixture (2.5kg) · Khara Boondi (0kg)`
- The entire panel is a clickable link that navigates to `/products`, where the admin can update stock levels
- The panel does not re-fetch on the 30-second orders polling cycle; it loads once on mount, which is appropriate since stock changes are admin-initiated events rather than background events

---

### Printable Packing Slip

**Problem:** Admins preparing physical orders had no way to produce a printed document from the system. They had to manually write or type order details separately, introducing risk of error in the packing process.

**Implementation** (`frontend/src/pages/OrderDetail.jsx`):

- Added `printReceipt()` function that calls `window.open('', '_blank', 'width=620,height=780')` to create a new popup window
- Writes a self-contained HTML document into the popup using `win.document.write()`, containing:
  - A "Packing Slip" heading with the truncated order ID and formatted date
  - A customer section with name, phone, optional email, and delivery address
  - A special instructions block (only rendered if the field is non-empty)
  - An HTML `<table>` with columns for Item, Qty (kg), and Amount ($), one row per order item, computed subtotals, and a bold total row
  - A payment status line: "Cash on Delivery — Received" or "Cash on Delivery — Pending"
  - An inline `<script>` tag using `window.onload = () => window.print()` so the browser's print dialog opens automatically when the popup finishes loading
- The entire HTML document is generated inline from live `order` state; no server round-trip is needed for the print data
- Added a "Print packing slip" button to the read-only order actions section, visible for all order statuses, positioned above the "Delete order" ghost button

---

## Frontend Architecture

### Updated Pages

- `src/pages/TrackOrder.jsx` — added `StarPicker` component, review submission form for Completed orders, existing review display when already submitted
- `src/pages/OrderDetail.jsx` — added `review` state and fetch effect, customer review display section, `printReceipt()` function, "Print packing slip" button
- `src/pages/Orders.jsx` — added `lowStock` state, low-stock alert panel at top of dashboard

---

## Backend Architecture

### New Route File

- `backend/src/routes/reviews.js` — three endpoints: public `POST /`, public `GET /order/:order_id`, auth-protected `GET /`

### New Routes

- `POST /api/reviews` — public review submission with order status validation and duplicate guard
- `GET /api/reviews/order/:order_id` — public per-order review lookup
- `GET /api/reviews` — admin list of all reviews joined with customer name
- `GET /api/products/low-stock` — auth-protected low-stock product list with configurable threshold

### Updated Routes

- `GET /api/orders/track/:id` — now joins `reviews` and returns `review` object in the response payload
- `backend/src/app.js` — mounted `/api/reviews` router

### New Files

- `database/migrations/003_add_reviews.sql` — idempotent `CREATE TABLE IF NOT EXISTS` migration
- `backend/src/routes/reviews.js` — reviews router

---

## Project Planning

- Five of the six SRS Section 5 Phase 2 enhancements are now fully or partially addressed: inventory tracking (Week 9), customer order tracking (Week 9), dashboard stats (Week 9), customer reviews (Week 10), low stock alerts (Week 10 — operational improvement adjacent to inventory)
- Remaining major Phase 2 items: user account registration and login with order history, and online payment gateway integration
- The review system currently allows submission only through the order tracking page using the full order UUID as identity; a future improvement would be to tie reviews to a customer account once the account system is built

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Relational Database Design — modelling a one-to-one relationship between `orders` and `reviews` using a foreign key and a `UNIQUE` constraint, with `ON DELETE CASCADE` for referential integrity
- Database Constraint Handling — intercepting PostgreSQL error code `23505` (unique violation) in the application layer and converting it to a meaningful HTTP `409 Conflict` response rather than exposing raw error messages
- SQL JOIN Types — using `LEFT JOIN` so the orders query returns results whether or not a review exists, and `row_to_json` to embed a related row as a nested object in a single query result
- API Design — structuring a public read/write interface (`POST /api/reviews`, `GET /api/reviews/order/:id`) alongside an auth-protected admin interface (`GET /api/reviews`) on the same resource
- Browser APIs — using `window.open`, `document.write`, and `window.print` to produce a printable document from in-memory React state without a server-side PDF library
- React Component Design — building a controlled `StarPicker` sub-component with hover and selection states isolated from the parent form, following single-responsibility principles
- React Side Effects — using multiple independent `useEffect` hooks for separate concerns (fetch order, fetch review, fetch products for edit) to keep side effects scoped and avoid coupling unrelated data-loading logic

---

## Evidence

- `backend/src/routes/reviews.js` — full reviews router (public submission, per-order lookup, admin list)
- `backend/src/routes/products.js` — low-stock endpoint
- `backend/src/routes/orders.js` — updated track endpoint with review join
- `backend/src/app.js` — reviews router mounted
- `database/migrations/003_add_reviews.sql` — reviews table migration
- `database/schema.sql` — updated with reviews table definition
- `frontend/src/pages/TrackOrder.jsx` — StarPicker component, review form and display
- `frontend/src/pages/OrderDetail.jsx` — review display section, printReceipt function, print button
- `frontend/src/pages/Orders.jsx` — low stock alert panel
- Tested: review submission on completed order, duplicate review rejection (409), admin review display in OrderDetail, low stock panel with multiple products, packing slip print popup with correct data

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
