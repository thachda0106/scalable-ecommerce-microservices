# Part I — Domain, Architecture & API Design

> **Sections**: 1. Business Domain & DDD | 2. System Overview & Architecture | 3. API Design Strategy

---

# Section 1: Business Domain & Domain-Driven Design

## 1.1 Core Business Domains

The platform decomposes e-commerce into **six bounded contexts**, each owning its data, invariants, and lifecycle:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BOUNDED CONTEXT MAP                                   │
│                                                                               │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────────┐    │
│  │   IDENTITY    │    │   CATALOG     │    │       COMMERCE            │    │
│  │   CONTEXT     │    │   CONTEXT     │    │       CONTEXT             │    │
│  │               │    │               │    │                           │    │
│  │ • Auth Service│    │ • Product Svc │    │ • Cart Service            │    │
│  │ • User Service│    │ • Search Svc  │    │ • Order Service (Saga)    │    │
│  │               │    │               │    │ • Inventory Service       │    │
│  │ Owns: users,  │    │ Owns: products│    │ • Payment Service         │    │
│  │ credentials,  │    │  categories,  │    │                           │    │
│  │ profiles,     │    │  search index │    │ Owns: carts, orders,      │    │
│  │ sessions      │    │               │    │ stock, payments           │    │
│  └───────┬───────┘    └───────┬───────┘    └─────────────┬─────────────┘    │
│          │                    │                           │                   │
│          │    Domain Events   │       Domain Events       │                   │
│          ▼                    ▼                           ▼                   │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                    NOTIFICATION CONTEXT                            │      │
│  │                    • Notification Service                         │      │
│  │                    Consumes: all domain events                    │      │
│  │                    Owns: notification preferences, templates      │      │
│  └───────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context Relationships

| Upstream Context | Downstream Context | Relationship | Integration Pattern |
|---|---|---|---|
| Identity | Catalog, Commerce | **Customer/Supplier** | Events (user.registered) |
| Catalog | Commerce | **Conformist** | Commerce accepts Catalog's product schema |
| Commerce (Order) | Commerce (Inventory) | **Partnership** | Orchestrated Saga via Kafka |
| Commerce (Order) | Commerce (Payment) | **Partnership** | Command/Event via Kafka |
| All Contexts | Notification | **Published Language** | Standard event envelope |

---

## 1.2 Aggregates, Entities & Value Objects

### Identity Context

```
┌─────────────────────────────────────────────────────┐
│  AUTH SERVICE                                         │
│                                                       │
│  Aggregate Root: User                                │
│  ├── Entity: User { id, email, passwordHash, role }  │
│  ├── VO: Email (validated format)                    │
│  ├── VO: Password (Argon2id hash)                   │
│  ├── VO: OAuthIdentity { provider, providerId }     │
│  └── VO: UserRole (CUSTOMER | ADMIN | SUPER_ADMIN)  │
│                                                       │
│  USER SERVICE                                         │
│  Aggregate Root: UserProfile                         │
│  ├── Entity: Profile { userId, firstName, lastName } │
│  ├── Entity: Address { street, city, country, zip }  │
│  └── VO: PhoneNumber                                 │
└─────────────────────────────────────────────────────┘
```

**Design Decision**: Auth and User are separate services despite both dealing with "users." Auth owns credentials and authentication state. User owns profile data. This separation means a security breach in the user profile service does not expose password hashes.

### Catalog Context

```
┌─────────────────────────────────────────────────────┐
│  PRODUCT SERVICE (System of Record)                  │
│                                                       │
│  Aggregate Root: Product                             │
│  ├── Entity: Product { id, name, desc, status }      │
│  ├── VO: Money { amountInCents: number, currency }   │
│  ├── VO: ProductStatus (ACTIVE | INACTIVE | DELETED) │
│  ├── VO: CategoryId                                  │
│  └── Collection: ProductAttribute[]                  │
│                                                       │
│  SEARCH SERVICE (Read Model / Projection)            │
│  Denormalized read model in OpenSearch:               │
│  └── ProductDocument { id, name, desc, price,        │
│       status, categoryId, attributes, score }        │
└─────────────────────────────────────────────────────┘
```

**Trade-off**: CQRS with physical separation (PostgreSQL write → Kafka → OpenSearch read) introduces 5-6s eventual consistency but enables independent scaling of read vs. write workloads. Full-text search with fuzzy matching, boosted fields, and faceted navigation would be prohibitively expensive on PostgreSQL.

