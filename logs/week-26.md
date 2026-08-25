# Week 26 Work Log (August 17 – August 23, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week closed the one remaining item from the Week 25 planning notes, then moved to a genuinely new area: giving the admin visibility into failed Stripe payments, which had been logged since Week 15 but never surfaced distinctly from any other webhook event. The first feature was the frontend half of last week's cancel-pending-email-change route — the backend shipped in Week 25 with its own UI deliberately deferred, and this week built the missing piece: a pending-change indicator on the customer dashboard with a working cancel link. The second and third features are two layers of the same underlying gap: `payment_intent.payment_failed` events were already being logged to `webhook_events` and displayed in two different places in the admin UI, but rendered identically to every other event type — nothing distinguished "this payment failed" from routine webhook noise, and there was no aggregate view at all of which orders currently have an unresolved failed payment.

---

## Technical Activities

### Cancel-Pending-Email-Change UI (SRS Section 4.4, follow-up from Week 25)

**Problem:** Week 25 built `POST /api/customers/me/email/cancel` and had `GET /api/customers/me` start returning `pending_email`, but explicitly left the frontend for both unbuilt — a customer with a pending, unconfirmed email change had no way to see that fact or act on it from the dashboard itself.

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Added a line under the customer's email/phone display, shown only when `customer.pending_email` is set: "Pending change to `[address]` — check your inbox to confirm," with an inline "Cancel" link
- `cancelPendingEmailChange()` calls the cancel route and updates the local `customer` state directly (`pending_email: null`) rather than waiting on a full refetch, so the indicator disappears immediately; if the cancel call fails with a `404` (the change was already confirmed or cancelled elsewhere in the interim — e.g. another tab), it falls back to a fresh `GET /me` to reconcile local state with whatever's actually true server-side, rather than assuming failure means nothing changed
- `requestEmailChange()` (from Week 23/24) now also updates `customer.pending_email` locally on a successful (non-no-op) request, so the new pending-change indicator appears immediately after submitting the change-email form, without needing a page reload or separate refetch to notice it

### Distinguishing Failed Payments in the Webhook Event Display (SRS Section 4.4: Usability Requirements)

**Problem:** The Stripe webhook handler (built in Week 15, extended in later weeks) logs every event type it receives to `webhook_events` without filtering by type — so `payment_intent.payment_failed` events were already being captured and already appearing in both the admin Orders dashboard's "Recent payment events" panel and each order's own "Stripe payment events" history on `OrderDetail.jsx`. But both displays only special-cased `payment_intent.succeeded` for color (green); every other event type, including a failed payment, rendered in the same neutral grey as routine, uninteresting events — a failed payment carried no more visual weight than, say, a `charge.updated` event.

**Frontend — Orders and OrderDetail pages** (`frontend/src/pages/Orders.jsx`, `frontend/src/pages/OrderDetail.jsx`):

