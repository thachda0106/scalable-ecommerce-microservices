# Phase 1 — Requirements & System Design

> **Why this phase exists:** Every failed microservices project traces back to skipping this step.
> You cannot build what you haven't designed. This phase forces you to answer "what" and "why"
> before touching "how." It prevents the #1 anti-pattern: building services that are the wrong size,
> own the wrong data, or communicate through the wrong channels.

---

## 1.1 Functional Requirements

Before drawing a single box on an architecture diagram, enumerate what the **business** needs.

### Core Business Capabilities

| # | Capability | Description |
|---|-----------|-------------|
| F1 | **User Registration & Auth** | Sign up, login, password reset, social login, MFA |
| F2 | **User Profile** | Manage profile, addresses, preferences |
| F3 | **Product Catalog** | Browse, search, filter, view product details |
| F4 | **Inventory Management** | Track stock, reserve on checkout, release on cancel |
| F5 | **Shopping Cart** | Add/remove/update items, persist across sessions |
| F6 | **Checkout & Order** | Place order, saga-coordinated payment + inventory |
| F7 | **Payment** | Process payments, handle refunds, multiple gateways |
| F8 | **Notifications** | Email, SMS, push for order confirmations, shipping |
| F9 | **Search** | Full-text, faceted search across products |
| F10 | **File Upload** | Product images, user avatars |
| F11 | **Admin Dashboard** | Manage products, orders, users, analytics |

### User Stories (Example Format)

```
AS A customer
I WANT TO search for products by name, category, and price range
SO THAT I can quickly find what I need

Acceptance Criteria:
- Search results return in < 200ms (p95)
- Support fuzzy matching for typos
- Faceted filters: category, price, rating, availability
- Pagination with cursor-based infinite scroll
```

### Common Mistakes

> [!CAUTION]
> - **Starting with services instead of capabilities.** You end up with "User Service" before you
>   know if "User" means authentication, profile, or both.
> - **Ignoring admin flows.** Admin is always an afterthought and becomes a monolith backdoor.
> - **Mixing reads and writes** in requirements — this leads to CQRS confusion later.

---

## 1.2 Non-Functional Requirements (NFRs)

NFRs determine your architecture more than features do. A system serving 100 users/day has a
fundamentally different architecture than one serving 100M.

### NFR Matrix

| NFR | Target | Implication |
|-----|--------|-------------|
| **Availability** | 99.95% (≈ 22 min downtime/month) | Multi-AZ, health checks, circuit breakers |
| **Latency** | p50 < 100ms, p95 < 300ms, p99 < 1s | Caching, CDN, async processing |
| **Throughput** | 3,000 orders/sec peak (Black Friday) | Horizontal scaling, event-driven |
| **Data Volume** | 50M products, 100M users | Database sharding strategy, search indexing |
| **Consistency** | Eventual (most), Strong (inventory) | Event sourcing for eventual, OCC for strong |
| **Security** | PCI-DSS for payments, GDPR for users | Encryption at rest/transit, audit logs |
| **Scalability** | 10x current load within 15 minutes | Auto-scaling, stateless services |
| **Recoverability** | RPO < 1 min, RTO < 5 min | Multi-region backup, automated failover |

### Best Practice: SLO-Driven Design

Real companies (Google, Netflix) design from SLOs backward:

```
SLO: 99.9% of product searches complete in < 200ms

Therefore:
  - OpenSearch cluster must handle 10K QPS
  - Cache layer needed for hot products
  - CDN for static product images
  - Async indexing (not blocking the write path)
```

---

## 1.3 Traffic Estimation

### Back-of-the-Envelope Calculations

```
Assumptions:
  - 100M registered users
  - 10M DAU (10% daily active)
  - Each user: ~20 page views, ~5 searches, ~2 cart actions, ~0.5 orders

Daily Traffic:
  Page Views:    10M × 20     = 200M/day     ≈ 2,315 RPS
  Searches:      10M × 5      = 50M/day      ≈ 579 RPS
  Cart Actions:  10M × 2      = 20M/day      ≈ 231 RPS
  Orders:        10M × 0.5    = 5M/day        ≈ 58 RPS (avg), 3,000 RPS (peak)

Storage (Year 1):
  Users:         100M × 2KB    = 200 GB
  Products:      50M × 5KB     = 250 GB
  Orders:        500M × 1KB    = 500 GB
  Events:        10B × 0.5KB   = 5 TB (Kafka retention)
  Search Index:  50M × 3KB     = 150 GB (OpenSearch)

Bandwidth:
  Avg Response:  5KB
  Daily:         200M × 5KB    = 1 TB/day outbound
```

