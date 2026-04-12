# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
npm run dev      # Start with nodemon (hot reload)
npm start        # Start without hot reload
```

### Frontend
```bash
cd frontend
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

Both servers must run simultaneously in development. The Vite dev server proxies `/api` requests to `http://localhost:3001`.

### Database
```bash
# Apply schema (run once to set up)
psql -d fullstack_platform -f database/schema.sql
```

## Architecture

This is a monorepo with separate `frontend/` and `backend/` directories — no shared code between them.

### Backend (`backend/src/`)
- **Framework:** Express 5 (CommonJS modules)
- **Entry point:** `src/app.js` — mounts routes, session middleware, CORS
- **Database:** PostgreSQL via the `pg` Pool in `src/db/index.js` — raw SQL, no ORM
- **Auth:** Session-based via `express-session`. The session flag `req.session.authenticated` is checked by `src/middleware/auth.js`. Admin password is stored in `.env` as `ADMIN_PASSWORD` (plaintext comparison; `bcryptjs` is installed but currently unused).
- **Routes:** `src/routes/auth.js`, `products.js`, `orders.js` — mounted at `/api/auth`, `/api/products`, `/api/orders`

### Frontend (`frontend/src/`)
- **Framework:** React 19 + React Router 7, ES modules (Vite)
- **API calls:** `src/api.js` exports an Axios instance with `baseURL: '/api'` and `withCredentials: true` (required for session cookies)
- **Pages:** `src/pages/` — Login, Orders, NewOrder, OrderDetail, Products
- **Routing:** Defined in `App.jsx`. Auth state is checked via `GET /api/auth/me` on mount; unauthenticated users see only the Login page.

### Database Schema
Tables: `products`, `orders`, `order_items`. All primary keys are UUIDs (`gen_random_uuid()`). `orders.status` is a PostgreSQL enum: `Received | In Preparation | Completed | Cancelled`. Order creation uses a transaction to insert `orders` and `order_items` atomically.

## Environment Variables

Backend `.env` (required):
```
PORT=3001
DATABASE_URL=postgresql://localhost:5432/fullstack_platform
SESSION_SECRET=<long random string>
ADMIN_PASSWORD=<plaintext password>
```

No frontend `.env` is needed — Vite's proxy handles API routing in development.

## Key Patterns

- **Auth guard:** Routes requiring auth call `requireAuth` middleware from `src/middleware/auth.js` before the handler. Public routes: `GET /api/products`, all `/api/auth/*`.
- **Order creation:** `POST /api/orders` accepts `{ customer_name, phone, email, address, special_instructions, items: [{ product_id, quantity_kg }] }` and wraps inserts in a `BEGIN/COMMIT` transaction.
- **Status filter:** `GET /api/orders?status=Received` filters by enum value.
