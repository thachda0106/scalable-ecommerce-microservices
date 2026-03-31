# Phase 4 — Microservices Design: Implementation Roadmap

---

## GOALS

Build all **10 microservices** using the shared modules from Phase 3. Each service is a standalone
NestJS application with its own database, its own Kafka consumers/producers, and its own API.
The services are built in dependency order — foundation services first, then business services,
then orchestration services.

**Outcome:** 10 running services, each with CRUD APIs, event publishing via Outbox, event
consumption via Inbox, and health checks. The checkout Saga works end-to-end.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **Framework** | NestJS v11 | Modular, TypeScript-native, DI built-in |
| **ORM** | TypeORM + migrations | Handles schema changes, supports multiple DBs |
| **Validation** | class-validator DTOs | Decorator-based, auto-validates request bodies |
| **API Docs** | @nestjs/swagger | Auto-generate OpenAPI from decorators |
| **Testing** | Jest + supertest | NestJS-native, HTTP integration tests |
| **Process Manager** | pnpm scripts + concurrently | Run all services locally |

---

## ARCHITECTURE DECISIONS

### ADR-013: Service Build Order

```
Decision: Build services in this order:

  Tier 1 — Foundation (no dependencies on other services):
    1. Auth Service
    2. User Service

  Tier 2 — Core Business (depends on Tier 1):
    3. Product Service
    4. Search Service
    5. Inventory Service
    6. Cart Service

  Tier 3 — Orchestration (depends on Tier 2):
    7. Order Service (Saga Orchestrator)
    8. Payment Service (Saga Participant)

  Tier 4 — Support:
    9. Notification Service
    10. API Gateway (wires everything together)

Rationale: Build bottom-up. Foundation services have no Kafka consumers (simple CRUD).
  Business services add Kafka. Orchestration services implement the Saga.
  API Gateway is last because it proxies to all other services.
```

### ADR-014: Each Service Has Its Own NestJS App

```
Decision: Each service is an independent NestJS application under apps/
  Not NestJS microservice (the transport layer) — standard HTTP apps
Rationale:
  - HTTP is simpler and more debuggable than Kafka/gRPC transport
  - Kafka is used via KafkaJS directly (Outbox/Inbox), not NestJS transport
  - Each service can be started, tested, and deployed independently
```

---

## IMPLEMENTATION STEPS

### Build Order (8 Weeks)

```
Week 1-2: Tier 1 — Foundation Services
────────────────────────────────────────
  Service 1: Auth Service                   [Week 1]
    - JWT generation (RS256)
    - Login/Register/Refresh/Logout
    - Token blacklisting (Redis)
    - /auth/validate (internal)

  Service 2: User Service                   [Week 1-2]
    - User profile CRUD
    - Address management
    - Consume UserRegistered event → create default profile
    - Outbox publishing for UserProfileUpdated

Week 3-4: Tier 2 — Core Business Services
──────────────────────────────────────────
  Service 3: Product Service                [Week 3]
    - Product CRUD
    - Category management
    - Outbox: ProductCreated, ProductUpdated, ProductDeleted
    - OpenAPI documentation

  Service 4: Search Service                 [Week 3]
    - OpenSearch index management
    - Full-text search + faceted filters
    - Consume: ProductCreated/Updated/Deleted → index
    - Inbox pattern for deduplication

  Service 5: Inventory Service              [Week 4]
    - Stock level management
    - OCC for concurrent reservations
    - Consume: ReserveStock → reserve with OCC
    - Consume: ReleaseStock → release reserved stock
    - Outbox: StockReserved, StockReservationFailed

  Service 6: Cart Service                   [Week 4]
    - Redis-backed cart (add/remove/update/clear)
    - Product price snapshot on add
    - Cart expiration (TTL 7 days)

Week 5-6: Tier 3 — Orchestration Services
──────────────────────────────────────────
  Service 7: Order Service                  [Week 5]
    - Order CRUD
    - Checkout Saga Orchestrator
    - State machine: CREATED → STOCK_RESERVED → PAYMENT_DONE → CONFIRMED
    - Compensation: release stock on payment failure
    - Consume: StockReserved, PaymentProcessed, etc.
    - Outbox: OrderCreated, OrderConfirmed, OrderFailed

  Service 8: Payment Service                [Week 5-6]
    - Payment processing (Stripe mock)
    - Refund handling
    - Consume: ProcessPayment → charge customer
    - Outbox: PaymentProcessed, PaymentFailed

Week 7: Tier 4 — Support Services
──────────────────────────────────
  Service 9: Notification Service           [Week 7]
    - Consume: OrderConfirmed, OrderFailed, UserRegistered
    - Email templates (mocked)
    - SMS (mocked)

  Service 10: API Gateway                   [Week 7]
    - Route to all services
    - JWT validation middleware
    - Rate limiting
    - Correlation ID generation
    - Request aggregation endpoints

Week 8: Integration + E2E Testing
──────────────────────────────────
  - All services running locally
  - Full checkout flow test (Cart → Order → Inventory → Payment → Notification)
  - CQRS test (Product create → Kafka → Search indexes)
  - Saga failure test (payment fails → stock released → order failed)
```

