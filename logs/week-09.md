# Week 9 Work Log (Apr 20 – Apr 26, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 26 hours

---

## Work Summary

With all Phase 1 SRS requirements completed in Week 8, this week began work on Phase 2 enhancements. Three features were designed and implemented: inventory tracking for products, a public-facing order status tracking page for customers, and a real-time statistics panel on the admin dashboard. These features improve operational accuracy, give customers visibility into their orders, and give administrators an at-a-glance summary of business activity without needing to scroll through the full order list.

---

## Technical Activities

### Inventory Tracking

**Problem:** The products table had no concept of stock. Orders could be placed for any quantity of any product regardless of whether inventory existed, making the system unusable for a business that needs to manage limited daily stock.

**Database migration** (`database/migrations/002_add_stock_kg.sql`):

- Added `stock_kg DECIMAL(8,2)` column to the `products` table using `ADD COLUMN IF NOT EXISTS`
- The column is nullable: `NULL` means unlimited stock (no tracking), a numeric value means tracked inventory in kilograms
- `database/schema.sql` was updated to include the column for any fresh installation

**Backend — products route** (`backend/src/routes/products.js`):

- `POST /api/products` now accepts an optional `stock_kg` parameter; omitting it leaves the field `NULL` (unlimited)
- `PATCH /api/products/:id` now accepts `stock_kg` in its dynamic field builder, allowing admins to set or clear stock at any time
- Both endpoints use the existing parameterized field builder pattern so no SQL concatenation is introduced

**Backend — orders route** (`backend/src/routes/orders.js`):

- Extracted a shared helper `insertItemsWithStockCheck(client, orderId, items)` that is called by both `POST /api/orders` and `POST /api/orders/public`
- The helper issues `SELECT stock_kg FROM products WHERE id=$1 FOR UPDATE` (a row-level lock) before inserting each item, preventing race conditions where two concurrent orders could both pass the stock check and overdraw inventory
- If `stock_kg` is not `NULL` and is less than the requested `quantity_kg`, the helper throws an error, rolling back the entire transaction and returning a `400` response with the available quantity in the message
- After each item is inserted, if `stock_kg` is tracked, the helper executes `UPDATE products SET stock_kg = stock_kg - $1 WHERE id=$2` to deduct the used quantity atomically within the same transaction
- The `PATCH /api/orders/:id` (edit order) endpoint was updated to restore stock for the old items before deducting for the new ones: it reads existing `order_items`, issues `UPDATE products SET stock_kg = stock_kg + $1 WHERE stock_kg IS NOT NULL` for each, deletes the old items, then calls `insertItemsWithStockCheck` for the replacement items — all within a single transaction
- The `DELETE /api/orders/:id` endpoint was similarly updated to restore stock before deletion, so cancelled or deleted orders give inventory back to the product correctly

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- Each product card now has a stock row below the name and price, showing the current stock level with colour-coded status:
  - "Unlimited" in grey when `stock_kg` is `NULL`
  - Stock value in green (e.g. "12.5kg") when above the low-stock threshold
  - "Xkg — Low" in amber when `stock_kg` is tracked and below 5kg
  - "Out of stock" in red when `stock_kg` is exactly 0
- Clicking the stock display activates an inline input field prepopulated with the current value; pressing Enter or clicking Save calls `PATCH /api/products/:id` with the new value; leaving the field blank and saving sets `stock_kg` back to `NULL` (unlimited)
- The Add Product form now includes an optional "Stock kg" field alongside name and price
- Keyboard shortcuts: Enter confirms the stock edit, Escape cancels it without saving

**Frontend — Order forms** (`frontend/src/pages/PlaceOrder.jsx`, `frontend/src/pages/NewOrder.jsx`):

- Both forms now filter out products where `stock_kg` is tracked and equals 0, so out-of-stock items do not appear as selectable options
- Product option labels include the remaining stock when tracked: `Spicy Mixture ($12.50/kg — 8.5kg left)`, giving customers and operators live inventory context before submitting

