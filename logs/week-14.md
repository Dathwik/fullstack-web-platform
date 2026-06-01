# Week 14 Work Log (May 25 – May 31, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 25 hours

---

## Work Summary

With the system in a maintenance and optimisation phase, this week focused on three operational enhancements that address the daily workflow of an administrator managing a growing order volume. Three features were implemented: a product sales analytics view on the Products page showing per-product revenue, quantity sold, and order count over a selectable time window; a server-side PDF invoice generator that produces a downloadable invoice for any order from the order detail page; and an order aging alert system that surfaces orders stuck in the "Received" state for more than four hours, with a dashboard banner, a count badge on the filter tab, and a dedicated server-side filtered view. All three features extend the admin usability surface addressed in Week 13 (SRS Section 4.4) and add new Computer Science concepts not previously exercised in the project.

---

## Technical Activities

### Product Sales Analytics (SRS Section 4.4: Usability Requirements)

**Problem:** The Products page showed only current stock and availability. An administrator had no way to see which products were actually selling, how much revenue each contributed, or whether a slow-moving product was worth restocking — without manually scanning the order list.

**Backend — products route** (`backend/src/routes/products.js`):

- Added `GET /api/products/analytics?days=30` — auth-protected, registered before the parameterised PATCH `/:id` route to prevent route shadowing
- SQL query uses a `LEFT JOIN` from `products` to `order_items` to `orders` so that products with zero sales appear in the result set with zeroed aggregates, rather than being absent from the response (which would make a "bottom performers" analysis misleading)
- `WHERE o.status <> 'Cancelled'` excludes cancelled orders from the revenue total — the same criterion used in the Week 13 analytics endpoint — so cancelled orders do not inflate product revenue figures
- `WHERE o.created_at >= CURRENT_DATE - ($1 || ' days')::interval` scopes the aggregation to the selected time window; the `days` parameter is capped at 365 server-side with `Math.min(parseInt, 365)` to prevent runaway queries
- Returns an array of `{ id, name, price_per_kg, total_orders, total_quantity_kg, total_revenue }` sorted by `total_revenue DESC` so the default view immediately surfaces the highest-value products

**Frontend — Products page** (`frontend/src/pages/Products.jsx`):

- Added `tab` state (`'inventory'` | `'analytics'`) and a two-button tab bar below the page header; the `+ Add` product button is hidden while the analytics tab is active since adding a product is irrelevant to the analytics view
- New `ProductAnalytics` sub-component manages its own `data`, `days` (7 / 30 / 90), and `sortBy` (`revenue` / `quantity` / `orders`) state — period and sort controls are localised to this component to avoid polluting the parent page state
- The component re-fetches from `GET /api/products/analytics` whenever the `days` value changes; sorting is performed client-side by sorting a copy of the fetched array so switching sort keys does not trigger a network request
- Rendered as a CSS grid table (`gridTemplateColumns: '1fr 60px 70px 80px'`) rather than an HTML `<table>` for layout consistency with the rest of the codebase, which uses `div`/inline-style layouts throughout

---

### Server-Side PDF Invoice Generation (SRS Section 4.4: Usability Requirements)

**Problem:** The admin had a browser-based print-to-PDF packing slip but no stable, branded, downloadable PDF invoice to share with customers or retain for bookkeeping. The packing slip is generated client-side in a new browser window; this approach cannot set consistent headers, footers, or layout across printers and operating systems.

**Backend — pdfkit dependency** (`backend/package.json`):

- Added `pdfkit@^0.18` — a pure Node.js PDF generation library that writes a binary stream directly to the Express response, eliminating the need for a headless browser or a third-party PDF service
- `pdfkit` was selected over browser-based alternatives (Puppeteer, wkhtmltopdf) because it operates entirely in-process with no external process spawning, no Chrome binary dependency, and a document model that composes directly in JavaScript

**Backend — orders route** (`backend/src/routes/orders.js`):

