# Week 4 Work Log (Mar 14 – Mar 20, 2026)

**Name:** Dathwik Kollikonda  
**Role:** Software Engineer (Self-Employed)  
**Employment Type:** Post-Completion OPT – Self-Employment  
**Hours Worked:** 25 hours  

---

## Work Summary

During this week, I focused on implementing the backend server and RESTful API layer for the full-stack web application platform. The goal of this phase was to build a functional backend system capable of handling authentication, product management, and order processing based on the previously designed database schema.

This involved setting up the server environment, configuring middleware, implementing authentication mechanisms, and developing API endpoints for core system functionality. The backend system developed during this phase enables interaction between the frontend interface and the database.

---

## Technical Activities

- Set up backend server using Node.js and Express framework
- Configured project structure with modular route handling
- Implemented middleware for JSON parsing, CORS, and session management
- Configured environment variables using dotenv for secure configuration
- Established PostgreSQL database connection using connection pooling
- Implemented session-based authentication system for admin access
- Developed authentication endpoints:
  - Admin login with password validation
  - Session persistence and logout functionality
  - Authentication status check endpoint
- Built protected routes using custom authentication middleware
- Developed product management APIs:
  - Fetch all products (public endpoint)
  - Create new products
  - Update product details and availability
  - Delete products
- Implemented order management APIs:
  - Create new orders with validation and transactional consistency
  - Retrieve all orders with associated items using SQL joins and aggregation
  - Retrieve individual order details
  - Update order status through defined lifecycle states
  - Delete orders
- Implemented transactional database operations using BEGIN / COMMIT / ROLLBACK
- Used JSON aggregation in SQL queries to structure nested order-item responses
- Added error handling middleware for robust API responses
- Implemented health check endpoint for server monitoring
- Tested API endpoints using local development environment

---

## System Design & Backend Architecture

### Backend Structure

- Modular routing architecture:
  - `/api/auth`
  - `/api/products`
  - `/api/orders`
- Middleware-based request handling
- Session-based authentication with secure cookies

### Database Integration

- PostgreSQL integration using connection pooling
- Efficient query design with joins and aggregation
- Transactional handling for multi-step operations (order creation)

### API Design

- RESTful endpoint structure for all resources
- Separation of public and protected routes
- Input validation for request payloads
- Structured JSON responses for frontend integration

---

## Project Planning & Architecture Refinement

- Transitioned from database design to full backend implementation
- Established clear API contracts for frontend integration
- Designed scalable backend architecture with modular components
- Prepared system for frontend connectivity and end-to-end testing
- Planned next phase focusing on frontend integration and UI development

---

## Degree Relevance

This week’s work directly applies core Computer Science concepts including:

- Backend Web Development
- RESTful API Design
- Client-Server Architecture
- Session Management and Authentication
- Database Integration and Query Optimization
- Middleware Architecture
- Transactional Systems
- Software Engineering Best Practices

The development of a scalable backend system using modern web technologies directly reflects coursework in software engineering, distributed systems, and database systems.

---

## Evidence

- Backend source code implementing server and API routes
- Authentication middleware and session handling implementation
- SQL queries and transactional operations for order management
- GitHub commits reflecting backend development progress

**GitHub Repository:**  
https://github.com/Dathwik/fullstack-web-platform