### Commerce Context

```
┌─────────────────────────────────────────────────────┐
│  CART SERVICE                                        │
│  Aggregate Root: Cart                                │
│  ├── Entity: Cart { id, userId }                     │
│  ├── Entity: CartItem { productId, qty, price }      │
│  ├── VO: SnapshottedPrice (price at time of add)     │
│  └── Invariants: max 50 items, max 10 per product    │
│                                                       │
│  ORDER SERVICE (Saga Orchestrator)                   │
│  Aggregate Root: Order                               │
│  ├── Entity: Order { id, userId, status, total }     │
│  ├── Entity: OrderItem { productId, qty, price }     │
│  ├── VO: OrderStatus (state machine)                 │
│  ├── VO: Money { amountInCents, currency }           │
│  └── VO: CancellationReason                          │
│                                                       │
│  INVENTORY SERVICE                                   │
│  Aggregate Root: Stock                               │
│  ├── Entity: Stock { productId, total, reserved }    │
│  ├── Entity: Reservation { orderId, productId, qty } │
│  ├── VO: ReservationType (ORDER | CART)               │
│  ├── VO: ReservationStatus (RESERVED|CONFIRMED|RELEASED)│
│  └── Concurrency: Optimistic locking (version col)   │
│                                                       │
│  PAYMENT SERVICE                                     │
│  Aggregate Root: Payment                             │
│  ├── Entity: Payment { id, orderId, amount, status } │
│  ├── VO: PaymentStatus (PENDING|SUCCESS|FAILED)      │
│  ├── VO: Money                                       │
│  ├── VO: Provider (stripe | paypal)                  │
│  └── VO: IdempotencyKey (= orderId)                  │
└─────────────────────────────────────────────────────┘
```

---

## 1.3 Domain Events

All domain events follow a **standard envelope** validated by Zod at consumer boundaries:

```json
{
  "type": "ProductCreated",
  "schemaVersion": 1,
  "source": "product-service",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "payload": { "..." }
}
```

### Complete Domain Event Catalog

| Domain | Event | Producer | Consumers | Trigger |
|--------|-------|----------|-----------|---------|
| Identity | `user.registered` | Auth | User, Notification | New user registration |
| Identity | `user.logged_in` | Auth | Notification (audit) | Successful login |
| Identity | `user.login_failed` | Auth | Notification (security) | Failed login attempt |
| Catalog | `ProductCreated` | Product | Search | Admin creates product |
| Catalog | `ProductUpdated` | Product | Search | Admin updates product |
| Catalog | `ProductDeleted` | Product | Search | Admin deletes product |
| Commerce | `order.created` | Order | Inventory, Notification | User places order |
| Commerce | `order.cancelled` | Order | Inventory, Notification | Order cancelled (any reason) |
| Commerce | `order.completed` | Order | Notification | Saga completes successfully |
| Commerce | `inventory.reserved` | Inventory | Order (saga) | Stock reserved for order |
| Commerce | `inventory.reservation_failed` | Inventory | Order (saga) | Insufficient stock |
| Commerce | `inventory.released` | Inventory | — | Stock released (compensation) |
| Commerce | `PaymentProcessed` | Payment | Order (saga) | Payment succeeded |
| Commerce | `PaymentFailed` | Payment | Order (saga) | Payment failed |
| Commerce | `cart.item_added` | Cart | Notification | Item added to cart |
| Commerce | `cart.item_removed` | Cart | Notification | Item removed from cart |

---

## 1.4 Domain Lifecycles

### Order Lifecycle (State Machine)

