# Week 12 Work Log (May 11 – May 17, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 27 hours

---

## Work Summary

This week delivered the two remaining Phase 2 enhancements from SRS Section 5: online payment gateway integration and automated customer notifications. Stripe was selected as the payment provider and integrated end-to-end — customers can now choose "Cash on Delivery" or "Pay by card" on the public order form, with card payments processed entirely through Stripe.js so card numbers never touch the application server. A signed webhook endpoint handles payment confirmation asynchronously. The notification side was implemented via SMTP email: when an admin advances an order to "In Preparation", "Completed", or "Cancelled", the customer automatically receives a status email if their address is on file. Both features degrade gracefully when the required environment variables are absent, so existing deployments continue to work without changes.

---

## Technical Activities

### Stripe Online Payment Integration (SRS Section 5: Online payment gateway integration)

**Database migration** (`database/migrations/005_add_payment_fields.sql`):

- Added `payment_method VARCHAR(10) NOT NULL DEFAULT 'cod'` to the `orders` table using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; a `CHECK (payment_method IN ('cod', 'stripe'))` constraint enforces valid values
- Added `stripe_payment_intent VARCHAR(100)` (nullable) to record the Stripe PaymentIntent ID for card orders; this ID is used by the webhook handler to match incoming Stripe events to the correct order without requiring any additional lookup by customer email or order amount
- The constraint is added via a conditional `DO $$ ... IF NOT EXISTS` block so the migration is safe to re-run
- `database/schema.sql` updated to include both new columns and the constraint so fresh installations start with the full schema

**Backend — payments route** (`backend/src/routes/payments.js`):

