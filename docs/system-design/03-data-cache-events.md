# Part III — Data, Cache & Events

> **Sections**: 6. Data Flow & Database Design | 7. Cache Flow (Redis Strategy) | 8. Event Flow

---

# Section 6: Data Flow & Database Design

## 6.1 Database-per-Service Pattern

Each microservice owns its database exclusively. No cross-service SQL joins. No shared schemas.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   auth_db    │  │   user_db    │  │  product_db  │  │   cart_db    │
│              │  │              │  │              │  │              │
│ • users      │  │ • profiles   │  │ • products   │  │ • carts      │
│ • outbox     │  │ • addresses  │  │ • categories │  │ • cart_items  │
│              │  │ • outbox     │  │ • outbox     │  │ • outbox     │
│              │  │ • inbox      │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  order_db    │  │ inventory_db │  │  payment_db  │  │  search_db   │
│              │  │              │  │              │  │              │
│ • orders     │  │ • stock      │  │ • payments   │  │ • inbox      │
│ • order_items│  │ • reservations│ │ • outbox     │  │              │
│ • outbox     │  │ • outbox     │  │ • inbox      │  │ + OpenSearch │
│ • inbox      │  │ • inbox      │  │              │  │   index      │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

**Why?** Full autonomy — each service can independently scale, migrate, or even switch database engines without affecting others. Trade-off: cross-service queries require BFF aggregation or event-driven denormalization.

## 6.2 Write Flow

```
Controller → DTO validation → CommandBus.execute(Command) → Handler
  → Domain logic (aggregate, value objects, invariants)
  → Repository.save() → Within DB transaction:
     ├── INSERT/UPDATE domain entities
     ├── INSERT outbox_events (domain events atomically with state)
     └── COMMIT

Post-commit:
  OutboxProcessor polls outbox_events → publishes to Kafka → marks processed
```

**Critical**: Domain state change and outbox event insertion happen in the **same database transaction**. This is the Transactional Outbox pattern — it guarantees that if the state changes, the event will eventually be published.

## 6.3 Read Flow

```
Controller → QueryBus.execute(Query) → Handler
  → [Optional] Redis cache check (FAIL_OPEN if Redis down)
  → If cache HIT → return cached data
  → If cache MISS → Repository.find() → PostgreSQL query
  → [Optional] Cache result in Redis with TTL
  → Return data (mapped via entity.toJSON())

For search queries:
  → OpenSearch query (multi-match, filters, pagination)
  → Return search results with highlights and scores
```

## 6.4 Transaction Strategy

| Scope | Strategy | Mechanism |
|-------|----------|-----------|
| **Single service** | ACID transaction | PostgreSQL `BEGIN/COMMIT/ROLLBACK` |
| **Cross-service** | Eventual consistency | Saga orchestration + compensation |
| **State + Event** | Transactional Outbox | Same DB transaction for both |
| **Event processing** | Exactly-once semantics | Inbox pattern + CAS locking |

**No distributed transactions (2PC)**. The system deliberately avoids two-phase commit across services. Instead, the Saga pattern provides eventual consistency with explicit compensation for failures.

## 6.5 Outbox & Inbox Tables

### Outbox Event (per service that produces events)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Event identifier |
| `type` | VARCHAR(100) | Event type (e.g., `order.created`) |
| `payload` | JSONB | Serialized event data |
| `processed` | BOOLEAN | `false` = pending, `true` = published |
| `createdAt` | TIMESTAMPTZ | Creation timestamp |

### Inbox Event (per service that consumes events)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Internal row ID |
| `eventId` | VARCHAR(255) UNIQUE | Producer event ID (dedup key) |
| `eventType` | VARCHAR(100) | Event type |
| `aggregateId` | VARCHAR(255) | Related aggregate ID |
| `source` | VARCHAR(100) | Source service name |
| `payload` | JSONB | Full event data |
| `status` | VARCHAR(20) | RECEIVED → PROCESSING → PROCESSED / FAILED / DEAD_LETTER |
| `retryCount` | INT | Current retry attempt |
| `maxRetries` | INT | Max retries (default: 5) |
| `errorMessage` | TEXT | Last error details |
| `correlationId` | VARCHAR(255) | Distributed tracing ID |
| `nextRetryAt` | TIMESTAMPTZ | Exponential backoff timestamp |
| `processedAt` | TIMESTAMPTZ | When successfully processed |
| `createdAt` | TIMESTAMPTZ | When received |

