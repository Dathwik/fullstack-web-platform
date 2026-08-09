# Week 24 Work Log (August 3 – August 9, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week closed out the customer-account gaps identified at the end of Week 23. The main feature was the "forgot password" flow explicitly called out last week as a distinct, larger piece of work from the password-*change* feature already built — a customer locked out of their account (who can't sign in to reach the change-password form in the first place) now has a self-service way back in, via an emailed reset link. The second feature was self-service account deletion, a real capability gap on the customer side that hadn't been built yet, following the same re-authentication and safe-cascade patterns already established for other account-mutation routes. The third was a small correctness fix flagged in last week's planning notes: requesting an email "change" to the address already on the account was previously accepted as a real change, generating an unnecessary token and email for something that wasn't actually a change at all.

---

## Technical Activities

### Forgot-Password Flow for Locked-Out Customers (SRS Section 4.4: Usability Requirements)

**Problem:** Week 23 built password *change* (for a customer who's signed in and knows their current password) but explicitly left out password *reset* (for a customer who can't sign in at all) as a separate, larger feature. Without it, a customer who forgot their password had no path back into their account short of contacting the administrator directly.

**Database — migration** (`database/migrations/011_add_password_reset.sql`, `database/schema.sql`):

- Added `password_reset_token` and `password_reset_expires` to `customers`, plus a supporting index on the token column — the same shape as the `email_verify_token`/`email_verify_expires` pair added in Week 23 for the email-change flow, since both are "prove you control something external, then let a sensitive change through" mechanisms

**Backend — mailer service** (`backend/src/services/mailer.js`):

- Added `sendPasswordResetEmail(email, name, token)`, following the same silent-no-op-without-SMTP convention as the two existing mailer functions; the link expires in 1 hour rather than the email-verification flow's 24 hours, since a password reset link reaching the wrong inbox is a more immediately exploitable risk than an email-change link (the latter still can't complete without the current account's session or password for related actions, since it's request-then-confirm rather than reset-then-use)

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `POST /api/customers/forgot-password` (public): looks up the customer by email, and — regardless of whether an account exists — **always responds identically** (`{ success: true }`). If an account is found, a token is generated and emailed; if not, nothing happens but the response looks the same either way. This prevents the endpoint from being usable to check which emails have registered accounts (account enumeration), a property the existing login route already had by design (a generic "invalid email or password" for both "no such account" and "wrong password") but this new route needed to deliberately replicate rather than get for free
- Added `POST /api/customers/reset-password` (public, not behind `requireCustomer`): consumes the token, checks its expiry, and sets a new password hash — public for the same reason `verify-email` is: the entire point is to let in someone who currently cannot authenticate, so requiring a session would defeat the feature
- Both routes reuse the existing `loginLimiter`, since a token-guessing attack against either endpoint is exactly the kind of brute-force scenario that limiter exists to slow down — and this was directly observed during testing this week (see Evidence)

**Frontend — new pages** (`frontend/src/pages/ForgotPassword.jsx`, `frontend/src/pages/ResetPassword.jsx`) **and routing** (`frontend/src/App.jsx`):