---

### Customer Order Tracking

**Problem:** After placing an order, customers had no way to check its progress. They received a confirmation page with a reference number but had to contact the business directly to find out the status.

**Backend** (`backend/src/routes/orders.js`):

- Added `GET /api/orders/track/:id` — a public endpoint requiring no authentication
- Returns a limited projection of the order: `id`, `customer_name`, `status`, `payment_received`, `created_at`, and an aggregated `items` array (product name, quantity, price per kg)
- Deliberately excludes internal fields such as `address`, `phone`, and `email` that are not appropriate to expose publicly
- Registered before `GET /:id` in the router so the path `/track/:id` is matched literally before the generic `/:id` catch-all

**Frontend — TrackOrder page** (`frontend/src/pages/TrackOrder.jsx`):

- New page at the `/track-order` route, accessible without login
- Contains a text input for the full order UUID and a Track button; submits to `GET /api/orders/track/:id`
- If a `?id=` query parameter is present in the URL (set by the confirmation page), the component issues the API call automatically on mount without requiring the user to click Track
- Successful lookups display a colour-coded status card matching the admin status colour scheme, a description sentence for each status (e.g. "Your order is currently being prepared"), an itemised order summary with line totals and a grand total, and a payment row indicating whether COD payment has been confirmed
- Failed lookups display a clear error message

**Frontend — Order Confirmation page** (`frontend/src/pages/OrderConfirmation.jsx`):

- Added a "Track this order" button below the existing "Place another order" button
- The button navigates to `/track-order?id=<full-uuid>`, which causes `TrackOrder` to auto-lookup the order on arrival
- The `?id=` parameter carries the full UUID, while the confirmation page still displays only the first 8 characters as the human-readable reference

**Frontend — App routing** (`frontend/src/App.jsx`):

- Added `/track-order` as a third public route alongside `/place-order` and `/order-confirmation`, so unauthenticated users can reach it directly

---

### Admin Dashboard Statistics Panel

**Problem:** To understand how the business was performing, admins had to manually count orders or export a CSV and calculate totals. There was no at-a-glance summary on the dashboard.

**Backend** (`backend/src/routes/orders.js`):

- Added `GET /api/orders/stats` — an auth-protected endpoint that runs four queries in parallel using `Promise.all`:
  1. Today's order count and revenue: `COUNT(DISTINCT o.id)` and `SUM(oi.quantity_kg * p.price_per_kg)` filtered by `DATE(o.created_at) = CURRENT_DATE`
  2. Pending count: orders with `status IN ('Received', 'In Preparation')`
  3. This week's order count and revenue: `created_at >= DATE_TRUNC('week', CURRENT_DATE)`
  4. Unpaid count: `payment_received = FALSE AND status <> 'Cancelled'`
- Revenue calculations join `order_items` and `products` to compute the correct monetary total per order without storing a derived total in the database
- Using `Promise.all` keeps the four queries concurrent, reducing the endpoint's response time versus running them sequentially
- Registered before `GET /:id` to prevent route shadowing

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added a `stats` state variable and a one-time `useEffect` on mount that calls `GET /api/orders/stats`
- When stats are available, a 2×2 grid panel renders above the Orders header showing four metric tiles: "Today's orders", "Today's revenue", "Pending", and "Unpaid (COD)"
- Each tile uses the same card visual style as the order list cards (white background, 1.5px border, 10px border radius)
- Stats load independently from the orders list; a failure to fetch stats is silently ignored so the dashboard remains functional

---

## Frontend Architecture

### New Pages

- `src/pages/TrackOrder.jsx` — public customer-facing order status lookup with auto-search from URL parameter

### Updated Pages