```
                                ┌─────────────────────────────────────────┐
                                │         ORDER STATE MACHINE              │
                                └─────────────────────────────────────────┘

  ┌─────────┐  inventory     ┌────────────────┐   payment     ┌──────────────────┐
  │ CREATED │──reserved────→│ PENDING_PAYMENT │──success────→│ PAYMENT_CONFIRMED │
  └────┬────┘               └───────┬────────┘              └────────┬───────────┘
       │                            │                                │
       │ inventory                  │ payment                        │ ship
       │ failed                     │ failed                         ▼
       │                            │                         ┌────────────┐
       ▼                            ▼                         │  SHIPPED   │
  ┌─────────┐                 ┌─────────┐                    └─────┬──────┘
  │CANCELLED│◄──compensation──│CANCELLED│                          │ deliver
  └─────────┘                 └─────────┘                          ▼
                                                             ┌────────────┐
       ┌──────────────────────────────────────────────────── │ DELIVERED  │
       │                                                     └─────┬──────┘
       │ user cancel (any pre-shipped state)                       │ refund
       ▼                                                           ▼
  ┌─────────┐                                               ┌──────────┐
  │CANCELLED│                                               │ REFUNDED │
  └─────────┘                                               └──────────┘

Valid Transitions:
  CREATED           → PENDING_PAYMENT | CANCELLED
  PENDING_PAYMENT   → PAYMENT_CONFIRMED | CANCELLED
  PAYMENT_CONFIRMED → SHIPPED | CANCELLED
  SHIPPED           → DELIVERED
  DELIVERED         → REFUNDED

Invalid transitions throw InvalidStatusTransitionException (422).
```

### Payment Lifecycle

```
  ┌─────────┐   provider call   ┌──────────┐
  │ PENDING │──────────────────→│ SUCCESS  │
  └────┬────┘                   └──────────┘
       │
       │ provider returns failure
       ▼
  ┌─────────┐
  │ FAILED  │
  └─────────┘

Idempotency: If payment for orderId already exists with status ≠ FAILED, skip (return existing).
Provider-level idempotency: Stripe idempotency_key = orderId.
Triple-layer protection: Inbox dedup → Payment DB dedup → Stripe API dedup.
```

### Inventory Lifecycle

```
Stock Record:
  total_quantity:     Warehouse total (admin-managed)
  reserved_quantity:  Sum of active reservations
  available:          total - reserved (computed)

Reservation States:
  RESERVED  → Stock locked for an order/cart
  CONFIRMED → Order completed, stock deducted
  RELEASED  → Order cancelled, stock returned

Concurrency: Optimistic locking via version column.
  UPDATE stock SET reserved_quantity = reserved + ?, version = version + 1
  WHERE product_id = ? AND version = ?
  → 0 affected rows = conflict → retry with fresh read.
```

### User Lifecycle

```
  Registration → Email verification (optional) → Active → Deactivated
  
  Auth State:
    is_active: true/false (admin can deactivate)
    is_email_verified: true/false
    role: CUSTOMER | ADMIN | SUPER_ADMIN
    
  Session State (Redis):
    Refresh token stored: rt:{userId} (TTL: 7d)
    Login attempts: login:attempts:{email} (TTL: 15min)
    JTI blocklist: blocklist:jti:{jti} (TTL: access token remaining life)
```

## 1.5 Domain Boundaries & Data Ownership

| Service | Owns (Tables) | Does NOT Own | Cross-Reference Via |
|---------|------|--------------|---------------------|
| Auth | `users` (credentials, roles) | Profile data | `userId` propagated in events |
| User | `profiles`, `addresses` | Credentials | Consumes `user.registered` event |
| Product | `products`, `categories` | Search index | Publishes `ProductCreated/Updated/Deleted` |
| Search | `inbox_events`, OpenSearch index | Product source-of-truth | Consumes product events |
| Cart | `carts`, `cart_items` | Product prices (snapshots) | `productId` reference, snapshotted price |
| Order | `orders`, `order_items` | Stock, payment details | `productId`, `paymentId` references |
| Inventory | `stock`, `reservations` | Product catalog | `productId` reference |
| Payment | `payments` | Order state | `orderId` reference |
| Notification | `notification_log` | All domain data | Consumes events for display |

**Key Principle**: Each service stores only the data it is the system of record for. Cross-service references use IDs only — never foreign keys across database boundaries.

---

# Section 2: System Overview & Architecture

## 2.1 System Goals

| Goal | Target | Mechanism |
|------|--------|-----------|
| **Availability** | 99.95% uptime | Multi-AZ ECS, health checks, auto-scaling |
| **Throughput** | 3,000 TPS (orders) | Stateless services, horizontal scaling |
| **Catalog Scale** | 50M products | CQRS with OpenSearch, database partitioning |
| **Latency (p99)** | <500ms (API), <100ms (search) | Redis caching, CDN, connection pooling |
| **Consistency** | Eventual (cross-service) | Transactional outbox/inbox, saga compensation |
| **Durability** | Zero data loss | PostgreSQL WAL, Kafka replication, S3 backups |
| **Security** | PCI-DSS aware | WAF, TLS everywhere, Argon2id, JWT blocklist |

