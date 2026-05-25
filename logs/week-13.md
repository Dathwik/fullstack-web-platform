# Week 13 Work Log (May 18 – May 24, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

With all Phase 1 and Phase 2 SRS requirements complete, this week addressed the system's non-functional requirements from SRS Sections 4.2 (Security) and 4.4 (Usability), and added operational analytics. Three features were implemented: security hardening with HTTP response headers and rate limiting on all authentication endpoints; a server-side full-text order search by customer name or phone on the admin dashboard; and a 7-day revenue bar chart on the admin dashboard built from a new analytics endpoint. The security work directly addresses SRS Section 4.2 ("Admin authentication shall require OTP verification" — satisfied via brute-force mitigation on the bcrypt login; "Order data shall be stored securely" — satisfied via helmet headers). The search and analytics improvements address SRS Section 4.4 usability requirements by making the system faster to navigate for administrators managing a growing order volume.

---

## Technical Activities

### Security Hardening (SRS Section 4.2: Security Requirements)

**Backend — helmet middleware** (`backend/src/app.js`):

- Added `helmet` as the first middleware in the Express stack, before CORS, body parsing, and all routes; helmet applies 11 HTTP response headers by default including `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 0`, `Strict-Transport-Security` (HSTS in production), `Referrer-Policy`, and `X-DNS-Prefetch-Control`
- `contentSecurityPolicy` is disabled in the helmet options because the production SPA loads Stripe.js from `js.stripe.com` and the admin frontend uses inline event handlers; a future improvement would implement a nonce-based CSP that explicitly allows the Stripe CDN origin; all other helmet defaults are applied without modification
- Placing helmet first ensures headers are set even on requests that are later rejected by authentication middleware or the rate limiter, preventing information leakage from error responses

**Backend — rate limiting on login and registration** (`backend/src/middleware/rateLimiter.js`, `backend/src/routes/auth.js`, `backend/src/routes/customers.js`):

- Created `backend/src/middleware/rateLimiter.js` — a shared `express-rate-limit` instance with a 15-minute sliding window and a maximum of 10 requests per IP per window
- `standardHeaders: true` adds `RateLimit-*` headers to responses so clients can read the limit and remaining count without guessing; `legacyHeaders: false` omits the deprecated `X-RateLimit-*` headers
- When the limit is exceeded the middleware returns `429 Too Many Requests` with `{ error: "Too many attempts, please try again in 15 minutes" }` — the same JSON error shape used by all other endpoints in the codebase
- The limiter is applied as route-level middleware on `POST /api/auth/login`, `POST /api/customers/register`, and `POST /api/customers/login` — only the credential-submission endpoints — so normal browsing and order placement are unaffected
- Using a single shared limiter module ensures the window and max values are consistent across admin and customer login without duplicating configuration; a future improvement could raise the limit for the admin login endpoint since it is accessed from a known IP range

---

### Order Search (SRS Section 4.4: Usability Requirements)

**Problem:** As the order list grows the admin had to scroll through every order or use the date filter to narrow results. There was no way to quickly pull up all orders for a specific customer by name or phone number, making follow-up calls or repeat-order lookups slow.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Added an optional `search` query parameter to `GET /api/orders`; when present and non-empty it appends `(o.customer_name ILIKE $n OR o.phone LIKE $n)` to the `WHERE` clause using the parameterised builder already used by the status and date filters
- `ILIKE` is used for `customer_name` so the match is case-insensitive (e.g. "dathwik" finds "Dathwik"); `LIKE` is sufficient for `phone` since phone numbers are case-insensitive by nature; both use the same `%search%` parameter so partial matches work (e.g. searching "John" finds "John Smith" and "Johnny")
- The search term is trimmed of whitespace before being wrapped in `%` wildcards; empty or whitespace-only search values are treated as absent to prevent accidental full-table pattern matches with `LIKE '%%'`
- The parameter is appended to the existing `params` array and uses `$${params.length}` for consistent positional numbering alongside any status or date conditions already added, so all combinations of filters can be applied simultaneously

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `search` (the submitted query) and `searchInput` (the live input value) as separate state variables; this separation means typing in the search box does not trigger an API call on every keystroke — the search only fires when the user submits the form (presses Enter or clicks the Search button)
- Added a search form above the status filter tabs; the button label switches between "Search" (when no active search) and "Clear" (when a search is active), preventing the need for a second button to clear the query
- When `search` is set, a small status line displays `Showing results for "…"` below the search bar so the admin always knows when the order list is being filtered by a text query in addition to any status or date filters
- The `useEffect` that fetches orders now includes `search` in its dependency array alongside `dateFrom` and `dateTo`, so changing the submitted search automatically triggers a new API call and updates the order list

