# Section 15 — Best Practices Used

| Pattern | Where Applied | Why |
|---------|--------------|-----|
| **Domain-Driven Design (DDD)** | All services | Rich domain entities with business logic, value objects for validation, domain events for side effects. Ensures business rules are centralized in the domain layer, not scattered across controllers or services. |
| **Clean / Hexagonal Architecture** | All services | `domain/` → `application/` → `infrastructure/` → `interfaces/` layering. Domain has zero framework dependencies. Infrastructure implements ports. Enables testability and swappable adapters. |
| **CQRS** | Product → Search (physical CQRS), all services (logical CQRS) | Physical: PostgreSQL write model + OpenSearch read model synced via Kafka. Logical: separate Command and Query handlers in each service. Enables independent scaling of reads vs writes. |
| **Transactional Outbox** | Order, Product, Inventory, Payment, User | Guarantees atomicity between DB writes and event publishing. Prevents "write succeeded but event lost" scenarios. No distributed transactions needed. |
| **Saga Pattern (Orchestrated)** | Order Service (Checkout) | Coordinates distributed operations across Inventory + Payment with compensation. Avoids 2PC, handles partial failures gracefully. |
| **Optimistic Concurrency Control** | Inventory, Order, Cart | `version` column prevents lost updates under concurrent stock reservation, order modifications, and cart mutations. Higher throughput than pessimistic locks. |
| **Database-per-Service** | All stateful services | Each service owns its schema. No shared tables. Enables independent schema evolution and technology choices. |
| **Event-Driven Architecture** | Cross-service communication | Kafka for async, loosely-coupled communication. Services don't call each other directly for domain events — they publish and subscribe. |
| **Idempotent Consumers** | All Kafka consumers | `processed_events` table ensures exactly-once business semantics on top of at-least-once Kafka delivery. |
| **API Gateway / BFF** | API Gateway | Single entry point with JWT validation, rate limiting, HMAC signing, and BFF aggregation. Clients never talk to internal services directly. |
| **Value Objects** | All domain models | `Money` (cents + currency), `OrderId`, `ProductId`, `Email`, `Password`, `Quantity` — immutable, self-validating, type-safe. Prevents primitive obsession. |
| **Dead Letter Queue** | Kafka consumers | Failed messages routed to `*.dlq` topics with error metadata for later inspection/retry. Prevents consumer crash loops. |

---

# Section 16 — Advanced Tips & Tricks

## Handling Duplicate Kafka Events

Every consumer implements the **idempotency check pattern**:
1. Extract `eventId` from message
2. Query `processed_events` table — if found, skip
3. Process the event
4. Insert into `processed_events` (within the same transaction if possible)

**Edge case**: If the consumer crashes between step 3 and 4, the event will be reprocessed on restart. This is safe because domain operations are designed to be idempotent (e.g., reserving stock for the same orderId twice is a no-op due to the OCC version check).

## Avoiding Race Conditions in Stock Reservation

The inventory service uses a **belt-and-suspenders** approach:
1. **Redis distributed lock** (`SET NX PX`) — prevents concurrent reservation attempts for the same product
2. **Database OCC** (`version` column) — catches any races that slip through lock expiry
3. **Stock invariant check** — `available + reserved + sold = total` — enforced at both domain and DB level

## Avoiding N+1 Queries

- Order items loaded eagerly: `findOne({ relations: ['items'] })`
- User profiles/settings loaded with joins
- Search results are pre-denormalized in OpenSearch — no joins needed

## Money Handling

All monetary values stored as `BIGINT` cents (not decimals):
- `$19.99` → `1999` cents
- Prevents floating-point arithmetic errors
- `Money` value object handles conversion: `Money.fromDecimal(19.99, 'USD')` → `{ amountInCents: 1999, currency: 'USD' }`

## Redis Hot Key Mitigation

- Cart keys are per-user (`cart:{userId}`) — naturally distributed
- Rate limit keys are per-IP — naturally distributed
- Stock cache keys are per-product — for hot products, the distributed lock with short TTL (5s) prevents thundering herd

---

# Section 17 — Scalability Analysis

## System Bottlenecks