## 6.6 Indexing Strategy

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| `users` | `email` | UNIQUE B-tree | Login lookup, duplicate prevention |
| `products` | `status` | B-tree | Filter active products |
| `products` | `category_id` | B-tree | Category filtering |
| `products` | `price` | B-tree | Price range queries |
| `orders` | `user_id, status` | Composite B-tree | User order history |
| `order_items` | `order_id` | B-tree | Order detail lookup |
| `stock` | `product_id` | UNIQUE B-tree (PK) | Stock lookup |
| `reservations` | `order_id, status` | Composite B-tree | Reservation lookup |
| `payments` | `order_id` | B-tree | Payment idempotency check |
| `outbox_events` | `processed, createdAt` | Composite B-tree | OutboxProcessor polling |
| `inbox_events` | `eventId` | UNIQUE B-tree | Dedup check (INSERT ON CONFLICT) |
| `inbox_events` | `status, nextRetryAt` | Composite B-tree | InboxProcessor retry polling |

## 6.7 Partitioning & Sharding Strategy

**Current**: No partitioning — single PostgreSQL instance per service with read replicas.

**At Scale (50M+ products)**:

| Table | Strategy | Partition Key | Rationale |
|-------|----------|---------------|-----------|
| `products` | Range by `created_at` | Monthly partitions | Time-based access patterns |
| `orders` | Range by `created_at` | Monthly partitions | Historical query isolation |
| `outbox_events` | Range by `created_at` | Daily partitions | Aggressive pruning of processed events |
| `inbox_events` | Range by `created_at` | Daily partitions | Cleanup job drops old partitions |
| `stock` | None (< 50M rows) | — | Fits single partition |

## 6.8 Soft Delete & Auditing

```
Products:  Soft delete via status='DELETED' (preserves historical order references)
Users:     Soft delete via is_active=false (GDPR: hard delete after retention period)
Orders:    Never deleted (financial records, audit trail)
Payments:  Never deleted (financial records, compliance)

Audit Trail:
  All tables include: created_at, updated_at (auto-managed by TypeORM)
  Domain events serve as an immutable audit log in Kafka (configurable retention)
  Outbox events retained for 7 days after processing
  Inbox events retained for 7 days after processing (DEAD_LETTER never auto-cleaned)
```

## 6.9 Data Retention & Backup

| Data | Retention | Backup Strategy |
|------|-----------|-----------------|
| User data | Until account deletion + 30d grace | RDS automated snapshots (daily, 35d retention) |
| Orders | Indefinite (financial record) | RDS snapshots + S3 cross-region replication |
| Payments | 7 years (compliance) | RDS snapshots + S3 cold storage |
| Outbox events | 7 days post-processed | Auto-cleanup via `OutboxCleanupService` |
| Inbox events | 7 days post-processed | Auto-cleanup via `InboxCleanupService` |
| Kafka events | 7 days (topic retention) | Configurable per topic |
| OpenSearch | Indefinite (re-projectable) | Can be rebuilt from product events |

---

# Section 7: Cache Flow (Redis Strategy)

## 7.1 Cache Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                     REDIS USAGE MAP                            │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐                 │
│  │ Session/Auth      │  │ Rate Limiting     │                 │
│  │                   │  │                   │                 │
│  │ rt:{userId}       │  │ throttle:{ip}     │                 │
│  │ blocklist:jti:*   │  │ login:attempts:*  │                 │
│  │ TTL: 7d / 15min   │  │ TTL: 60s / 15min  │                 │
│  └───────────────────┘  └───────────────────┘                 │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐                 │
│  │ Application Cache │  │ Ephemeral State   │                 │
│  │                   │  │                   │                 │
│  │ product:{id}      │  │ cart:{userId}     │                 │
│  │ product:list:*    │  │ (if Redis-backed) │                 │
│  │ stock:{productId} │  │ TTL: 24h          │                 │
│  │ TTL: 1h/5min/30s  │  │                   │                 │
│  └───────────────────┘  └───────────────────┘                 │
└───────────────────────────────────────────────────────────────┘
```

## 7.2 Cache-Aside Pattern (Primary Strategy)

```
Read Path:
  1. Service → Redis GET product:{id}
  2. Cache HIT → return cached data (skip DB)
  3. Cache MISS → PostgreSQL SELECT → cache result in Redis with TTL → return data

Write Path:
  1. Service → PostgreSQL UPDATE → invalidate Redis DEL product:{id}
  2. Next read → cache MISS → fresh data loaded from DB

Resilience:
  Redis read wrapped in safeExecute(FAIL_OPEN):
    - If Redis down → treated as cache MISS → fall through to DB
    - If Redis slow (>1s timeout) → treated as MISS
    - Circuit breaker prevents cascading failures