- Added a small `webhookEventColor(eventType)` helper to each file (duplicated rather than shared, consistent with this codebase's existing precedent of duplicating small per-page constants like `STATUS_COLORS` rather than introducing a shared frontend utility module): green for `payment_intent.succeeded`, red for `payment_intent.payment_failed`, and the previous neutral grey for anything else — deliberately not attempting to enumerate every Stripe event type, since only these two are ones staff need to visually triage at a glance
- Replaced the existing inline ternary (`ev.event_type === 'payment_intent.succeeded' ? green : grey`) in both files with a call to this helper

### Payment-Issues Alert and Filter (new feature, SRS Section 4.4: Usability Requirements)

**Problem:** Even with failed-payment events now visually distinct, an administrator would only notice one by scrolling through the "Recent payment events" panel or happening to open the specific order. There was no aggregate signal — no count, no banner, no way to filter the order list down to "which orders currently have an unresolved failed payment" — the same kind of at-a-glance visibility the aging-orders and low-stock alerts already provide for their respective concerns.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Extracted a shared SQL condition, `PAYMENT_FAILED_CONDITION`, identifying an order as having an unresolved failed payment: it's a Stripe order, payment hasn't been received, the order isn't cancelled, and a `payment_intent.payment_failed` webhook event exists whose payload's PaymentIntent ID matches the order's `stripe_payment_intent`
- This relies on a property already true elsewhere in the codebase: `stripe_payment_intent` is set once at order creation and never overwritten, so a failed-payment event logged against that PI is a durable, unambiguous signal — a customer whose payment fails must place an entirely new order to retry, they can't retry against the same order and PI, so there's no risk of a later success under the same order superseding an earlier failure
- `GET /api/orders/stats` now includes a `payment_failed: { count }` field alongside the existing `today`, `pending`, `week`, `unpaid`, and `aging` counts, computed with the shared condition
- `GET /api/orders` now accepts `?payment_failed=true`, applying the same shared condition as an additional filter — mirroring the exact pattern the pre-existing `?aging=true` parameter already established, so this required no new filtering infrastructure, just a new condition plugged into the existing one

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added a "Payment issues" alert banner (red-tinted, following the same clickable-banner-sets-filter pattern as the existing aging-orders banner), shown when `stats.payment_failed.count > 0` and the filter isn't already on it; clicking it sets `filter` to `'payment_failed'`
- Added a "Payment issues" filter tab alongside the existing Active/Done/All/Aging tabs, complete with its own count badge — this was necessary rather than optional, since the aging tab's precedent showed that a filter reachable only via a banner click, with no corresponding tab reflecting it as "currently selected," would leave every tab looking unselected while a filter is actually active
- `fetchOrders` now passes `payment_failed: 'true'` to the API when that filter is active, and the client-side status-filtering pass-through comment was updated to note that `'payment_failed'` (like `'aging'`) is already filtered server-side and needs no additional client-side narrowing

---

## Frontend Architecture

### Updated Pages

- `src/pages/CustomerDashboard.jsx` — pending-email-change indicator with a working "Cancel" link; email-change request now updates local state immediately
- `src/pages/Orders.jsx` — `webhookEventColor` helper; "Payment issues" alert banner and filter tab with count badge
- `src/pages/OrderDetail.jsx` — `webhookEventColor` helper applied to the per-order Stripe event history

---

## Backend Architecture

### Updated Routes

- `GET /api/orders/stats` — new `payment_failed: { count }` field
- `GET /api/orders` — new `?payment_failed=true` filter, sharing the same `PAYMENT_FAILED_CONDITION` SQL fragment as `/stats`

---

## Project Planning

- `PAYMENT_FAILED_CONDITION` currently only recognizes `payment_intent.payment_failed`; Stripe has other event types that could indicate a problem (e.g. a dispute or chargeback), which aren't reflected in this signal — the condition can be extended if those ever need the same aggregate treatment
- The payment-issues banner and filter say nothing about *why* a payment failed (Stripe's decline reason, e.g. insufficient funds vs. an expired card) — that detail already exists in the logged webhook payload's JSON but isn't surfaced anywhere in the UI; a future improvement could show it inline next to the event in the per-order Stripe history
- This week's local dev database was again missing pre-existing migrations unrelated to this week's work — `005_add_payment_fields.sql` (the `payment_method`/`stripe_payment_intent` columns) and `006_add_webhook_events.sql` (the `webhook_events` table itself) had not been applied, the same class of drift noted in Week 22 for the `customers` table migration; applying them was a prerequisite for testing this week's payment-related work, not a change made this week

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Extracting a Shared Predicate to Guarantee Two Call Sites Agree — `PAYMENT_FAILED_CONDITION` is defined once and used identically in both a `COUNT(*)` aggregate (`/stats`) and a `WHERE` filter (`GET /orders`); writing the same logic twice in slightly different SQL would risk the count and the filtered list silently disagreeing (e.g. the banner says "3" but clicking it shows 4 orders) after either one is edited without the other — the same motivation as the shared `stockVelocity.js` service extracted back in Week 20 for an unrelated pair of endpoints
- A Foreign Key's Immutability as a Correctness Invariant, Not Just a Storage Fact — the payment-issues query relies on `stripe_payment_intent` never being overwritten after order creation; this is a property of how the rest of the codebase happens to use that column (verified in Week 23 when building customer invoice access, and re-verified here), not a database constraint — recognizing when correctness depends on an application-level invariant that isn't enforced by the schema itself is a distinct kind of reasoning from trusting a `NOT NULL` or `UNIQUE` constraint the database itself guarantees
- Consistent Visual Encoding Extracted into a Pure Function — `webhookEventColor` takes a string, returns a string, and has no side effects or dependency on component state; extracting it (in both files, following the codebase's existing precedent of small per-page duplicated constants) rather than inlining the conditional again for a third case (failure, alongside success and neutral) keeps the mapping from event type to meaning in one readable place per file instead of a growing ternary chain
- Optimistic Local State Updates with a Reconciliation Fallback — `cancelPendingEmailChange` updates the customer object locally immediately on success rather than waiting for a fresh fetch, but falls back to re-fetching from the server specifically on failure, rather than assuming the local state is still correct; this is a small instance of the general pattern where an optimistic UI update needs an explicit plan for what happens when the assumption it made (the mutation succeeded) turns out to be wrong
- Query Parameters as an Extensible Filter Vocabulary — adding `?payment_failed=true` alongside the pre-existing `?aging=true` on the same endpoint, using the identical "push a condition onto an array, join with AND" implementation pattern, demonstrates that a well-factored filter-building routine doesn't need to be redesigned to add a new filter — it needs one more `if` block shaped exactly like the ones already there

---

## Evidence

- `frontend/src/pages/CustomerDashboard.jsx` — pending-email indicator and cancel link; local state updates for both request and cancel
- `frontend/src/pages/Orders.jsx` — `webhookEventColor` helper; payment-issues banner, filter tab, and count badge
- `frontend/src/pages/OrderDetail.jsx` — `webhookEventColor` helper applied to per-order Stripe history
- `backend/src/routes/orders.js` — `PAYMENT_FAILED_CONDITION`; `payment_failed` count in `/stats`; `?payment_failed=true` filter on `GET /orders`
- Tested against a local Postgres instance and the running backend: `GET /customers/me` correctly showed `pending_email: null` before a change, the actual pending address immediately after requesting one, and `null` again immediately after cancelling — confirming the exact data shape the new frontend UI depends on; seeded a Stripe order with a logged `payment_intent.payment_failed` webhook event and confirmed `GET /orders/stats` correctly counted it in `payment_failed.count` while a separately-seeded, successfully-paid Stripe order did not inflate that count; confirmed `GET /orders?payment_failed=true` returned exactly the failed-payment order and no others; confirmed both `GET /payments/webhook-events` (global) and the per-payment-intent query correctly returned the failed event with its `event_type` intact, the exact field the frontend's color helper switches on; verified the `webhookEventColor` function directly (succeeded → green, payment_failed → red, an arbitrary third event type → neutral grey); `npm run lint` (aside from the same pre-existing, unrelated warnings/error in `OrderDetail.jsx` documented in prior weeks) and `npm run build` both pass on the frontend; all seeded test customers, orders, order items, and webhook events were removed from the local database after verification
- Applied two pre-existing, previously-unapplied migrations (`005_add_payment_fields.sql`, `006_add_webhook_events.sql`) to the local dev database as a prerequisite for testing this week's payment-related work — neither was written this week
- **Testing limitation:** as in prior weeks, all features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review and direct execution of the pure frontend helper functions; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