### Peak Multiplier

```
Normal → Peak = 10x  (flash sales, Black Friday)

Peak RPS = 2,315 × 10 = ~23,000 RPS at API Gateway

Design for PEAK, pay for AVERAGE (auto-scaling).
```

---

## 1.4 High-Level Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                   │
│    Web App (React)    Mobile (React Native)    Admin Dashboard    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                    ┌───────┴────────┐
                    │  CloudFront    │  ← Static assets, image CDN
                    │  + WAF         │  ← DDoS protection, rate limiting
                    └───────┬────────┘
                            │
                    ┌───────┴────────┐
                    │    Route 53    │  ← DNS routing, health checks
                    └───────┬────────┘
                            │
                    ┌───────┴────────┐
                    │     ALB        │  ← TLS termination, path-based routing
                    └───────┬────────┘
                            │
              ┌─────────────┴──────────────┐
              │       API Gateway          │  ← Auth, rate limit, routing
              │       (NestJS :3000)       │
              └─────────────┬──────────────┘
                            │
        ┌─────────┬─────────┼─────────┬─────────┐
        ▼         ▼         ▼         ▼         ▼
   ┌─────────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
   │  Auth   │ │ User  │ │Product│ │ Cart  │ │ Order │
   │ Service │ │Service│ │Service│ │Service│ │Service│
   │ :3001   │ │:3002  │ │:3003  │ │:3005  │ │:3006  │
   └────┬────┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
        │          │         │         │         │
     Redis     Postgres   Postgres   Redis    Postgres
     (sessions)  (users)  (products) (carts)   (orders)

                    ┌──────────────────┐
                    │   Apache Kafka   │  ← Event backbone
                    │   (MSK)          │
                    └───────┬──────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
      ┌─────────┐    ┌──────────┐    ┌──────────┐
      │ Search  │    │Inventory │    │  Notif.  │
      │ Service │    │ Service  │    │ Service  │
      │ :3004   │    │ :3007    │    │ :3009    │
      └────┬────┘    └────┬─────┘    └──────────┘
           │              │
       OpenSearch      Postgres
       (search index)  (inventory)
```

### Why This Architecture?

| Decision | Rationale |
|----------|-----------|
| **API Gateway as single entry** | Single point for auth, rate limiting, request routing |
| **Database per service** | Independent scaling, technology freedom, failure isolation |
| **Kafka as event bus** | Decoupled services, replay capability, ordered processing |
| **Redis for Cart** | Sub-millisecond responses for ephemeral shopping state |
| **OpenSearch for Search** | Full-text search, faceted queries, not possible with SQL |
| **Separate Search Service** | CQRS — reads are denormalized, writes are normalized |

---

## 1.5 Microservices Boundaries (Domain-Driven Design)

### How to Find Service Boundaries

This is the **single most important decision** in microservices. Get it wrong and you'll spend years
refactoring. Use Domain-Driven Design (DDD) to identify **Bounded Contexts**.

### Step 1: Event Storming

Gather domain experts and engineers. Use sticky notes (orange = events, blue = commands, yellow = aggregates):

```
Timeline of Domain Events:
──────────────────────────────────────────────────────────────────►

