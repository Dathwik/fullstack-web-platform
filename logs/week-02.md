# Week 2 Work Log (Feb 28 – Mar 6, 2026)

**Name:** Dathwik Kollikonda  
**Role:** Software Engineer (Self-Employed)  
**Employment Type:** Post-Completion OPT – Self-Employment  
**Hours Worked:** 22 hours  

---

## Work Summary

During this week, I focused on defining and documenting the core functional requirements of the full-stack web application platform. The objective was to clearly establish system behavior, user interactions, and backend workflows before beginning database and API implementation.

This phase involved structured requirements gathering, workflow modeling, and translating business needs into technical system specifications. The output of this work serves as the functional foundation for backend API design and frontend development in upcoming phases.

---

## Technical Activities

- Conducted structured requirements analysis for an online order intake and management system
- Identified and formally documented primary user roles:
  - Customer
  - Admin
- Defined complete customer order submission workflow
- Designed admin authentication flow using phone number + OTP verification
- Defined order lifecycle states:
  - Received
  - In Preparation
  - Completed
  - Cancelled
- Specified required and optional system inputs for order creation
- Defined expected system outputs including confirmation messages and order exports
- Documented validation rules such as minimum order quantity (1kg)
- Defined backend responsibilities including data persistence and status tracking
- Documented CSV/Excel export requirements for administrative reporting
- Structured all requirements into formal functional documentation
- Added requirements documentation to the GitHub repository under `/docs`

---

## System Design & Workflow Modeling

### Customer-Side Workflow

- Order form submission
- Input validation
- Database persistence
- Automatic default status assignment ("Received")
- Confirmation response generation

### Admin-Side Workflow

- Secure login using phone number + OTP
- Order viewing and filtering
- Order status updates
- Order editing and deletion
- Data export for reporting purposes

### Payment Model (Phase 1)

- Cash on Delivery (COD)
- Manual payment confirmation
- Planned future integration of online payment gateway

---

## Project Planning & Architecture Refinement

- Translated business requirements into structured functional requirements
- Defined system inputs and outputs clearly for backend API planning
- Prepared groundwork for database schema design (Week 3 focus)
- Refined Agile task breakdown for next implementation sprint
- Established clear separation of concerns between frontend, backend, and database layers

---

## Degree Relevance

This week’s work directly applies core Computer Science concepts including:

- Software Requirements Engineering
- Full-Stack System Design
- Client-Server Architecture
- RESTful API Planning
- Data Modeling Preparation
- Authentication System Design
- Workflow Modeling
- Agile Software Development Practices

The process of converting business requirements into structured system behavior aligns directly with coursework in software engineering, distributed systems, and database systems.

---

## Evidence

- Functional requirements documentation added to repository:
  - `/docs/SRS.md`
- GitHub commits referencing requirements definition
- Structured project documentation outlining workflows and system behaviors
- Development logs maintained in repository commit history

**GitHub Repository:**  
https://github.com/Dathwik/fullstack-web-platform