```

## 7.3 Cache Invalidation Strategies

| Strategy | When Used | Example |
|----------|-----------|---------|
| **Delete on write** | Same-service update | Product update → DEL product:{id} |
| **Event-driven** | Cross-service | ProductUpdated Kafka event → consumer DELs cache |
| **TTL expiry** | Background freshness | Product list: TTL 5min, stock: TTL 30s |
| **Never cache** | Security-sensitive | Passwords, tokens (stored directly, not cached) |

## 7.4 Redis Key Naming Convention

```
Pattern: {domain}:{entity}:{id}[:{sub-resource}]

Keys:
  product:prod-001                    → Full product details       (TTL: 1h)
  product:list:cat-electronics:p1     → Product list page 1       (TTL: 5min)
  stock:prod-001                      → Stock availability         (TTL: 30s)
  cart:usr-123e4567                   → Cart data                  (TTL: 24h)
  rt:usr-123e4567                     → Refresh token              (TTL: 7d)
  login:attempts:john@example.com     → Login attempt counter      (TTL: 15min)
  blocklist:jti:abc123                → JTI blocklist              (TTL: access token life)
  throttle:{ip}:{route}               → Rate limit counter         (TTL: 60s)
```

## 7.5 Cache Stampede Prevention

```
Problem: Cache expires → 1,000 concurrent requests all query DB simultaneously

Mitigations:
  1. Probabilistic Early Expiration:
     Cache actually set with TTL × 1.1 (extra 10%)
     At TTL × 0.9, randomly selected request refreshes cache
     Other requests still see cached data

  2. Distributed Lock (future):
     On cache MISS → try Redis SETNX lock:{key} → only winner queries DB
     Other requests wait briefly, retry cache read

  3. Current approach: Short TTLs on volatile data (stock: 30s) means
     cache misses are frequent and distributed naturally.
     For product data (1h TTL), the load is low enough that stampede
     is not a practical concern at current scale.
```

## 7.6 What to Cache / Not Cache

| Cache | Don't Cache |
|-------|-------------|
| Product catalog (READ-heavy) | Passwords / hashes |
| Stock availability (short TTL) | Active transactions |
| Search results (short TTL) | Order state (changes rapidly during saga) |
| User sessions | Payment data (security) |
| Rate limit counters | Outbox/inbox events |

---

# Section 8: Event Flow (Message Queue / Event Bus)

## 8.1 Event-Driven Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        KAFKA TOPIC TOPOLOGY                                  │
├──────────────────┬───────────────────┬───────────────────────────────────────┤
│ Topic            │ Producer          │ Consumers                             │
├──────────────────┼───────────────────┼───────────────────────────────────────┤
│ user.registered  │ Auth Service      │ User Service, Notification Service    │
│ user.logged_in   │ Auth Service      │ Notification Service (audit)          │
│ user.login_failed│ Auth Service      │ Notification Service (security)       │
│ product.events   │ Product Service   │ Search Service                        │
│ order.events     │ Order Service     │ Inventory Service, Notification Svc   │
│ cart.events      │ Cart Service      │ Inventory Service, Notification Svc   │
│ inventory.events │ Inventory Service │ Order Service                         │
│ payment.commands │ Order Service     │ Payment Service                       │
│ payment.events   │ Payment Service   │ Order Service                         │
├──────────────────┼───────────────────┼───────────────────────────────────────┤
│ *.dlq Topics     │ InboxService      │ Ops team (manual review/replay)       │
└──────────────────┴───────────────────┴───────────────────────────────────────┘
```

## 8.2 Event Publishing Pipeline (Outbox → Kafka)

```
Producer Service:
  1. Domain logic executes
  2. DB Transaction:
     - State change (INSERT/UPDATE domain table)
     - Outbox event (INSERT outbox_events, processed=false)
     - COMMIT (atomic — both or neither)
  3. OutboxProcessor (cron, every 5s):
     - SELECT * FROM outbox_events WHERE processed=false LIMIT 50
     - For each event: publish to Kafka topic with headers
     - UPDATE SET processed=true
  4. Kafka guarantees at-least-once delivery to consumer groups
```

## 8.3 Event Consuming Pipeline (Kafka → Inbox)

```
Consumer Service:
  1. KafkaJS consumer.run() receives message
  2. Parse message, extract eventId from x-event-id header
  3. InboxService.handleIncoming():
     a. INSERT INTO inbox_events ON CONFLICT DO NOTHING (dedup)
     b. CAS lock: UPDATE SET status='PROCESSING' WHERE status='RECEIVED'
        - If 0 rows affected → already processing (skip)
     c. Execute handler within DB transaction
     d. If success → status = PROCESSED
     e. If error → handleFailure():
        - Increment retryCount
        - If retryCount < maxRetries (5) → status = FAILED, calculate nextRetryAt
        - If retryCount >= maxRetries → status = DEAD_LETTER → send to DLQ topic
  4. Kafka consumer commits offset (after handler completes)
```