- Added `GET /api/orders/:id/invoice` — auth-protected, registered immediately before `GET /:id` to prevent Express from treating `invoice` as an order ID; the route constructs a full `SELECT` with `json_agg` over `order_items` and `products` (identical structure to the existing `GET /:id` query) so a single database round-trip fetches all required data
- Response headers: `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="invoice-<shortId>.pdf"` — the `attachment` disposition instructs the browser to prompt a file download rather than attempting to render the PDF inline, consistent with a bookkeeping document workflow
- The `PDFDocument` instance is constructed with `doc.pipe(res)` — `pdfkit` writes chunk-by-chunk to the Node.js writable stream as each element is added, so the entire PDF is never buffered in memory before being sent; this is important for large orders or high concurrency
- PDF layout: business header (right-aligned name and contact), order number and placed-at timestamp, billing address block (customer name, phone, optional email, delivery address, optional special instructions), an itemised line-items table with product name / quantity / rate / amount columns, a total row, and a payment method and status footer
- Items table columns are positioned using `pdfkit`'s absolute coordinate system (`doc.text(str, x, y)`) because `pdfkit` does not have a native table primitive; absolute positioning ensures columns remain aligned regardless of text length in earlier columns
- `if (!res.headersSent) res.status(500).json(...)` in the catch block guards against writing a JSON error response after `Content-Type: application/pdf` has already been flushed — without this guard, a mid-stream error would produce a corrupt PDF file rather than a clean error

**Frontend — OrderDetail page** (`frontend/src/pages/OrderDetail.jsx`):

- Added a `<a href="/api/orders/:id/invoice" download>` anchor styled to match the existing action buttons; using a native anchor with the `download` attribute delegates the PDF fetch to the browser's download manager (keeps the order detail page open, respects Content-Disposition) rather than using `window.open` or `fetch()` with a blob URL

---

### Order Aging Alerts (SRS Section 4.4: Usability Requirements)

**Problem:** Orders in the "Received" state represent demand that has not yet been acknowledged. As order volume grows, an order placed at 8 AM could sit unnoticed until well into the afternoon. There was no mechanism to proactively surface orders that had been waiting too long, forcing the administrator to rely on manual scanning.

**Backend — orders route** (`backend/src/routes/orders.js`):

- Extended `GET /api/orders/stats` to run a fifth parallel query alongside the four existing stat queries: `SELECT COUNT(*) FROM orders WHERE status = 'Received' AND created_at < NOW() - INTERVAL '4 hours'` — this uses PostgreSQL's `INTERVAL` arithmetic to compare the current server timestamp against `created_at` directly in the database, avoiding any client-side date computation that could be affected by timezone differences between the browser and the database server
- The 4-hour threshold is a standard operational SLA for order acknowledgement; it is defined once in the SQL literal so it can be adjusted without frontend changes
- Added `aging: 'true'` as an optional query parameter to `GET /api/orders` — when present it appends `(o.status = 'Received' AND o.created_at < NOW() - INTERVAL '4 hours')` to the parameterised `WHERE` builder; the aging filter uses the same interval literal as the stats query so the count shown in the alert and the number of orders returned by the filter are always consistent
- The aging filter is additive with the existing `search`, `date_from`, and `date_to` filters through the same `conditions` array builder used by all other filters

**Frontend — Orders page** (`frontend/src/pages/Orders.jsx`):

- Added `'aging'` to the filter tab array; when selected, `fetchOrders` passes `params.aging = 'true'` to the API instead of applying a client-side status filter — the server returns the correctly scoped result set directly
- Added `filter` to the `useEffect` dependency array (previously only `dateFrom`, `dateTo`, and `search`), so switching to the Aging tab immediately triggers a fresh API call rather than filtering the previously fetched result set client-side
- A count badge is rendered inside the Aging tab button when `stats.aging.count > 0` — styled with the same amber colour scheme as the aging banner so the two indicators are visually linked
- An amber banner appears at the top of the orders list (above the low-stock alert) when `stats.aging.count > 0` and the current filter is not already `'aging'`; clicking the banner sets `filter` to `'aging'`, which causes the useEffect to re-fetch the filtered order list; the banner is hidden when the Aging tab is already active to avoid redundancy
- The stats panel is fetched once on mount and is not refreshed with the 30-second polling interval; the aging count therefore reflects the state at page load, which is sufficient for an operational alert — an administrator who has been on the page for an extended period will see updated data on their next page navigation

---

## Frontend Architecture

### Updated Pages

- `src/pages/Products.jsx` — `tab` state (`inventory` | `analytics`); `ProductAnalytics` sub-component with `days` and `sortBy` controls; inventory list and Add button conditional on `tab === 'inventory'`
- `src/pages/Orders.jsx` — `'aging'` added to filter tab array; `filter` added to `useEffect` dependency array; aging banner above low-stock alert; count badge on Aging tab button; `params.aging` passed when `filter === 'aging'`
- `src/pages/OrderDetail.jsx` — `<a download>` anchor for PDF invoice below the Print packing slip button

---

## Backend Architecture

### New Routes

