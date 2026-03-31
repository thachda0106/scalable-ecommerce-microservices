# Phase 5 — Event-Driven Architecture

> **Why this phase exists:** Events are the nervous system of microservices. Get event design wrong
> and you'll deal with lost events, duplicate processing, impossible debugging, and data inconsistency.
> This phase defines the rules, patterns, and infrastructure for reliable event-driven communication.

---

## 5.1 Event Naming Conventions

### Format

```
{domain}.{entity}.{action}.v{version}

Examples:
  product.created.v1
  order.confirmed.v1
  inventory.stock-reserved.v1
  payment.processed.v1
  user.registered.v1
```

### Rules

| Rule | Good | Bad |
|------|------|-----|
| Past tense (something happened) | `order.confirmed` | `order.confirm` |
| Domain-prefixed | `product.created` | `created` |
| Versioned | `product.created.v1` | `product.created` |
| Lowercase, dot-separated | `order.item-added` | `OrderItemAdded` |
| Specific | `inventory.stock-reserved` | `inventory.updated` |

### Kafka Topic Naming

```
Topics (one per domain):
  product.events
  order.events
  inventory.events
  payment.events
  user.events
  cart.events
  notification.events

Event type is carried in message headers, not in the topic name.
This keeps the number of topics manageable.
```

> [!TIP]
> **Topic per domain, not per event.** Having topics like `product.created`, `product.updated`,
> `product.deleted` creates hundreds of topics. Instead, use one `product.events` topic and
> differentiate by the `event-type` header.

---

## 5.2 Event Versioning

### Why Version Events?

Events are contracts between services. When you change a schema, consumers may break.

### Strategy: Header-Based Version + Backward Compatible Changes

```typescript
// Event envelope with version
interface EventEnvelope<T> {
  eventId: string;           // UUID for deduplication
  eventType: string;         // 'product.created'
  version: number;           // Schema version
  timestamp: string;         // ISO 8601
  source: string;            // 'product-service'
  correlationId: string;     // Request trace ID
  tenantId: string;
  payload: T;                // The actual event data
}
```

### Versioning Rules

| Change Type | Version Bump? | Example |
|-------------|--------------|---------|
| Add optional field | No (backward compatible) | Add `tags` to ProductCreated |
| Add required field | Yes (v1 → v2) | Add required `warehouseId` |
| Remove field | Yes (v1 → v2) | Remove `legacyCode` |
| Rename field | Yes (v1 → v2) | `price` → `unitPrice` |
| Change field type | Yes (v1 → v2) | `price: string` → `price: number` |

### Multi-Version Consumer

```typescript
// Consumer handles multiple versions
async handleProductCreated(envelope: EventEnvelope<any>): Promise<void> {
  switch (envelope.version) {
    case 1:
      await this.handleV1(envelope.payload as ProductCreatedV1);
      break;
    case 2:
      await this.handleV2(envelope.payload as ProductCreatedV2);
      break;
    default:
      this.logger.warn('Unknown event version', {
        eventType: envelope.eventType,
        version: envelope.version,
      });
  }
}
```

---

## 5.3 Event Schema

### Standard Envelope

```typescript
// packages/events/src/envelope.ts
export interface EventEnvelope<T = any> {
  eventId: string;
  eventType: string;
  version: number;
  timestamp: string;
  source: string;
  correlationId: string;
  tenantId: string;
  metadata?: Record<string, any>;
  payload: T;
}

// Example: ProductCreated event
export interface ProductCreatedPayload {
  id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  currency: string;
  categoryId: string;
  categoryName: string;
  brand: string;
  images: string[];
  tags: string[];
  status: string;
}

// Full event example:
const event: EventEnvelope<ProductCreatedPayload> = {
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  eventType: 'product.created',
  version: 1,
  timestamp: '2024-01-15T10:30:00.000Z',
  source: 'product-service',
  correlationId: 'trace-abc-123',
  tenantId: 'tenant-456',
  payload: {
    id: 'prod-789',
    name: 'Wireless Headphones',
    description: 'Premium noise-cancelling headphones',
    sku: 'WH-001',
    price: 79.99,
    currency: 'USD',
    categoryId: 'cat-electronics',
    categoryName: 'Electronics',
    brand: 'AudioPro',
    images: ['https://cdn.example.com/img/wh-001.jpg'],
    tags: ['wireless', 'bluetooth', 'noise-cancelling'],
    status: 'active',
  },
};
```