## 2.2 High-Level Architecture

```
┌─────────────┐
│   Browser    │  React / Next.js SPA
│   (Client)   │
└──────┬──────┘
       │ HTTPS
       ▼
┌─────────────┐
│   Route53    │  DNS resolution → CloudFront distribution
└──────┬──────┘
       ▼
┌─────────────┐
│  CloudFront  │  CDN — caches static assets + GET API responses
└──────┬──────┘
       ▼
┌─────────────┐
│     WAF      │  AWS WAF — rate limiting, IP blocklist, SQL injection, XSS
└──────┬──────┘
       ▼
┌─────────────┐
│     ALB      │  Application Load Balancer — TLS termination, health checks
└──────┬──────┘
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (NestJS)                            │
│  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────────────┐   │
│  │ Helmet   │ │ RequestIdMW  │ │ Throttler│ │ JwtAuthGuard         │   │
│  │ (security│ │ (x-request-id│ │ (Redis)  │ │ (Passport + JWT)     │   │
│  │ headers) │ │  propagation)│ │ 100/min  │ │ Public routes exempt  │   │
│  └──────────┘ └──────────────┘ └──────────┘ └──────────────────────┘   │
│                                                                        │
│  Routes:                                                               │
│   /auth/*     → Auth Service      (🔓 Public)                         │
│   /products/* → Product Service   (🔓 Public)                         │
│   /search/*   → Search Service    (🔓 Public)                         │
│   /users/*    → User Service      (🔒 Protected)                      │
│   /cart/*     → Cart Service      (🔒 Protected)                      │
│   /orders/*   → Order Service     (🔒 Protected)                      │
│   /payments/* → Payment Service   (🔒 Protected)                      │
│   /inventory/*→ Inventory Service (🔒 Protected)                      │
│                                                                        │
│  BFF Aggregation:                                                      │
│   GET /product-page/:id → Product + Inventory + Reviews (parallel)     │
│   GET /cart-summary     → Cart + Product details                       │
│   GET /order-details/:id→ Order + Products + Payment                   │
└──────────────────────────────────────────────────────────────────────────┘
       │ HTTP forward (BaseHttpClient)
       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    ECS Fargate Services                                  │
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  Auth    │ │  User    │ │ Product  │ │  Cart    │ │   Order      │  │
│  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │  Service     │  │
│  │ :3001    │ │ :3002    │ │ :3003    │ │ :3005    │ │  :3006       │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────────┘  │
│  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴────────┐  │
│  │ auth_db  │ │ user_db  │ │product_db│ │ cart_db  │ │  order_db   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────────────────┐  │
│  │ Payment  │ │Inventory │ │ Notification │ │    Search Service     │  │
│  │ :3008    │ │ :3007    │ │   :3009      │ │    :3004              │  │
│  └────┬─────┘ └────┬─────┘ └──────┬───────┘ └────┬──────────────────┘  │
│  ┌────┴─────┐ ┌────┴─────┐  ┌────┴──────┐  ┌────┴──────────────────┐  │
│  │payment_db│ │invent_db │  │ notif_db  │  │ search_db + OpenSearch│  │
│  └──────────┘ └──────────┘  └───────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
       │                              │
       ▼                              ▼
┌──────────────┐              ┌──────────────┐
│    Redis     │              │    Kafka      │
│  (ElastiCache)│             │  (MSK)        │
│  - Sessions  │              │  - Events     │
│  - Rate limit│              │  - Commands   │
│  - Token     │              │  - DLQ topics  │
│    blocklist │              │               │
│  - Cache     │              │               │
└──────────────┘              └──────────────┘
```

## 2.3 Service Catalog