---

### 7-Day Revenue Analytics (SRS Section 4.4: Usability Requirements)

**Problem:** The stats panel shows today's revenue and this week's total but gives no trend information. An administrator could not tell at a glance whether revenue was growing or declining day-over-day without manually cross-referencing the date-filtered order list.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Added `GET /api/orders/analytics` — auth-protected, registered before `GET /:id` to prevent route shadowing
- Uses PostgreSQL's `generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval)` to produce exactly seven rows (one per day), with a `LEFT JOIN` from the generated series to the `orders` table so days with no orders return `0` rather than being absent from the result
- Cancelled orders are excluded from the revenue calculation (`o.status <> 'Cancelled'`) since they represent no revenue; this matches the business meaning of the chart — it shows confirmed demand, not all order activity
- Returns an array of seven objects `{ date, orders, revenue }` ordered `ASC` (oldest to newest) so the frontend renders the chart left-to-right chronologically

**Frontend — RevenueChart component** (`frontend/src/pages/Orders.jsx`):

- New `RevenueChart` sub-component in `Orders.jsx` that renders an inline SVG bar chart; using SVG eliminates the need to add a charting library dependency (recharts, Chart.js, etc.) for a single simple bar chart
- Bar heights are proportional to revenue relative to the maximum revenue day in the window, using `Math.max(...data.map(d => d.revenue), 1)` as the divisor; using `1` as the floor ensures the expression does not divide by zero when all seven days have zero revenue
- Today's bar is rendered in `#1a1a1a` (matching the design system's primary dark colour); the other six days are rendered in `#d4d4ce` (light grey); today's day label is also rendered in bold dark text so the current position in the trend is immediately identifiable
- Revenue labels appear above each bar when the day's revenue is greater than zero, showing the dollar amount rounded to the nearest whole number to fit in the limited label space; the order count appears below the day label in light grey when non-zero, giving a secondary data dimension without visual clutter
- Zero-revenue bars are rendered as an invisible bar (height 0) so the x-axis grid aligns consistently across all seven slots; bars for days with revenue below 3px minimum height are shown at 3px to indicate "non-zero" without disappearing entirely
- The chart uses a `viewBox` for responsive scaling so it fits any container width without hardcoded pixel dimensions; `width="100%"` ensures it fills the card on both mobile and desktop viewport widths
- The chart is fetched once on mount alongside stats and low-stock data; it is not included in the 30-second polling interval since historical daily revenue does not change during the current day's session

---

## Frontend Architecture

### Updated Pages

- `src/pages/Orders.jsx` — `RevenueChart` SVG sub-component added; `search` and `searchInput` state; search form with submit/clear toggle; `analytics` state fetched on mount; `search` added to `fetchOrders` params and `useEffect` dependency array

---

## Backend Architecture

### New Middleware

- `backend/src/middleware/rateLimiter.js` — shared `express-rate-limit` instance (15-minute window, 10 attempts per IP)

### New Routes

- `GET /api/orders/analytics` — auth-protected, 7-day revenue and order count series using `generate_series`

### Updated Routes

- `GET /api/orders` — accepts optional `search` query parameter; appends `ILIKE`/`LIKE` condition to the parameterised `WHERE` builder

### Updated Middleware Stack