- `ForgotPassword.jsx`: an email-entry form that always shows the same "if an account exists, a link is on its way" message after submitting, regardless of the backend's actual outcome — mirroring the backend's non-leaking behavior in the UI layer too, since branching the displayed message on success/failure would reintroduce the account-enumeration signal the backend was built to avoid
- `ResetPassword.jsx`: reads `?token=` via `useSearchParams` (the established pattern from `TrackOrder.jsx` and Week 23's `VerifyEmail.jsx`), presents a new-password form, and shows a success state pointing back to sign-in
- Added a "Forgot password?" link to `CustomerLogin.jsx`, positioned directly under the password field — the natural place a locked-out customer would look

### Self-Service Account Deletion (SRS Section 4.4: Usability Requirements)

**Problem:** There was no way for a customer to delete their own account — the only account-lifecycle operations were create (register) and authenticate (login/logout). A customer who wanted to leave the platform had no self-service path to do so.

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `DELETE /api/customers/me` (auth required), requiring the current password in the request body before deleting — the same re-authentication reasoning as the Week 23 password-change route, applied to what's now the single most destructive action a customer can take
- Relies on the existing `orders.customer_id ... ON DELETE SET NULL` foreign-key behavior (already in place since the Week 4 customer-accounts migration): deleting the `customers` row does not delete that customer's order history, it just detaches it — the orders remain in the database, indistinguishable from a guest checkout, preserving revenue and fulfillment records for the administrator without needing any application-level cleanup logic in this route
- Clears `req.session.customer_id` as part of the same request, so the now-deleted account's session can't continue making authenticated requests against a row that no longer exists

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- Added a "Delete account" link in a visually distinct danger-zone section at the bottom of the page, below "Sign out" — clicking it reveals a confirmation panel (red-tinted, matching the existing cancel/error color convention used elsewhere) requiring a password entry before the delete button is enabled, and explicitly stating that order history is retained but unlinked, so the customer understands what "delete" does and does not do before confirming

### Email-Change No-Op Short-Circuit (SRS Section 4.4, follow-up from Week 23)

**Problem:** Week 23's planning notes identified that `POST /api/customers/me/email`'s uniqueness check (`WHERE email=$1 AND id <> $2`) correctly excluded the requester's own row from the *collision* check, but didn't distinguish "this is a genuinely new address" from "this happens to already be my current address" — the latter would still generate a real token, write it to the database, and send a real (pointless) confirmation email.

**Backend — customers route** (`backend/src/routes/customers.js`):

- `POST /api/customers/me/email` now fetches the account's current email first and compares it (case-normalized) against the requested `new_email` before doing anything else; when they match, it responds immediately with `{ pending_email: null, already_current: true }` and skips token generation and the email send entirely
- This is a pure early-return — no change to the existing collision check, token logic, or verification route, since those all remain correct for the case they were built to handle (a genuinely different address)

**Frontend — CustomerDashboard page** (`frontend/src/pages/CustomerDashboard.jsx`):

- The change-email form now checks the response's `already_current` flag and shows "That's already your email — nothing to confirm" instead of the normal "check your inbox" message, so the customer isn't told to go look for an email that was never sent

---

## Frontend Architecture

### New Pages

- `src/pages/ForgotPassword.jsx` — public email-entry form; always shows the same non-leaking confirmation message
- `src/pages/ResetPassword.jsx` — public `?token=`-driven new-password form

### Updated Pages

- `src/pages/CustomerLogin.jsx` — "Forgot password?" link
- `src/pages/CustomerDashboard.jsx` — danger-zone "Delete account" flow with password confirmation; change-email form now distinguishes the no-op case
- `src/App.jsx` — new public `/forgot-password` and `/reset-password` routes

---

## Backend Architecture

### New Files

- `database/migrations/011_add_password_reset.sql` — `password_reset_token`, `password_reset_expires` on `customers`, plus a supporting index

### Updated Routes

- `POST /api/customers/forgot-password` (new, public) — requests a reset link; identical response whether or not the account exists
- `POST /api/customers/reset-password` (new, public) — consumes the token, sets a new password
- `DELETE /api/customers/me` (new) — password-confirmed account deletion; orders detach via existing `ON DELETE SET NULL`
- `POST /api/customers/me/email` — now short-circuits when the requested address matches the current one

### Updated Services

- `backend/src/services/mailer.js` — `sendPasswordResetEmail`, following the existing silent-no-op-without-SMTP convention

---

## Project Planning

- The forgot-password and reset-password routes share the same `loginLimiter` bucket as login, registration, and the other account-mutation routes — this was directly observed during testing this week when a burst of manual test requests against a single IP tripped the shared limit; it's working as designed, but if any of these flows need independent limits in the future (e.g. a stricter one specifically for password reset), they'd need their own limiter instance rather than the shared one
- Account deletion is immediate and irreversible from the API's perspective — there's no grace period or soft-delete. If that's ever a concern (e.g. accidental deletion, "are you sure" fatigue leading to real mistakes), a time-delayed deactivation-then-purge pattern would be a natural evolution, but adds meaningfully more complexity (a background job, a "reactivate" path) than this week's scope called for
- The email-change no-op fix only covers the *request* side; if a customer has a pending, unconfirmed change to some other address and then requests a change back to their current address, that still correctly generates `already_current: true` and leaves the original pending change (with its own still-valid token) untouched — verifying that original token would still complete the original change. This is arguably correct (the no-op request shouldn't cancel an unrelated in-flight request) but worth knowing if a future feature wants a "cancel pending email change" action, which doesn't currently exist

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Constant-Response Design to Prevent Information Leakage via Timing/Content Side Channels — `forgot-password` doing the same amount of visible work (a single JSON response, `{ success: true }`) whether or not the account exists is a security pattern with a real-world failure mode when skipped: a route that returns different messages (or even just responds measurably faster) for "no such account" than for "email sent" leaks exactly the information — which emails are registered — that a system handling personal accounts should not leak, even to a curious rather than malicious caller
- Referential Actions as Cascade Policy, Not Application Logic — account deletion's order-history preservation is entirely a consequence of the `ON DELETE SET NULL` foreign key defined back in the Week 4 migration; this week's `DELETE FROM customers` needed zero special-casing for "but keep the orders," because the database's own referential-action policy already encodes that business rule at the schema level, where it can't be forgotten or reimplemented inconsistently by a future route that also deletes a customer
- Distinguishing Authentication Freshness from Authorization for High-Stakes Actions — both the reset-password and delete-account flows apply the same principle from different angles: reset-password grants access *without* a session (because the session is exactly what's missing) but *with* proof of email control; delete-account requires an *active* session *and* a fresh password re-entry (because a stale session shouldn't authorize irreversible data loss on its own). The right proof of identity is different depending on what's being protected and what's already been lost (access vs. nothing)
- Idempotent Guard Clauses to Prevent Redundant Side Effects — the email-change no-op fix is a straightforward but important case of checking "would this action actually change anything" before performing side effects (writing a token, sending an email); the same shape recurs anywhere a mutation is requested that might already match the current state, and skipping the check means paying the cost of a side effect for zero actual change
- Time-Bounded Credentials with Differentiated Expiry Windows — choosing a 1-hour expiry for password-reset tokens versus the pre-existing 24-hour window for email-verification tokens reflects a deliberate risk-based trade-off: the two tokens grant different capabilities (reset-password grants immediate account takeover if intercepted; email-verification only redirects future logins to a new address, and can't itself be used to log in), so a uniform expiry policy across both would either be too loose for the more sensitive one or too tight for the more benign one

---

## Evidence

- `database/migrations/011_add_password_reset.sql` (new) — `password_reset_token`, `password_reset_expires` on `customers`
- `backend/src/routes/customers.js` — `POST /forgot-password`, `POST /reset-password`, `DELETE /me`, and the no-op short-circuit added to `POST /me/email`
- `backend/src/services/mailer.js` — `sendPasswordResetEmail`
- `frontend/src/pages/ForgotPassword.jsx` (new), `frontend/src/pages/ResetPassword.jsx` (new), `frontend/src/App.jsx` — new public routes
- `frontend/src/pages/CustomerLogin.jsx` — "Forgot password?" link
- `frontend/src/pages/CustomerDashboard.jsx` — danger-zone delete-account flow; already-current email messaging
- Tested against a local Postgres instance with a registered test customer: `forgot-password` returned an identical `{"success":true}` for both a real and a nonexistent email; the reset flow correctly rejected an invalid token, rejected a too-short new password, accepted a valid token and password, after which login with the old password failed and login with the new password succeeded, and a replay of the same (now-consumed) token was correctly rejected; the email-change no-op fix correctly issued no token when the "new" address matched the current one, while a genuinely different address still correctly issued a real token; account deletion correctly rejected an incorrect password (`401`), correctly succeeded with the right one, correctly cleared the session (`GET /customers/me` returned `null` immediately after), correctly removed the `customers` row, and correctly left the customer's existing order in place with `customer_id` set to `NULL` rather than deleting order history; a burst of manual test requests during this session actually tripped the shared `loginLimiter`, confirming the rate limiting on these new routes works as designed; `npm run lint` and `npm run build` both pass with zero errors on the frontend; all seeded test customers, orders, and order items were removed from the local database after verification
- **Testing limitation:** as in prior weeks, all features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window. SMTP is unconfigured in this dev environment, so email delivery itself was not observed — reset and verification tokens were read directly from the database to drive testing, consistent with how the mailer service's no-SMTP no-op path is designed to be exercised in earlier weeks too

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