| Service | Database | Port | Kafka Produce | Kafka Consume |
|---------|----------|------|---------------|---------------|
| **API Gateway** | — (stateless) | 3000 | — | — |
| **Auth Service** | `auth_db` (PG) | 3001 | `user.registered`, `user.logged_in`, `user.login_failed` | — |
| **User Service** | `user_db` (PG) | 3002 | `user.events` | `user.registered` |
| **Product Service** | `product_db` (PG) | 3003 | `product.events` | — |
| **Search Service** | `search_db` (PG) + OpenSearch | 3004 | — | `product.events` |
| **Cart Service** | `cart_db` (PG) | 3005 | `cart.events` | — |
| **Order Service** | `order_db` (PG) | 3006 | `order.events`, `payment.commands` | `payment.events`, `inventory.events` |
| **Inventory Service** | `inventory_db` (PG) | 3007 | `inventory.events` | `order.events`, `cart.events` |
| **Payment Service** | `payment_db` (PG) | 3008 | `payment.events` | `payment.commands` |
| **Notification Service** | `notif_db` (PG) | 3009 | — | `user.events`, `order.events`, `cart.events` |

## 2.4 Communication Patterns

| Pattern | Used For | Protocol | Guarantees |
|---------|----------|----------|------------|
| **Synchronous HTTP** | Client→Gateway→Service | REST/JSON | Request-response, <5s timeout |
| **Async Events** | Cross-service state propagation | Kafka | At-least-once delivery, inbox dedup |
| **Async Commands** | Saga orchestration | Kafka | Exactly-once processing (outbox+inbox) |
| **BFF Aggregation** | Frontend data composition | HTTP parallel | Fail-partial (return available data) |
| **Service Auth** | Gateway→Service trust | `INTERNAL_AUTH_SECRET` header | Shared secret via env vars |

**Why not gRPC?** REST was chosen over gRPC for inter-service communication because: (1) HTTP debugging tooling is richer, (2) services communicate via Kafka events for most flows, (3) the few synchronous calls are simple request/response that don't benefit from gRPC's streaming or protobuf efficiency. gRPC would be reconsidered if binary protocol latency becomes critical.

## 2.5 Monorepo Structure

```
ecommerce-platform/              (pnpm workspace root)
├── apps/                         (deployable services)
│   ├── api-gateway/
│   ├── auth-service/
│   ├── user-service/
│   ├── product-service/
│   ├── search-service/
│   ├── cart-service/
│   ├── order-service/
│   ├── inventory-service/
│   ├── payment-service/
│   └── notification-service/
├── packages/                     (shared libraries)
│   ├── core/                     # @ecommerce/core — DI, resilience, observability
│   ├── events/                   # @ecommerce/events — event schemas (Zod)
│   └── shared-types/             # @ecommerce/shared-types — cross-service DTOs
├── adapters/                     (infrastructure adapters)
├── docker/                       (docker-compose for local dev)
├── terraform/                    (IaC modules)
│   ├── modules/                  # vpc, ecs, rds, elasticache, msk, opensearch, etc.
│   ├── environments/             # dev, staging, production
│   └── bootstrap/
├── scripts/                      (build, deploy, utility scripts)
└── docs/                         (this documentation)
```

**Why Monorepo?** Shared libraries (`@ecommerce/core`, `@ecommerce/events`) are consumed by all services. Atomic refactors across shared types prevent version drift. Single CI pipeline with change detection ensures affected services are rebuilt. Trade-off: larger repository size, requires pnpm workspace management.

## 2.6 Environments

| Environment | Purpose | Infrastructure | Data |
|-------------|---------|----------------|------|
| **Local** | Developer laptop | Docker Compose (PG, Redis, Kafka, OpenSearch) | Seed data |
| **Dev** | Integration testing | ECS Fargate (minimal sizing) | Synthetic data |
| **Staging** | Pre-production validation | ECS Fargate (production-like) | Anonymized prod data |
| **Production** | Live traffic | ECS Fargate (auto-scaled) | Real customer data |

---

# Section 3: API Design Strategy

## 3.1 REST Conventions

All APIs follow REST conventions with JSON payloads:

```
Verb    Path                    Action            Idempotent?
GET     /products               List (paginated)  Yes
GET     /products/:id           Get by ID         Yes
POST    /products               Create            No (use idempotency key)
PATCH   /products/:id           Partial update    Yes
DELETE  /products/:id           Soft delete       Yes
POST    /orders                 Create order      No (use idempotency key)
PATCH   /orders/:id/cancel      Cancel order      Yes (state machine guards)
POST    /auth/register          Register          No
POST    /auth/login             Login             No
POST    /auth/refresh           Refresh token     No
POST    /auth/logout            Logout            Yes
```

## 3.2 API Gateway Routing