---

## TASK BREAKDOWN

```
Phase 4 — Microservices Implementation
│
├── [ ] 4.1 — Auth Service
│   ├── [ ] Scaffold NestJS app (apps/auth-service)
│   ├── [ ] Configure Redis connection
│   ├── [ ] Implement AuthController (register, login, refresh, logout)
│   ├── [ ] Implement AuthService (JWT generation RS256)
│   ├── [ ] Implement TokenService (Redis blacklist)
│   ├── [ ] Implement PasswordService (bcrypt hashing)
│   ├── [ ] Implement /auth/validate (internal endpoint)
│   ├── [ ] Publish UserRegistered via Outbox
│   ├── [ ] Health check endpoint
│   ├── [ ] Unit tests for AuthService
│   ├── [ ] Integration test: login → token → validate
│   └── [ ] OpenAPI annotations
│
├── [ ] 4.2 — User Service
│   ├── [ ] Scaffold NestJS app (apps/user-service)
│   ├── [ ] Create User + UserAddress entities (TypeORM)
│   ├── [ ] Create database migration
│   ├── [ ] UserController (GET /me, PUT /me, addresses CRUD)
│   ├── [ ] UserService + UserRepository
│   ├── [ ] Kafka consumer: UserRegistered → create profile
│   ├── [ ] Outbox: UserProfileUpdated
│   ├── [ ] Tenant-scoped queries
│   ├── [ ] Unit tests
│   └── [ ] Integration test: create + get user
│
├── [ ] 4.3 — Product Service
│   ├── [ ] Scaffold app + entities (Product, Category)
│   ├── [ ] Database migration
│   ├── [ ] ProductController (CRUD + pagination)
│   ├── [ ] ProductService + ProductRepository
│   ├── [ ] Category management
│   ├── [ ] Outbox: ProductCreated, ProductUpdated, ProductDeleted
│   ├── [ ] Versioning for optimistic locking
│   ├── [ ] Image URLs (S3 presigned) integration point
│   ├── [ ] Unit + integration tests
│   └── [ ] OpenAPI annotations
│
├── [ ] 4.4 — Search Service
│   ├── [ ] Scaffold app + OpenSearch client setup
│   ├── [ ] Create product index with mapping
│   ├── [ ] SearchController (GET /search?q=, GET /search/suggest)
│   ├── [ ] SearchService (full-text, faceted, suggest)
│   ├── [ ] Kafka consumers extending BaseEventConsumer:
│   │   ├── [ ] ProductCreatedConsumer → index document
│   │   ├── [ ] ProductUpdatedConsumer → update document
│   │   └── [ ] ProductDeletedConsumer → remove document
│   ├── [ ] Inbox pattern for deduplication (PostgreSQL)
│   ├── [ ] InboxSchedulerService (retry + cleanup cron)
│   ├── [ ] Reindex endpoint (POST /search/reindex, admin only)
│   └── [ ] Test: create product → verify appears in search
│
├── [ ] 4.5 — Inventory Service
│   ├── [ ] Scaffold app + Inventory entity
│   ├── [ ] Database migration (inventory + stock_reservations tables)
│   ├── [ ] InventoryController (GET stock, PUT stock)
│   ├── [ ] InventoryService:
│   │   ├── [ ] reserveStock() with OCC (version column)
│   │   ├── [ ] releaseStock() on compensation
│   │   └── [ ] confirmReservation() on saga success
│   ├── [ ] Kafka consumers:
│   │   ├── [ ] ReserveStockConsumer → reserve + publish StockReserved/Failed
│   │   ├── [ ] ReleaseStockConsumer → release + publish StockReleased
│   │   └── [ ] ProductCreatedConsumer → init stock record
│   ├── [ ] Outbox: StockReserved, StockReservationFailed, StockReleased
│   ├── [ ] Inbox deduplication
│   └── [ ] Test: concurrent reservation with OCC
│
├── [ ] 4.6 — Cart Service
│   ├── [ ] Scaffold app + Redis setup
│   ├── [ ] CartController (GET cart, POST items, PUT items, DELETE items)
│   ├── [ ] CartService:
│   │   ├── [ ] addItem() — store product snapshot
│   │   ├── [ ] updateQuantity()
│   │   ├── [ ] removeItem()
│   │   ├── [ ] clearCart()
│   │   └── [ ] getCart() — recalculate totals
│   ├── [ ] Cart TTL: 7 days
│   ├── [ ] Cart checkout → publish CartCheckedOut via Outbox
│   └── [ ] Test: add → update → remove flow
│
├── [ ] 4.7 — Order Service (Saga Orchestrator)
│   ├── [ ] Scaffold app + Order/OrderItem entities
│   ├── [ ] Database migration
│   ├── [ ] OrderController (POST /orders, GET /orders, GET /orders/:id)
│   ├── [ ] OrderService:
│   │   ├── [ ] createOrder() — save order + publish ReserveStock
│   │   └── [ ] cancelOrder() — publish ReleaseStock
│   ├── [ ] CheckoutSagaOrchestrator:
│   │   ├── [ ] State machine (CREATED → STOCK_RESERVED → PAYMENT_DONE → CONFIRMED)
│   │   ├── [ ] Handle StockReserved → publish ProcessPayment
│   │   ├── [ ] Handle StockReservationFailed → mark FAILED
│   │   ├── [ ] Handle PaymentProcessed → confirm order
│   │   ├── [ ] Handle PaymentFailed → publish ReleaseStock + mark FAILED
│   │   └── [ ] Saga timeout (if no response in 30s → compensate)
│   ├── [ ] Kafka consumers for saga responses
│   ├── [ ] Outbox for all published events
│   ├── [ ] Inbox deduplication
│   └── [ ] Test: full saga success + failure paths
│
├── [ ] 4.8 — Payment Service
│   ├── [ ] Scaffold app + Payment/Refund entities
│   ├── [ ] Database migration
│   ├── [ ] PaymentController (GET /payments/:id, POST /payments/:id/refund)
│   ├── [ ] PaymentService:
│   │   ├── [ ] processPayment() — Stripe mock
│   │   ├── [ ] refundPayment() — Stripe mock
│   │   └── [ ] Idempotent (check existing payment for orderId)
│   ├── [ ] Kafka consumer: ProcessPayment → process + publish result
│   ├── [ ] Outbox: PaymentProcessed, PaymentFailed, RefundProcessed
│   ├── [ ] Inbox deduplication
│   └── [ ] Test: successful + failed payment
│
├── [ ] 4.9 — Notification Service
│   ├── [ ] Scaffold app (no database)
│   ├── [ ] Kafka consumers:
│   │   ├── [ ] OrderConfirmedConsumer → send confirmation email (mock)
│   │   ├── [ ] OrderFailedConsumer → send failure notification (mock)
│   │   └── [ ] UserRegisteredConsumer → send welcome email (mock)
│   ├── [ ] Email template service (Handlebars / plain text)
│   ├── [ ] Inbox deduplication
│   └── [ ] Test: event triggers notification log
│
├── [ ] 4.10 — API Gateway
│   ├── [ ] Scaffold app
│   ├── [ ] HTTP proxy module (route to backend services)
│   ├── [ ] Route configuration:
│   │   ├── /api/auth/* → auth-service:3001
│   │   ├── /api/users/* → user-service:3002
│   │   ├── /api/products/* → product-service:3003
│   │   ├── /api/search/* → search-service:3004
│   │   ├── /api/cart/* → cart-service:3005
│   │   ├── /api/orders/* → order-service:3006
│   │   ├── /api/inventory/* → inventory-service:3007
│   │   └── /api/payments/* → payment-service:3008
│   ├── [ ] JWT validation middleware (call auth-service or validate locally)
│   ├── [ ] Rate limiting middleware
│   ├── [ ] CorrelationId middleware
│   ├── [ ] Request/response logging
│   ├── [ ] Timeout configuration per route
│   └── [ ] Health check (aggregate all backend health)
│
└── [ ] 4.11 — End-to-End Integration
    ├── [ ] All 10 services run locally (docker-compose + pnpm)
    ├── [ ] Test: Register → Login → Browse → Search → Cart → Checkout → Order
    ├── [ ] Test: Saga success path (order confirmed)
    ├── [ ] Test: Saga failure path (insufficient stock)
    ├── [ ] Test: Saga failure path (payment failed, stock released)
    ├── [ ] Test: CQRS (product create → appears in search)
    └── [ ] Test: Event deduplication (replay an event, no duplicate processing)
```