| Bottleneck | Impact | Mitigation |
|-----------|--------|-----------|
| **Inventory hot products** | Stock reservation contention during flash sales | OCC + distributed locks + Redis stock cache |
| **Kafka consumer lag** | Delayed search indexing, saga progression | Increase partition count + consumer instances |
| **PostgreSQL write throughput** | Order/payment writes under extreme load | Aurora Serverless v2 auto-scales (1.0–8.0 ACU) |
| **OpenSearch indexing** | Bulk product updates slow search freshness | Batch indexing + adjustable `refresh_interval` |
| **Single API Gateway** | Gateway becomes bottleneck under extreme traffic | ECS auto-scaling + ALB distributes load |

## Scaling Strategies

| Component | Scaling Method | Details |
|----------|---------------|---------|
| **ECS Services** | Horizontal (ECS auto-scaling) | Add more Fargate tasks per service |
| **Aurora PostgreSQL** | Vertical (Serverless v2) | Auto-scales 1.0–8.0 ACU based on load |
| **ElastiCache Redis** | Horizontal (cluster mode) | 3 shards × 2 replicas in production |
| **MSK Kafka** | Horizontal (add brokers) | 3 brokers in production, increase partitions |
| **OpenSearch** | Horizontal (add data nodes) | 3 × m5.large in production |
| **API Gateway** | Horizontal (ECS + ALB) | ALB distributes across multiple gateway instances |

## Partitioning Strategies

- **Kafka**: Topics partitioned by entity key (orderId, productId) for ordering guarantees
- **Redis cluster**: Automatic hash-slot partitioning
- **PostgreSQL**: Currently single-instance per service — could shard by userId for users_db, orderId for orders_db at extreme scale

---

# Section 18 — Failure Scenarios

| Scenario | System Behavior | Recovery |
|----------|----------------|----------|
| **Payment Service down** | Saga: `requestPayment()` throws → Saga compensates with `CancelOrderHandler` → Order CANCELLED → `order.cancelled` → Inventory releases stock | Payment retries handled by saga compensation. User can re-checkout. |
| **Kafka unavailable** | Outbox relay fails to publish → Events accumulate in `outbox_events` table (processed=false) → Relay retries on next poll interval | Self-healing: relay catches up when Kafka returns. No data loss due to outbox pattern. |
| **Redis fails** | Cart Service: cannot read/write carts → 500 errors. Auth Service: cannot validate refresh tokens → users must re-login. API Gateway: rate limiting disabled (ThrottlerGuard fails open in dev). | Cart data is ephemeral — users re-add items. Auth falls back to access token until expiry. |
| **Database slow / unavailable** | Service returns 500. Outbox writes fail → events not published. OCC retries may exhaust. | Aurora Serverless auto-scaling handles load spikes. Health check at `/health` triggers ECS task replacement. |
| **Partial saga failure** | Inventory reserves but payment fails → `payment.failed` event → `CancelOrderHandler` → `order.cancelled` → Inventory releases | Fully compensated. If compensation fails, CRITICAL log + manual intervention needed. |
| **Duplicate Kafka messages** | Idempotency check: `processed_events` table → duplicate detected → event skipped | Zero impact — designed for at-least-once delivery. |
| **Stock oversell attempt** | `InsufficientStockError` thrown → `inventory.reservation_failed` → Order cancelled | User notified of out-of-stock. No overselling occurs. |
| **OpenSearch down** | Search Service returns errors → product search unavailable. Product writes continue normally (source of truth is PostgreSQL). | `RebuildIndexCommand` available for full reindex when OpenSearch recovers. |

---

# Section 19 — Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Why Kafka?** | Durable, ordered, partitioned event streaming. Supports replay. Decouples producers from consumers. Handles backpressure naturally. MSK provides managed production deployment. |
| **Why Redis?** | Sub-millisecond latency for ephemeral state (cart) and session management (auth tokens). Distributed locking (SET NX) for concurrency control. Rate limiting backing store. |
| **Why PostgreSQL?** | ACID transactions for financial data (orders, payments). JSONB for flexible attributes (products). Aurora Serverless v2 for auto-scaling without operational overhead. |
| **Why OpenSearch?** | Sub-second full-text search with `search_as_you_type`, completion suggestions, and faceted filtering. Denormalized read model optimized for query patterns. |
| **Why microservices?** | Independent scaling, fault isolation, technology heterogeneity, team autonomy. Cart needs Redis; Search needs OpenSearch; Payment needs isolation. Monolith cannot optimize for all. |
| **Why DDD?** | Complex business domains (orders, inventory, payments) with rich rules. DDD ensures business logic lives in domain entities, not in controllers or infrastructure. |
| **Why CQRS?** | Product catalog (PostgreSQL) has different read vs write patterns. Search requires denormalized, indexed data. Physical CQRS with Kafka sync enables independent optimization. |
| **Why Saga over 2PC?** | 2PC requires all participants to be available simultaneously. Saga handles partial failures gracefully with compensation. Better availability and scalability at the cost of eventual consistency. |
| **Why Transactional Outbox?** | Dual-write problem: writing to DB + Kafka is not atomic. Outbox makes it atomic by writing both in one DB transaction. Relay publishes asynchronously. |
| **Why HMAC for internal auth?** | Stateless verification (no remote call needed). Prevents identity spoofing if internal network is compromised. Timing-safe comparison prevents timing attacks. |
| **Why KRaft Kafka (no ZooKeeper)?** | Simplified operations. Single process handles both broker and controller. Faster metadata operations. Production MSK abstracts this entirely. |