- `src/pages/Products.jsx` — stock display with colour-coded status, inline stock editor, stock field in Add Product form
- `src/pages/PlaceOrder.jsx` — out-of-stock products filtered from selector, remaining stock shown in option labels
- `src/pages/NewOrder.jsx` — same stock-aware product filtering as PlaceOrder
- `src/pages/Orders.jsx` — stats panel above header, stats fetched on mount
- `src/pages/OrderConfirmation.jsx` — "Track this order" button linking to TrackOrder with the full order UUID
- `src/App.jsx` — `/track-order` registered as a public route

---

## Backend Architecture

### New Routes

- `GET /api/orders/stats` — four-query parallel stats aggregation, auth-protected
- `GET /api/orders/track/:id` — public limited order lookup for customer tracking

### Updated Routes

- `POST /api/orders` and `POST /api/orders/public` — both now call shared `insertItemsWithStockCheck` helper with row-level locking and atomic stock deduction
- `PATCH /api/orders/:id` — restores stock for replaced items before deducting for new items, all within the same transaction
- `DELETE /api/orders/:id` — now restores stock for the deleted order's items before removing the record
- `POST /api/products` — accepts optional `stock_kg` on product creation
- `PATCH /api/products/:id` — accepts `stock_kg` in the dynamic update builder

### New Files

- `database/migrations/002_add_stock_kg.sql` — idempotent migration adding `stock_kg DECIMAL(8,2)` to products
- `frontend/src/pages/TrackOrder.jsx` — customer order tracking page

---

## Project Planning

- Phase 2 work has begun; three of the six listed future enhancements (SRS Section 5) are now implemented or partially addressed
- Remaining Phase 2 items: user account registration and login with order history, online payment gateway integration, automated SMS/WhatsApp notifications, and customer reviews
- Inventory tracking is currently one-directional (stock decreases on order, restores on edit/delete); a future improvement would be an explicit stock replenishment flow in the admin Products page

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Concurrency Control — using `SELECT ... FOR UPDATE` row-level locking inside PostgreSQL transactions to prevent race conditions in stock deduction across simultaneous order requests
- Database Transaction Design — composing multi-step operations (stock restore, item delete, item insert, stock deduct) as a single atomic unit with `BEGIN/COMMIT/ROLLBACK`
- Idempotent Schema Migration — using `ADD COLUMN IF NOT EXISTS` so migrations are safe to re-run without errors
- SQL Aggregation — computing revenue totals by joining three tables and using `SUM`, `COUNT(DISTINCT)`, `DATE_TRUNC`, and `CURRENT_DATE` in parallel queries
- REST API Design — publishing a limited public projection of a resource (`/track/:id`) that exposes only the fields appropriate for unauthenticated consumers
- Parallel Query Execution — using `Promise.all` to run independent database queries concurrently and reduce API latency
- React State and Side Effects — using `useEffect` with URL search parameters to trigger automatic API calls on page load when context is available in the URL
- Software Engineering Practices — refactoring duplicated logic into a shared helper function (`insertItemsWithStockCheck`) to enforce DRY principles across two separate route handlers

---

## Evidence

- `backend/src/routes/orders.js` — stats endpoint, track endpoint, stock check helper, updated order creation/edit/delete with stock management
- `backend/src/routes/products.js` — stock_kg support on create and patch
- `database/migrations/002_add_stock_kg.sql` — schema migration
- `database/schema.sql` — updated products table definition
- `frontend/src/pages/Products.jsx` — stock display, inline stock editor
- `frontend/src/pages/PlaceOrder.jsx` and `NewOrder.jsx` — stock-aware product filtering
- `frontend/src/pages/Orders.jsx` — stats panel
- `frontend/src/pages/TrackOrder.jsx` — customer order tracking page
- `frontend/src/pages/OrderConfirmation.jsx` — Track this order button
- `frontend/src/App.jsx` — /track-order public route
- Tested: stock deduction on order placement, stock restoration on edit and delete, out-of-stock filtering in order forms, customer order tracking auto-lookup, stats panel metrics

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