UserRegistered → ProfileCreated → ProductSearched → ProductViewed
→ ItemAddedToCart → CartUpdated → CheckoutStarted → OrderCreated
→ StockReserved → PaymentProcessed → OrderConfirmed
→ NotificationSent → ItemShipped → OrderDelivered
```

### Step 2: Group Into Bounded Contexts

```
┌─────────────────────────────────────────────────────────┐
│  Identity Context        │  Catalog Context             │
│  ┌──────────┐            │  ┌───────────┐               │
│  │   Auth   │            │  │  Product  │               │
│  └──────────┘            │  └───────────┘               │
│  ┌──────────┐            │  ┌───────────┐               │
│  │   User   │            │  │  Search   │  (Read Model) │
│  └──────────┘            │  └───────────┘               │
├──────────────────────────┼──────────────────────────────┤
│  Shopping Context        │  Fulfillment Context         │
│  ┌──────────┐            │  ┌───────────┐               │
│  │   Cart   │            │  │ Inventory │               │
│  └──────────┘            │  └───────────┘               │
│  ┌──────────┐            │  ┌───────────┐               │
│  │  Order   │            │  │ Shipping  │  (Future)     │
│  └──────────┘            │  └───────────┘               │
├──────────────────────────┼──────────────────────────────┤
│  Payment Context         │  Engagement Context          │
│  ┌──────────┐            │  ┌──────────────┐            │
│  │ Payment  │            │  │ Notification │            │
│  └──────────┘            │  └──────────────┘            │
└──────────────────────────┴──────────────────────────────┘
```

### Step 3: Define Service Ownership

| Service | Owns (Aggregates) | Database | Rationale |
|---------|-------------------|----------|-----------|
| **Auth** | Sessions, Tokens | Redis | Stateless JWT, token blacklisting |
| **User** | User, Address | PostgreSQL | Relational data, ACID for profiles |
| **Product** | Product, Category, Price | PostgreSQL | Source of truth for catalog |
| **Search** | SearchIndex | OpenSearch | Denormalized read model (CQRS) |
| **Cart** | Cart, CartItem | Redis | Ephemeral, high-frequency updates |
| **Order** | Order, OrderItem | PostgreSQL | Transactional, audit trail |
| **Inventory** | StockLevel | PostgreSQL | OCC for concurrent reservations |
| **Payment** | Payment, Refund | PostgreSQL | PCI compliance, audit trail |
| **Notification** | NotificationLog | None (fire-and-forget) | Stateless consumer |

### Common Mistakes

> [!WARNING]
> - **Too-small services** (nano-services): A "PriceService" separate from "ProductService" creates
>   unnecessary network hops and distributed transactions.
> - **Too-large services**: A "CatalogService" that handles products, search, reviews, and
>   recommendations becomes a distributed monolith.
> - **Shared databases**: If two services share a table, they are NOT separate services.

---

## 1.6 Database Per Service

### The Rule

Each service owns its data. No service may directly query another service's database.

```
✅ CORRECT                          ❌ WRONG
┌─────────┐    ┌─────────┐         ┌─────────┐    ┌─────────┐
│  Order   │    │Inventory│         │  Order   │    │Inventory│
│ Service  │    │ Service │         │ Service  │    │ Service │
└────┬─────┘    └────┬────┘         └────┬─────┘    └────┬────┘
     │               │                   │               │
     ▼               ▼                   └───────┬───────┘
┌─────────┐    ┌─────────┐                      ▼
│ OrderDB │    │InvntryDB│              ┌──────────────┐
└─────────┘    └─────────┘              │  SharedDB    │
                                        └──────────────┘
```

### Data Access Patterns

| Pattern | When | Example |
|---------|------|---------|
| **API Call** | Need current data synchronously | Order → Inventory: "check stock" |
| **Event** | Need eventual consistency | Product → Search: "product updated" |
| **Data Duplication** | Need fast reads | Order stores product name + price snapshot |

---

## 1.7 Sync vs Async Communication

### Decision Matrix

```
┌─────────────────────────────────────┐
│   Need immediate response?          │
│            │                        │
│     YES    │     NO                 │
│     ▼      │     ▼                  │
│   SYNC     │   ASYNC               │
│  (HTTP)    │  (Kafka/Events)       │
│            │                        │
│  Examples: │  Examples:             │
│  - Auth    │  - Index product       │
│  - Get     │  - Send notification   │
│    product │  - Update search       │
│  - Check   │  - Process payment     │
│    stock   │    confirmation        │
└─────────────────────────────────────┘
```

### Communication Patterns in Our System

| From → To | Pattern | Why |
|-----------|---------|-----|
| Client → API Gateway | HTTP REST | Frontend needs response |
| API GW → Auth Service | HTTP (sync) | Must validate JWT before proceeding |
| API GW → Product Service | HTTP (sync) | Client needs product data |
| Product → Search | Kafka (async) | Eventual consistency is fine |
| Order → Inventory | Kafka (saga) | Distributed transaction |
| Order → Payment | Kafka (saga) | Distributed transaction |
| Order → Notification | Kafka (async) | Fire-and-forget |

### Best Practices

> [!TIP]
> - **Default to async.** Only use sync when the caller literally cannot proceed without the response.
> - **Never chain sync calls.** If Service A calls B, which calls C, which calls D — you have a
>   distributed monolith with compounding latency and failure probability.
> - **Timeout everything.** Every HTTP call needs a timeout (default: 3s) and circuit breaker.

---

## 1.8 Event-Driven Architecture (EDA)

### Why Events?

Events decouple services in time and space. The publisher doesn't know or care who consumes its events.

```
                    ┌─────────────────┐
                    │ Product Service  │
                    │                 │
                    │ saveProduct()   │
                    │   │             │
                    │   ├─► DB Write  │
                    │   │             │
                    │   └─► Outbox    │──── Relay ────► Kafka Topic:
                    │       Table     │                 "product.created.v1"
                    └─────────────────┘
                                                            │
                              ┌──────────────────────────────┤
                              ▼                              ▼
                    ┌─────────────────┐           ┌──────────────────┐
                    │ Search Service   │           │ Notification Svc │
                    │                 │           │                  │
                    │ Indexes product │           │ Alerts admin of  │
                    │ into OpenSearch │           │ new product      │
                    └─────────────────┘           └──────────────────┘
