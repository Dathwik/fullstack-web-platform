# Week 7 Work Log (Apr 6 – Apr 12, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 24 hours

---

## Work Summary

During this week, I focused on extending the order management web platform beyond its MVP state by implementing four feature enhancements and preparing the application for production deployment. The work addressed remaining functional requirements from the SRS that were deferred during the MVP phase: customer-facing order submission, CSV data export, date-range filtering, and secure credential handling.

The platform is now feature-complete for Phase 1 of the SRS and ready to serve both customers placing orders and operators managing them, with a documented path to deploy on a cloud hosting platform.

---

## Technical Activities

### CSV Order Export (FR-9)

- Added `GET /api/orders/export` endpoint to the orders router, registered before `GET /:id` to prevent route shadowing
- Built a CSV serialization function with proper RFC 4180 quoting (fields containing commas, quotes, or newlines are double-quoted and inner quotes are escaped)
- Exported columns: Order ID, Customer Name, Phone, Email, Address, Status, Items summary, Total ($), Date (ISO 8601), Special Instructions
- Executed a single aggregated SQL query joining `orders`, `order_items`, and `products` to compute per-row item summaries and totals server-side
- Added an "Export CSV" button to the Orders board header that triggers a browser file download via `window.location.href`, which passes the session cookie automatically
- Endpoint is protected by `requireAuth` middleware; unauthorized requests return 401

### Public Customer Order Submission (FR-1, FR-2, FR-3, FR-12)

- Added `POST /api/orders/public` endpoint that accepts the same payload as the admin order creation route but requires no authentication
- Returns only `{ id, created_at }` to avoid exposing internal order state to customers
- Built `PlaceOrder.jsx` as a customer-facing order form at the `/place-order` route
  - Fetches only available products from the existing public `GET /api/products` endpoint
  - Displays an estimated order total that updates in real time as the customer selects items and quantities
  - Validates required fields and minimum 1kg quantity before submitting
  - Submits to `POST /api/orders/public` and navigates to `/order-confirmation?id=<uuid>` on success
- Built `OrderConfirmation.jsx` confirmation screen that displays a success message and the first 8 characters of the order UUID as a customer-readable reference number
- Restructured `App.jsx` to wrap all routing in `BrowserRouter` and expose `/place-order` and `/order-confirmation` as public routes that bypass the authentication check, while keeping all other routes protected

### Date Filter on Orders Board (FR-7)

- Extended `GET /api/orders` to accept optional `date_from` and `date_to` query parameters
- Backend builds WHERE conditions dynamically using a parameterized conditions array, supporting any combination of status, date_from, and date_to filters without SQL string concatenation
- `date_from` maps to `created_at >= $N::date` and `date_to` to `created_at < ($N::date + interval '1 day')` so the end date is inclusive
- Added two date inputs (from/to) below the status filter tabs on the Orders board, connected to component state
- `fetchOrders` passes the active date values as query parameters; the effect re-runs whenever either date changes
- A "Clear" button appears inline when either date is set, resetting both fields to fetch all orders

### Admin Password Security (bcryptjs)

- Replaced the plaintext `ADMIN_PASSWORD` comparison in `auth.js` with `bcrypt.compare()` using the stored `ADMIN_PASSWORD_HASH` environment variable
- `ADMIN_PASSWORD_HASH` is a bcrypt hash generated with salt rounds of 12 using `node scripts/hash-password.js <password>`
- Added `backend/scripts/hash-password.js` helper script and a `npm run hash-password` shortcut in `backend/package.json`
- Added `backend/.env.example` documenting all required environment variables and how to generate the hash
- The `.env` now contains only the hash, not the plaintext password

### Production Deployment Preparation

- Updated `backend/src/app.js` to read the CORS allowed origin from `CORS_ORIGIN` env var (defaults to `localhost:5173` for development) and to set `cookie.secure = true` automatically when `NODE_ENV=production`
- In production mode, Express serves the built Vite frontend as static files from `frontend/dist` and falls back to `index.html` for any non-API route to support SPA client-side routing
- Added a `/api` catch-all middleware (registered after all API routes) that returns a 404 JSON response for unknown API paths, preventing Express from falling through to the SPA handler for bad API requests
- Created a root-level `package.json` with `build` (installs and compiles the frontend) and `start` (runs the backend in production mode) scripts intended for cloud deployment platforms
- Created `Procfile` for Railway/Render deployment
- Verified the full production setup: `npm run build` produces the Vite bundle successfully, and the backend correctly serves `index.html` and API routes simultaneously on a single port

---

## Frontend Architecture

### New Pages

- `src/pages/PlaceOrder.jsx` — customer-facing order form with live price estimation, submitting to the public API endpoint
- `src/pages/OrderConfirmation.jsx` — post-order success screen showing the order reference number

### Updated Pages

- `src/pages/Orders.jsx` — added Export CSV button, date-from/date-to inputs with a clear control, and date-aware `fetchOrders` function
- `src/App.jsx` — restructured to always render inside `BrowserRouter` and expose two public routes before the authentication gate

### Routing

- `/place-order` — public customer order form (no login required)
- `/order-confirmation` — public confirmation screen (no login required)
- All other routes remain authentication-protected

---

## Backend Architecture

### New Routes

- `GET /api/orders/export` — CSV download, auth-protected
- `POST /api/orders/public` — customer order creation, no auth required

### Updated Routes

- `GET /api/orders` — now accepts `date_from` and `date_to` query parameters alongside the existing `status` filter
- `POST /api/auth/login` — now uses `bcrypt.compare()` against a stored hash

### New Files

- `backend/scripts/hash-password.js` — CLI utility to generate a bcrypt hash from a plaintext password
- `backend/.env.example` — environment variable template for new deployments
- `Procfile` — deployment entrypoint for Railway/Render
- Root `package.json` — build and start scripts for single-port production deployment

---

## Project Planning

- All Phase 1 functional requirements from the SRS (FR-1 through FR-9) are now implemented
- The system can be deployed to a cloud platform by configuring the required environment variables and running `npm run build && npm start`
- Identified next steps: acquire a production domain, configure a managed PostgreSQL instance, and run a real-device test with actual customer orders

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- REST API Design and Route Organization
- Data Serialization and the CSV file format (RFC 4180)
- SQL Query Composition with Parameterized Inputs and Dynamic WHERE Clauses
- Cryptographic Password Hashing with bcrypt (cost factor, salted hashing, compare)
- Single-Page Application Routing and Public vs. Protected Route Patterns
- Full-Stack Production Build Pipelines and Static File Serving
- Secure Session Cookie Configuration for Production Environments
- Software Engineering Practices: Incremental Feature Delivery and SRS Compliance Verification

---

## Evidence

- `backend/src/routes/orders.js` — CSV export endpoint and public order endpoint
- `backend/src/routes/auth.js` — bcrypt-based login
- `backend/src/app.js` — production static file serving and CORS configuration
- `frontend/src/pages/PlaceOrder.jsx` and `OrderConfirmation.jsx` — new customer-facing pages
- `frontend/src/pages/Orders.jsx` — date filter and export button
- `frontend/src/App.jsx` — public route restructure
- `backend/.env.example`, `backend/scripts/hash-password.js`, `Procfile`, root `package.json`
- Tested: bcrypt login, CSV export, date filter, public order submission, production build

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
