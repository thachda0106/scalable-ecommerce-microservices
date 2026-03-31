# Service Catalog

> **Purpose:** Single reference for every microservice — what it owns, its APIs, database, events,
> and team ownership. Consult this before building any cross-service feature.

---

## Service Overview

| # | Service | Port | Database | Owner | Status |
|---|---------|------|----------|-------|--------|
| 1 | API Gateway | 3000 | — | Platform | Active |
| 2 | Auth Service | 3001 | Redis | Identity | Active |
| 3 | User Service | 3002 | PostgreSQL | Identity | Active |
| 4 | Product Service | 3003 | PostgreSQL | Catalog | Active |
| 5 | Search Service | 3004 | OpenSearch + PG (inbox) | Catalog | Active |
| 6 | Cart Service | 3005 | Redis | Shopping | Active |
| 7 | Order Service | 3006 | PostgreSQL | Checkout | Active |
| 8 | Inventory Service | 3007 | PostgreSQL | Fulfillment | Active |
| 9 | Payment Service | 3008 | PostgreSQL | Payments | Active |
| 10 | Notification Service | 3009 | — (stateless) | Engagement | Active |

---

## Service Details

### 1. API Gateway

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/api-gateway` |
| **Port** | 3000 |
| **Database** | None |
| **Responsibility** | Single entry point: JWT validation, routing, rate limiting, correlation ID generation |
| **Communicates With** | All backend services (HTTP proxy) |

**Routes:**

| Method | Path | Proxied To | Auth |
|--------|------|-----------|------|
| * | `/api/auth/*` | auth-service:3001 | None |
| * | `/api/users/*` | user-service:3002 | JWT |
| * | `/api/products/*` | product-service:3003 | Mixed |
| * | `/api/search/*` | search-service:3004 | None |
| * | `/api/cart/*` | cart-service:3005 | JWT |
| * | `/api/orders/*` | order-service:3006 | JWT |
| * | `/api/inventory/*` | inventory-service:3007 | JWT |
| * | `/api/payments/*` | payment-service:3008 | JWT |

---

### 2. Auth Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/auth-service` |
| **Port** | 3001 |
| **Database** | Redis (token blacklist, refresh tokens, sessions) |
| **Responsibility** | JWT generation/validation, login/register, token blacklisting |
| **Events Published** | `UserRegistered` |
| **Events Consumed** | None |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login → JWT |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/logout` | JWT | Blacklist token |
| GET | `/auth/validate` | Internal | Validate JWT (for Gateway) |

---

### 3. User Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/user-service` |
| **Port** | 3002 |
| **Database** | PostgreSQL (`user_db`) |
| **Tables** | `users`, `user_addresses` |
| **Responsibility** | User profiles, addresses |
| **Events Published** | `UserProfileUpdated`, `UserDeactivated` |
| **Events Consumed** | `UserRegistered` → create default profile |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | JWT | Get current user profile |
| PUT | `/users/me` | JWT | Update profile |
| GET | `/users/:id` | Admin | Get any user |
| POST | `/users/addresses` | JWT | Add address |
| PUT | `/users/addresses/:id` | JWT | Update address |
| DELETE | `/users/addresses/:id` | JWT | Delete address |

---

### 4. Product Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/product-service` |
| **Port** | 3003 |
| **Database** | PostgreSQL (`product_db`) |
| **Tables** | `products`, `categories` |
| **Pattern** | CQRS write side |
| **Responsibility** | Product CRUD, pricing, categories (source of truth) |
| **Events Published** | `ProductCreated`, `ProductUpdated`, `ProductDeleted`, `ProductPriceChanged` |
| **Events Consumed** | None |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/products` | No | List (paginated) |
| GET | `/products/:id` | No | Get by ID |
| POST | `/products` | Admin | Create |
| PUT | `/products/:id` | Admin | Update |
| DELETE | `/products/:id` | Admin | Soft delete |
| GET | `/products/categories` | No | List categories |

---

### 5. Search Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/search-service` |
| **Port** | 3004 |
| **Database** | OpenSearch (product index) + PostgreSQL (inbox table) |
| **Pattern** | CQRS read side |
| **Responsibility** | Full-text search, faceted filters, autocomplete |
| **Events Published** | None |
| **Events Consumed** | `ProductCreated` → index, `ProductUpdated` → reindex, `ProductDeleted` → remove |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | No | Full-text search with filters |
| GET | `/search/suggest` | No | Autocomplete |
| POST | `/search/reindex` | Admin | Full reindex trigger |

---

### 6. Cart Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/cart-service` |
| **Port** | 3005 |
| **Database** | Redis (Hash, TTL 7 days) |
| **Responsibility** | Shopping cart CRUD, price snapshots |
| **Events Published** | `CartCheckedOut` |
| **Events Consumed** | None |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/cart` | JWT | Get cart |
| POST | `/cart/items` | JWT | Add item |
| PUT | `/cart/items/:productId` | JWT | Update quantity |
| DELETE | `/cart/items/:productId` | JWT | Remove item |
| DELETE | `/cart` | JWT | Clear cart |

---

### 7. Order Service (Saga Orchestrator)

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/order-service` |
| **Port** | 3006 |
| **Database** | PostgreSQL (`order_db`) |
| **Tables** | `orders`, `order_items`, `outbox_events`, `inbox_events` |
| **Pattern** | Orchestrated Saga for checkout |
| **Responsibility** | Order CRUD, checkout saga orchestration, compensation |
| **Events Published** | `OrderCreated`, `ReserveStock`, `ProcessPayment`, `OrderConfirmed`, `OrderFailed`, `OrderCancelled` |
| **Events Consumed** | `StockReserved`, `StockReservationFailed`, `PaymentProcessed`, `PaymentFailed` |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | JWT | Create order (start saga) |
| GET | `/orders` | JWT | List user's orders |
| GET | `/orders/:id` | JWT | Get order detail |
| POST | `/orders/:id/cancel` | JWT | Cancel order |

**Saga State Machine:**

```
CREATED → STOCK_RESERVED → PAYMENT_PROCESSING → CONFIRMED
    ↓           ↓                    ↓
  FAILED      FAILED          COMPENSATING → FAILED
```

---

### 8. Inventory Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/inventory-service` |
| **Port** | 3007 |
| **Database** | PostgreSQL (`inventory_db`) |
| **Tables** | `inventory`, `stock_reservations` |
| **Pattern** | Optimistic Concurrency Control (version column) |
| **Responsibility** | Stock levels, reservations, saga participant |
| **Events Published** | `StockReserved`, `StockReservationFailed`, `StockReleased`, `StockLevelChanged` |
| **Events Consumed** | `ReserveStock`, `ReleaseStock`, `ProductCreated` |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/inventory/:productId` | JWT | Get stock level |
| PUT | `/inventory/:productId` | Admin | Set stock |
| POST | `/inventory/bulk` | Admin | Bulk update |

---

### 9. Payment Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/payment-service` |
| **Port** | 3008 |
| **Database** | PostgreSQL (`payment_db`) |
| **Tables** | `payments`, `refunds` |
| **Responsibility** | Payment processing (Stripe), refunds, saga participant |
| **Events Published** | `PaymentProcessed`, `PaymentFailed`, `RefundProcessed` |
| **Events Consumed** | `ProcessPayment` |

**API Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/payments` | Internal | Process (from saga) |
| GET | `/payments/:id` | JWT | Get status |
| POST | `/payments/:id/refund` | Admin | Refund |

---

### 10. Notification Service

| Property | Value |
|----------|-------|
| **Package** | `@ecommerce/notification-service` |
| **Port** | 3009 |
| **Database** | None (stateless event consumer) |
| **Responsibility** | Send emails/SMS triggered by events |
| **Events Published** | None |
| **Events Consumed** | `OrderConfirmed`, `OrderFailed`, `OrderCancelled`, `UserRegistered`, `RefundProcessed` |
| **External Integrations** | AWS SES (email), AWS SNS (SMS) |

**API Endpoints:** None (only `/health`)

---

## Service Communication Map

```
Auth ──publishes──► UserRegistered ──consumed by──► User, Notification

Product ──publishes──► ProductCreated/Updated/Deleted ──consumed by──► Search, Inventory

Cart ──publishes──► CartCheckedOut ──consumed by──► (future: analytics)

Order ──publishes──► ReserveStock ──consumed by──► Inventory
                     ProcessPayment ──consumed by──► Payment
                     OrderConfirmed ──consumed by──► Notification
                     OrderFailed ──consumed by──► Notification

Inventory ──publishes──► StockReserved/Failed ──consumed by──► Order

Payment ──publishes──► PaymentProcessed/Failed ──consumed by──► Order
                       RefundProcessed ──consumed by──► Notification
```
