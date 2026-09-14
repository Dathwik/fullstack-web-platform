# Week 29 Work Log (September 7 – September 13, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week continued the sibling-comparison audit habit flagged at the end of Week 28, which surfaced the most significant bug found in several weeks: a product's `is_available` flag — the switch an administrator uses to pull an item off the menu — was only ever enforced by filtering it out of dropdown menus on the frontend, never by the backend that actually creates orders. A customer's cash-on-delivery order (and, it turned out, an admin-entered order too) could still be placed for a product marked unavailable, as long as nothing else caught it; only the Stripe online-payment path happened to be protected, because a separate, unrelated check in the payment-intent route incidentally blocked it before a card was ever charged. The second and third items closed both remaining threads from the Week 28 planning notes: showing which card was used for a Stripe payment (Stripe's PaymentIntent payload carries this, but nothing surfaced it), and aggregating the decline codes added last week into an actual "what's failing and how often" breakdown on the admin dashboard.

---

## Technical Activities

### Closing the `is_available` Enforcement Gap (bug fix, SRS Section 4.3: Inventory Management)

**Problem:** `is_available` on a product controls whether it appears in `NewOrder.jsx`'s and `PlaceOrder.jsx`'s dropdown menus — both already filter it out client-side. But neither the public order route (`POST /orders/public`) nor the admin route (`POST /orders`) checked it server-side; the shared `insertItemsWithStockCheck` helper both routes call verified stock quantity but not availability. The gap was invisible in ordinary use (nobody manually types a product ID), but the customer-facing "Reorder" button on `CustomerDashboard.jsx` reconstructs an order's items directly from its historical `product_id`s, completely bypassing the dropdown and its filter — reordering a discontinued item would silently succeed for a cash-on-delivery order. Comparing this against `POST /payments/create-intent` (the Stripe path) showed it already checked `is_available` for an unrelated reason (to avoid creating a PaymentIntent for something that shouldn't be charged for), which is the only reason the Stripe path wasn't equally exposed — an accidental protection, not a designed one.

**Backend — orders route** (`backend/src/routes/orders.js`):

- `insertItemsWithStockCheck` (shared by the public order route, the admin order route, and the order-editing route) now fetches `is_available` alongside `stock_kg` and rejects the whole insertion with `'One of the items in this order is no longer available'` if any item's product isn't available — closing the gap for every caller of this function at once, rather than patching each route separately and risking a fourth call site someday reintroducing the same hole

**Frontend — PlaceOrder page** (`frontend/src/pages/PlaceOrder.jsx`):

- Added a one-time reconciliation effect that runs once real product data has loaded: it filters the reorder-seeded `items` array down to only product IDs that still exist in the (already available-and-in-stock-filtered) `products` list, dropping anything stale
- Without this, a stale reorder item wouldn't just fail at submission — it would render as a blank, unexplained dropdown selection beforehand, and silently contribute `$0` to the running total (since the total's lookup against `products` would find nothing for that ID), understating what the customer would actually be charged for the remaining valid items right up until the submit attempt failed
- A visible amber notice now tells the customer how many items were dropped and why, rather than leaving them to notice a shorter or differently-priced order than the one they clicked "Reorder" from
- The reconciliation is guarded by a ref so it runs exactly once — it reconciles against the *first* load of real product data and never re-fires or overwrites anything the customer edits by hand afterward

### Surfacing the Card Used for a Payment (SRS Section 4.4, follow-up from Week 28)

**Problem:** Week 28's planning notes pointed out that neither the on-screen payment section nor the packing slip mentioned which card was used for a Stripe payment, even though Stripe's own webhook payload for a successful charge already carries the card's network and last four digits — nothing in this codebase extracted or displayed it.

**Backend — payments route** (`backend/src/routes/payments.js`):

- `GET /api/payments/webhook-events` now also selects `card_brand` and `card_last4` from `charges.data[0].payment_method_details.card` in the payload, present only on a `payment_intent.succeeded` event for a card payment and `NULL` otherwise — the same null-safe nested-path technique already used for `decline_reason`/`decline_code`

**Frontend — OrderDetail page** (`frontend/src/pages/OrderDetail.jsx`):

- The order's own row never stores card details — only whichever webhook event happened to carry that charge data — so the main Payment section now derives it by scanning the already-fetched `stripeEvents` list for the first entry carrying both fields, and displays it as e.g. "Visa •••• 4242" beneath the existing Received/Pending status

### Decline-Reason Aggregate Dashboard (SRS Section 4.4, follow-up from Week 28)

**Problem:** Week 28 added `decline_code` to individual failed-payment events but explicitly left aggregation for later, since nothing had asked for it yet — the planning notes named the specific gap: "which decline reasons are most common" had no answer without querying the database directly.

**Backend — payments route** (`backend/src/routes/payments.js`):

- Added `GET /api/payments/decline-reasons?days=30`, grouping `payment_intent.payment_failed` events by `decline_code` over a trailing window and returning counts ordered most-common-first
- Groups by the stable `decline_code` rather than the free-text `decline_reason` message, for the same reason the Week 28 notes gave for adding the code in the first place: two failures with the same code are guaranteed to share a cause, while two failures with superficially different wording of the same underlying message aren't guaranteed to group cleanly on text alone
- `COALESCE(..., 'unknown')` covers the rare case of a failure event with no `decline_code` in its payload at all, so it still gets counted rather than silently vanishing from the breakdown

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added a "Decline reasons — last 30 days" panel beneath the existing "Recent payment events" panel, listing each decline code and its count — hidden entirely when there's nothing to show, matching the same show-only-when-non-empty convention already used by the panel directly above it

---

## Frontend Architecture

### Updated Pages