```

### Event Types

| Type | Purpose | Example |
|------|---------|---------|
| **Domain Event** | Something happened in the domain | `OrderCreated`, `PaymentProcessed` |
| **Integration Event** | Cross-service communication | `product.created.v1` on Kafka |
| **Command** | Request to do something | `ReserveStock`, `ProcessPayment` |

---

## 1.9 Saga Pattern

### The Problem

Distributed transactions (2PC) don't work well in microservices. Instead, use **Sagas** — a sequence
of local transactions coordinated by events or an orchestrator.

### Our Checkout Saga (Orchestrated)

```
                    ┌──────────────────┐
                    │  Order Service   │
                    │  (Orchestrator)  │
                    └────────┬─────────┘
                             │
            Step 1: ─────────┤
            Reserve Stock    │
                             ▼
                    ┌──────────────────┐
                    │ Inventory Service│──── Success ──► Step 2
                    └──────────────────┘     Failure ──► Compensate
                             │
            Step 2: ─────────┤
            Process Payment  │
                             ▼
                    ┌──────────────────┐
                    │ Payment Service  │──── Success ──► Confirm
                    └──────────────────┘     Failure ──► Compensate

Compensation (Rollback):
    Payment Failed → Release Reserved Stock → Mark Order Failed
    Inventory Failed → Mark Order Failed (nothing to rollback)
```

### Saga State Machine

```
    ┌──────────┐    reserve_stock    ┌───────────────┐
    │ CREATED  │ ──────────────────► │ STOCK_RESERVED│
    └──────────┘                     └───────┬───────┘
         │                                   │
         │ stock_failed              process_payment
         ▼                                   │
    ┌──────────┐                             ▼
    │  FAILED  │ ◄─── payment_failed  ┌──────────────┐
    └──────────┘                      │PAYMENT_DONE  │
                                      └──────┬───────┘
                                             │
                                      confirm_order
                                             │
                                             ▼
                                      ┌──────────────┐
                                      │  CONFIRMED   │
                                      └──────────────┘
```

### Orchestration vs Choreography

| Aspect | Orchestration | Choreography |
|--------|--------------|--------------|
| **Control** | Central orchestrator | Each service knows next step |
| **Visibility** | Easy to trace flow | Hard to trace |
| **Coupling** | Orchestrator knows all services | Services know each other's events |
| **Complexity** | Orchestrator can become god object | Event chains become spaghetti |
| **Our Choice** | ✅ **Used for checkout** | Used for simple pub/sub (notifications) |

---

## 1.10 CQRS (Command Query Responsibility Segregation)

### The Pattern

Separate the **write model** (source of truth) from the **read model** (optimized for queries).

```
                WRITE SIDE                          READ SIDE
           (Command Model)                     (Query Model)

     ┌──────────────────────┐            ┌──────────────────────┐
     │   Product Service    │            │   Search Service     │
     │                      │            │                      │
     │   POST /products     │            │   GET /search?q=     │
     │   PUT /products/:id  │            │                      │
     │                      │            │   Full-text search   │
     │   PostgreSQL         │            │   Faceted filters    │
     │   (normalized)       │            │   Autocomplete       │
     │                      │            │                      │
     │   Source of Truth    │   Kafka    │   OpenSearch          │
     │   ─────────────────► │ ──────────►│   (denormalized)     │
     │   ProductCreated     │            │                      │
     │   ProductUpdated     │            │   Optimized for      │
     │   ProductDeleted     │            │   read performance   │
     └──────────────────────┘            └──────────────────────┘