---

## FOLDER STRUCTURE (Per Service Template)

```
apps/{service-name}/
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env                              # Local dev env vars
├── .env.example                      # Template for env vars
│
├── src/
│   ├── main.ts                       # Bootstrap the app
│   ├── app.module.ts                 # Root module
│   │
│   ├── domain/                       # Business logic (no frameworks)
│   │   ├── entities/
│   │   │   ├── {entity}.entity.ts    # Domain entity
│   │   │   └── {value-object}.vo.ts
│   │   ├── events/
│   │   │   └── {domain-event}.ts
│   │   └── repositories/
│   │       └── {entity}.repository.interface.ts
│   │
│   ├── application/                  # Use cases / orchestration
│   │   ├── services/
│   │   │   └── {service}.service.ts
│   │   ├── commands/                 # (optional, for CQRS)
│   │   └── queries/                  # (optional, for CQRS)
│   │
│   ├── infrastructure/               # Framework-specific
│   │   ├── persistence/
│   │   │   ├── entities/             # TypeORM ORM entities
│   │   │   │   └── {entity}.orm-entity.ts
│   │   │   ├── repositories/
│   │   │   │   └── {entity}.repository.ts  # Implements interface
│   │   │   └── migrations/
│   │   │       └── {timestamp}-{name}.ts
│   │   ├── kafka/
│   │   │   ├── consumers/
│   │   │   │   └── {event}.consumer.ts
│   │   │   └── producers/
│   │   │       └── {event}.producer.ts
│   │   └── http/
│   │       └── {external-service}.client.ts
│   │
│   └── presentation/                 # Controllers / DTOs
│       ├── controllers/
│       │   └── {resource}.controller.ts
│       └── dto/
│           ├── create-{resource}.dto.ts
│           ├── update-{resource}.dto.ts
│           └── {resource}-response.dto.ts
│
└── test/
    ├── unit/
    │   └── {service}.service.spec.ts
    └── integration/
        └── {resource}.controller.spec.ts
```