## 8.4 Event Schema & Versioning

All events follow a standard envelope validated by Zod:

```typescript
export const EventEnvelopeSchema = z.object({
  type: z.string(),
  schemaVersion: z.number().int().positive(),
  source: z.string(),
  correlationId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});
```

**Versioning Strategy**: `schemaVersion` field in every event. Consumers implement version-specific handlers. Schema changes follow these rules:
- **Additive (new field)**: No version bump required (backward compatible)
- **Rename/remove field**: Bump version, maintain handler for old version during transition
- **Structural change**: New version with migration period, old version deprecated

## 8.5 Saga Pattern (Orchestrated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CHECKOUT SAGA STATE MACHINE                          │
│                                                                         │
│  ┌─────────┐  order.created   ┌──────────────┐  inventory.reserved     │
│  │  START  │ ──────────────→ │  RESERVE     │ ──────────────────────→  │
│  └─────────┘                 │  INVENTORY   │                          │
│                              └──────┬───────┘                          │
│                          ┌──────────┼──────────┐                       │
│                     ✅ Success           ❌ Failed                      │
│                          │                  │                           │
│                          ▼                  ▼                           │
│                ┌──────────────┐      ┌─────────┐                      │
│                │  REQUEST     │      │ CANCEL  │ ← No compensation    │
│                │  PAYMENT     │      │ ORDER   │   (nothing reserved) │
│                └──────┬───────┘      └─────────┘                      │
│                  ┌────┼────┐                                           │
│             ✅ Success  ❌ Failed                                      │
│                  │         │                                           │
│                  ▼         ▼                                           │
│         ┌────────────┐ ┌─────────┐                                    │
│         │  CONFIRM   │ │ CANCEL  │ ← Compensation:                    │
│         │  ORDER  ✅ │ │ ORDER   │   release reserved inventory       │
│         └────────────┘ │ +RELEASE│                                    │
│                        └─────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘

Orchestrator: CheckoutSagaOrchestrator (order-service)
State tracking: Implicit via Order status transitions
Compensation: Explicit handlers (CancelOrderHandler → order.cancelled → inventory release)
```

**Why orchestration over choreography?** Centralized control in the Order Service makes the saga debuggable — you can inspect the order status to determine exactly where the saga is. Choreography would scatter saga logic across services, making failure diagnosis harder.

## 8.6 Dead Letter Queue (DLQ) Flow

```
Inbox retry exhausted (5 attempts with exponential backoff):
  1. InboxService marks event as DEAD_LETTER
  2. KafkaDlqProducer publishes to {original-topic}.dlq
  3. DLQ message includes diagnostic headers:
     - x-dlq-reason: error message
     - x-dlq-timestamp: when DLQ'd
     - x-dlq-original-topic: source topic
     - x-dlq-service: failing service
     - x-retry-count: total attempts

DLQ Recovery:
  1. CloudWatch alarm on DLQ message count > 0
  2. Ops investigates x-dlq-reason
  3. Root cause fixed (restore service, fix schema, etc.)
  4. Replay: consume from DLQ, re-publish to original topic
  5. OR: Manual retry via admin API: POST /admin/inbox/retry/{eventId}
```

## 8.7 Ordering Guarantees

```
Kafka Ordering:
  - Messages within the same partition are strictly ordered
  - Default: message key = event ID → random partition
  - For ordered processing: use aggregateId as key
    → All events for same order go to same partition → processed in order

Consumer Groups:
  - Each consumer group reads each partition independently
  - Multiple instances of same service share partitions
  - Partition rebalancing on scale in/out

At-least-once delivery:
  - Consumer commits offset AFTER handler succeeds
  - If consumer crashes mid-processing → Kafka redelivers
  - Inbox dedup ensures no double processing
```

## 8.8 Idempotency (Triple-Layer)

```
Layer 1: Kafka Inbox (event-level)
  INSERT INTO inbox_events (event_id) ON CONFLICT DO NOTHING
  → Same event delivered twice → second INSERT is no-op

Layer 2: Business Logic (entity-level)
  Payment: SELECT WHERE order_id = ? AND status != FAILED
  → If already paid → skip processing, return existing result

Layer 3: External Provider (API-level)
  Stripe: Idempotency-Key = orderId
  → Stripe returns cached result on duplicate requests

All three layers active simultaneously → zero chance of duplicate payment.
```