- `GET /api/products/analytics` — auth-protected, per-product sales aggregation over a configurable day window using `LEFT JOIN` to include zero-sales products
- `GET /api/orders/:id/invoice` — auth-protected, returns a binary PDF stream generated by `pdfkit`

### Updated Routes

- `GET /api/orders/stats` — fifth parallel query added to count aging "Received" orders (> 4 hours); `aging.count` added to response object
- `GET /api/orders` — accepts optional `aging=true` query parameter; appends timestamp-interval condition to the parameterised `WHERE` builder

### New Dependencies

- `pdfkit@^0.18` (backend) — pure Node.js PDF document stream library; writes directly to the Express response without an intermediate buffer

---

## Project Planning

- The system now provides three layers of operational visibility: real-time order counts and revenue (Weeks 1–9), 7-day revenue trend (Week 13), and per-product sales analytics over configurable periods (this week)
- PDF invoices close the bookkeeping gap between the packing slip (print-only) and a formal customer-facing document; a future improvement would add a business address, tax number, and a payment reference line for reconciliation
- The 4-hour aging threshold is currently hardcoded; a future improvement would expose it as an admin-configurable setting stored in a `settings` table
- The product analytics endpoint does not yet break down sales by time period within the window (e.g. weekly sub-totals); this would require a `generate_series` approach similar to the revenue chart and could be added to a future analytics expansion

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- SQL Aggregate Functions with Outer Joins — using `LEFT JOIN` from `products` to `order_items` with `COUNT(DISTINCT order_id)`, `SUM(quantity_kg)`, and `SUM(quantity_kg * price_per_kg)` grouped by product; the `LEFT JOIN` ensures zero-sales products appear in the result with `COALESCE(..., 0)` replacing `NULL` aggregates, which is essential for completeness of a reporting query
- Binary Stream I/O over HTTP — piping a `pdfkit` `PDFDocument` instance directly to the Node.js `http.ServerResponse` object using `doc.pipe(res)`; the PDF is generated and transmitted as a chunked stream rather than materialising the full byte array in memory before writing, applying the same producer–consumer streaming model used in file system and network I/O
- PDF Coordinate Systems and Layout — composing a PDF using absolute `(x, y)` coordinates on a fixed page canvas; the items table uses a `COL` map of column x-positions to simulate tabular alignment since PDF has no native table primitive, requiring the developer to manage column alignment manually (as opposed to HTML/CSS `display:table` or `display:grid`)
- HTTP Content-Disposition Header — using `Content-Disposition: attachment; filename="invoice-<id>.pdf"` to instruct the browser to download the response as a file rather than navigate to it; contrasted with `Content-Disposition: inline` which would attempt browser-native rendering
- SQL Temporal Arithmetic — using `NOW() - INTERVAL '4 hours'` directly in a `WHERE` predicate to compare row timestamps against a relative time offset; this executes entirely in the database engine, avoiding round-trips or client-side date calculations that would be subject to timezone drift between the Node.js server and the PostgreSQL instance
- Client-Side Sorting with Server-Side Pagination — fetching the full analytics dataset from the server and sorting a copy of it in the browser on each sort-key change (`[...data].sort(...)`); this design is appropriate for a small, bounded dataset (one row per product) where re-fetching for each sort change would add unnecessary latency; contrasted with the order list, which uses server-side filtering because the dataset is unbounded

---

## Evidence

- `backend/src/routes/products.js` — `GET /api/products/analytics` endpoint with LEFT JOIN aggregation and day-window parameter
- `backend/src/routes/orders.js` — `GET /api/orders/:id/invoice` PDF endpoint using pdfkit; `aging` count in `GET /api/orders/stats`; `aging=true` filter in `GET /api/orders`
- `frontend/src/pages/Products.jsx` — `ProductAnalytics` component with period and sort controls; tab switcher
- `frontend/src/pages/Orders.jsx` — aging banner, Aging tab with count badge, `filter` in useEffect dependency array
- `frontend/src/pages/OrderDetail.jsx` — Download invoice PDF anchor
- `backend/package.json` — `pdfkit@^0.18` added
- Tested: product analytics loads correct revenue/quantity/order totals for 7d, 30d, 90d windows; sorting by each column reorders correctly; products with no sales show zero values rather than being absent; PDF invoice downloads with correct filename, renders business header, customer block, itemised table, correct total, payment method and status; aging alert banner appears when orders exist over 4 hours old, clicking it activates the Aging tab and fetches the server-filtered list; Aging tab badge shows correct count; frontend production build succeeds

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
