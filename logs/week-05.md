# Week 5 Work Log (Mar 21 – Mar 28, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 26 hours

---

## Work Summary

During this week, I focused on designing and implementing the complete frontend interface for the order management web platform. The goal of this phase was to build a functional, mobile-first single-page application that enables the operator to manage customer orders in real time directly from a phone browser.

This involved scaffolding the React application, configuring client-server communication, implementing session-based authentication on the frontend, and building all core UI screens: the login page, live orders board, new order entry form, and product management interface. The frontend developed during this phase integrates fully with the backend REST API built in the previous week.

---

## Technical Activities

### Project Setup & Configuration

- Scaffolded React application using Vite with the React template
- Configured Vite development proxy to forward `/api` requests to the Express backend, eliminating CORS issues during development
- Installed and configured React Router DOM for client-side navigation between screens
- Set up Axios as the HTTP client with credentials enabled for session cookie handling
- Created a centralized API module (`api.js`) for consistent base URL and credential configuration across all requests
- Removed Vite boilerplate files and configured global mobile-first CSS baseline

### Authentication Flow

- Implemented Login page with password input, error display, and loading state
- Connected login form to `POST /api/auth/login` endpoint
- Implemented session persistence check on app load using `GET /api/auth/me`
- Built logout functionality calling `POST /api/auth/logout` and clearing frontend auth state
- Designed top-level App component to conditionally render Login or authenticated routes based on session state

### Orders Board

- Built Orders page displaying all orders fetched from `GET /api/orders`
- Implemented status-based filtering with Active, Done, and All tabs
- Designed order cards showing customer name, phone, item summary, total price, and status badge
- Implemented inline status advancement buttons (Start, Complete) with direct API calls to `PATCH /api/orders/:id/status`
- Added cancel button with confirmation dialog on Received orders
- Applied color-coded status badges for quick visual scanning (amber for Received, blue for In Preparation, green for Completed, red for Cancelled)
- Wired order cards to navigate to individual order detail view on tap

### New Order Form

- Built multi-section order entry form optimized for fast data entry during a phone call
- Implemented dynamic item list with add and remove item controls
- Populated product selector from `GET /api/products`, showing only available products with price
- Enforced minimum 1kg quantity per item with 0.5kg step increments
- Captured customer name, phone, address (required), email and special instructions (optional)
- Submitted complete order payload to `POST /api/orders` with client-side validation before submission
- Redirected operator back to orders board on successful save

### Product Management

- Built Products page listing all products with name, price per kg, and availability status
- Implemented inline add product form toggled by a header button
- Built availability toggle button calling `PATCH /api/products/:id` to flip `is_available`
- Implemented delete product with confirmation dialog calling `DELETE /api/products/:id`
- Visually dimmed unavailable products so operator can immediately distinguish active inventory

### Integration & Testing

- Tested full end-to-end order flow: login → create order → view on board → advance status → complete
- Verified session persistence across page refreshes
- Validated that protected API routes correctly reject unauthenticated frontend requests
- Tested product availability toggle reflecting correctly in the new order form dropdown
- Confirmed all API responses render correctly in the UI including empty states
- Pushed complete frontend codebase to GitHub repository

---

## Frontend Architecture

### Application Structure

- `src/pages/` — Login, Orders, NewOrder, Products
- `src/api.js` — Axios instance with base URL and credentials
- `src/App.jsx` — Root component managing auth state and routing
- `src/index.css` — Global mobile-first CSS reset and base styles

### Routing

- `/` — Orders board (protected)
- `/new-order` — New order form (protected)
- `/products` — Product manager (protected)
- `*` — Redirect to `/` for unknown routes

### State Management

- Local React state (`useState`) used per page component
- Auth state managed at App root and passed down via props
- No external state library required at MVP scale

### Mobile-First Design Decisions

- Maximum content width of 480px centered on screen for comfortable thumb reach
- Large tap targets on all action buttons (minimum 44px height)
- Inline status action buttons on order cards to minimize navigation
- Form inputs sized for comfortable mobile keyboard interaction

---

## Project Planning & Architecture Refinement

- Completed frontend MVP covering all core operator workflows
- Validated full-stack integration between React frontend and Express/PostgreSQL backend
- Scoped frontend to operator-only use case, deferring customer-facing interface to future phase
- Simplified authentication to single password login, replacing OTP flow for MVP
- Identified next development phase: order detail view, CSV export, and deployment

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Frontend Web Development with React
- Single-Page Application Architecture
- Client-Server Communication and REST API Integration
- Session-Based Authentication on the Client
- Component-Based UI Design
- State Management and Reactive UI Patterns
- Mobile-First Responsive Design
- Software Engineering Best Practices and Version Control

The development of a complete frontend interface integrating with a backend system reflects coursework in software engineering, human-computer interaction, and full-stack web development.

---

## Evidence

- React source code for all page components and routing
- Axios API integration module with session credential handling
- Vite configuration with backend proxy setup
- GitHub commits reflecting frontend implementation progress

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
