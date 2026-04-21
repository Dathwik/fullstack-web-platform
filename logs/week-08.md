# Week 8 Work Log (Apr 13 – Apr 19, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 22 hours

---

## Work Summary

During this week, I completed the four remaining functional requirements from the SRS that were outstanding after Week 7, bringing the platform to full Phase 1 compliance. The work focused on enforcing business rules at the server level, enabling admins to edit order details after creation, adding Cash on Delivery payment tracking, and implementing real-time dashboard notifications for incoming orders.

With all SRS acceptance criteria now met, the platform is feature-complete for Phase 1: customers can place orders, admins can manage and track the full order lifecycle, payment confirmation is recorded, and the system actively surfaces new activity without requiring manual page refreshes.

---

## Technical Activities

### Status Transition Enforcement — Backend (FR-5)

- The `PATCH /api/orders/:id/status` endpoint previously accepted any valid enum value regardless of the order's current state, allowing illegal jumps such as `Received → Completed` directly
- Added a `VALID_TRANSITIONS` constant on the backend that maps each status to its permitted next states:
  - `Received` → `In Preparation`, `Cancelled`
  - `In Preparation` → `Completed`
  - `Completed` → *(none)*
  - `Cancelled` → *(none)*
- The endpoint now performs a preliminary `SELECT status FROM orders WHERE id=$1` to retrieve the current state, then validates the requested transition before executing the update
- Invalid transitions return HTTP 400 with a descriptive message listing the allowed options; unknown order IDs return 404
- The frontend `NEXT_STATUS` map already enforced these rules in the UI; this change makes the server the authoritative guard

### Edit Order Details (FR-8)

- Added `PATCH /api/orders/:id` endpoint that accepts `customer_name`, `phone`, `address`, `email`, `special_instructions`, and `items[]`
- The endpoint rejects requests on orders with status `Completed` or `Cancelled` since those are considered immutable records
- Item replacement is handled atomically: the endpoint issues `DELETE FROM order_items WHERE order_id=$1` followed by fresh inserts within a `BEGIN/COMMIT` transaction, so items are never left in a partial state
- All required fields and minimum 1kg item quantities are validated server-side before the transaction begins
- Added an **Edit** button to the Order Detail page that is visible only on `Received` and `In Preparation` orders
- Clicking Edit switches to an inline edit form that is pre-populated with the current order values — customer fields as text inputs and a product/quantity row editor using the same selector pattern as the New Order form
- Submitting calls `PATCH /api/orders/:id`, then the component refetches the order and returns to read-only view
- The back arrow in edit mode returns to read-only view without saving, rather than navigating away

### COD Payment Tracking (FR-10)

- Added `payment_received BOOLEAN DEFAULT FALSE` column to the `orders` table
- Created `database/migrations/001_add_payment_received.sql` using `ALTER TABLE orders ADD COLUMN IF NOT EXISTS` so the migration is safe to re-run on existing databases
- Updated `database/schema.sql` so fresh installs include the column
- Added `PATCH /api/orders/:id/payment` endpoint that accepts `{ payment_received: true/false }` and updates the field; returns the updated order row
- Updated `GET /api/orders/export` to include a `Payment` column (`Paid` / `Unpaid`) in the CSV output
- Added a **Payment (COD)** section to the Order Detail page showing the current state — green "Received" or amber "Pending" — with a toggle button ("Mark as paid" / "Mark unpaid") that calls the new endpoint and refreshes the view
- Orders list cards now display a small green "Paid" badge next to the status chip for orders where `payment_received` is true

### Admin Dashboard Notification (FR-11)

- Added `GET /api/orders/new-since?since=<iso-timestamp>` endpoint that counts `Received` orders with `created_at` greater than the provided timestamp; registered before `GET /:id` to prevent route shadowing
- The Orders page now records an ISO timestamp (`sessionStartRef`) at component mount and sets up a `setInterval` polling `GET /api/orders` every **30 seconds** silently in the background
- On each poll response, orders with `created_at > sessionStartRef.current` and `status === 'Received'` are counted; if the count has grown since the last alert threshold, a dismissible banner — **"New orders received"** — is rendered at the top of the dashboard
- Dismissing the banner advances `sessionStartRef.current` to the current time and resets the alert counter, preventing the same batch from re-triggering
- The polling interval is cleaned up via `useEffect` return function and restarted whenever the date filter changes, so polling always uses the current filter values from the closure

---

## Frontend Architecture

### Updated Pages

- `src/pages/OrderDetail.jsx` — added edit mode with inline form (customer fields + item editor), payment section with toggle button, and conditional Edit button for active orders
- `src/pages/Orders.jsx` — added 30-second polling interval, new order banner with dismiss logic, and "Paid" badge on order cards

---

## Backend Architecture

### New Routes

- `GET /api/orders/new-since` — returns count of new Received orders since a given timestamp, auth-protected
- `PATCH /api/orders/:id` — updates customer info and items on active orders, auth-protected
- `PATCH /api/orders/:id/payment` — toggles `payment_received` flag, auth-protected

### Updated Routes

- `PATCH /api/orders/:id/status` — now enforces valid status transitions server-side
- `GET /api/orders/export` — CSV output now includes a Payment column

### New Files

- `database/migrations/001_add_payment_received.sql` — idempotent migration adding `payment_received` column

---

## Project Planning

- All Phase 1 functional requirements (FR-1 through FR-12) are now fully implemented and the SRS acceptance criteria are satisfied
- Next steps: conduct end-to-end testing with real customer orders in the production environment, monitor for edge cases in the status transition logic, and evaluate Phase 2 enhancements (online payment gateway, SMS/WhatsApp notifications, inventory tracking)

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- State Machine Design — modeling valid order lifecycle transitions as a directed graph and enforcing them at the API boundary
- Database Transactions — using `BEGIN/COMMIT/ROLLBACK` to replace order items atomically and preserve referential integrity
- SQL Schema Migration — incrementally altering a live table with `ADD COLUMN IF NOT EXISTS` without downtime
- REST API Design — structuring sub-resource endpoints (`/:id/status`, `/:id/payment`) to keep concerns separated
- Event-Driven UI Patterns — polling for external state changes and surfacing them to the user without blocking the main interaction thread
- React Hooks — using `useRef` for mutable cross-render values (session timestamp, alert threshold) that should not trigger re-renders
- Software Engineering Practices — closing open SRS requirements systematically and verifying each against the documented acceptance criteria

---

## Evidence

- `backend/src/routes/orders.js` — status transition validation, edit endpoint, payment endpoint, new-since endpoint
- `frontend/src/pages/OrderDetail.jsx` — edit mode, payment section
- `frontend/src/pages/Orders.jsx` — polling interval, new order banner, Paid badge
- `database/migrations/001_add_payment_received.sql` — schema migration
- `database/schema.sql` — updated with payment_received column
- Tested: transition rejection on illegal status jump, edit form save and cancel, payment toggle, Paid badge in list, new order banner on polling

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
