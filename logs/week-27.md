# Week 27 Work Log (August 24 – August 30, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week closed the one concrete item left in the Week 26 planning notes, then addressed two gaps found by comparing admin-facing tooling against its customer-facing or session-based equivalents rather than following up on a single feature area. The first was surfacing Stripe's decline reason directly in the payment-events UI — the underlying data had been logged since the failed-payment work began last week, but the human-readable "why" was buried in a JSON payload nobody could see without querying the database directly. The second was a parity gap on the admin's manual order-entry form: the customer-facing checkout has shown a running order total since it was built, but the admin's equivalent form never did, leaving staff to add up prices by hand while entering a phone-in order. The third was a genuine data-linkage gap: orders an admin enters manually on a customer's behalf were never associated with that customer's account, even when the account already existed and the email matched exactly — so a repeat customer's phone-in order silently vanished from their own order history and account stats.

---

## Technical Activities

### Surfacing Stripe's Decline Reason (SRS Section 4.4, follow-up from Week 26)

**Problem:** Week 26 gave failed-payment events a distinct red color in the admin UI, but said nothing about *why* a payment failed — that detail (Stripe's `last_payment_error.message`, e.g. "Your card was declined") was already present in the raw webhook payload logged to `webhook_events`, but nothing extracted or displayed it. An administrator seeing a red "payment_intent.payment_failed" row had no way to tell an expired card from insufficient funds from a suspected-fraud block without opening Stripe's own dashboard.

**Backend — payments route** (`backend/src/routes/payments.js`):

- `GET /api/payments/webhook-events` now selects `payload->'data'->'object'->'last_payment_error'->>'message' AS decline_reason` alongside the existing fields, in both the global-events and per-payment-intent query branches
- This is `NULL` for any event without that nested path (which is every event type except a failed payment attempt), so no special-casing by `event_type` was needed in the query itself — a missing JSON path in Postgres's `->` operator chain simply produces `NULL` rather than an error, which is exactly the right behavior here

**Frontend — Orders and OrderDetail pages** (`frontend/src/pages/Orders.jsx`, `frontend/src/pages/OrderDetail.jsx`):

- Both webhook-event displays (the dashboard's "Recent payment events" panel and the per-order "Stripe payment events" history) now render `ev.decline_reason` in red directly under the event type and PaymentIntent ID, when present — no change needed for events that don't carry one, since the conditional render simply doesn't fire

### Live Order Total on Manual Order Entry (SRS Section 4.4: Usability Requirements)

**Problem:** `PlaceOrder.jsx`, the customer-facing checkout form, has shown a live "Estimated total" since Week 8-ish that updates as items are added — but `NewOrder.jsx`, the admin's equivalent form for entering an order manually (e.g. a phone-in order), never gained the same feature. An administrator building a multi-item order by hand had to mentally total the prices themselves, with no on-screen confirmation the final charge matched what they intended.

**Frontend — NewOrder page** (`frontend/src/pages/NewOrder.jsx`):

- Added the identical `selectedTotal` computation `PlaceOrder.jsx` already uses — reducing over the selected items, looking up each one's current price from the fetched product list, multiplying by quantity — with one small hardening addition: `parseFloat(item.quantity_kg) || 0`, since this form's quantity input can transiently hold a non-numeric or empty value while being typed (a state `PlaceOrder.jsx`'s equivalent field doesn't need to guard against in quite the same way, given its own input handling), and a `NaN` propagating through the reduce would have silently broken the total for every line after it
- Added the same "Order total" line beneath the item list, shown only once at least one item has a valid product selected — matching `PlaceOrder.jsx`'s "don't show a $0.00 total before anything is selected" convention exactly

### Auto-Linking Manually-Entered Orders to Existing Customer Accounts (SRS Section 4.3/4.4)

**Problem:** `POST /api/orders/public` (the customer-facing order-creation route) already links a new order to `req.session.customer_id` when a customer is signed in — but `POST /api/orders` (the *admin's* order-creation route, used by `NewOrder.jsx`) never set `customer_id` at all, under any circumstance. A repeat customer who called in an order, or had one entered on their behalf at a counter, would have that order permanently disconnected from their own account — invisible in their order history, uncounted in their lifetime stats — even though they typed the exact same email into their account that the admin typed into the order form.

**Backend — orders route** (`backend/src/routes/orders.js`):

- `POST /api/orders` now looks up `customers` by the order's `email` (case-normalized) before inserting; if a match is found, that customer's `id` is written into the new order's `customer_id` column
- No new schema or route was needed — `orders.customer_id` and its `ON DELETE SET NULL` foreign key have existed since Week 4, and every downstream consumer of that column (the customer dashboard's order history and stats, from Weeks 22–23) already reads it correctly; this was purely a matter of one route failing to populate a column that already meant something everywhere else it was read
- An order with no email, or an email that doesn't match any registered account, correctly leaves `customer_id` as `NULL` — the same as it always has — so this is purely additive and can't misattribute an order to the wrong account by matching on anything looser than an exact email

---

## Frontend Architecture

### Updated Pages

- `src/pages/NewOrder.jsx` — live "Order total" line, mirroring `PlaceOrder.jsx`'s existing running-total pattern
- `src/pages/Orders.jsx`, `src/pages/OrderDetail.jsx` — both webhook-event displays now show `decline_reason` in red when present

---

## Backend Architecture

### Updated Routes

- `GET /api/payments/webhook-events` — now selects `decline_reason` (Stripe's `last_payment_error.message`) from the payload, `NULL` when absent
- `POST /api/orders` — now looks up the order's email against `customers` and links `customer_id` on a match, closing the gap between this route and the customer-session-aware `POST /api/orders/public`

---

## Project Planning

- The customer-account auto-link only fires on an exact, case-normalized email match — a customer whose account email differs even slightly from what an admin typed (a typo, a different email entirely) won't be linked, and there's no fallback matching on phone number; phone wasn't used because, unlike email, it isn't unique-constrained on `customers` and a false match there would misattribute an order to the wrong account
- `NewOrder.jsx`'s total, like `PlaceOrder.jsx`'s, is illustrative only — it's computed client-side from whatever product data was fetched on page load, not authoritative; the actual charge (for online orders) and the stored order total are always computed server-side from current database prices at order-creation time, so a stale client-side total could theoretically drift from the real one if prices changed mid-entry, though this has always been true of `PlaceOrder.jsx` too and was never treated as a defect there
- `decline_reason` surfaces Stripe's message field, which is written for a human to read but is still just prose — it's not a stable, filterable code the way `event_type` is, so a future "which decline reasons are we seeing most" aggregate view would need to key off `last_payment_error.decline_code` instead (a stable enum-like string Stripe also provides) rather than grouping by the free-text message

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Safe Null-Propagation Through Nested JSON Paths — `payload->'data'->'object'->'last_payment_error'->>'message'` returns `NULL` at whichever `->` step first finds nothing to descend into, rather than raising an error for a missing key; this is the same defensive-navigation principle as optional chaining (`?.`) in JavaScript, just expressed in Postgres's JSON operator syntax, and it's what let one query handle both "a failed-payment event with this field" and "every other event type without it" without a branching `CASE` statement
- Recognizing the Same Bug Pattern Across Two Independent Order-Creation Paths — the admin route's missing `customer_id` linkage is structurally the same class of gap as the Week 22 discovery that CustomerDashboard lacked features the admin Orders page already had: two code paths implementing "the same real-world action" (placing an order) had quietly diverged in a way visible only by explicitly comparing them side by side, not by reading either one in isolation
- Defensive Coercion at a Trust Boundary Between UI State and Computation — `parseFloat(item.quantity_kg) || 0` in the new total calculation guards against exactly the state a controlled number input can transiently hold (empty string, a bare minus sign, `NaN` from an incomplete decimal) before the user finishes typing; a reduce over an array where any single element can silently become `NaN` corrupts every subsequent accumulation, not just that one term, since `NaN` propagates through arithmetic rather than raising
- Idempotent, Match-or-No-Match Enrichment as a Non-Breaking Addition — the customer-linking lookup either finds exactly one row or finds none; there's no ambiguous "multiple matches" case to handle because `customers.email` is already unique-constrained, so the added logic has exactly two possible outcomes and neither can partially fail or need a tie-breaking rule
- Illustrative vs. Authoritative Computation — the new order-total display is explicitly a client-side convenience for the person entering data, not the value that gets persisted or charged; the real total is always recomputed server-side from current prices at the moment of insert (as it already was, unrelated to this week's change) — a useful general distinction between a UI affordance that helps a human catch their own mistake and the actual source of truth a system relies on

---

## Evidence

- `backend/src/routes/payments.js` — `decline_reason` added to `GET /webhook-events`, both query branches
- `backend/src/routes/orders.js` — `POST /` now looks up and links `customer_id` by email match
- `frontend/src/pages/NewOrder.jsx` — live "Order total" line
- `frontend/src/pages/Orders.jsx`, `frontend/src/pages/OrderDetail.jsx` — `decline_reason` rendered in red on both webhook-event displays
- Verified the total calculation's arithmetic directly in Node against a small fixture (two selected products with fractional quantities, plus one unselected row) and confirmed it produced the expected sum while correctly ignoring the unselected row; seeded a `payment_intent.payment_failed` webhook event with a realistic `last_payment_error.message` and confirmed `GET /payments/webhook-events` correctly returned it as `decline_reason` in both the global and per-payment-intent query forms; seeded a `payment_intent.succeeded` event with no such field and confirmed `decline_reason` came back `null` rather than an error; registered a test customer, then had the admin route create an order using that same email and confirmed the returned order's `customer_id` matched the registered account, and that the order then correctly appeared in that customer's own `GET /customers/orders` and was correctly counted in `GET /customers/stats`; confirmed a second order with a non-matching email, and a third with no email at all, both correctly left `customer_id` as `null`; `npm run lint` (aside from the same pre-existing, unrelated warnings/error in `OrderDetail.jsx` documented in prior weeks — confirmed via `git diff` that none of them fall on lines this week's changes touched) and `npm run build` both pass on the frontend; all seeded test customers, orders, order items, and webhook events were removed from the local database after verification
- **Testing limitation:** as in prior weeks, all features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review and direct execution of the pure calculation logic; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