---

## 5.4 Kafka Topics & Consumer Groups

### Topic Configuration

| Topic | Partitions | Replication | Retention | Compaction |
|-------|-----------|-------------|-----------|------------|
| `product.events` | 6 | 3 | 7 days | No |
| `order.events` | 12 | 3 | 30 days | No |
| `inventory.events` | 6 | 3 | 7 days | No |
| `payment.events` | 6 | 3 | 30 days | No |
| `user.events` | 3 | 3 | 7 days | No |
| `cart.events` | 3 | 3 | 3 days | No |
| `notification.events` | 3 | 3 | 3 days | No |

### Consumer Groups

```
Topic: product.events
├── Consumer Group: search-indexer      → Search Service (indexes products)
├── Consumer Group: inventory-init      → Inventory Service (init stock records)
└── Consumer Group: notification-prod   → Notification Service (admin alerts)

Topic: order.events
├── Consumer Group: inventory-saga      → Inventory Service (reserve/release stock)
├── Consumer Group: payment-saga        → Payment Service (process payments)
└── Consumer Group: notification-order  → Notification Service (order emails)

Topic: inventory.events
└── Consumer Group: order-saga          → Order Service (saga state transitions)

Topic: payment.events
└── Consumer Group: order-saga-payment  → Order Service (saga state transitions)
```

### Why Consumer Groups Matter

```
                    product.events (6 partitions)
                    ┌──┬──┬──┬──┬──┬──┐
                    │P0│P1│P2│P3│P4│P5│
                    └──┴──┴──┴──┴──┴──┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    search-indexer  inventory-init  notification
    (3 instances)   (2 instances)   (1 instance)

    Each consumer group gets ALL messages (independent).
    Within a group, partitions are distributed across instances.

    search-indexer:
      Instance 1: P0, P1
      Instance 2: P2, P3
      Instance 3: P4, P5
```

---

## 5.5 Retry Strategy

### Kafka Consumer Retry Flow

```
  Message received
       │
       ▼
  Process event ──── Success ──► Commit offset
       │
       │ Failure
       ▼
  Retry 1 (delay: 1s) ──── Success ──► Commit offset
       │
       │ Failure
       ▼
  Retry 2 (delay: 5s) ──── Success ──► Commit offset
       │
       │ Failure
       ▼
  Retry 3 (delay: 30s) ──── Success ──► Commit offset
       │
       │ Failure
       ▼
  Send to DLQ (Dead Letter Queue)
  ──► topic: product.events.dlq
  ──► Alert on-call engineer
```

### Configuration

```typescript
const retryConfig = {
  maxRetries: 3,
  retryDelays: [1000, 5000, 30000],  // 1s, 5s, 30s
  retryableErrors: [
    'ECONNREFUSED',      // Database temporarily down
    'ETIMEOUT',          // Network timeout
    'LOCK_TIMEOUT',      // Concurrent access
  ],
  nonRetryableErrors: [
    'VALIDATION_ERROR',  // Bad data, retrying won't help
    'NOT_FOUND',         // Entity doesn't exist
  ],
};
```

---

## 5.6 Dead Letter Queue (DLQ)

### Architecture

```
  Main Topic                     DLQ Topic
  ┌────────────────┐            ┌──────────────────────┐
  │ product.events │            │ product.events.dlq   │
  └───────┬────────┘            └──────────┬───────────┘
          │                                 │
          ▼                                 ▼
  ┌──────────────────┐           ┌──────────────────────┐
  │ Consumer         │           │ DLQ Dashboard        │
  │ (normal flow)    │           │ (manual review)      │
  │                  │           │                      │
  │ On max retries   │           │ Options:             │
  │ exceeded ────────┼──────────►│ 1. Fix and replay    │
  │                  │           │ 2. Skip (ack)        │
  └──────────────────┘           │ 3. Route to support  │
                                 └──────────────────────┘
```

### DLQ Message Format

```json
{
  "originalTopic": "product.events",
  "originalPartition": 3,
  "originalOffset": 12345,
  "consumerGroup": "search-indexer",
  "failureCount": 3,
  "lastError": "OpenSearch cluster unavailable",
  "lastErrorTimestamp": "2024-01-15T10:30:00Z",
  "originalMessage": { ... },
  "metadata": {
    "serviceName": "search-service",
    "hostname": "search-service-abc123",
    "environment": "production"
  }
}
```