---

## DEPENDENCIES

```
Phase 4 depends on:
  └── Phase 3 (all shared modules published and tested)
  └── Phase 2 (dev environment running — PostgreSQL, Redis, Kafka, OpenSearch)

Service build dependencies:
  Auth Service        → no service dependencies
  User Service        → consumes events from Auth (UserRegistered)
  Product Service     → no service dependencies
  Search Service      → consumes events from Product
  Inventory Service   → consumes events from Order + Product
  Cart Service        → no service dependencies (reads product snapshots)
  Order Service       → consumes events from Inventory + Payment
  Payment Service     → consumes events from Order
  Notification Service → consumes events from Order + User
  API Gateway         → routes to ALL services (build last)
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | 10 running NestJS services | All start without errors |
| D2 | CRUD APIs for all resources | Swagger UI accessible per service |
| D3 | Outbox publishing for all domain events | Events appear in Kafka topics |
| D4 | Inbox consumption for all consumers | Events processed exactly once |
| D5 | Checkout Saga works E2E | Order → StockReserved → PaymentProcessed → Confirmed |
| D6 | Saga compensation works | Payment fails → stock released → order failed |
| D7 | CQRS sync works | Product created → appears in search within 10s |
| D8 | API Gateway routes correctly | All /api/* paths proxy to correct services |
| D9 | OCC works in Inventory | Concurrent reservations don't oversell |
| D10 | Full E2E flow works | Register → Login → Search → Cart → Checkout → Notification |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Building services in wrong order.** Don't build Order Service before Inventory and Payment.
> The Saga orchestrator needs participants to exist first.
>
> **2. Sync calls where events belong.** Order Service should NOT call `POST /payments` via HTTP.
> It publishes `ProcessPayment` event via Outbox. Payment Service consumes it.
>
> **3. Missing Saga compensations.** For every forward step, write the compensation FIRST.
> If reserve stock succeeds, the compensation (release stock) must exist before you move on.
>
> **4. Hardcoding service URLs.** Use environment variables and service discovery.
> `http://product-service:3003` in dev, `product-service.ecommerce.prod.local` in prod.
>
> **5. Skipping OCC in Inventory.** Without optimistic concurrency control, two concurrent
> checkouts for the last item both succeed → oversold. This is the #1 e-commerce bug.
>
> **6. Not storing price snapshots.** Cart and Order must store the price at the time of action.
> If Product Service changes a price, existing carts and orders should NOT be affected.

---

> **Next →** [Phase 5 — Event-Driven Architecture Implementation](./phase-05-implementation.md)