```

### Why CQRS for Product Search?

| Concern | Write Model (PostgreSQL) | Read Model (OpenSearch) |
|---------|-------------------------|------------------------|
| Schema | Normalized (3NF) | Denormalized (flat document) |
| Speed | Optimized for writes | Optimized for reads |
| Queries | Simple CRUD | Full-text, fuzzy, faceted |
| Scale | Vertical | Horizontal (sharded) |
| Consistency | Strong | Eventual (seconds delay) |

---

## 1.11 Domain-Driven Design (DDD)

### Key Concepts Applied

```
┌─────────────────────────────────────────────┐
│  Bounded Context: Order Management          │
│                                             │
│  ┌─────────────────────────────────┐        │
│  │  Aggregate: Order               │        │
│  │  ┌─────────────┐               │        │
│  │  │ Order       │ (Aggregate    │        │
│  │  │  - id       │  Root)        │        │
│  │  │  - status   │               │        │
│  │  │  - total    │               │        │
│  │  └──────┬──────┘               │        │
│  │         │ owns                  │        │
│  │  ┌──────┴──────┐               │        │
│  │  │ OrderItem   │ (Entity)      │        │
│  │  │  - productId│               │        │
│  │  │  - quantity │               │        │
│  │  │  - price    │               │        │
│  │  └─────────────┘               │        │
│  └─────────────────────────────────┘        │
│                                             │
│  Value Objects: Money, Address, OrderId     │
│  Domain Events: OrderCreated, OrderFailed   │
│  Repository: OrderRepository                │
│  Service: CheckoutSagaOrchestrator          │
└─────────────────────────────────────────────┘
```

### Folder Structure (DDD-Aligned)

```
apps/order-service/src/
├── domain/                    # Pure business logic, no frameworks
│   ├── entities/
│   │   ├── order.entity.ts
│   │   └── order-item.entity.ts
│   ├── value-objects/
│   │   ├── money.vo.ts
│   │   └── order-status.vo.ts
│   ├── events/
│   │   ├── order-created.event.ts
│   │   └── order-failed.event.ts
│   └── repositories/
│       └── order.repository.interface.ts    # Interface only
│
├── application/               # Use cases, orchestration
│   ├── commands/
│   │   ├── create-order.command.ts
│   │   └── create-order.handler.ts
│   ├── queries/
│   │   ├── get-order.query.ts
│   │   └── get-order.handler.ts
│   └── sagas/
│       └── checkout-saga.orchestrator.ts
│
├── infrastructure/            # Framework-specific implementations
│   ├── persistence/
│   │   ├── typeorm/
│   │   │   ├── order.orm-entity.ts
│   │   │   └── order.repository.ts  # Implements interface
│   │   └── migrations/
│   ├── kafka/
│   │   ├── producers/
│   │   └── consumers/
│   └── http/
│       └── inventory.client.ts
│
└── presentation/              # Controllers, DTOs
    ├── controllers/
    │   └── order.controller.ts
    └── dtos/
        ├── create-order.dto.ts
        └── order-response.dto.ts
