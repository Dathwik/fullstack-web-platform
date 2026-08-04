# Week 23 Work Log (July 27 – August 2, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week continued last week's shift toward the customer-facing account area, closing three real gaps that Week 22's work surfaced but deliberately left out of scope. The first was self-service password changes — `customers.js` had registration and login but no way for a signed-in customer to change their password without contacting the administrator. The second was the email-change feature Week 22 explicitly deferred, since changing the login-identifying, unique-constrained email needed its own verification flow rather than a one-line addition to the existing profile-edit route; this week built that flow end-to-end, including a database migration, a confirmation-link email, and a public landing page that completes the change when the link is opened. The third gave customers access to something only the admin could previously see: their own order's PDF invoice, by loosening the existing invoice route's admin-only gate to also accept a matching customer session rather than duplicating the route.

---

## Technical Activities

### Self-Service Password Change (SRS Section 4.4: Usability Requirements)

**Problem:** A customer who wanted to change their password had no in-app path to do so — the only account-mutation route as of Week 22 was `PATCH /api/customers/me` for name and phone. Password changes are also security-sensitive in a way name/phone edits aren't, since a stolen or shared session cookie shouldn't be sufficient on its own to take over an account's credentials.

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `PATCH /api/customers/me/password` (auth required), requiring both `current_password` and `new_password` — verifying the current password with `bcrypt.compare` before accepting a change means a bare session cookie left on a shared device isn't enough to hijack the account's login credentials, the same reasoning already applied to the admin password check
- Reuses the existing `loginLimiter` rate limiter (10 attempts per 15 minutes per IP) already applied to login/registration, since a password-change endpoint that verifies a secret is exactly the kind of route brute-force protection exists for
- Enforces the same 8-character minimum on the new password that registration already enforces, so this can't be used to downgrade an account below the strength bar set at signup

### Verified Email Change (SRS Section 4.4: Usability Requirements)

**Problem:** Week 22's profile-edit route explicitly left email out of scope, since email is the account's login identifier and unique-constrained — writing a new address immediately, the way name/phone updates do, would let a customer (or an attacker with a stolen session) lock the real account owner out just by mistyping or maliciously entering an address they don't control. This needed its own confirm-before-committing flow.

**Database — migration** (`database/migrations/010_add_email_change_verification.sql`, `database/schema.sql`):

- Added three nullable columns to `customers`: `pending_email`, `email_verify_token`, `email_verify_expires` — the live `email` column is untouched until a change is confirmed, so an in-progress, unconfirmed request never affects login
- Added an index on `email_verify_token` since it's the lookup key the verification endpoint queries by

**Backend — mailer service** (`backend/src/services/mailer.js`):

- Added `sendEmailChangeVerification(pendingEmail, name, token)`, following the exact silent-no-op-without-SMTP-configured convention `sendOrderStatusEmail` already established — email delivery failure (or SMTP being unconfigured, as in this dev environment) never breaks the API response, it's logged and swallowed
- The confirmation link points at `${APP_URL}/verify-email?token=...`, with `APP_URL` falling back to the Vite dev server's default origin when unset

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `POST /api/customers/me/email` (auth required): validates the new address, checks it isn't already claimed by a *different* account (`WHERE email=$1 AND id <> $2`, deliberately excluding the requester's own row so re-requesting the same address isn't treated as a collision), generates a 32-byte random token via `crypto.randomBytes`, stores it with a 24-hour expiry alongside the pending address, and emails the confirmation link to the **new** address (not the current one) — since proving control of the new address is the entire point of the flow
- Added `GET /api/customers/verify-email?token=` (deliberately public, not behind `requireCustomer`) — the link is opened from an email client, which has no reason to be carrying the session cookie that originated the request, so the token itself (not the session) is the proof of intent; looks up the customer by token, checks the stored expiry, and on success writes `pending_email` into `email` while clearing all three verification columns so the token can't be replayed
- A same-token replay after a successful verification correctly fails, since `email_verify_token` is cleared as part of the same `UPDATE` that commits the new email — there's no separate "consumed" flag needed, clearing the token that looks it up is sufficient
- Handles the rare race where two customers both claim the same address before either verifies (`23505` unique-violation on the final `UPDATE`) with a `409`, rather than a raw database error reaching the client

