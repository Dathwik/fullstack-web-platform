# Week 11 Work Log (May 4 – May 10, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 26 hours

---

## Work Summary

This week tackled the largest remaining Phase 2 enhancement from SRS Section 5: customer account registration and login with order history. A full second authentication tier was introduced (separate from the existing admin session) covering registration, sign-in, sign-out, and a customer-facing dashboard. Orders placed while signed in are automatically linked to the customer account, and the dashboard provides a one-click "Reorder" flow that navigates to the public order form with the previous order's items pre-filled. Two operational features round out the week: an internal-notes panel on the admin order detail page so staff can leave handoff comments, and a sign-in/sign-up call to action on the public order form so returning customers can opt into the account flow without losing the guest checkout path.

---

## Technical Activities

### Customer Account System (SRS Section 5: Customer accounts with order history)

**Database migration** (`database/migrations/004_add_customer_accounts.sql`):

- Created a `customers` table with columns: `id UUID` (primary key, generated), `email VARCHAR(150) UNIQUE NOT NULL`, `password_hash VARCHAR(100) NOT NULL`, `name VARCHAR(100) NOT NULL`, `phone VARCHAR(20)` (nullable), and `created_at TIMESTAMP`
- Added `customer_id UUID REFERENCES customers(id) ON DELETE SET NULL` to the existing `orders` table using `ADD COLUMN IF NOT EXISTS`; the column is nullable so guest checkouts continue to work and so the customer record can be deleted without cascading away the order history that the business needs to keep
- Created `CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id)` so the per-customer order-history query is index-supported instead of a sequential scan
- `database/schema.sql` was updated to include the `customers` table definition, the new `customer_id` column on `orders`, and the supporting index, so a fresh installation produces the same shape

**Backend — customer authentication** (`backend/src/middleware/customerAuth.js`, `backend/src/routes/customers.js`):

- Added `requireCustomer` middleware that checks `req.session.customer_id` and returns `401` when absent — kept as a separate middleware from the existing `requireAuth` (admin) so the two privilege tiers cannot be confused at the route level
- Customer session state is stored in the same `express-session` cookie as admin auth but under a distinct key (`req.session.customer_id` vs. `req.session.authenticated`) so the same cookie can carry both states and the middleware checks remain orthogonal
- `POST /api/customers/register` — public endpoint that validates email format with a regex (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) and password length (minimum 8 characters), hashes the password with `bcryptjs` at cost 10, lowercases the email before insertion to make uniqueness case-insensitive, and signs the new customer in by setting `req.session.customer_id` so registration and first sign-in are a single round trip
- Catches PostgreSQL error code `23505` (unique constraint violation on email) and returns a clean `409 Conflict` with a friendly message instead of leaking the raw database error
- `POST /api/customers/login` — verifies the password using `bcrypt.compare`, returns the same generic `Invalid email or password` message for both unknown email and bad password to avoid email enumeration via timing or response differences
- `POST /api/customers/logout` — deletes `customer_id` from the session without destroying the entire session object, so an admin who happened to also be signed in as a customer is not signed out of admin
- `GET /api/customers/me` — returns the signed-in customer's record or `null`; the endpoint also self-heals stale sessions by clearing `customer_id` if the referenced customer no longer exists in the database
- `GET /api/customers/orders` — `requireCustomer`-protected endpoint that returns the signed-in customer's orders with their items, ordered by `created_at DESC`, using the same `json_agg ... FILTER (WHERE oi.id IS NOT NULL)` pattern used elsewhere in the codebase

**Backend — orders route** (`backend/src/routes/orders.js`):

- `POST /api/orders/public` now reads `req.session?.customer_id` and inserts it into the `orders.customer_id` column when present, so an order placed while signed in is automatically linked to the customer's account without any new client-side payload
- Guest checkouts continue to work unchanged because the column is nullable

**Backend — app wiring** (`backend/src/app.js`):