The API Gateway acts as both **reverse proxy** and **BFF aggregator**:

```
Reverse Proxy:
  Client → /orders/123 → Gateway forwards → Order Service /orders/123
  Headers propagated: Authorization, x-request-id, x-user-id, x-user-role

BFF Aggregation:
  Client → /product-page/:id
    → parallel: Product Service + Inventory Service
    → aggregate: { product, stock }
    → return combined response
```

**Service-to-Service Auth**: Gateway adds `INTERNAL_AUTH_SECRET` header when forwarding. Each downstream service validates this secret via `ServiceAuthGuard` to reject direct external access.

## 3.3 API Versioning Strategy

**Current**: URI path versioning is not yet implemented. All endpoints are v1 implicitly.

**Planned Strategy**: Header-based versioning via `Accept: application/vnd.ecommerce.v2+json` when breaking changes are required. This avoids URL pollution while allowing gradual migration.

**Event Versioning**: All domain events include `schemaVersion: number`. Consumers implement version-specific handlers with fallback to the latest compatible version.

## 3.4 Pagination, Filtering & Sorting

```http
GET /products?page=1&limit=20&sortBy=price&sortOrder=ASC&categoryId=cat-001&minPrice=50&maxPrice=200&status=ACTIVE

Response:
{
  "data": [...],
  "total": 1500,
  "page": 1,
  "limit": 20
}
```

| Feature | Implementation | Notes |
|---------|---------------|-------|
| **Pagination** | `LIMIT/OFFSET` via `page` + `limit` params | Keyset pagination for deep pages (>1000) |
| **Filtering** | Query params → SQL WHERE clauses | Validated via DTO class-validator |
| **Sorting** | `sortBy` + `sortOrder` params | Whitelist allowed sort fields |
| **Search** | OpenSearch multi-match with fuzziness | `q` param routes to Search Service |

## 3.5 Idempotency Keys

Critical for payment and order creation to prevent duplicate processing:

```
Payment: idempotencyKey = orderId
  → Payment DB: SELECT WHERE order_id = ? (skip if exists + SUCCESS)
  → Stripe API: Idempotency-Key header (provider-level dedup)
  → Inbox: eventId dedup (Kafka-level dedup)

Order: Inbox dedup prevents duplicate event processing.
```

**Triple-layer idempotency for payments**: Kafka Inbox dedup → Payment DB dedup → Stripe API dedup.

## 3.6 Error Handling Format

All errors follow a consistent JSON structure:

```json
{
  "statusCode": 422,
  "message": "Insufficient stock for product prod-001",
  "error": "Unprocessable Entity",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "path": "/orders",
  "requestId": "req-550e8400-e29b-41d4-a716-446655440000"
}
```

| HTTP Status | Domain Meaning | Example |
|-------------|---------------|---------|
| 400 | Validation failure | Invalid email format, quantity ≤ 0 |
| 401 | Authentication failure | Invalid/expired JWT |
| 403 | Authorization failure | Non-owner accessing resource |
| 404 | Resource not found | Product/order doesn't exist |
| 409 | Conflict | Email already registered |
| 422 | Business rule violation | Invalid state transition, insufficient stock |
| 429 | Rate limited | Throttler exceeded |
| 500 | Internal error | Unhandled exception |
| 503 | Service unavailable | Dependency down (circuit open) |

**Domain Exception Mapping**: Domain exceptions (e.g., `InvalidStatusTransitionException`) are caught by `GlobalExceptionFilter` and mapped to appropriate HTTP status codes. Business logic never throws HTTP exceptions directly.

## 3.7 Rate Limiting Strategy

```
┌───────────────────────────────────────────────┐
│           RATE LIMITING LAYERS                 │
├───────────────────────────────────────────────┤
│ Layer 1: AWS WAF          — IP-based, global  │
│   100 requests/minute per IP                   │
│                                                │
│ Layer 2: API Gateway      — Route-based       │
│   ThrottlerGuard (Redis-backed)                │
│   Auth endpoints: 100/min per IP               │
│   General endpoints: 100/min per IP            │
│                                                │
│ Layer 3: Login Attempts   — Account-based     │
│   5 failed attempts in 15min → account lockout │
│   Redis key: login:attempts:{email}            │
│   Auto-expires after 15 minutes                │
└───────────────────────────────────────────────┘
```