**Frontend — new page** (`frontend/src/pages/VerifyEmail.jsx`) **and routing** (`frontend/src/App.jsx`):

- New public page at `/verify-email`, reading `?token=` via `useSearchParams` (the same pattern `TrackOrder.jsx` already uses for its own query-string-driven public page) and calling the verify endpoint on mount, showing a checking/success/error state
- The "missing token" case is derived once from the URL during initial `useState` computation rather than set from inside the effect — calling `setState` synchronously and unconditionally from an effect body is the same React anti-pattern flagged and fixed in Week 18 (`set-state-in-effect`); here, since there's no user action to attach the reset to (unlike Week 18's period-picker buttons), the fix is to make the "no token" outcome part of the initial state itself, leaving the effect to do nothing but the async fetch-and-setState

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Added a "Change password" and "Change email" toggle alongside the existing "Edit profile" link, each opening its own small inline form (current/new password fields; new-email field with an explanatory line about the confirmation email) rather than one large combined settings panel, since the three are independent actions with independent success/failure states
- The email-change form's success message names the address a confirmation was sent to, so the customer knows to go check that inbox rather than expecting an immediate change to `customer.email` in the UI

### Customer-Facing Invoice Download (SRS Section 4.3/4.4)

**Problem:** `GET /api/orders/:id/invoice` (built for the admin in an earlier week) was gated by `requireAuth`, the admin-only middleware — a customer who wanted a PDF receipt of their own order had no way to get one without asking the administrator to generate and send it manually.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Removed the blanket `requireAuth` middleware from `GET /api/orders/:id/invoice` and replaced it with an explicit ownership check performed *after* the order is fetched: `isAdmin` (the existing admin session flag) or `isOwner` (`req.session.customer_id` matching the order's own `customer_id`) — either is sufficient, neither alone is required
- The check has to happen after the fetch rather than in middleware, since knowing whether a customer session "owns" this order requires knowing the order's `customer_id` first, and route-level middleware runs before the route handler has looked anything up
- Guest checkout orders (`customer_id IS NULL`) correctly remain admin-only under this logic, since `req.session.customer_id === order.customer_id` can never be true when the right-hand side is `null` — there's no session value that legitimately equals "no customer" in a way that should grant access

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Added an "Invoice" link next to the existing "Track" and "Reorder" buttons on each order card, a plain `<a href="/api/orders/:id/invoice" download>` — the same anchor-based download pattern already used on the admin's `OrderDetail.jsx` page, relying on the browser sending the session cookie automatically on a same-origin navigation rather than needing any JavaScript-driven fetch-and-blob dance

---

## Frontend Architecture

### New Pages

- `src/pages/VerifyEmail.jsx` — public landing page for the email-change confirmation link; reads `?token=` and calls the verify endpoint on mount

### Updated Pages

- `src/pages/CustomerDashboard.jsx` — "Change password" and "Change email" inline forms alongside the existing profile editor; "Invoice" download link on each order card
- `src/App.jsx` — new public `/verify-email` route

---

## Backend Architecture

### New Files

- `database/migrations/010_add_email_change_verification.sql` — `pending_email`, `email_verify_token`, `email_verify_expires` columns and a supporting index on `customers`

### Updated Routes

- `PATCH /api/customers/me/password` (new) — current-password-verified password change
- `POST /api/customers/me/email` (new) — requests an email change, emails a confirmation link to the new address
- `GET /api/customers/verify-email` (new, public) — confirms a pending email change via token
- `GET /api/orders/:id/invoice` — no longer admin-only; now also accepts the matching customer's own session

### Updated Services

- `backend/src/services/mailer.js` — `sendEmailChangeVerification`, following the existing silent-no-op-without-SMTP convention

---

## Project Planning

- Requesting an email change to the account's *own current* address is technically accepted (it doesn't collide with any other account, which is all the uniqueness check verifies) — this generates a real, sendable confirmation token for a no-op change; harmless today, but if this is ever surfaced as confusing in practice, the request route could short-circuit when `new_email === current email`
- The email-change token has no rate limit beyond the shared `loginLimiter` on the request route itself; a customer who requests a change repeatedly will keep generating new tokens (each request overwrites the previous one), which is fine functionally but means only the most recently emailed link is valid — worth documenting if support ever needs to explain "the first link I got didn't work"
- Password reset (for a customer who is locked out and can't sign in to change their password) is a different, larger feature than password *change* (for a signed-in customer) — this week only built the latter; a "forgot password" flow would need its own token-based route similar in shape to the email-verification one built this week, but triggered from the sign-in page rather than from within the dashboard

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Re-Authentication for Sensitive State Changes — requiring `current_password` before accepting a `new_password`, rather than trusting the session alone, is the standard defense against a class of attack where a session token is compromised (shared device, XSS, a copied cookie) but the underlying password is not; the session proves "this browser was recently logged in," not "this person currently knows the password," and a credential change should require the latter
- Two-Phase Commit for a Change That Must Be Confirmed Out-of-Band — the email-change flow never writes directly to the field it's changing; it stores the proposed value (`pending_email`) alongside a token, and only commits it to the real column once a second, independent signal (opening the emailed link) arrives. This is the same shape as a two-phase commit protocol: propose, then confirm, with the system left in the original valid state if confirmation never happens (a 24-hour expiry) rather than stuck half-changed
- Tokens as Bearer Proof of Out-of-Band Delivery — the verification endpoint is deliberately *not* behind session auth, because the security property being relied on isn't "this request came from a logged-in session," it's "whoever is making this request had access to the new email inbox," which the token (delivered only to that inbox) is what actually proves; conflating "authenticated session" with "authorized action" would have broken the flow, since the browser opening the link is very often not the same one that requested the change
- Authorization Checks That Depend on Data Not Yet Fetched — the invoice route's ownership check can't live in Express middleware (which runs before any database query) because the very fact being checked — whether this customer owns this order — is itself a row in the table being queried; this is a common shape for row-level authorization (as opposed to route-level authorization), where "can this user do X" depends on "X" specifically, not just "this kind of action" in the abstract
- Idempotent Token Invalidation via Shared State — clearing `email_verify_token` in the same `UPDATE` statement that commits the new email means there's no separate "used" flag or expiry check needed to prevent replay; the token's own absence *is* the record that it was consumed, collapsing two concerns (commit the change, invalidate the credential) into one atomic write

---

## Evidence

- `database/migrations/010_add_email_change_verification.sql` (new) — `pending_email`, `email_verify_token`, `email_verify_expires` on `customers`, plus a supporting index
- `backend/src/routes/customers.js` — `PATCH /me/password`, `POST /me/email`, `GET /verify-email`
- `backend/src/services/mailer.js` — `sendEmailChangeVerification`
- `backend/src/routes/orders.js` — `GET /:id/invoice` ownership check (admin OR matching customer)
- `frontend/src/pages/VerifyEmail.jsx` (new), `frontend/src/App.jsx` — `/verify-email` public route
- `frontend/src/pages/CustomerDashboard.jsx` — change-password and change-email forms; invoice download link
- Tested against a local Postgres instance with a registered test customer: password change correctly rejected an incorrect current password (`401`) and accepted a correct one, after which login with the old password failed and login with the new password succeeded; requesting an email change correctly rejected a malformed address (`400`), correctly generated a token for a legitimate new address, and the verification endpoint correctly rejected an invalid token (`400`), accepted the real token (updating `email` and clearing the pending fields), and rejected a second attempt to reuse the same now-consumed token (`400`); the invoice route correctly returned a `200` PDF for the order's own customer session, a `200` PDF for the admin session, a `401` for an unauthenticated request, and a `401` for a *different* customer's session attempting to access someone else's order; `npm run lint` and `npm run build` both pass with zero errors on the frontend; all seeded test customers, orders, and order items were removed from the local database after verification
- Applied the new migration (`010_add_email_change_verification.sql`) to the local dev database as part of this week's setup — this one **was** written and is intended to ship, unlike the pre-existing Week 4 migration gap noted last week
- **Testing limitation:** as in prior weeks, all three features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window. SMTP is unconfigured in this dev environment, so the verification email's actual delivery was not observed — the token was instead read directly from the database to drive the verification-endpoint test, consistent with how `mailer.js`'s no-SMTP no-op path is designed to be exercised

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
