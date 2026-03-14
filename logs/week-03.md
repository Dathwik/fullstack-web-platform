# Week 3 Work Log (Mar 7 – Mar 13, 2026)

**Name:** Dathwik Kollikonda  
**Role:** Software Engineer (Self-Employed)  
**Employment Type:** Post-Completion OPT – Self-Employment  
**Hours Worked:** 21 hours  

---

## Work Summary

During this week, I focused on designing and implementing the relational database schema for the backend of the full-stack web application platform. The goal of this phase was to translate the previously defined functional requirements into a structured data model capable of supporting order management, product catalog management, and administrator authentication.

This involved designing normalized database tables, defining relationships between entities, implementing data constraints, and establishing a clear structure for handling order lifecycle states and authentication workflows. The database schema created during this phase forms the foundation for the upcoming backend API development and system integration.

---

## Technical Activities

- Implemented relational database schema for the platform using SQL
- Defined `order_status` ENUM type to represent order lifecycle states:
  - Received
  - In Preparation
  - Completed
  - Cancelled
- Designed and created the `products` table to store product catalog information including pricing and availability
- Designed and implemented the `orders` table to store customer order information including contact details, delivery address, special instructions, and order status
- Created the `order_items` table to model the relationship between orders and products with quantity tracking
- Implemented relational integrity using foreign key constraints between:
  - `orders` and `order_items`
  - `products` and `order_items`
- Designed the `admins` table for administrator authentication using phone numbers
- Implemented the `otp_codes` table to support secure phone-based OTP verification
- Enabled UUID-based primary keys using PostgreSQL random UUID generation
- Configured default timestamp fields for order creation and update tracking
- Inserted test product data to validate schema functionality
- Performed initial validation queries to ensure correct table relationships and data insertion behavior
- Added database schema scripts to the repository for version control and collaboration

---

## System Design & Data Modeling

### Core Entities Designed

**Products**
- Product name
- Price per kilogram
- Availability status

**Orders**
- Customer contact information
- Delivery address
- Order status
- Special instructions
- Creation and update timestamps

**Order Items**
- Relationship between products and orders
- Quantity tracking in kilograms

### Authentication Components

**Admins**
- Secure administrator identification using phone number

**OTP Codes**
- Temporary authentication codes
- Expiration tracking
- Verification status

---

## Database Architecture Decisions

- Implemented normalized relational structure separating orders and order items
- Used UUID primary keys to ensure globally unique identifiers
- Defined ENUM types for consistent order status management
- Implemented foreign key constraints to enforce referential integrity
- Added timestamp fields to support future analytics and operational monitoring

These decisions ensure the backend data layer is scalable, maintainable, and aligned with best practices in relational database design.

---

## Project Planning & Architecture Refinement

- Converted functional requirements into concrete relational database structures
- Defined clear entity relationships to support future REST API endpoints
- Prepared the backend data model for upcoming API implementation
- Organized schema scripts for maintainability and version control
- Planned next development phase focusing on backend API layer and server integration

---

## Degree Relevance

This week’s work directly applies core Computer Science concepts including:

- Relational Database Design
- Data Modeling and Normalization
- SQL Schema Development
- Backend System Architecture
- Data Integrity and Constraint Design
- Authentication System Data Structures
- Backend Infrastructure Preparation

The implementation of structured relational schemas and data integrity mechanisms directly reflects concepts studied in database systems, backend engineering, and distributed systems coursework.

---

## Evidence

- Database schema implementation scripts committed to repository
- SQL schema definitions for tables and ENUM types
- Test queries validating database functionality
- Repository commits reflecting database implementation work

**GitHub Repository:**  
https://github.com/Dathwik/fullstack-web-platform