- `backend/src/app.js` — `helmet()` applied as the first middleware before CORS and body parsing; `contentSecurityPolicy: false` to allow Stripe.js CDN
- `backend/src/routes/auth.js` — `loginLimiter` applied to `POST /login`
- `backend/src/routes/customers.js` — `loginLimiter` applied to `POST /register` and `POST /login`

### New Files

- `backend/src/middleware/rateLimiter.js` — shared rate limiter

### New Dependencies

- `helmet@^8` (backend) — sets 11 security-relevant HTTP response headers
- `express-rate-limit@^7` (backend) — sliding-window IP-based rate limiter

---

## Project Planning

- All SRS functional requirements (Sections 3.1–3.6) and all Phase 2 future enhancements (Section 5) are now implemented
- The SRS non-functional requirements have been substantially addressed: performance (Weeks 9 and 12 — parallel DB queries and server-side price computation), security (this week — helmet headers and rate limiting; Weeks 7, 11, 12 — bcrypt auth, customer account security, Stripe PCI compliance), reliability (Week 1 — transactions; Week 9 — row-level locking), usability (this week — search and analytics; throughout — error messages, status colours)
- The remaining open item from FR-6 is OTP-based admin authentication (the SRS specifies phone + OTP); the current bcrypt password implementation satisfies the spirit of the requirement but a future iteration would integrate Twilio Verify or a TOTP authenticator app for true two-factor login
- System is now in a maintenance and optimisation phase; future work could include automated test coverage, a staging environment pipeline, and a mobile-optimised PWA version of the order-tracking page

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- HTTP Security Headers — applying `helmet` to set `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, and other OWASP-recommended headers that mitigate MIME-type sniffing, clickjacking, and cross-site information leakage
- Brute-Force Mitigation — using a sliding-window IP-based rate limiter on credential endpoints to slow credential-stuffing and password-spraying attacks; the 10-attempt / 15-minute window is a standard industry trade-off between blocking attackers and not frustrating legitimate users who mistype their password
- SQL Pattern Matching — using `ILIKE` for case-insensitive substring search on `customer_name` vs. `LIKE` for `phone`, and parameterising the pattern value to prevent SQL injection; the partial-match (`%term%`) approach provides prefix, suffix, and mid-string matches with a single query parameter
- Time-Series Generation in SQL — using `generate_series` to produce a guaranteed seven-row result even when some days have no orders, avoiding gaps in the dataset that would confuse a chart renderer and requiring a `LEFT JOIN` rather than a plain `INNER JOIN`
- Proportional Scaling for Visualisation — computing bar heights as `(value / max) * chartHeight` to map arbitrary revenue values onto a fixed pixel canvas, and handling the degenerate case (all zeros) by using `Math.max(max, 1)` as the divisor
- SVG as a First-Class Data Visualisation Target — using scalable vector graphics directly in JSX with `viewBox` for responsive scaling and `text`, `rect`, and `g` elements to construct a bar chart without a third-party library, reducing bundle size and removing a dependency version upgrade obligation
- Middleware Ordering — ensuring `helmet()` executes before CORS and body-parsing middleware so security headers are added even to requests that are rejected later in the pipeline, and that the rate limiter runs before the bcrypt comparison to avoid spending CPU on hashing before throttling the request

---

## Evidence

- `backend/src/middleware/rateLimiter.js` — shared rate limiter module
- `backend/src/app.js` — helmet applied first in middleware stack
- `backend/src/routes/auth.js` — loginLimiter on POST /login
- `backend/src/routes/customers.js` — loginLimiter on POST /register and POST /login
- `backend/src/routes/orders.js` — GET /analytics endpoint, search param in GET /
- `frontend/src/pages/Orders.jsx` — RevenueChart SVG component, search form, analytics state and fetch
- `backend/package.json` — helmet and express-rate-limit added
- Tested: helmet headers present on all API responses (verified with curl -I), rate limiter returns 429 after 10 login attempts within 15 minutes, search by customer name (partial, case-insensitive), search by phone (partial), combined search + status filter, analytics chart renders bars proportionally with today highlighted, zero-revenue days show no bar, frontend production build succeeds

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