- Mounted `/api/customers` for the new router
- Mounted `/api/orders/:id/notes` ahead of `/api/orders` so the nested notes router takes precedence over the catch-all order routes; the nested router uses `express.Router({ mergeParams: true })` so it can read `:id` from the parent path

---

### Customer Dashboard, Sign-In and Sign-Up Pages

**Frontend — CustomerLogin page** (`frontend/src/pages/CustomerLogin.jsx`):

- New page at the `/sign-in` route, accessible without admin login
- Email + password form that calls `POST /api/customers/login`; on success navigates to `/account`
- Below the form: a link to `/register` for new customers and a secondary "Continue as guest" link to `/place-order` so unauthenticated users are not blocked from placing an order

**Frontend — CustomerRegister page** (`frontend/src/pages/CustomerRegister.jsx`):

- New page at the `/register` route — collects name, email, password (with 8-character minimum enforced both client-side and server-side), and optional phone number
- On success the API call also sets the session cookie, so the user lands on `/account` already signed in rather than having to log in again

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- New page at the `/account` route — fetches `GET /api/customers/me`; if it returns `null` the page redirects to `/sign-in`, so the route is effectively customer-protected on the client side
- Renders a greeting with the customer's name and email, a "+ New order" button to `/place-order`, and an order history list with one card per past order showing date, status badge (using the same colour scheme as the admin Orders page), itemised summary, and total
- Each card has two action buttons:
  - "Track" — links to `/track-order?id=<full-uuid>` so the customer can see live status from their dashboard without typing the order ID
  - "Reorder" — calls `navigate('/place-order', { state: { reorderItems } })` with the previous order's items mapped to `{ product_id, quantity_kg }` shape; React Router's location state carries the items without polluting the URL or sessionStorage
- Empty state ("You haven't placed any orders yet.") with a primary CTA to `/place-order` so the dashboard remains useful even for brand-new accounts

**Frontend — PlaceOrder page** (`frontend/src/pages/PlaceOrder.jsx`):

- On mount the page now also calls `GET /api/customers/me`; when a customer is signed in, the form's `customer_name`, `phone`, and `email` are pre-populated from the customer record (only filling fields that are still blank, so a manual edit is never overwritten)
- A status line under the heading reads "Signed in as <Name> · My account" with a link back to `/account`, or "Have an account? Sign in to save your details" linking to `/sign-in` when no session exists
- When `location.state.reorderItems` is present the items array is initialised from it instead of the default single empty row, and a blue info banner explains "Items pre-filled from your previous order — review the quantities and submit when ready" so the user knows the form was pre-populated rather than mistyped

**Frontend — App routing** (`frontend/src/App.jsx`):

- Added `/sign-in`, `/register`, and `/account` as public routes alongside the existing `/place-order`, `/order-confirmation`, and `/track-order`; admin authentication state does not gate them
- The customer dashboard performs its own session check via `GET /api/customers/me` and redirects to `/sign-in` if no customer session exists, so client-side route protection lives in the page rather than the router

---

### Internal Notes on Admin Order Detail

**Problem:** When an order changed hands between staff (or between sessions), there was no place to leave a note like "Customer called to add a delivery time" or "Substituted Khara Boondi with Mixture Namkeen — informed customer". Special instructions were customer-supplied and read-only; staff had to communicate via external channels.

**Database migration** (`database/migrations/004_add_customer_accounts.sql`):

- Created an `order_notes` table with columns: `id UUID` (primary key), `order_id UUID` (foreign key referencing `orders(id)` with `ON DELETE CASCADE`), `body TEXT NOT NULL`, and `created_at TIMESTAMP`
- `ON DELETE CASCADE` ensures notes are removed automatically when the parent order is deleted, avoiding orphaned rows
- `CREATE INDEX IF NOT EXISTS order_notes_order_id_idx ON order_notes(order_id)` supports the per-order list query, which is the only read pattern for this table
- The notes table definition was added to `database/schema.sql` for fresh installations

