# Week 25 Work Log (August 10 – August 16, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

This week closed the two remaining items from the Week 24 planning notes, then shifted to a different, long-neglected corner of the codebase for the third feature. The first was splitting the shared login rate limiter into two independent limiters, giving the public, session-less forgot-password/reset-password pair a tighter, dedicated budget rather than sharing one with login and registration traffic. The second was letting a customer cancel a pending, unconfirmed email change — a gap explicitly identified last week when the no-op short-circuit fix was built but a genuine "I changed my mind" path was found to not exist at all. The third pivoted away from customer accounts (the focus of the last four weeks) to `order_notes`, the internal staff-notes feature on the admin order-detail page, which had gone untouched since it was first built and had no way to correct a note once added short of deleting and re-typing it.

---

## Technical Activities

### Dedicated Rate Limiter for Password Reset (SRS Section 4.4: Security)

**Problem:** `forgot-password` and `reset-password` (built in Week 24) shared `loginLimiter` with every other account-mutation route — admin login, customer login, customer registration, password change, account deletion, and email change. The Week 24 planning notes flagged this as worth revisiting: these two routes are uniquely exposed among that group, since they're the only ones that are both fully public (no session) *and* accept nothing but a bare email or token as input, making them a more natural target for enumeration or token-guessing than a route that also requires a known password.

**Backend — rate limiter middleware** (`backend/src/middleware/rateLimiter.js`):

- Split the single exported limiter into two: `loginLimiter` (unchanged — 10 attempts per 15 minutes, still used for login, registration, and the other session-backed account routes) and a new `passwordResetLimiter` (5 attempts per hour), applied only to `forgot-password` and `reset-password`
- The module now exports `{ loginLimiter, passwordResetLimiter }` instead of a single function, which required updating both existing call sites (`auth.js`, `customers.js`) to destructure rather than import a bare default

**Backend — routes** (`backend/src/routes/auth.js`, `backend/src/routes/customers.js`):

- `auth.js`'s admin login route keeps using `loginLimiter`, unaffected by the split
- `customers.js` now imports both limiters, applying `passwordResetLimiter` specifically to `forgot-password` and `reset-password`, and leaving every other route (`register`, `login`, `me/password`, `me`, `me/email`) on the original `loginLimiter`

### Cancel a Pending Email Change (SRS Section 4.4: Usability Requirements)

**Problem:** Week 24 fixed the case where requesting a "change" to the current email was accepted as a real change — but its own planning notes pointed out the fix only handled the *request* side. A customer with a genuinely pending, unconfirmed change to some other address (e.g. they started the flow, then reconsidered, or mistyped the new address) had no way to cancel it; the only way out was to let the token expire after 24 hours or ignore the confirmation email entirely.

**Backend — customers route** (`backend/src/routes/customers.js`):