---

# Section 20 — Complete Knowledge Summary

## How the Entire System Works

This platform is a **distributed e-commerce engine** built as 10 NestJS microservices in a pnpm monorepo, communicating via HTTP (synchronous) and Apache Kafka (asynchronous). Every service follows Clean Architecture with DDD tactical patterns.

**The shopping flow**: A user authenticates via the Auth Service (JWT + Redis sessions). They browse products via the Search Service (OpenSearch read model synced from Product Service via Kafka CQRS). They add items to their Cart (Redis-backed, optimistic locking). At checkout, the Order Service creates an order and orchestrates a **saga**: Inventory Service reserves stock (OCC + distributed locks), Payment Service charges the user, and Notification Service sends confirmation. If any step fails, compensation logic reverses all preceding steps.

**Data integrity**: The Transactional Outbox pattern ensures that database writes and Kafka events are always consistent. Idempotent consumers prevent duplicate processing. OCC prevents lost updates. The stock invariant constraint (`available + reserved + sold = total`) is enforced at both domain and database level.

**Infrastructure**: Terraform provisions the full AWS stack — VPC with public/private subnets, ALB with TLS, ECS Fargate for containers, Aurora Serverless v2 for databases, ElastiCache Redis for caching, MSK for Kafka, and OpenSearch for search. CloudWatch + SNS provides alerting.

## How Data Flows Through the Platform

```
User Action                  Service Chain                   Data Stores
─────────────────────────────────────────────────────────────────────────
Register       → Auth → PostgreSQL (user) + Redis (session) + Kafka (user.created)
Login          → Auth → PostgreSQL (verify) + Redis (store tokens)
Browse         → Search → OpenSearch (full-text query) + Redis (cache)
Add to Cart    → Cart → Redis (cart state) + Kafka (cart.item_added)
Checkout       → Order → PostgreSQL (order) + Kafka (order.created)
                    ↓ Saga
               → Inventory → PostgreSQL (reserve stock) + Redis (lock) + Kafka (inventory.reserved)
                    ↓ Saga
               → Payment → PostgreSQL (payment record) + Kafka (payment.processed)
                    ↓ Saga
               → Order → PostgreSQL (confirm) + Kafka (order.completed)
                    ↓
               → Notification → Email/SMS (mocked)
```

## How to Reason About the System Like a Tech Lead

1. **Follow the events** — Every cross-service interaction is visible in the Kafka topic map. When debugging, trace the correlation ID through event headers.
2. **Trust the outbox** — If an event is in `outbox_events` with `processed = false`, the relay will eventually publish it. Check the relay logs if events seem delayed.
3. **Check the state machine** — Order and Payment entities have explicit status transitions with guard clauses. Invalid transitions throw domain errors. This is your first debugging tool.
4. **Understand the saga boundary** — The saga only coordinates Order, Inventory, and Payment. Search is independent (CQRS sync). Notification is fire-and-forget. Cart is pre-checkout.
5. **Scaling is per-service** — Under load, identify the bottleneck service (check ECS metrics) and scale that service independently. Common hotspots: Inventory during sales, Search during browsing spikes.
6. **Redis is ephemeral** — Cart data and auth sessions are in Redis. If Redis fails, users lose carts and sessions but no financial data is lost (PostgreSQL is the source of truth for orders/payments).
7. **The domain model is the documentation** — When in doubt about business rules, read the domain entity's behavior methods. `Order.requestPayment()`, `ProductInventory.reserve()`, `Payment.complete()` — these ARE the specification.