- `POST /api/payments/create-intent` — public endpoint that accepts the list of items, fetches the current `price_per_kg` for each product from the database, and computes the total in cents server-side; this prevents price tampering since the client never sends a monetary amount
- Creates a Stripe `PaymentIntent` with `amount` (in cents), `currency: 'usd'`, and `payment_method_types: ['card']`; returns `{ client_secret, payment_intent_id }` to the frontend
- Returns `503` with a descriptive error when `STRIPE_SECRET_KEY` is absent so the absence of the environment variable produces a clear API failure rather than a crash
- Rejects orders below 50 cents (Stripe's minimum charge) with a `400` error
- `POST /api/payments/webhook` (exported as `webhookHandler`) — handles signed Stripe events using `stripe.webhooks.constructEvent` with the `STRIPE_WEBHOOK_SECRET`; on a `payment_intent.succeeded` event, sets `payment_received=TRUE` on the matching order using `stripe_payment_intent=$1`; signature verification returns a `400` rather than a `500` if the HMAC check fails, which is the correct response code for a bad request from Stripe's retry logic

**Backend — app wiring** (`backend/src/app.js`):

- The Stripe webhook endpoint requires the raw request body for HMAC signature verification; `express.json()` would parse and buffer the body before it could be read as raw bytes, breaking the signature check
- To solve this, the webhook handler is exported separately from the router and mounted with `express.raw({ type: 'application/json' })` at `app.post('/api/payments/webhook', ...)` before the `app.use(express.json())` call
- The rest of the payments router (the `create-intent` endpoint) is mounted via `app.use('/api/payments', paymentsRouter)` after `express.json()`, as with all other routers

**Backend — orders route** (`backend/src/routes/orders.js`):

- `POST /api/orders/public` now accepts `payment_method` and `stripe_payment_intent_id` from the request body and writes them to the new columns; the `payment_method` field defaults to `'cod'` if absent or unrecognised, preserving backwards compatibility with any existing clients
- Returns `400` when `payment_method: 'stripe'` is submitted without a `stripe_payment_intent_id`, preventing orders from being created in a state where the webhook can never match them

**Frontend — PlaceOrder page** (`frontend/src/pages/PlaceOrder.jsx`):

- `loadStripe` is called once at module level with `VITE_STRIPE_PUBLISHABLE_KEY` (read from Vite's `import.meta.env`); if the key is absent the result is `null` and the "Pay by card" button is rendered but disabled, so the form remains usable for COD orders without any code-path changes
- The page is restructured: a new inner `OrderForm` component holds all form state and logic, while the outer `PlaceOrder` shell wraps it in `<Elements stripe={stripePromise}>` when `stripePromise` is non-null — this allows `OrderForm` to call `useStripe()` and `useElements()` hooks from `@stripe/react-stripe-js`; the hooks return `null` when called outside an `Elements` provider, which is handled in the submit path
- A payment method selector renders two toggle buttons: "Cash on Delivery" and "Pay by card"; the card button is disabled and labelled "not enabled" when `VITE_STRIPE_PUBLISHABLE_KEY` is absent
- When "Pay by card" is selected, Stripe's `<CardElement>` renders in a bordered container below the toggle; the card element is hosted in a Stripe-owned iframe so card numbers, CVVs, and expiry dates never reach the application origin
- Email becomes a required field when `payment_method === 'stripe'` because Stripe requires a receipt email and the order confirmation notification relies on it
- The submit button label changes to `Pay $X.XX & Place Order` when card payment is selected, showing the exact charge amount calculated from the selected items
- **Submit flow for card payments (three-step):**
  1. `POST /api/payments/create-intent` with the items — total is computed server-side; the client receives `client_secret` and `payment_intent_id`
  2. `stripe.confirmCardPayment(client_secret, { payment_method: { card: cardElement } })` — Stripe.js sends the card data directly to Stripe's servers over TLS; the application server never sees the raw card details
  3. On success, `POST /api/orders/public` with `payment_method: 'stripe'` and `stripe_payment_intent_id` — the order is created linked to the confirmed PaymentIntent; the Stripe webhook subsequently sets `payment_received=TRUE`
- Stripe errors from step 2 (declined card, insufficient funds, authentication required) are surfaced directly to the user via `stripeError.message` which Stripe formats in user-friendly language

---

### Automated Order Status Email Notifications (SRS Section 5: Automated notifications)

**Problem:** Customers had no way to know when their order status changed unless they manually checked the tracking page. The email field had been collected since Phase 1 but was never used for outbound communication.

**Backend — mailer service** (`backend/src/services/mailer.js`):

- Created a `nodemailer` transport factory that reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, and `SMTP_FROM` from environment variables; returns `null` when `SMTP_HOST` is absent so callers can skip sending without any conditional logic
- `sendOrderStatusEmail(order, newStatus)` is the single exported function; it is called with the full order record and the new status string
- Email subjects and bodies are defined for three transitions: "In Preparation" ("Your order is being prepared"), "Completed" ("Your order is ready"), and "Cancelled" ("Your order has been cancelled"); no email is sent for the `Received` status because that already triggers the order confirmation page
- Errors from `nodemailer` (authentication failure, network timeout, DNS resolution) are caught inside the function and logged to stderr; they are never re-thrown, so a mail delivery failure cannot cause the status-update API call to return a `500` to the admin dashboard
- The function returns early without attempting delivery when the order has no email address, so orders placed without an email (which is optional on COD orders) are silently skipped

**Backend — orders route** (`backend/src/routes/orders.js`):

- Imported `{ sendOrderStatusEmail }` from the new mailer service
- In `PATCH /api/orders/:id/status`, after the `UPDATE orders SET status=...` query succeeds and `res.json(updatedOrder)` is called, `sendOrderStatusEmail(updatedOrder, status)` is invoked without `await` — this is a deliberate fire-and-forget pattern so the HTTP response returns immediately and the admin dashboard is not delayed by SMTP round-trip time
- The updated order row returned by `RETURNING *` contains the `email` field, so the mailer receives the customer email directly from the database without an additional query

---

## Frontend Architecture

### Updated Pages

- `src/pages/PlaceOrder.jsx` — restructured into outer `PlaceOrder` shell and inner `OrderForm` component; Stripe `Elements` wrapper applied when publishable key is configured; payment method toggle (COD / card) with `CardElement`; three-step card payment submit flow; graceful degradation when Stripe key is absent

---

## Backend Architecture

### New Route File

- `backend/src/routes/payments.js` — `POST /create-intent` (standard JSON, public), plus `webhookHandler` (exported separately for raw-body mounting)

### New Service

- `backend/src/services/mailer.js` — `nodemailer` transport factory and `sendOrderStatusEmail` with per-status templates and silent error handling

### New Routes

- `POST /api/payments/create-intent` — public, server-side total computation, Stripe PaymentIntent creation
- `POST /api/payments/webhook` — Stripe signed webhook, mounted before `express.json()` with `express.raw()`

### Updated Routes

- `POST /api/orders/public` — accepts `payment_method` and `stripe_payment_intent_id`; defaults to `'cod'` for backwards compatibility
- `PATCH /api/orders/:id/status` — fires `sendOrderStatusEmail` after a successful status update

### New Files

- `database/migrations/005_add_payment_fields.sql` — `payment_method` and `stripe_payment_intent` columns with CHECK constraint
- `backend/src/routes/payments.js` — Stripe payments router and webhook handler
- `backend/src/services/mailer.js` — nodemailer mailer service

### New Dependencies

- `stripe@^22` (backend) — Stripe Node.js SDK for PaymentIntent creation and webhook signature verification
- `nodemailer@^8` (backend) — SMTP email transport
- `@stripe/stripe-js@^9` (frontend) — Stripe.js browser SDK, loads from Stripe's CDN with SRI
- `@stripe/react-stripe-js@^6` (frontend) — React bindings for Stripe Elements (`CardElement`, `useStripe`, `useElements`)

### Environment Variables Added

Backend `.env` (all optional — features degrade gracefully when absent):
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASS=<password>
SMTP_FROM=Snack Shop <notifications@example.com>
SMTP_SECURE=false
```

Frontend `.env`:
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Project Planning

- All six SRS Section 5 Phase 2 enhancements are now fully implemented: inventory tracking (Week 9), customer order tracking (Week 9), dashboard stats (Week 9), customer reviews (Week 10), low stock alerts (Week 10), customer accounts with order history (Week 11), online payment gateway integration (Week 12), and automated notifications (Week 12)
- The Stripe integration uses Stripe's test mode keys during development; switching to live mode requires only replacing the key values in environment variables — no code changes are needed
- The email notification system covers order lifecycle events; a future enhancement could extend it to a WhatsApp or SMS channel (Twilio, for example) by adding a second provider in the mailer service without changing the call site in the orders route
- Stripe's `payment_intent.succeeded` webhook makes payment confirmation reliable even when the browser tab is closed after the card payment step but before the order creation step; a future improvement could poll for unconfirmed Stripe PaymentIntents and link them to orders automatically

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Payment Security — using Stripe.js `CardElement` so raw card data (PAN, CVV, expiry) is tokenized in a Stripe-hosted iframe and never passes through the application server, eliminating PCI DSS scope for cardholder data
- Webhook Signature Verification — using HMAC-SHA256 (`stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`) to authenticate inbound Stripe events, preventing replay attacks or forged confirmations from malicious parties
- Raw vs Parsed Body Middleware Ordering — registering the webhook endpoint with `express.raw({ type: 'application/json' })` before `express.json()` in the middleware chain, because `express.json()` consumes and buffers the request stream, making the raw bytes needed for signature verification unavailable to later handlers
- Server-Side Price Validation — computing the PaymentIntent amount from database-authoritative prices rather than accepting a client-submitted total, closing a business-logic vulnerability where a client could alter the price of their order
- Asynchronous Fire-and-Forget — calling `sendOrderStatusEmail` without `await` after `res.json()` so the HTTP response returns to the admin immediately, decoupling the API latency from SMTP round-trip time while accepting that delivery errors are observable only in server logs
- Graceful Degradation — structuring both new integrations around environment variable guards so the application starts and operates normally when `STRIPE_SECRET_KEY` or `SMTP_HOST` are absent, allowing incremental deployment without a hard coupling between feature enablement and code deployment
- React Component Composition — splitting `PlaceOrder` into a shell component (data fetching, Stripe context setup) and an inner `OrderForm` component (form state and submission logic) so the `Elements` provider wraps only the parts that need Stripe hooks
- Idempotent Schema Migration — using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and a conditional `DO $$ IF NOT EXISTS` block for the constraint so the migration is safe to re-run without errors

---

## Evidence

- `database/migrations/005_add_payment_fields.sql` — payment_method and stripe_payment_intent columns
- `database/schema.sql` — updated with new columns and constraint
- `backend/src/routes/payments.js` — create-intent endpoint and webhookHandler export
- `backend/src/routes/orders.js` — payment fields on public order creation, sendOrderStatusEmail on status change
- `backend/src/app.js` — raw webhook mount before express.json(), payments router mounted
- `backend/src/services/mailer.js` — nodemailer transport factory, sendOrderStatusEmail with status templates
- `frontend/src/pages/PlaceOrder.jsx` — Elements wrapper, OrderForm component, payment method toggle, CardElement, three-step Stripe submit flow
- `backend/package.json` — stripe and nodemailer added
- `frontend/package.json` — @stripe/stripe-js and @stripe/react-stripe-js added
- Tested: COD order placement unchanged (no Stripe key set), card payment flow with Stripe test cards in Elements, webhook signature verification rejects tampered payloads with 400, status email fires after PATCH /orders/:id/status with email on the order, absent SMTP_HOST skips email silently, frontend production build succeeds

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
