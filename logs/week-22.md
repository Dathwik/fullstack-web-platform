# Week 22 Work Log (July 20 – July 26, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

After four consecutive weeks concentrated on the admin-side reviews and stock-velocity systems, this week deliberately shifted to the customer-facing account area, which had gone untouched since it was first built and had visibly less capability than the equivalent admin tooling. All three features target `CustomerDashboard.jsx`, the page a signed-in customer sees after logging in. The first added an order-history status filter (All / Active / Completed / Cancelled), mirroring the filter pattern already established on the admin Orders page but scoped to the customer's own orders. The second added an account summary card — lifetime order count, total spend, and member-since date — giving a customer the same kind of at-a-glance intelligence the admin dashboard has had for its own metrics since Week 15. The third added the ability for a customer to edit their own name and phone number, closing a real gap: there was previously no way to correct a typo or update a phone number after registration without going through the admin.

---

## Technical Activities

### Order-History Status Filter (SRS Section 4.4: Usability Requirements)

**Problem:** `CustomerDashboard.jsx` rendered every order a customer had ever placed in one undifferentiated list, ordered by date. A customer with an active order and a long history of completed ones had no way to jump straight to "what's still in progress" without scrolling past everything else — the exact problem the admin Orders page's status tabs solved for the administrator back in earlier weeks, never carried over to the customer-facing equivalent.

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Added a `filter` state (`all` / `active` / `completed` / `cancelled`) and a `filteredOrders` derived list computed on every render from `orders` and `filter` — following the same "derive, don't store" pattern used for the reviews star filter, so the filtered view can never drift out of sync with the underlying fetched list
- Filtering is entirely client-side: unlike the admin Orders page (which can have hundreds of orders across all customers and filters server-side), one customer's own order history is inherently small, so there's no scaling reason to add a `?status=` query parameter here — the existing `GET /api/customers/orders` endpoint needed no changes
- Added a filter pill row (`All` / `Active` / `Completed` / `Cancelled`), styled consistently with the pill patterns already used on the admin Orders and Products pages; hidden entirely when the customer has no orders at all (there's nothing to filter), and the empty-state message adapts to name which filter produced zero results (e.g. "No cancelled orders here") rather than a generic empty message

### Customer Account Summary (SRS Section 4.4: Usability Requirements)

**Problem:** The customer dashboard showed a raw list of individual orders but no aggregate view of the relationship — how many orders total, how much they'd spent, how long they'd been a customer. This is the same kind of at-a-glance summary the admin side has had since the Week 15 stats panel, just never built for the customer's own view of their own account.

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `GET /api/customers/stats` (auth required via `requireCustomer`), returning `{ member_since, total_orders, total_spent }` for the signed-in customer
- `member_since` comes from the `customers.created_at` column (account-creation date), not the earliest order — those are different facts, and account age is the more honest answer to "how long have you been with us" for a customer who registered before ever placing an order
- Both `total_orders` and `total_spent` exclude `Cancelled` orders via a single `WHERE o.status <> 'Cancelled'` — neither figure should credit an order that was never actually fulfilled or paid for; this mirrors the same exclusion already used everywhere else in the codebase that aggregates order data (analytics, low-stock velocity, fulfillment stats)

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Fetches `/customers/stats` alongside `/customers/orders` in the same `Promise.all` as the existing mount-time fetch, so both requests fire concurrently rather than one waiting on the other
- Renders a single-line summary card ("**2** orders · **$33.00** spent · member since Jul 2026") above the order list; hidden when `total_orders` is `0`, since a summary of nothing isn't useful and would just add clutter above the existing "you haven't placed any orders yet" empty state

### Editable Customer Profile (SRS Section 4.4: Usability Requirements)

**Problem:** There was no `PATCH` route for a customer to change their own name or phone number after registration — `customers.js` had `register`, `login`, `logout`, and `me`, but no update path. A customer with a typo in their name or a changed phone number had no self-service way to fix it.

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `PATCH /api/customers/me` (auth required), accepting `name` and/or `phone`, following the same dynamic-field-builder pattern already used by `PATCH /api/products/:id` (only build `SET` clauses for fields actually present in the request body)
- Email is deliberately left out of this route's scope — it's the login identifier and is unique-constrained, so changing it would need its own re-verification flow (confirming the new address, handling the case where it collides with another account) that's a meaningfully different feature, not a one-line addition to this one
- Rejects a blank/whitespace-only `name` with `400`, since an empty name is never a legitimate update; `phone` has no such requirement since it was already optional at registration (blank clears it to `null`, matching how optional fields are cleared elsewhere in this codebase, e.g. the reorder-point field on `PATCH /api/products/:id`)

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Added an inline edit mode for the header's name/phone display, toggled by an "Edit profile" link and following the same start-edit/save/cancel pattern already established for stock and reorder-point editing on the Products page (`editingProfile` state, draft fields seeded from the current customer on entering edit mode, `saveProfile` calling the `PATCH` and updating local state from the response)
- Email is shown read-only in both modes (never becomes an input), reflecting that it isn't editable via this route

---

## Frontend Architecture

### Updated Pages

- `src/pages/CustomerDashboard.jsx` — order-history filter pills with a filter-aware empty state; account summary card (orders, spend, member-since) fetched alongside the existing order list; inline profile editing for name/phone

---

## Backend Architecture

### Updated Routes

- `PATCH /api/customers/me` (new) — updates `name` and/or `phone` for the signed-in customer; email is out of scope by design
- `GET /api/customers/stats` (new) — `member_since` (from `customers.created_at`), `total_orders`, and `total_spent`, both aggregates excluding `Cancelled` orders

---

## Project Planning

- This week's local dev database was missing the `customers` and `order_notes` tables entirely (the Week 4-era migration, `004_add_customer_accounts.sql`, had apparently never been applied to this environment) — applying it was a prerequisite for testing any of this week's work and is unrelated to anything built this week; worth checking whether other environments are similarly behind on migrations, since a schema drift like this would otherwise surface as a confusing runtime error rather than a clear "migration needed" signal
- The order-history filter is intentionally client-side only; if a customer's order history ever grows large enough that fetching it in full becomes wasteful, the same server-side-filtering approach taken for the admin reviews list (`GET /api/reviews?rating=`) would be the template to follow
- Editing email was deliberately left out this week — if it's added later, it will need its own verification step (e.g. a confirmation link to the new address) rather than an immediate write, unlike `name`/`phone` which have no such risk

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Deriving Filtered State Instead of Storing It — `filteredOrders` is computed fresh from `orders` and `filter` on every render rather than kept in its own `useState`, the same pattern used for the reviews star filter in Week 18; this avoids an entire class of bug where a background refetch of `orders` could leave a separately-stored filtered copy stale
- Choosing Client-Side vs. Server-Side Filtering Based on Data Scale — the reviews list moved from client-side to server-side filtering in Week 19 specifically because the *admin* sees every review across all customers, a potentially large and growing set; a single customer's own order history has a fundamentally different scale (bounded by how many orders one person places), so the same feature — filtering a list by a field — correctly uses the opposite implementation strategy here. Recognizing that the same UI pattern doesn't imply the same architecture is a judgment call about data scale, not a rule that can be applied mechanically
- Distinguishing Two Similar but Different Facts in a Data Model — `member_since` (account creation) and "date of first order" are two different timestamps that could easily be confused; using `customers.created_at` rather than `MIN(orders.created_at)` is a small but deliberate choice to answer the question actually being asked ("how long have you had an account") rather than a related but distinct one
- Dynamic SQL Field Building for Partial Updates — `PATCH /api/customers/me` only includes `SET` clauses for fields present in the request body, the same pattern already used by `PATCH /api/products/:id`; this lets a single endpoint support "update just the name," "update just the phone," or both, without needing a separate route or a required-fields contract that would force clients to resend values they aren't changing
- Concurrent Requests via `Promise.all` for Independent Data — fetching `/customers/orders` and `/customers/stats` together via `Promise.all` rather than sequentially (or in two separate uncoordinated effects) reflects that the two responses don't depend on each other, so there's no reason to pay for two round-trip latencies in sequence when they can overlap

---

## Evidence

- `backend/src/routes/customers.js` — `PATCH /api/customers/me` (name/phone update, blank-name rejection); `GET /api/customers/stats` (member_since, total_orders, total_spent excluding cancelled)
- `frontend/src/pages/CustomerDashboard.jsx` — order status filter pills with filter-aware empty state; account summary card; inline profile editing
- Tested against a local Postgres instance with a registered test customer and three seeded orders (one Completed, one Received, one Cancelled): `GET /api/customers/stats` correctly returned `total_orders: 2` and `total_spent: 33` (2kg + 1kg at $11/kg = $33), correctly excluding the cancelled order's 5kg; `GET /api/customers/orders` correctly still returned all three orders (unfiltered, as designed, since filtering happens client-side); `PATCH /api/customers/me` correctly updated name and phone and reflected the change on a subsequent `GET /api/customers/me`; a blank-name `PATCH` request correctly returned `400`; `npm run lint` and `npm run build` both pass with zero errors on the frontend; the test customer, orders, and order items were removed from the local database after verification
- Applied a pre-existing, previously-unapplied migration (`004_add_customer_accounts.sql`) to the local dev database as a prerequisite for testing — the `customers` table did not exist beforehand; this was necessary to test this week's work but is not itself a change made this week
- **Testing limitation:** as in prior weeks, all three features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
