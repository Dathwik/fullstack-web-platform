# Software Requirements Specification (SRS)
## Online Order Management Web Platform

**Version:** 1.0  
**Author:** Dathwik Kollikonda  
**Date:** March 2026  

---

# 1. Introduction

## 1.1 Purpose

This Software Requirements Specification (SRS) document describes the functional and non-functional requirements for the Online Order Management Web Platform.

The purpose of this system is to enable customers to submit snack orders online and allow administrators to manage, track, and export order data efficiently.

This document serves as a reference for system design, development, and validation.

---

## 1.2 Scope

The Online Order Management Web Platform will:

- Provide a web interface for customers to place snack orders
- Validate and store order data in a backend database
- Allow administrators to authenticate securely
- Enable order lifecycle management
- Support reporting via CSV/Excel export

The system will initially support local orders only and operate with manual payment confirmation (Cash on Delivery). Future enhancements may include online payment integration and automated notifications.

---

## 1.3 Definitions, Acronyms, and Abbreviations

- **OTP** – One-Time Password
- **COD** – Cash on Delivery
- **SRS** – Software Requirements Specification
- **Admin** – Authorized system administrator
- **Customer** – End user placing an order

---

## 1.4 Overview

This document includes:

- Overall system description
- User characteristics
- Functional requirements
- Non-functional requirements
- System constraints
- Future enhancements

---

# 2. Overall Description

## 2.1 Product Perspective

The system is a full-stack web application consisting of:

- Frontend (User Interface)
- Backend API
- Relational Database

The system follows a client-server architecture where the frontend communicates with backend REST APIs.

---

## 2.2 Product Functions

High-level system functions include:

- Order submission
- Input validation
- Order persistence
- Order status tracking
- Admin authentication
- Order management
- Data export functionality

---

## 2.3 User Classes and Characteristics

### 2.3.1 Customer

- Basic web user
- No login required (Phase 1)
- Can submit orders via form

### 2.3.2 Admin

- Authorized personnel (maximum 2 initially)
- Must authenticate using phone number + OTP
- Manages and tracks orders

---

## 2.4 Operating Environment

- Web browser (Chrome, Edge, Safari, Firefox)
- Backend server (Node.js environment)
- PostgreSQL database server

---

## 2.5 Design Constraints

- Local orders only (Phase 1)
- Minimum order quantity: 1kg
- English language interface
- Manual payment confirmation only (initial phase)

---

# 3. Functional Requirements

---

## 3.1 Customer Order Submission

### FR-1: Order Form Input

The system shall allow customers to submit orders including:

- Name (mandatory)
- Phone number (mandatory)
- Address (mandatory)
- Selected items
- Quantity (minimum 1kg per item)
- Email (optional)
- Special instructions (optional)

---

### FR-2: Input Validation

The system shall:

- Validate required fields
- Enforce minimum quantity of 1kg
- Reject invalid or incomplete submissions

---

### FR-3: Order Creation

Upon successful validation, the system shall:

- Generate a unique Order ID
- Store order data in the database
- Assign default order status: "Received"
- Display confirmation message

---

## 3.2 Order Lifecycle Management

### FR-4: Order Statuses

The system shall support the following statuses:

- Received
- In Preparation
- Completed
- Cancelled

---

### FR-5: Status Transitions

Valid status transitions:

- Received → In Preparation
- In Preparation → Completed
- Received → Cancelled

---

## 3.3 Admin Authentication

### FR-6: Admin Login

The system shall:

- Accept admin phone number
- Send OTP for verification
- Validate OTP before granting access

Only authenticated admins may access administrative features.

---

## 3.4 Order Management (Admin)

### FR-7: View Orders

The system shall allow admins to:

- View all orders in list format
- Filter by status
- Filter by date

---

### FR-8: Update Orders

Admins shall be able to:

- Update order status
- Edit order details
- Delete orders

---

### FR-9: Export Orders

The system shall allow admins to export order data in CSV/Excel format.

---

## 3.5 Payment Handling

### FR-10: Payment Model (Phase 1)

The system shall:

- Support Cash on Delivery (COD)
- Allow manual payment confirmation

Online payment gateway integration is deferred to future versions.

---

## 3.6 Notifications

### FR-11: Admin Notification

The system shall notify admins via dashboard when a new order is placed.

---

### FR-12: Customer Confirmation

The system shall display an on-screen confirmation after successful order submission.

Future versions may include SMS/WhatsApp notifications.

---

# 4. Non-Functional Requirements

---

## 4.1 Performance Requirements

- The system shall respond to order submissions within 2 seconds under normal load.
- The system shall support concurrent users typical of a small local business.

---

## 4.2 Security Requirements

- Admin authentication shall require OTP verification.
- Order data shall be stored securely in the database.
- Unauthorized users shall not access administrative functions.

---

## 4.3 Reliability Requirements

- Orders must not be lost after successful submission.
- Database transactions must ensure data consistency.

---

## 4.4 Usability Requirements

- The order form shall be simple and user-friendly.
- Required fields shall be clearly indicated.
- Error messages shall be descriptive.

---

# 5. Future Enhancements

Future system versions may include:

- User account registration and login
- Order history tracking
- Online payment gateway integration
- Automated SMS/WhatsApp notifications
- Inventory tracking
- Customer reviews

---

# 6. Acceptance Criteria

The system shall be considered complete for Phase 1 when:

- Customers can successfully submit orders
- Orders are stored with unique IDs
- Admins can authenticate securely
- Admins can manage and update order statuses
- Orders can be exported as CSV/Excel
- All functional requirements in this SRS are implemented