---

## 5.7 Outbox Pattern (Detailed)

### The Dual-Write Problem

```
WITHOUT Outbox:
┌─────────────────────────────────────────────────────┐
│ async createProduct(data) {                         │
│   // Step 1: Write to DB                            │
│   const product = await this.repo.save(data); ✅    │
│                                                     │
│   // Step 2: Publish to Kafka                       │
│   await this.kafka.publish('product.created',       │
│     product); ❌ Network failure!                   │
│                                                     │
│   // Result: Product in DB, but no event published  │
│   // Search Service never knows about this product  │
│ }                                                   │
└─────────────────────────────────────────────────────┘

WITH Outbox:
┌─────────────────────────────────────────────────────┐
│ async createProduct(data) {                         │
│   await this.dataSource.transaction(async (em) => { │
│     // Step 1: Write product                        │
│     const product = await em.save(Product, data);   │
│                                                     │
│     // Step 2: Write outbox event (same TX!)        │
│     await em.save(OutboxEvent, {                    │
│       topic: 'product.events',                      │
│       payload: product,                             │
│       partitionKey: product.id,                     │
│     });                                             │
│   }); // ← If this commits, BOTH are saved         │
│                                                     │
│   // Background relay picks up outbox → Kafka       │
│ }                                                   │
└─────────────────────────────────────────────────────┘
```

### Outbox Relay Sequence

```
Every 5 seconds:
  1. SELECT * FROM outbox_events
     WHERE published = false
     ORDER BY created_at ASC
     LIMIT 100

  2. For each event:
     a. Publish to Kafka
     b. UPDATE outbox_events SET published = true, published_at = NOW()
        WHERE id = :id

  3. Periodically: DELETE FROM outbox_events
     WHERE published = true AND published_at < NOW() - INTERVAL '24 hours'
```

---

## 5.8 Inbox Pattern (Detailed)

### Why Inbox?

Kafka guarantees **at-least-once delivery**. This means consumers may receive the same message
multiple times (network issues, rebalancing, crashes). The Inbox pattern ensures each event is
processed **exactly once**.

### Flow

```
  Kafka Message Received
       │
       ▼
  Check inbox: SELECT * FROM inbox_events WHERE event_id = :eventId
       │
       ├── Found + PROCESSED → Skip (idempotent)
       ├── Found + PENDING → Already being processed
       │
       └── Not found:
            │
            ▼
       INSERT INTO inbox_events (event_id, topic, payload, status)
       VALUES (:eventId, :topic, :payload, 'PENDING')
            │
            ▼
       Process event (business logic)
            │
            ├── Success → UPDATE status = 'PROCESSED'
            └── Failure → UPDATE status = 'FAILED', retry_count++
```

---

## 5.9 Event Replay

### When to Replay

- Search index is corrupted or out of sync
- New consumer needs historical data
- Data migration to new service

### Replay Strategy

```
Option 1: Kafka Offset Reset
  - Set consumer group offset to earliest
  - Consumer replays all retained messages
  - ⚠️ Only works within retention period (7-30 days)

Option 2: Database Snapshot + Event Replay
  - Query source database for all records
  - Re-publish events for each record
  - Used for full reindexing

Option 3: Event Store (Advanced)
  - Store all events permanently in an event store
  - Replay from any point in time
  - Most flexible, most complex
```

### Full Reindex Example

```typescript
// Product Service: reindex endpoint
@Post('reindex')
@UseGuards(AdminGuard)
async triggerReindex(): Promise<void> {
  const batchSize = 100;
  let offset = 0;

  while (true) {
    const products = await this.productRepo.find({
      skip: offset,
      take: batchSize,
      order: { createdAt: 'ASC' },
    });

    if (products.length === 0) break;

    for (const product of products) {
      await this.outboxService.saveEvent({
        topic: 'product.events',
        eventType: 'product.reindexed',
        partitionKey: product.id,
        payload: product,
      });
    }

    offset += batchSize;
  }
}
```

---

## 5.10 Event Ordering

### Partition-Level Ordering

Kafka guarantees ordering within a partition. Use **partition keys** to ensure
related events are processed in order.

```
Partition Key Strategy:
  product.events → partitionKey = product.id
    ─ All events for product "P1" go to the same partition
    ─ ProductCreated(P1) is ALWAYS before ProductUpdated(P1)

  order.events → partitionKey = order.id
    ─ OrderCreated(O1) before StockReserved(O1) before OrderConfirmed(O1)

  user.events → partitionKey = user.id
```

