# Week 28 Work Log (August 31 – September 6, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week found and fixed two real bugs that had been sitting undetected in long-untouched pages, then closed the one follow-up item left in the Week 27 planning notes. The first bug: the customer-facing order-tracking page and the admin's printable packing slip both hardcoded "Cash on Delivery" as the payment method label on every order, regardless of how the order was actually paid — a customer who paid online would see their own tracking page tell them they paid cash. The second bug: the admin sign-in page collapsed every login failure into a single hardcoded "Wrong password" message, even when the real cause was a triggered rate limit or a server misconfiguration — both of which the backend already reports with their own distinct, more useful messages that the frontend was simply discarding. The third item extended last week's Stripe decline-reason work with the stable decline code Stripe provides alongside its free-text message, exactly the follow-up the Week 27 planning notes flagged as needed for anything wanting to group failures by cause rather than match on prose.

---

## Technical Activities

### Fixing the Hardcoded "Cash on Delivery" Payment Label (bug fix, SRS Section 4.4)

**Problem:** `TrackOrder.jsx` (the public order-tracking page) and the packing-slip print function inside `OrderDetail.jsx` both displayed a payment-method label as a static string — "Payment (Cash on Delivery)" and "Payment: Cash on Delivery" respectively — with no reference to the order's actual `payment_method` field at all. `OrderDetail.jsx`'s own on-screen payment section (a few hundred lines away from its print function, in the same file) already correctly branched on `order.payment_method === 'stripe'`, so the bug was an inconsistency within a single file as much as it was one across two files. The root cause on the tracking-page side ran deeper: `GET /api/orders/track/:id` never selected `payment_method` from the database at all, so even fixing the frontend conditional there would have had nothing to branch on.

**Backend — orders route** (`backend/src/routes/orders.js`):

- `GET /api/orders/track/:id` now selects `o.payment_method` alongside the fields it already returned, so the public tracking response actually carries the fact the frontend needs to label payment correctly

**Frontend — TrackOrder and OrderDetail pages** (`frontend/src/pages/TrackOrder.jsx`, `frontend/src/pages/OrderDetail.jsx`):

- `TrackOrder.jsx`'s payment section now reads `order.payment_method === 'stripe' ? 'Online card' : 'COD'` — the exact same conditional and wording `OrderDetail.jsx`'s on-screen section already used, so a customer and the admin now see consistent terminology for the same order
- The packing-slip print function's payment line was updated the same way (`'Online card'` vs. `'Cash on Delivery'`, matching that function's fuller existing wording rather than the abbreviated "COD" used on-screen, since a printed slip has more room and less need for brevity)

### Surfacing the Real Admin Login Error Instead of a Hardcoded One (bug fix, SRS Section 4.4)

**Problem:** `Login.jsx`'s `catch` block set a hardcoded `'Wrong password'` string regardless of what the backend actually returned — `POST /api/auth/login` can respond with `401 Wrong password`, a `429`-style rate-limit rejection (`"Too many attempts, please try again in 15 minutes"`, from the `loginLimiter` middleware added in earlier weeks), or a `500` `"Server misconfigured: ADMIN_PASSWORD_HASH not set"`. Every other login-adjacent page in this codebase (`CustomerLogin.jsx`, `ForgotPassword.jsx`, and others built across Weeks 22–25) already followed the `err.response?.data?.error || 'fallback'` pattern to surface the backend's actual message — `Login.jsx`, unmodified since the very first week of this project, had simply never been brought in line with that convention as it was established elsewhere.

**Frontend — Login page** (`frontend/src/pages/Login.jsx`):

- The `catch` block now reads `err.response?.data?.error || 'Wrong password'`, so an admin who's been rate-limited sees the real "Too many attempts" message (and knows to wait, rather than assuming they're mistyping a correct password) and a misconfigured server surfaces its own diagnostic message instead of a misleading "Wrong password"
- `'Wrong password'` remains the fallback for the case where a response genuinely doesn't carry a structured error message, preserving the original behavior for that scenario exactly

### Stable Decline Codes Alongside the Decline Message (SRS Section 4.4, follow-up from Week 27)

**Problem:** Week 27 surfaced Stripe's human-readable `last_payment_error.message` for a failed payment, but its own planning notes pointed out the gap: that message is free-text prose, not a stable value anything could group or filter by. Stripe also provides `last_payment_error.decline_code` — a short, stable, enum-like string (e.g. `insufficient_funds`, `expired_card`) — specifically for this purpose, and it wasn't being extracted at all.

**Backend — payments route** (`backend/src/routes/payments.js`):

- `GET /api/payments/webhook-events` now also selects `payload->'data'->'object'->'last_payment_error'->>'decline_code' AS decline_code`, in both the global and per-payment-intent query branches, following the exact same null-safe JSON-path pattern `decline_reason` already established last week

**Frontend — Orders and OrderDetail pages** (`frontend/src/pages/Orders.jsx`, `frontend/src/pages/OrderDetail.jsx`):