```

---

## 1.12 API Gateway

### Responsibilities

| Responsibility | Implementation |
|----------------|---------------|
| **Routing** | Route `/api/products/*` → Product Service |
| **Authentication** | Validate JWT on every request |
| **Rate Limiting** | Per-user, per-IP throttling |
| **Request Aggregation** | Combine data from multiple services |
| **Response Caching** | Cache product listings |
| **Load Shedding** | Reject under extreme load |
| **Request/Response Transform** | Add correlation IDs, strip internal headers |

### Routing Configuration

```typescript
// API Gateway route table
const routes = {
  '/api/auth/*':        { target: 'http://auth-service:3001',     auth: false },
  '/api/users/*':       { target: 'http://user-service:3002',     auth: true  },
  '/api/products/*':    { target: 'http://product-service:3003',  auth: false },
  '/api/search/*':      { target: 'http://search-service:3004',   auth: false },
  '/api/cart/*':        { target: 'http://cart-service:3005',      auth: true  },
  '/api/orders/*':      { target: 'http://order-service:3006',    auth: true  },
  '/api/payments/*':    { target: 'http://payment-service:3008',  auth: true  },
};
```

---

## 1.13 Authentication & Authorization

### Auth Flow

```
  Client                API Gateway              Auth Service
    │                       │                         │
    │  POST /auth/login     │                         │
    │  {email, password}    │                         │
    │──────────────────────►│                         │
    │                       │  Forward to Auth        │
    │                       │────────────────────────►│
    │                       │                         │ Validate credentials
    │                       │                         │ Generate JWT
    │                       │  {accessToken,          │
    │                       │   refreshToken}         │
    │                       │◄────────────────────────│
    │  200 OK               │                         │
    │  {accessToken}        │                         │
    │◄──────────────────────│                         │
    │                       │                         │
    │  GET /api/orders      │                         │
    │  Authorization: Bearer│                         │
    │──────────────────────►│                         │
    │                       │  Validate JWT           │
    │                       │  (locally or via Auth)  │
    │                       │                         │
    │                       │  Route to Order Service │
    │                       │────────►OrderService    │
```

### JWT Structure

```json
{
  "sub": "user-uuid-123",
  "email": "user@example.com",
  "roles": ["customer"],
  "tenantId": "tenant-uuid-456",
  "iat": 1700000000,
  "exp": 1700003600
}
```

### RBAC Matrix

| Role | Products | Orders | Users | Admin |
|------|----------|--------|-------|-------|
| `customer` | Read | Own only | Own only | ✗ |
| `seller` | CRUD own | Read own | Own only | ✗ |
| `admin` | Full | Full | Full | Full |
| `super_admin` | Full | Full | Full | Full |

---

## 1.14 Multi-Tenant Architecture

### Strategy: Tenant ID in JWT

Every request carries a `tenantId`. Services filter all queries by tenant.

```typescript
// Middleware extracts tenantId from JWT
@Injectable()
export class TenantContextMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const decoded = this.jwtService.decode(req.headers.authorization);
    req.tenantId = decoded.tenantId;
    next();
  }
}

// Repository automatically scopes queries
@Injectable()
export class ProductRepository {
  async findAll(tenantId: string): Promise<Product[]> {
    return this.repo.find({ where: { tenantId } });
  }
}
```

### Data Isolation Levels

| Level | How | Pros | Cons |
|-------|-----|------|------|
| **Row-Level** | `tenantId` column | Simple, cost-effective | Risk of data leaks |
| **Schema-Level** | Separate schema per tenant | Better isolation | Migration complexity |
| **Database-Level** | Separate DB per tenant | Full isolation | Expensive, hard to manage |

**Our choice:** Row-level with `tenantId` enforced at the repository layer.

---

## 1.15 Caching Strategy

### Cache Layers

```
  Client ──► CDN (CloudFront) ──► API Gateway ──► Service ──► DB
              │                      │               │
              │ Static assets        │ Response       │ Query
              │ Product images       │ cache          │ cache
              │ TTL: 24h             │ TTL: 60s       │ TTL: 5min
              │                      │                │
              └──── L1 ──────────────┴──── L2 ────────┴── L3
```

### Cache Patterns

| Pattern | When | How |
|---------|------|-----|
| **Cache-Aside** | Read-heavy data | App checks cache → miss → query DB → populate cache |
| **Write-Through** | Data must be current | App writes to cache AND DB simultaneously |
| **Write-Behind** | High-write throughput | App writes to cache → async flush to DB |
| **Read-Through** | Transparent caching | Cache auto-loads from DB on miss |

### What to Cache

| Data | Cache? | TTL | Invalidation |
|------|--------|-----|-------------|
| Product catalog | ✅ | 5 min | Event-driven (ProductUpdated) |
| User sessions | ✅ | 1 hour | Explicit on logout |
| Cart | ✅ (primary store) | 7 days | On user action |
| Search results | ✅ | 60 sec | Time-based |
| Order history | ❌ | — | Always fresh |
| Inventory count | ❌ | — | Must be real-time |

---

## 1.16 Search Engine Integration

### OpenSearch Architecture

```
  Product Service                          Search Service
  ┌──────────────┐                        ┌──────────────┐
  │ PostgreSQL   │                        │  OpenSearch   │
  │ (normalized) │    Kafka Events        │ (denormalized)│
  │              │ ──────────────────────► │              │
  │ Product      │   product.created.v1   │ Product Index │
  │ Category     │   product.updated.v1   │ {             │
  │ Price        │   product.deleted.v1   │   name,       │
  │              │                        │   description,│
  └──────────────┘                        │   category,   │
                                          │   price,      │
                                          │   images,     │
                                          │   rating,     │
                                          │   inStock     │
                                          │ }             │
                                          └──────────────┘
```

---

## 1.17 File Storage

```
  Client ──► API Gateway ──► File Service ──► S3 (presigned URL)
                                                │
                                          CloudFront CDN
                                                │
                                          Client downloads
                                          directly from CDN
```

### Presigned URL Flow

1. Client requests upload URL from File Service
2. File Service generates S3 presigned URL (valid 15 min)
3. Client uploads directly to S3 (bypasses backend)
4. S3 triggers Lambda to generate thumbnails
5. CDN serves images globally

---

## 1.18 Resilience Patterns

### Pattern Summary

| Pattern | Purpose | Implementation |
|---------|---------|---------------|
| **Circuit Breaker** | Stop calling a failing service | `@ecommerce/core` resilience module |
| **Retry with Backoff** | Handle transient failures | Exponential backoff + jitter |
| **Timeout** | Prevent hanging requests | 3s default for HTTP calls |
| **Bulkhead** | Isolate failures | Separate thread pools per service |
| **Rate Limiting** | Protect from overload | Token bucket at API Gateway |
| **Fallback** | Degrade gracefully | Return cached data on service failure |

### Circuit Breaker States

```
        ┌───────────┐        failures > threshold       ┌───────────┐
        │   CLOSED  │ ─────────────────────────────────► │   OPEN    │
        │ (normal)  │                                    │ (failing) │
        └───────────┘                                    └─────┬─────┘
              ▲                                                │
              │ success                            timeout expires
              │                                                │
        ┌─────┴──────┐                                         │
        │ HALF-OPEN  │ ◄──────────────────────────────────────┘
        │ (testing)  │
        └────────────┘
              │
        failure → back to OPEN
```

---

## 1.19 Rate Limiting

### Token Bucket Algorithm

```
  Per-User Rate Limit:
    Bucket Size: 100 tokens
    Refill Rate: 10 tokens/second
    Each request consumes 1 token
    When empty → 429 Too Many Requests

  Per-IP Rate Limit:
    Bucket Size: 1000 tokens
    Refill Rate: 100 tokens/second

  Global Rate Limit:
    Max RPS: 50,000
    When exceeded → 503 Service Unavailable
```

---

## 1.20 Idempotency

### The Problem

Network failures cause retries. Retries without idempotency cause duplicate operations.

```
  Client ────► API Gateway ────► Order Service
    │              │                   │
    │  POST        │  Forward          │  Create Order
    │  /orders     │  ────────────────►│  ────► DB
    │              │                   │
    │              │  ◄─── Timeout ──  │  (order created but
    │              │  (network issue)  │   response lost)
    │              │                   │
    │  RETRY       │  Forward          │
    │  POST        │  ────────────────►│  ❌ Duplicate order!
    │  /orders     │                   │
```

### Solution: Idempotency Key

```typescript
// Client sends: POST /orders
// Header: Idempotency-Key: "uuid-abc-123"

@Post('/orders')
async createOrder(
  @Headers('idempotency-key') idempotencyKey: string,
  @Body() dto: CreateOrderDto,
) {
  // Check if we've already processed this key
  const existing = await this.idempotencyStore.get(idempotencyKey);
  if (existing) return existing; // Return cached response

  const order = await this.orderService.create(dto);

  // Store the result keyed by idempotency key
  await this.idempotencyStore.set(idempotencyKey, order, TTL: '24h');

  return order;
}
```

---

## 1.21 Distributed Tracing

### How a Request Flows

```
  Client                                           Jaeger/X-Ray
    │                                                   ▲
    │  GET /api/orders/123                              │
    │  X-Correlation-Id: "trace-abc"                    │
    │                                                   │
    ▼                                                   │
  API Gateway ──── Span 1: "gateway.route" ─────────────┤
    │                                                   │
    ▼                                                   │
  Auth Service ── Span 2: "auth.validate" ──────────────┤
    │                                                   │
    ▼                                                   │
  Order Service ─ Span 3: "order.getById" ──────────────┤
    │                                                   │
    ▼                                                   │
  PostgreSQL ──── Span 4: "db.query" ───────────────────┘

  Trace: trace-abc
  ├── Span 1: gateway.route    [0ms ──────── 50ms]
  │   ├── Span 2: auth.validate   [5ms ── 15ms]
  │   └── Span 3: order.getById   [16ms ────── 45ms]
  │       └── Span 4: db.query      [20ms ── 30ms]
```

---

## 1.22 Logging Strategy

### Structured JSON Logging

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "service": "order-service",
  "traceId": "trace-abc-123",
  "spanId": "span-def-456",
  "tenantId": "tenant-789",
  "userId": "user-012",
  "method": "POST",
  "path": "/orders",
  "statusCode": 201,
  "duration": 150,
  "message": "Order created successfully",
  "metadata": {
    "orderId": "order-345",
    "total": 99.99,
    "itemCount": 3
  }
}
```

### Log Levels

| Level | When | Examples |
|-------|------|---------|
| `error` | Something is broken | Database connection failed, payment gateway error |
| `warn` | Something is suspicious | Approaching rate limit, retry attempted |
| `info` | Important business events | Order created, payment processed |
| `debug` | Development details | SQL queries, cache hits/misses |

---

## 1.23 Metrics

### The Four Golden Signals (Google SRE)

| Signal | What It Measures | Example Metric |
|--------|------------------|---------------|
| **Latency** | Time to serve a request | `http_request_duration_seconds` |
| **Traffic** | Demand on the system | `http_requests_total` |
| **Errors** | Rate of failed requests | `http_errors_total` |
| **Saturation** | How full the system is | `cpu_utilization`, `memory_usage` |

### Service-Specific Metrics

```
# Business metrics
orders_created_total{service="order-service"}
payment_processed_total{status="success|failure"}
cart_abandoned_total
product_views_total

# Infrastructure metrics
kafka_consumer_lag{topic="product.events", group="search-indexer"}
db_connection_pool_active{service="user-service"}
redis_cache_hit_ratio{service="cart-service"}
circuit_breaker_state{service="payment-service", target="stripe"}
```

---

## 1.24 Feature Flags

### Why Feature Flags?

Deploy code to production without activating features. Essential for:
- **Gradual rollouts** (1% → 10% → 50% → 100%)
- **A/B testing**
- **Kill switches** (disable broken feature without redeploying)

### Implementation

```typescript
// Feature flag check
if (await this.featureFlags.isEnabled('new-checkout-flow', { userId, tenantId })) {
  return this.newCheckoutFlow(order);
} else {
  return this.legacyCheckoutFlow(order);
}
```

---

## 1.25 Configuration Management

### Hierarchy

```
  1. Default values (hardcoded)
  2. Environment variables (.env)
  3. AWS Parameter Store (shared config)
  4. AWS Secrets Manager (sensitive data)
  5. Feature flags (dynamic config)

  Priority: 5 > 4 > 3 > 2 > 1
```

### What Goes Where

| Config Type | Storage | Example |
|-------------|---------|---------|
| **Code defaults** | In code | Max retry count = 3 |
| **Environment config** | `.env` / ECS env | `NODE_ENV=production` |
| **Shared config** | Parameter Store | Database connection strings |
| **Secrets** | Secrets Manager | API keys, JWT secrets |
| **Dynamic config** | Feature flags | New feature toggles |

---

## Summary — What This Phase Delivers

| Deliverable | Status |
|------------|--------|
| Functional requirements documented | ✅ |
| NFRs and SLOs defined | ✅ |
| Traffic estimation completed | ✅ |
| High-level architecture diagram | ✅ |
| Service boundaries defined (DDD) | ✅ |
| Database-per-service strategy | ✅ |
| Sync vs Async decision matrix | ✅ |
| Saga pattern for checkout | ✅ |
| CQRS for search | ✅ |
| Auth/AuthZ strategy | ✅ |
| Caching strategy | ✅ |
| Resilience patterns | ✅ |
| Observability strategy | ✅ |

> [!IMPORTANT]
> **Do NOT proceed to Phase 2 until all stakeholders have reviewed and approved these decisions.**
> Changing service boundaries after building infrastructure is 10x more expensive.

---

> **Next →** [Phase 2 — Infrastructure (IaC)](./phase-02-infrastructure-iac.md)