**Backend — notes route** (`backend/src/routes/notes.js`):

- New router using `express.Router({ mergeParams: true })` so the nested handler can read the parent `:id` path parameter for the order ID
- Mounted at `/api/orders/:id/notes` in `app.js`, registered before the general `/api/orders` router so the nested path is matched first
- All endpoints are admin-only via the existing `requireAuth` middleware
- `GET /` — returns notes for the order ordered by `created_at DESC`
- `POST /` — trims the body, rejects empty (`400`) and overly long (`> 1000` chars, `400`) submissions, verifies the parent order exists (returning `404` if not), and inserts the note returning the created row
- `DELETE /:noteId` — deletes the note only if it belongs to the matched order ID, preventing cross-order deletion via guessed UUIDs even though notes are admin-only

**Frontend — OrderDetail page** (`frontend/src/pages/OrderDetail.jsx`):

- Added `notes`, `noteDraft`, `noteSubmitting`, and `noteError` state and a `fetchNotes()` function that loads the notes list from `GET /api/orders/:id/notes`; called from a mount-time `useEffect` keyed on the order ID
- Notes section renders in the read-only view between the customer review and the action buttons, showing each note as a soft-grey card with the timestamp, the body (preserving line breaks via `white-space: pre-wrap`), and a "×" delete button that prompts before removal
- Below the list, an inline form with a 1000-character textarea and an "Add note" submit button posts the note and refreshes the list on success; the submit button disables itself when the draft is empty so accidental empty submissions cannot reach the server

---

## Frontend Architecture

### New Pages

- `src/pages/CustomerLogin.jsx` — public sign-in form for customer accounts
- `src/pages/CustomerRegister.jsx` — public sign-up form with email + password validation
- `src/pages/CustomerDashboard.jsx` — signed-in customer's order history with Track and Reorder actions

### Updated Pages

- `src/pages/PlaceOrder.jsx` — pre-fills customer details from `/customers/me`, shows sign-in CTA for guests, accepts `reorderItems` via React Router location state
- `src/pages/OrderDetail.jsx` — internal notes panel with create, list, and delete
- `src/App.jsx` — `/sign-in`, `/register`, and `/account` registered as public routes

---

## Backend Architecture

### New Route Files

- `backend/src/routes/customers.js` — register, login, logout, me, and orders endpoints for the customer tier
- `backend/src/routes/notes.js` — nested router for `/api/orders/:id/notes` with list, create, and delete

### New Middleware

- `backend/src/middleware/customerAuth.js` — `requireCustomer` middleware checking `req.session.customer_id`

### New Routes

- `POST /api/customers/register` — public account creation, signs the new customer in
- `POST /api/customers/login` — public sign-in setting `req.session.customer_id`
- `POST /api/customers/logout` — clears the customer session field without destroying the session
- `GET /api/customers/me` — returns the signed-in customer or `null`, with self-heal of stale sessions
- `GET /api/customers/orders` — auth-protected list of the signed-in customer's orders with items
- `GET /api/orders/:id/notes` — admin list of notes for an order
- `POST /api/orders/:id/notes` — admin add note (trimmed, max 1000 chars)
- `DELETE /api/orders/:id/notes/:noteId` — admin delete with order-scoped check

### Updated Routes

- `POST /api/orders/public` — now writes `customer_id` from the session when present, linking guest-or-account orders to accounts where applicable
- `backend/src/app.js` — mounted `/api/customers` and `/api/orders/:id/notes` (the nested notes mount sits before the general orders mount)

### New Files

- `database/migrations/004_add_customer_accounts.sql` — idempotent migration adding `customers`, `order_notes`, the `customer_id` column on `orders`, and supporting indexes
- `backend/src/middleware/customerAuth.js` — customer auth middleware
- `backend/src/routes/customers.js` — customer auth and history router
- `backend/src/routes/notes.js` — nested order notes router