### Cross-Partition Ordering

```
⚠️ There is NO ordering guarantee across partitions.

If product P1 → Partition 0, and product P2 → Partition 3:
  ProductCreated(P1) might be consumed AFTER ProductCreated(P2)
  even if P1 was created first.

This is usually fine because P1 and P2 are independent entities.
```

---

## 5.11 Idempotent Consumers

### Implementation

Every consumer MUST be idempotent. Processing the same event twice should produce the same result.

```typescript
// Example: Search indexer (naturally idempotent)
async handleProductCreated(payload: ProductCreatedPayload): Promise<void> {
  // Index document with product.id as the document ID
  // If the document already exists, it gets overwritten (idempotent!)
  await this.opensearch.index({
    index: 'products',
    id: payload.id,          // ← This makes it idempotent
    body: this.mapToSearchDocument(payload),
  });
}

// Example: Payment processing (NOT naturally idempotent)
async handleProcessPayment(payload: ProcessPaymentPayload): Promise<void> {
  // Must check if payment already exists for this order
  const existing = await this.paymentRepo.findByOrderId(payload.orderId);
  if (existing) {
    this.logger.info('Payment already processed, skipping', {
      orderId: payload.orderId,
    });
    return;  // ← Idempotent guard
  }

  // Process payment...
}
```

---

## 5.12 Saga Patterns Deep Dive

### Orchestrated Saga (Our Checkout Flow)

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                    ORDER SERVICE (Orchestrator)                     │
  │                                                                     │
  │  ┌──────────┐    ┌────────────────┐    ┌──────────────┐            │
  │  │ CREATED  │───►│ STOCK_RESERVED │───►│PAYMENT_DONE  │───► DONE  │
  │  └──────────┘    └────────────────┘    └──────────────┘            │
  │       │                  │                    │                     │
  │       │ step_1_fail      │ step_2_fail        │ success            │
  │       ▼                  ▼                    ▼                     │
  │    FAILED          COMPENSATING           CONFIRMED                │
  │                    (release stock)                                  │
  │                         │                                          │
  │                         ▼                                          │
  │                      FAILED                                        │
  └─────────────────────────────────────────────────────────────────────┘

  Outgoing Commands:
    Step 1: → inventory.events: ReserveStock {orderId, items}
    Step 2: → payment.events:   ProcessPayment {orderId, amount}
    Done:   → notification.events: OrderConfirmed {orderId}

  Incoming Responses:
    ← inventory.events: StockReserved {orderId}       → Proceed to step 2
    ← inventory.events: StockReservationFailed        → Mark FAILED
    ← payment.events:   PaymentProcessed {orderId}    → Mark CONFIRMED
    ← payment.events:   PaymentFailed {orderId}       → Compensate (release stock)
```

### Choreography (Simple Pub/Sub)

```
  Used for simple, non-transactional flows:

  Product Service                Search Service           Notification Service
       │                              │                         │
       │  ProductCreated              │                         │
       │──────────── Kafka ──────────►│ Index product          │
       │                              │                         │
       │                              │                         │
       │  No saga, no orchestrator, no compensation needed.     │
       │  If Search fails, it retries independently.            │
       │  Product Service doesn't know or care.                 │
```

### When to Use Which

| Pattern | When | Complexity | Rollback |
|---------|------|-----------|----------|
| **Orchestration** | Multi-step, needs compensation | High | Centralized |
| **Choreography** | Simple pub/sub, independent consumers | Low | Per-consumer |

---

## Common Mistakes

> [!CAUTION]
> - **No idempotency key in events.** Without `eventId`, you can't deduplicate. Every event
>   MUST have a unique `eventId`.
> - **Event payload too large.** Don't put the entire product catalog in a single event.
>   Include only what consumers need, or reference IDs they can look up.
> - **No DLQ monitoring.** If events silently enter the DLQ and nobody notices, you have
>   data inconsistency in production.
> - **Blocking on Kafka in the request path.** Never wait for Kafka acknowledgment in an
>   HTTP handler. Use the Outbox pattern instead.
> - **Missing compensations.** Every Saga step that changes state MUST have a compensation.
>   If you can't compensate, the step shouldn't be in the Saga.

---

> **Next →** [Phase 6 — CI/CD & Deployment](./phase-06-cicd-and-deployment.md)