- `src/pages/PlaceOrder.jsx` — one-time reorder-item reconciliation against real product data, with a visible notice when items are dropped
- `src/pages/OrderDetail.jsx` — main Payment section now shows the card brand and last four digits when available
- `src/pages/Orders.jsx` — new "Decline reasons — last 30 days" breakdown panel

---

## Backend Architecture

### Updated Routes

- `POST /orders/public`, `POST /orders`, and the order-item-editing path (all via the shared `insertItemsWithStockCheck`) — now reject any item whose product is `is_available = false`
- `GET /api/payments/webhook-events` — now also selects `card_brand` and `card_last4`
- `GET /api/payments/decline-reasons` (new) — decline-code counts over a trailing window, most common first

---

## Project Planning

- The `is_available` fix protects every current caller of `insertItemsWithStockCheck`, but any future route that inserts into `order_items` directly (bypassing that shared function) would reintroduce the same class of gap — the enforcement is only as durable as everything continuing to go through the one shared path
- The decline-reason breakdown is a flat count over a fixed 30-day window with no comparison to a prior period — unlike several other dashboard metrics in this codebase (the reviews trend badge from Week 18, the stock-velocity trend from Week 20), it doesn't yet say whether failures are trending up or down, only how many of each kind occurred
- Card brand/last4 are only ever available for orders whose `payment_intent.succeeded` webhook happened to arrive and get logged — an order paid before webhook logging was added, or one whose webhook delivery genuinely failed, will just show no card details rather than a placeholder explaining why; this is consistent with how every other webhook-derived field in this codebase already behaves (silently absent rather than distinguishing "never happened" from "we don't know")

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Client-Side Filtering Is Not Enforcement — this is the central lesson of the week's main bug: a dropdown that hides invalid options prevents a well-behaved UI from constructing an invalid request, but it does nothing to stop a request built any other way (a reorder shortcut that skips the dropdown, a direct API call, a future bug in a different form) from reaching the same backend unfiltered. Real enforcement has to live at the boundary that actually creates the record, not at every UI surface that happens to construct one
- An Incidental Side Effect Masquerading as a Deliberate Protection — the Stripe payment path's accidental immunity to this bug (via a check that existed for an unrelated reason) is a caution about verifying *why* something works, not just *that* it works: if that check in `create-intent` had been refactored or removed for its own stated purpose, the Stripe path would have silently regressed into the same hole the COD and admin paths had the whole time, with nothing signaling that the removal had a second, unrelated consequence
- Fixing a Shared Dependency Once vs. Patching Every Caller — extending `insertItemsWithStockCheck` itself, rather than adding the same `is_available` check separately inside each of the three routes that call it, guarantees the fix applies uniformly and can't be accidentally skipped for a caller someone forgets to update; this is the same "shared predicate, one source of truth" reasoning behind the `PAYMENT_FAILED_CONDITION` extraction in Week 26 and the `stockVelocity.js` service in Week 20
- A `useEffect` Guarded by a Ref for "Run Exactly Once, Based on Async Data" — the reorder-reconciliation effect can't run at mount time (the real product data it needs hasn't arrived yet) and can't be a plain dependency-driven effect either (it would re-run and clobber the customer's own edits every time `products` or `items` changes for any reason); a ref that flips permanently after the first successful reconciliation is the standard escape hatch for "this needs to happen once, whenever its precondition first becomes true," which a dependency array alone can't express
- Grouping by a Stable Key vs. a Descriptive One — the decline-reasons aggregate groups by `decline_code`, not `decline_reason`, for the same reason a database groups by a foreign key rather than a denormalized display name: the code is guaranteed to be one of a small, stable set of values, while the message is free text that can vary in wording for the same underlying cause, making it an unreliable `GROUP BY` key even though it's the better one for a human to read

---

## Evidence

- `backend/src/routes/orders.js` — `insertItemsWithStockCheck` now rejects unavailable products, applied to all three of its callers at once
- `backend/src/routes/payments.js` — `card_brand`/`card_last4` added to `GET /webhook-events`; new `GET /decline-reasons`
- `frontend/src/pages/PlaceOrder.jsx` — one-time reorder-item reconciliation with a visible drop notice
- `frontend/src/pages/OrderDetail.jsx` — card brand/last4 shown in the main Payment section
- `frontend/src/pages/Orders.jsx` — decline-reasons breakdown panel
- Marked a real product unavailable and confirmed a COD order for it via `POST /orders/public` was correctly rejected with `"One of the items in this order is no longer available"` — the exact scenario that previously succeeded silently; confirmed the same rejection via the admin's `POST /orders` route against the same product (after an initial test-methodology slip using an unordered `SELECT ... LIMIT 1` returned a different, still-available product — corrected by pinning the exact product ID and re-testing); confirmed an available product still orders normally through both routes; verified the reorder-reconciliation filtering logic directly against a fixture with one stale and two valid items (correctly drops exactly the stale one) and against an all-stale fixture (correctly reports all dropped and falls back to a single blank row); seeded a `payment_intent.succeeded` webhook event carrying `charges.data[0].payment_method_details.card` and confirmed `GET /webhook-events` returned `card_brand: "visa"` and `card_last4: "4242"`, then verified the frontend's card-derivation logic against that exact shape; seeded four failed-payment events (two sharing a decline code, one with a different code, one with no code at all) and confirmed `GET /decline-reasons` correctly grouped them into `insufficient_funds: 2`, `expired_card: 1`, `unknown: 1`, ordered most-common-first; `npm run lint` (aside from the same pre-existing, unrelated warnings/error in `OrderDetail.jsx` documented across prior weeks) and `npm run build` both pass on the frontend; all seeded test orders and webhook events were removed from the local database, and the product's availability was restored to its original state, after verification
- **Testing limitation:** as in prior weeks, all features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review and direct execution of the pure reconciliation/derivation logic; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