---

## Project Planning

- Five of the six SRS Section 5 Phase 2 enhancements have now been delivered: inventory tracking (Week 9), customer order tracking (Week 9), dashboard stats (Week 9), customer reviews (Week 10), low stock alerts (Week 10), and customer accounts with order history (Week 11)
- Customer reviews can now be tied to a customer once a future migration links `reviews.customer_id` (deferred until there is enough account adoption to design the per-customer review summary correctly)
- The remaining major Phase 2 item is online payment gateway integration; this is paused until a payments provider is selected, since gateway choice (Stripe vs. Razorpay vs. Square) drives the schema for storing transaction references, refund flows, and webhook idempotency keys
- A future improvement is automated email notification on order status change (Received → In Preparation → Completed); the customer email is now reliably present whenever a customer is signed in, so the data side of that feature is in place

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Authentication and Password Storage — using `bcryptjs` to salt-and-hash customer passwords at cost 10, never storing or logging the plaintext, and using `bcrypt.compare` for constant-time verification
- Session Management — running a second authentication tier (customer) in the same `express-session` cookie as the existing admin tier by partitioning the session object into orthogonal keys (`authenticated` vs. `customer_id`), keeping middleware checks independent
- Information Disclosure Prevention — returning a single generic `Invalid email or password` message for both unknown email and wrong password to avoid email enumeration, and intercepting database error code `23505` to return a controlled `409` rather than the raw constraint name
- Relational Database Design — modelling the customer-to-order relationship as one-to-many with a nullable foreign key and `ON DELETE SET NULL`, which preserves order history when a customer record is removed (a common business requirement that pure cascading would violate)
- Index-Supported Query Design — adding `orders_customer_id_idx` so the per-customer order list scales with the number of customers rather than the size of the orders table
- Input Validation — combining a server-side regex for email format, a server-side length check for passwords, and trim/length checks for note bodies so validation lives at the trust boundary and is not bypassable from the client
- React Router Patterns — using nested public routes that perform their own session check via `/customers/me` and conditional redirect inside `useEffect`, rather than a wrapping route guard, since the same routes need to behave differently for guests vs. signed-in customers
- Cross-Page State Transfer — using React Router's `location.state` (rather than query strings or `sessionStorage`) to pass reorder item arrays from the dashboard to the order form, keeping the URL clean and the data ephemeral
- Idempotent Schema Migration — combining `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, and `CREATE INDEX IF NOT EXISTS` so the migration is safe to re-run

---

## Evidence

- `database/migrations/004_add_customer_accounts.sql` — customers, order_notes, customer_id column, indexes
- `database/schema.sql` — updated with new tables and column for fresh installations
- `backend/src/middleware/customerAuth.js` — customer auth middleware
- `backend/src/routes/customers.js` — register, login, logout, me, orders endpoints
- `backend/src/routes/notes.js` — nested order notes router
- `backend/src/routes/orders.js` — `POST /public` now persists `customer_id` from the session
- `backend/src/app.js` — `/api/customers` and `/api/orders/:id/notes` mounted
- `frontend/src/pages/CustomerLogin.jsx` — sign-in page
- `frontend/src/pages/CustomerRegister.jsx` — sign-up page with validation
- `frontend/src/pages/CustomerDashboard.jsx` — order history with Track and Reorder
- `frontend/src/pages/PlaceOrder.jsx` — customer pre-fill, sign-in CTA, reorder support via location state
- `frontend/src/pages/OrderDetail.jsx` — internal notes panel
- `frontend/src/App.jsx` — `/sign-in`, `/register`, `/account` public routes
- Tested: customer registration with duplicate-email rejection (409), sign-in/sign-out cycle, order placement while signed in attaches `customer_id`, dashboard order list, reorder pre-fills the order form, internal note add/list/delete on admin order detail, frontend production build succeeds with no new errors

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