- Both existing `decline_reason` displays now append `` ` (${ev.decline_code})` `` when a code is present, rendering e.g. "Your card has insufficient funds. (insufficient_funds)" — the code is appended rather than replacing the message, since the prose is still what a human reads fastest and the code is a secondary detail for anyone who wants to act on it precisely (searching Stripe's own documentation for that exact string, for instance)

---

## Frontend Architecture

### Updated Pages

- `src/pages/TrackOrder.jsx` — payment-method label now reflects the order's real `payment_method`
- `src/pages/OrderDetail.jsx` — packing-slip print function's payment label fixed the same way; both `decline_reason` displays now append `decline_code` when present
- `src/pages/Orders.jsx` — its `decline_reason` display now appends `decline_code` when present
- `src/pages/Login.jsx` — surfaces the backend's actual error message instead of a hardcoded `'Wrong password'`

---

## Backend Architecture

### Updated Routes

- `GET /api/orders/track/:id` — now selects `payment_method`
- `GET /api/payments/webhook-events` — now also selects `decline_code` alongside the existing `decline_reason`

---

## Project Planning

- Both payment-label bugs and the login-error bug were found by directly comparing pages that do the same conceptual thing (`OrderDetail.jsx`'s on-screen payment section vs. its own print function; `Login.jsx` vs. every other login-style page) rather than by a report or a test failure — the same technique that surfaced the Week 22 CustomerDashboard gap and the Week 27 order-linkage gap. Worth treating as a standing habit: any page that hasn't been touched in several weeks is worth a quick side-by-side comparison against its closest sibling before assuming it's still correct
- `decline_code` is now available but nothing aggregates it yet (e.g. "which decline reasons are most common this month") — that would need a new query grouping by `decline_code` across `webhook_events`, which wasn't built this week since no specific need for it has come up yet, only the underlying data being available for when it does
- The packing-slip and on-screen payment labels now agree with each other, but neither currently mentions *which* card network or last-four digits for a Stripe payment — Stripe's PaymentIntent payload does carry that detail (under `charges.data[].payment_method_details.card`), but surfacing it wasn't in scope for this week's fix

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Data Availability as a Precondition for Correctness — the tracking-page bug couldn't be fixed by touching the frontend alone; `payment_method` had to be added to the backend's `SELECT` before any frontend conditional had something to branch on. A UI bug that looks purely presentational sometimes has its actual root cause one layer down, in what the API even makes available to render correctly
- Consistency Within a Single File as a Distinct Failure Mode from Consistency Across Files — `OrderDetail.jsx`'s on-screen and print-function payment labels disagreed with each other despite living in the same file, a subtler bug than the usual "two different files drifted apart" pattern this project has fixed in past weeks (Week 22, Week 27) — it shows that code proximity doesn't guarantee logical consistency, since the two code paths were written (or last touched) at different times without either author necessarily re-reading the other
- Preserving an Established Convention When Extending a Codebase — `Login.jsx`'s fix didn't invent a new error-handling pattern; it applied the exact `err.response?.data?.error || fallback` idiom already used consistently everywhere else login-adjacent in this codebase, which is what made the fix a one-line, low-risk change rather than a new pattern needing its own justification
- A Backend Distinguishing Failure Causes Is Wasted Work If the Frontend Collapses Them — the `loginLimiter` rate limiter and its distinct "Too many attempts" message were built and correctly returned by the backend for many weeks; the value of that distinction was completely lost at the UI layer until this week, which is a reminder that a backend API's granularity only matters if something downstream actually reads and acts on it
- Extending a Data Extraction Pattern Rather Than Introducing a New One — adding `decline_code` reused `decline_reason`'s exact JSON-path-with-null-propagation technique from Week 27 verbatim, rather than reaching for a different mechanism (e.g. a separate lookup, a stored/computed column); recognizing when a new requirement is really "one more instance of last week's pattern" avoids introducing unnecessary variety into how similar problems are solved in the same codebase

---

## Evidence

- `backend/src/routes/orders.js` — `GET /track/:id` now selects `payment_method`
- `backend/src/routes/payments.js` — `GET /webhook-events` now also selects `decline_code`
- `frontend/src/pages/TrackOrder.jsx`, `frontend/src/pages/OrderDetail.jsx` — payment-method labels fixed to reflect the real `payment_method`; `decline_code` appended to both `decline_reason` displays
- `frontend/src/pages/Orders.jsx` — `decline_code` appended to its `decline_reason` display
- `frontend/src/pages/Login.jsx` — surfaces the backend's actual error message
- Seeded a completed Stripe order and confirmed `GET /orders/track/:id` now returns `payment_method: "stripe"` where it previously omitted the field entirely; verified the fixed label-selection logic directly (`stripe → 'Online card'`, `cod → 'COD'` on-screen; `stripe → 'Online card'`, `cod → 'Cash on Delivery'` on the packing slip) against representative inputs; triggered the admin login rate limiter with eleven rapid wrong-password attempts against the live backend and confirmed the tenth-and-beyond requests return the distinct `"Too many attempts, please try again in 15 minutes"` message the fixed `Login.jsx` now surfaces instead of masking; seeded a `payment_intent.payment_failed` webhook event carrying both a `last_payment_error.message` and a `decline_code`, and confirmed `GET /payments/webhook-events` correctly returned both in the response, in both the global and per-payment-intent query forms; verified the frontend's append-when-present rendering logic directly against both a decline event with a code and one without; `npm run lint` (aside from the same pre-existing, unrelated warnings/error in `OrderDetail.jsx` documented across prior weeks) and `npm run build` both pass on the frontend; all seeded test orders and webhook events were removed from the local database after verification
- **Testing limitation:** as in prior weeks, all features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review and direct execution of the pure rendering/labeling logic; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