- Added `POST /api/customers/me/email/cancel` (auth required): clears `pending_email`, `email_verify_token`, and `email_verify_expires` in one `UPDATE`, guarded by `WHERE ... AND pending_email IS NOT NULL` so a customer with nothing pending gets a clear `404` rather than a silent no-op success
- The live `email` column is never touched by this route — a pending change never wrote to it in the first place (per Week 23's design), so "cancel" is purely a matter of clearing the three verification columns
- `GET /api/customers/me` now also selects `pending_email`, so the frontend can show (and offer to cancel) an in-progress change without a separate round-trip just to check whether one exists; `PATCH /api/customers/me`'s `RETURNING` clause was updated to include `pending_email` too, so editing name/phone doesn't cause the pending-change indicator to disappear from the frontend's local state between an unrelated profile edit and the next full refetch

**Frontend** — not built this week; see Project Planning below for why.

### Editable Order Notes (SRS Section 4.4: Usability Requirements)

**Problem:** `order_notes` (internal, staff-only notes attached to an order) supported add, list, and delete, but not edit — a typo or an outdated note could only be fixed by deleting it and adding a new one, which loses the original note's place in the timeline and creates a confusing "this note vanished" moment for anyone else who'd already read it. This part of the codebase (`notes.js`, and the notes section of `OrderDetail.jsx`) hadn't been touched since it was first built, well before the last several weeks' focus on reviews, stock forecasting, and customer accounts.

**Database — migration** (`database/migrations/012_add_order_notes_updated_at.sql`, `database/schema.sql`):

- Added a nullable `updated_at` column to `order_notes` — left `NULL` for a note that's never been edited, distinct from a note that was edited (which gets a real timestamp), so the UI can show "edited" only when it's actually true rather than every note carrying a timestamp indistinguishable from its creation time

**Backend — notes route** (`backend/src/routes/notes.js`):

- Added `PATCH /api/orders/:id/notes/:noteId` (admin only), reusing the exact same body validation (non-empty after trim, 1000-character max) already applied to `POST /`, since an edited note shouldn't be held to a looser standard than a new one
- `UPDATE ... SET body=$1, updated_at=NOW() WHERE id=$2 AND order_id=$3` scopes the edit to the specific order as well as the note ID, matching the existing `DELETE` route's same two-column guard — a note ID alone isn't sufficient to authorize an edit if it turns out to belong to a different order than the URL claims
- `GET /` and `POST /` were both updated to also select/return `updated_at`, so the frontend has it available immediately on both the initial list load and right after adding a new note (which comes back with `updated_at: null`, as expected for something that was never edited)

**Frontend — OrderDetail page** (`frontend/src/pages/OrderDetail.jsx`):

- Added an "Edit" link next to each note's existing delete "×", opening an inline textarea pre-filled with the note's current body — following the same start-edit/save/cancel state shape (`editingNoteId`, a draft string, a saving flag, an error string) already used elsewhere in this codebase for inline editing (e.g. Products page stock and reorder-point fields)
- When a note has been edited, its timestamp line now shows both the original creation time and " · edited [time]" for the most recent edit, so staff can tell at a glance whether a note reflects the original author's words or has since been revised

---

## Frontend Architecture

### Updated Pages

- `src/pages/OrderDetail.jsx` — inline "Edit" flow for internal notes (textarea, save/cancel, edited-timestamp display)

---

## Backend Architecture

### New Files

- `database/migrations/012_add_order_notes_updated_at.sql` — nullable `updated_at` on `order_notes`

### Updated Files

- `backend/src/middleware/rateLimiter.js` — split into `loginLimiter` and a new, stricter `passwordResetLimiter`
- `backend/src/routes/auth.js` — updated import to destructure `loginLimiter`
- `backend/src/routes/customers.js` — `forgot-password`/`reset-password` moved to `passwordResetLimiter`; new `POST /me/email/cancel`; `GET /me` and `PATCH /me` now include `pending_email`
- `backend/src/routes/notes.js` — new `PATCH /:noteId`; `GET /` and `POST /` now include `updated_at`

---

## Project Planning

- The cancel-pending-email-change backend route shipped this week, but its frontend UI (showing the pending address on the dashboard with a "Cancel" button) did not — this write-up focuses on what was actually built and verified; the frontend piece is straightforward given `GET /me` already returns `pending_email` now, and is the natural next small addition
- The two rate limiters are still both in-memory (the default `express-rate-limit` store), so neither survives a server restart or is shared across multiple backend instances if this were ever horizontally scaled — acceptable for the current single-process deployment, but worth remembering if that assumption changes
- `order_notes` editing intentionally has no edit history (only the single most recent `updated_at`, not a log of every revision) — if staff ever need to see what a note said *before* an edit, that would require a genuinely different design (an append-only revision table, or an audit log), not an extension of the current single-row-per-note approach

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Per-Endpoint Threat Modeling Driving Per-Endpoint Rate Limits — the decision to split one rate limiter into two wasn't about traffic volume, it was about *what each endpoint's input proves*: a login attempt requires knowing a password (a real secret), while a password-reset request requires knowing nothing but an email address (public information); routes with a lower bar to attempt deserve a tighter bound on how often they can be attempted, and conflating their budgets under-protects the weaker one while potentially over-throttling the stronger one
- Nullable Timestamp as an Implicit Boolean Flag — `updated_at IS NULL` doubles as "has this note ever been edited," avoiding a separate boolean column that would need to be kept in sync with the timestamp by hand; the single column carries both "whether" and "when" without redundancy, at the cost of being unable to represent "edited but we don't know when" (a state this system has no need to represent)
- Compound `WHERE` Clauses as the Sole Authorization Mechanism for a Scoped Resource — both the new note-edit route and the note-delete route it mirrors use `WHERE id=$noteId AND order_id=$orderId` rather than trusting the note ID alone; this means a note ID leaked or guessed from one order can never be edited or deleted through a different order's URL, without needing a separate ownership check before the query runs — the database's own row-matching does the authorization
- API Response Shape Consistency Across Related Endpoints — updating `GET /`, `POST /`, and the new `PATCH /:noteId` to all return the same shape (`id, body, created_at, updated_at`) means the frontend's note-rendering logic doesn't need separate cases for "a note that just came from the list endpoint" versus "a note that just came back from being created or edited" — one render path handles all three, because the data underneath is shaped identically
- Guard Clauses That Turn a Silent No-Op into an Informative Failure — `POST /me/email/cancel`'s `WHERE ... AND pending_email IS NOT NULL` guard means a customer calling cancel with nothing pending gets a `404` they can act on ("oh, there's nothing to cancel") rather than a `200 success` response that's technically true (the columns are indeed all `NULL` afterward) but misleading about whether the call actually did anything

---

## Evidence

- `backend/src/middleware/rateLimiter.js` — `{ loginLimiter, passwordResetLimiter }`
- `backend/src/routes/auth.js`, `backend/src/routes/customers.js` — updated imports and limiter assignments; `POST /me/email/cancel`; `pending_email` added to `GET /me` and `PATCH /me`
- `database/migrations/012_add_order_notes_updated_at.sql` (new) — `updated_at` on `order_notes`
- `backend/src/routes/notes.js` — `PATCH /:noteId`; `updated_at` added to `GET /` and `POST /`
- `frontend/src/pages/OrderDetail.jsx` — inline note-edit flow with edited-timestamp display
- Tested against a local Postgres instance and the running backend: six rapid `forgot-password` requests correctly succeeded for the first five and were rejected with "try again in an hour" on the sixth, confirming `passwordResetLimiter`'s independent 5-per-hour budget; a subsequent, unrelated `login` request succeeded immediately afterward, confirming the two limiters don't share state; the cancel-email-change route correctly returned `404` with nothing pending, correctly cleared a genuinely pending change (verified via `GET /me` before and after), correctly rejected a second cancel attempt with `404`, and a token cancelled this way correctly failed verification (`400`) when tried against `GET /verify-email`; the note-edit route correctly updated a note's body and set `updated_at`, correctly rejected an empty body (`400`) and a nonexistent note ID (`404`), and the list endpoint correctly reflected the edit on a subsequent fetch; `npm run lint` (aside from four pre-existing, unrelated warnings/error already present in `OrderDetail.jsx` before this week's changes) and `npm run build` both pass on the frontend; all seeded test customers and notes were removed from the local database after verification
- **Testing limitation:** as in prior weeks, all features were verified end-to-end at the API layer (curl against the running backend with seeded data) and by static review of the React components; this environment has no browser-automation tool available, so the UI was not visually exercised in an actual browser window

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
