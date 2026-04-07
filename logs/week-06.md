# Week 6 Work Log (Mar 29 – Apr 4, 2026)

**Name:** Dathwik Kollikonda
**Role:** Software Engineer (Self-Employed)
**Employment Type:** Post-Completion OPT – Self-Employment
**Hours Worked:** 22 hours

---

## Work Summary

During this week, I focused on implementing the order detail view for the order management web platform. The goal of this phase was to complete the core navigation flow by making individual order cards tappable and displaying a full breakdown of order information on a dedicated detail screen.

This involved building a new React page component, wiring it into the client-side routing system, integrating it with the existing order API, and testing the complete order lifecycle end-to-end. The order detail page developed during this phase completes the MVP frontend, giving the operator full visibility into every order from a single screen.

---

## Technical Activities

### Order Detail Page

- Built `OrderDetail.jsx` page component fetching a single order from `GET /api/orders/:id`
- Displayed full customer information including name, phone, email, and delivery address
- Rendered special instructions in a visually distinct highlighted block for quick operator reference
- Built itemized order breakdown showing each product name, quantity in kg, price per kg, and line subtotal
- Calculated and displayed order total derived from all item subtotals
- Displayed order metadata including placement timestamp and truncated order ID
- Applied color-coded status badge consistent with the orders board for visual continuity
- Handled loading state while order data is being fetched from the API
- Redirected to orders board if order ID is invalid or fetch fails

### Status Management

- Implemented "Mark as In Preparation" and "Mark as Completed" action buttons calling `PATCH /api/orders/:id/status`
- Implemented cancel order button with confirmation dialog on orders in Received status
- Implemented permanent delete for Completed and Cancelled orders calling `DELETE /api/orders/:id`
- Added loading/disabled state on all action buttons during API calls to prevent duplicate requests
- Refreshed order data in place after every status change without navigating away

### Routing Integration

- Imported `OrderDetail` component into `App.jsx`
- Added `/orders/:id` dynamic route to the React Router configuration
- Verified that tapping any order card on the board navigates correctly to the detail page
- Confirmed back navigation returns operator to the orders board with updated status reflected

### End-to-End Testing

- Created test orders with multiple items and special instructions through the new order form
- Verified all customer fields, item breakdowns, and totals render correctly on the detail page
- Tested status advancement flow: Received → In Preparation → Completed
- Tested cancel flow on a Received order and confirmed status updates on the board
- Confirmed delete removes the order and redirects back to the board
- Verified session persistence and protected route behavior throughout

---

## Frontend Architecture

### New Component

- `src/pages/OrderDetail.jsx` — dynamic order detail page consuming `/api/orders/:id`

### Routing Update

- Added `/orders/:id` route to the React Router `Routes` block in `App.jsx`
- Dynamic `:id` parameter extracted via `useParams()` hook and passed to the API request

### Data Flow

- Order fetched on component mount via `useEffect`
- Local state updated in place after status changes, avoiding full page reloads
- Total price computed on the client from item quantity and price fields returned by the API

---

## Project Planning & Architecture Refinement

- Completed all core MVP screens: login, orders board, new order form, product manager, order detail
- Full operator workflow is now functional end-to-end from order entry to completion
- Identified next development phase: CSV export for order data and production deployment
- Platform is ready for real-world testing on an actual phone browser

---

## Degree Relevance

This week's work directly applies core Computer Science concepts including:

- Frontend Web Development with React
- Dynamic Client-Side Routing and URL Parameter Handling
- REST API Integration and Data Fetching Patterns
- Component State Management and Side Effects
- User Interface Design for Mobile Devices
- End-to-End System Testing
- Software Engineering Best Practices and Iterative Development

The implementation of a dynamic detail view with full CRUD lifecycle management reflects coursework in software engineering, human-computer interaction, and full-stack web development.

---

## Evidence

- `OrderDetail.jsx` source code implementing the full detail view
- Updated `App.jsx` with dynamic route configuration
- Tested order lifecycle from creation through completion on local development environment
- GitHub commits reflecting order detail implementation

**GitHub Repository:**
https://github.com/Dathwik/fullstack-web-platform
