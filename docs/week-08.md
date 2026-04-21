# Week 8 Work Log
**Date:** April 2026  
**Goal:** Complete all remaining SRS functional requirements to satisfy Phase 1 acceptance criteria

---

## Summary

This week closed the four remaining gaps from the SRS, bringing every functional requirement to full implementation.

---

## Features Implemented

### FR-5 — Status Transition Enforcement (Backend)

**Problem:** The `PATCH /api/orders/:id/status` endpoint accepted any status value as long as it was a valid enum, allowing illegal jumps like `Received → Completed` directly.

**Solution:** Added a `VALID_TRANSITIONS` map on the backend that defines the only allowed moves:

| From | Allowed To |
|------|-----------|
| Received | In Preparation, Cancelled |
| In Preparation | Completed |
| Completed | *(none)* |
| Cancelled | *(none)* |

The endpoint now fetches the current status from the database first and returns a `400` with a descriptive error message if the requested transition is not allowed. The frontend already enforced this via `NEXT_STATUS` — the server now enforces it too.

**Files changed:** `backend/src/routes/orders.js`

---

### FR-8 — Edit Order Details

**Problem:** Once an order was created, its customer information and items were immutable (except by deleting and recreating the order). The SRS requires admins to be able to edit order details.

**Solution:**

- Added `PATCH /api/orders/:id` endpoint that accepts updated `customer_name`, `phone`, `address`, `email`, `special_instructions`, and `items[]`. The endpoint:
  - Rejects edits on `Completed` or `Cancelled` orders
  - Replaces all `order_items` atomically within a transaction
  - Validates all required fields and minimum quantities

- Added an **Edit button** on the Order Detail page (visible only for `Received` / `In Preparation` orders). Clicking it switches to an inline edit form pre-populated with current values, using the same product selector and quantity input pattern as the New Order form. Saving calls the new endpoint and refreshes the view.

**Files changed:** `backend/src/routes/orders.js`, `frontend/src/pages/OrderDetail.jsx`

---

### FR-10 — Payment Tracking (COD)

**Problem:** The orders table had no payment field. There was no way to record whether a Cash on Delivery order had been paid.

**Solution:**

- Added `payment_received BOOLEAN DEFAULT FALSE` column to the `orders` table via migration `database/migrations/001_add_payment_received.sql`
- Added `PATCH /api/orders/:id/payment` endpoint to toggle the field
- Updated `database/schema.sql` to include the column for fresh installs
- Updated CSV export to include a `Payment` column (`Paid` / `Unpaid`)

**UI changes in Order Detail:**
- New Payment section shows "COD — Received" (green) or "COD — Pending" (amber)
- "Mark as paid" / "Mark unpaid" toggle button

**UI changes in Orders list:**
- Orders with `payment_received = true` show a small green "Paid" badge next to the status chip

**Files changed:** `database/schema.sql`, `database/migrations/001_add_payment_received.sql`, `backend/src/routes/orders.js`, `frontend/src/pages/OrderDetail.jsx`, `frontend/src/pages/Orders.jsx`

---

### FR-11 — Admin Dashboard Notification

**Problem:** Admins had no way to know when new customer orders arrived while they were on the dashboard. They had to manually refresh the page.

**Solution:**

- Added `GET /api/orders/new-since?since=<iso-timestamp>` endpoint that returns the count of `Received` orders placed after a given timestamp
- Orders page now polls `GET /api/orders` every **30 seconds** silently in the background
- On each poll, orders with `created_at` newer than the page-load timestamp are counted. If the count grows, a dismissible blue banner — **"New orders received"** — appears at the top of the dashboard
- Dismissing the banner advances the baseline timestamp so the same orders don't re-trigger it

**Files changed:** `backend/src/routes/orders.js`, `frontend/src/pages/Orders.jsx`

---

## Database Migration

```bash
psql -d fullstack_platform -f database/migrations/001_add_payment_received.sql
```

Run this once on any existing database. The migration uses `ADD COLUMN IF NOT EXISTS` and is safe to re-run.

---

## Acceptance Criteria — Phase 1 Status

| Criterion | Status |
|-----------|--------|
| Customers can successfully submit orders | Done |
| Orders stored with unique IDs | Done |
| Admins can authenticate securely | Done |
| Admins can manage and update order statuses | Done |
| Orders can be exported as CSV | Done |
| All functional requirements implemented | **Done** |
