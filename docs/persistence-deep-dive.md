# Persistence Layer — Deep Dive

> `packages/core/src/persistence/`

The persistence module implements the **Transactional Outbox** and **Transactional Inbox**
patterns, providing exactly-once processing semantics for distributed domain events
in a microservices architecture built on NestJS + TypeORM + Kafka + PostgreSQL.

---

## 1. OVERVIEW TABLE

| File | Path | One-Sentence Role |
|---|---|---|
| `unit-of-work.ts` | `persistence/` | Atomic wrapper that commits business data and outbox events in a single DB transaction |
| `outbox-event.entity.ts` | `persistence/outbox/` | TypeORM entity defining the `outbox_events` table shape (4 columns) |
| `outbox-processor.ts` | `persistence/outbox/` | Background job that polls unprocessed outbox rows and publishes them to Kafka |
| `inbox-event.entity.ts` | `persistence/inbox/` | TypeORM entity defining the `inbox_events` table shape (13 columns + 4 indices) |
| `inbox.types.ts` | `persistence/inbox/` | Shared enums, interfaces, and default config for the entire inbox subsystem |
| `inbox.repository.ts` | `persistence/inbox/` | Data-access layer encapsulating all SQL queries and CAS state transitions |
| `inbox.service.ts` | `persistence/inbox/` | Orchestrator: deduplicates, locks, executes handlers transactionally, escalates failures |
| `inbox-processor.ts` | `persistence/inbox/` | Background worker that polls FAILED events and retries them with registered handlers |
| `inbox-cleanup.service.ts` | `persistence/inbox/` | Retention job that deletes old PROCESSED and DEAD_LETTER rows |
| `base-event-consumer.ts` | `persistence/inbox/` | Abstract base class for Kafka consumers; extracts metadata and delegates to InboxService |

---

## 2. DECLARATIVE KNOWLEDGE

### 2.1 The Problem: The Distributed Transaction Gap

In a microservice, saving an entity and publishing its domain event are two independent
operations across different systems (PostgreSQL and Kafka). Without coordination, a
crash between them causes data inconsistency.

```
BROKEN FLOW (no outbox):
══════════════════════════

  Service Code:
    db.save(order)          ──►  PostgreSQL ✓
    producer.send(event)    ──►  Kafka       ✗  (crash here)
                                      │
                                      ▼
                              ┌───────────────────┐
                              │ Order saved in DB │
                              │ Event LOST forever │
                              │ Consumer NEVER runs│
                              └───────────────────┘

FIXED FLOW (with outbox + inbox):
══════════════════════════════

  Service Code:
    UnitOfWork.execute(
      save order,           ──┐  Single
      write outbox entry    ──┘  Transaction  ►  PostgreSQL ✓ (both or neither)
    )

  Background Job:
    OutboxProcessor.publish ──►  Kafka ✓        ►  Consumer receives event
    InboxService.dedup      ──►  PostgreSQL      ►  Skips duplicates
    InboxService.execute    ──►  Handler runs    ►  Business logic
    InboxProcessor.retry    ──►  Failed events   ►  Exponential backoff
```

The **Transactional Outbox** (producer side) ensures the event is *always* persisted
alongside the business data in a single atomic transaction. A background processor
publishes it later. The **Transactional Inbox** (consumer side) deduplicates, provides
CAS locking, and retries with exponential backoff.

### 2.2 Core Variables Table

| Variable | Type | Plain-English Meaning |
|---|---|---|
| `eventId` | `string` | A globally unique identifier for the event, set by the producer; used as the deduplication key on the consumer |
| `aggregateId` | `string \| undefined` | ID of the business entity this event belongs to (e.g., `orderId`, `userId`); used for querying and ordering |
| `correlationId` | `string` | A trace identifier propagated from producer to consumer via Kafka headers; links all work triggered by a single user action |
| `retryCount` | `number` | How many times this inbox event has already failed and been retried |
| `maxRetries` | `number` | The threshold after which the event is moved to the dead-letter queue (default: 5) |
| `nextRetryAt` | `Date \| undefined` | The earliest timestamp when the next retry should occur, computed with exponential backoff |
| `retryBackoffMs` | `number` | Base delay in milliseconds for the exponential backoff formula (default: 1000) |
| `processorBatchSize` | `number` | Maximum number of events fetched in one poll cycle by the background processor (default: 50) |
| `retentionDays` | `number` | Age after which PROCESSED and DEAD_LETTER events are deleted (default: 30) |
| `status` | `InboxEventStatus` | Current lifecycle state of an inbox event: RECEIVED, PROCESSING, PROCESSED, FAILED, or DEAD_LETTER |

### 2.3 Key Concepts Table

| Term | Definition |
|---|---|
| **Transactional Outbox** | A pattern where domain events are written to a database table inside the same transaction as the business data, then published asynchronously by a background process |
| **Transactional Inbox** | A pattern where each consumer writes incoming events to a local table with a UNIQUE constraint on the event ID, providing atomic deduplication |
| **CAS (Compare-And-Swap)** | An atomic SQL UPDATE pattern: `UPDATE t SET status='PROCESSING' WHERE id=$1 AND status='RECEIVED'` — only one worker wins the lock |
| **Idempotency Key** | The `eventId` field; consumers use it to detect and skip duplicate messages from at-least-once Kafka delivery |
| **Dead Letter Queue (DLQ)** | A Kafka topic (`<topic>.dlq`) where events go after exhausting all retries; holds full metadata for inspection and manual replay |
| **Exponential Backoff** | A retry delay formula `baseMs × 2^retryCount` that spaces out retries to avoid overwhelming downstream services during outages |
| **Correlation ID** | An identifier that flows through Kafka headers and DB records, connecting the producing service, the event, and the consuming service for distributed tracing |
| **At-Least-Once Delivery** | Kafka's default guarantee: a message may be delivered more than once; the inbox pattern compensates by making the consumer idempotent |

---

## 3. DATA STRUCTURES

### 3.1 IDomainEvent

```typescript
// unit-of-work.ts:9-13
export interface IDomainEvent {
  readonly eventId: string;    // Globally unique event identifier
  readonly eventType: string;  // Event type string (e.g., 'order.created')
  readonly occurredOn: Date;   // Timestamp when the event was raised
}
```

### 3.2 OutboxEventEntity

```typescript
// outbox-event.entity.ts:13-29
@Entity('outbox_events')
export class OutboxEventEntity {
  @PrimaryColumn('uuid')
  id!: string;                       // Random UUID, auto-generated by UnitOfWork

  @Column({ type: 'varchar', length: 100 })
  type!: string;                     // Event type string (e.g., 'order.created')

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>; // Full serialized event body (JSONB)

  @Column({ type: 'boolean', default: false })
  processed!: boolean;               // false = pending publish, true = published

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;                  // Insertion timestamp (auto-set by TypeORM)
}
```

### 3.3 InboxEventEntity

```typescript
// inbox-event.entity.ts:26-88
@Entity('inbox_events')
@Index('idx_inbox_status_created', ['status', 'createdAt'])    // Speeds up findRetryable queries
@Index('idx_inbox_event_type', ['eventType'])                   // Speeds up handler lookup
@Index('idx_inbox_aggregate_id', ['aggregateId'])               // Speeds up entity-scoped queries
@Index('idx_inbox_correlation_id', ['correlationId'])           // Speeds up trace queries
export class InboxEventEntity {
  @PrimaryColumn('uuid')
  id!: string;                       // Random UUID, internal primary key

  @Column({ type: 'varchar', length: 255, unique: true })
  eventId!: string;                  // Idempotency key — UNIQUE constraint drives dedup

  @Column({ type: 'varchar', length: 100 })
  eventType!: string;                // Event type (e.g., 'order.created'), used for handler routing

  @Column({ type: 'varchar', length: 255, nullable: true })
  aggregateId?: string;              // Business entity ID (e.g., 'ord-456')

  @Column({ type: 'varchar', length: 100, nullable: true })
  source?: string;                   // Source service name (e.g., 'order-service')

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>; // Original event payload

  @Column({ type: 'varchar', length: 20, default: 'RECEIVED' })
  status!: InboxEventStatus;         // Current lifecycle state

  @Column({ type: 'int', default: 0 })
  retryCount!: number;               // Number of failed processing attempts so far

  @Column({ type: 'int', default: 5 })
  maxRetries!: number;               // Max attempts before dead-lettering (copied from config)

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;             // Last error message for diagnostics

  @Column({ type: 'varchar', length: 255, nullable: true })
  correlationId?: string;            // Distributed tracing ID propagated through Kafka headers

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt?: Date;                // Earliest timestamp when retry should happen (= now + backoff)

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date;                // Timestamp when event was successfully processed

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;                  // Insertion timestamp (auto-set)

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;                  // Last update timestamp (auto-set)
}
```

### 3.4 InboxEventStatus

```typescript
// inbox.types.ts:9-20
export enum InboxEventStatus {
  RECEIVED    = 'RECEIVED',     // Event stored, not yet picked up for processing
  PROCESSING  = 'PROCESSING',   // Currently being processed within a transaction
  PROCESSED   = 'PROCESSED',    // Successfully processed
  FAILED      = 'FAILED',       // Processing failed; will be retried after backoff expires
  DEAD_LETTER = 'DEAD_LETTER',  // Exhausted all retries; sent to DLQ for manual inspection
}
```

### 3.5 InboxEventMetadata

```typescript
// inbox.types.ts:27-34
export interface InboxEventMetadata {
  readonly eventId: string;              // Unique event identifier
  readonly eventType: string;            // Event type for routing
  readonly aggregateId?: string;         // Business entity ID
  readonly correlationId?: string;       // Distributed tracing ID
  readonly source?: string;              // Source service name
  readonly receivedAt: Date;             // When the event was first received
}
```

### 3.6 InboxHandlerFn

```typescript
// inbox.types.ts:42-45
export type InboxHandlerFn = (
  payload: Record<string, unknown>,  // Deserialized event payload from JSONB
  metadata: InboxEventMetadata,       // Event metadata (eventId, correlationId, etc.)
) => Promise<void>;
```

### 3.7 InboxConfig & DEFAULT_INBOX_CONFIG

```typescript
// inbox.types.ts:49-65
export interface InboxConfig {
  maxRetries?: number;          // Default: 5
  retryBackoffMs?: number;      // Default: 1000
  processorBatchSize?: number;  // Default: 50
  retentionDays?: number;       // Default: 30
}

export const DEFAULT_INBOX_CONFIG: Required<InboxConfig> = {
  maxRetries: 5,
  retryBackoffMs: 1000,
  processorBatchSize: 50,
  retentionDays: 30,
};
```

---

## 4. ALGORITHM DIAGRAMS

### 4.1 Architecture Overview

```
┌────────────────────────────────────── PRODUCER SERVICE ───────────────────────────────────────┐
│                                                                                                │
│  Application Code          UnitOfWork                                  OutboxProcessor         │
│  ┌──────────────┐        ┌──────────────┐                           ┌───────────────────┐     │
│  │ save(order)  │──────► │ .transaction │                           │ processOutbox()   │     │
│  │ pullEvents() │        │              │                           │                   │     │
│  └──────────────┘        │  work(em) ───┼──┐                        │ find({            │     │
│                          │  save       ──┼──┤  ┌─────────────────┐  │   processed:false │     │
│                          │  outbox      ──┼──┼─►│   PostgreSQL    │  │ })               │     │
│                          └──────────────┘  │  │                 │  │                   │     │
│                                            │  │ business_table  │◄─┼─ SELECT ...        │     │
│                                            │  │ outbox_events   │  │                   │     │
│                                            │  └────────┬────────┘  │ for each event:   │     │
│                                            │           │           │  ┌───────────────┐ │     │
│                                            └───────────┘           │  │publishWith    │ │     │
│                                                                    │  │Resilience()   │─┼──┐  │
│                                                                    │  └───────────────┘ │  │  │
│                                                                    │  mark processed   │  │  │
│                                                                    └───────────────────┘  │  │
└────────────────────────────────────────────────────────────────────────────────────────────┼──┘
                                                                                             │
                                                                                      ┌──────▼─────┐
                                                                                      │   Kafka    │
                                                                                      │  Broker    │
                                                                                      └──────┬─────┘
                                                                                             │
┌────────────────────────────────────── CONSUMER SERVICE ─────────────────────────────────────┼──┐
│                                                                                             │  │
│  Kafka Controller          BaseEventConsumer       InboxService        InboxRepository      │  │
│  ┌──────────────┐        ┌──────────────┐        ┌─────────────┐    ┌─────────────────┐    │  │
│  │@EventPattern │──────► │ .consume()   │──────► │handleIncoming│──► │ tryInsert()     │    │  │
│  │('order.      │        │              │        │              │    │                 │    │  │
│  │  created')   │        │ extractEvent │        │ dedup ───────┼───►│ INSERT ...      │    │  │
│  └──────────────┘        │  Id()       │        │              │    │ ON CONFLICT     │    │  │
│                          │ extractAggr  │        │ CAS lock ────┼───►│ DO NOTHING      │    │  │
│                          │  Id()       │        │              │    │                 │    │  │
│                          │ extractSrc   │        │ markProcessing│──►│ UPDATE WHERE    │    │  │
│                          └──────────────┘        │              │    │ status=RECEIVED │    │  │
│                                                  │ execute      │    └─────────────────┘    │  │
│                        Domain Handler           │  handler()   │    ┌─────────────────┐    │  │
│                        ┌──────────────┐        │  in transact │    │                 │    │  │
│                        │ reserveStock │◄───────│  ion         │    │  PostgreSQL     │◄───┼──┘  │
│                        │ (items)      │        │              │    │  inbox_events   │       │
│                        └──────────────┘        │ markProcessed│──►│  UPDATE status   │       │
│                                                  │ on success   │    │  =PROCESSED     │       │
│                        ┌──────────────┐        │              │    └─────────────────┘       │
│                        │ markFailed() │◄───────│ handleFailure│                                │
│                        │ markDeadLet  │        │              │                                │
│                        └──────────────┘        └──────┬──────┘                                │
│                                                       │                                       │
│                        ┌──────────────┐        ┌──────▼──────┐                                │
│                        │ InboxProc    │        │   DLQ       │                                │
│                        │ essor        │        │  (Kafka)    │                                │
│                        │ .processRet  │        └─────────────┘                                │
│                        │ ries()       │                                                        │
│                        └──────────────┘                                                        │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 UnitOfWork Execution Flow

```
┌─── UnitOfWork.execute(work, events) ──────────────────────────────────┐
│                                                                        │
│  Input:                                                                │
│    work  = (manager) => manager.save(OrderOrmEntity, ormOrder)         │
│    events = [{eventId: 'evt-1', eventType: 'order.created', ...}]      │
│                                                                        │
│  ┌─────────────────── TRANSACTION ────────────────────────────────┐   │
│  │                                                                  │   │
│  │  1. result = await work(manager)          ──► saves order row    │   │
│  │                                                                  │   │
│  │  2. if events.length > 0:                                       │   │
│  │       outboxEntries = events.map(e => {                         │   │
│  │         entry = new OutboxEventEntity()                         │   │
│  │         entry.id       = crypto.randomUUID()  → "a1b2c3d4"     │   │
│  │         entry.type     = e.eventType           → "order.created"│   │
│  │         entry.payload  = serialize(e)          → {orderId: ...} │   │
│  │         entry.processed = false                                 │   │
│  │       })                                                        │   │
│  │       await manager.save(OutboxEventEntity, outboxEntries)      │   │
│  │                                                                  │   │
│  │  3. COMMIT ─────► both order row AND outbox row(s) committed    │   │
│  │     ROLLBACK ───► if ANY step fails, NEITHER persists           │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  Output: result (the return value of work)                             │
│                                                                        │
│  unit-of-work.ts:46-68                                                 │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.3 InboxService.handleIncoming() State Machine

```
                         ┌──────────┐
                         │ Event    │
                         │ Arrives  │
                         └────┬─────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ tryInsert()      │
                    │ INSERT ON        │
                    │ CONFLICT DO      │___________________
                    │ NOTHING          │                  │
                    └────┬─────────────┘                  │
                         │                                │
                    isNew=true                        isNew=false
                         │                                │
                         │                                ▼
                         │                     ┌───────────────────┐
                         │                     │ findByEventId()   │
                         │                     │  check status:    │
                         │                     │                   │
                         │              ┌──────┼─ PROCESSED ───────┼──────┐
                         │              │      │                   │      │
                         │              │      │─ PROCESSING ──────┼──┐   │
                         │              │      │                   │  │   │
                         │              │      │─ DEAD_LETTER ─────┼──┤   │
                         │              │      │                   │  │   │
                         │              │      │─ FAILED ──────────┼──┤   │
                         │              │      └───────────────────┘  │   │
                         │              │          │                  │   │
                         │              │          ▼                  │   │
                         │              │     return (skip)           │   │
                         │              │               RETURN        │   │
                         │              ▼                             │   │
                         │    ┌────────────────────┐                  │   │
                         │    │ markProcessing(id) │                  │   │
                         └───►│ CAS: RECEIVED →    │◄─────────────────┘   │
                              │ PROCESSING         │                      │
                              └────────┬───────────┘                      │
                                       │                                  │
                                  acquired?                               │
                              ┌────────┴────────┐                        │
                              │                 │                        │
                           false              true                       │
                              │                 │                        │
                              ▼                 ▼                        │
                          return          ┌─────────────────┐           │
                          (another        │ handler(payload,│           │
                           worker got     │ metadata)       │           │
                           the lock)      │ in transaction  │           │
                                          └────┬──────┬─────┘           │
                                               │      │                 │
                                          success  throws               │
                                               │      │                 │
                                               ▼      ▼                 │
                                     ┌──────────┐  ┌──────────────┐    │
                                     │markProc  │  │handleFailure │    │
                                     │essed(id) │  │()            │    │
                                     └──────────┘  └──┬───────┬───┘    │
                                                       │       │        │
                                                  retry<max  retry>=max │
                                                       │       │        │
                                                       ▼       ▼        │
                                                ┌──────────┐ ┌───────┐ │
                                                │markFailed│ │mark   │ │
                                                │backoff=  │ │Dead   │ │
                                                │1000*2^n  │ │Letter │ │
                                                └──────────┘ │+send  │ │
                                                             │ToDlq  │ │
                                                             └───────┘ │
                                                                       │
  State diagram key:                                                    │
    inbox.service.ts:69-270                                             │
    inbox.repository.ts:28-165                                          │
```

### 4.4 Exponential Backoff Timeline

```
Retry attempts for an event with retryBackoffMs=1000, maxRetries=5:

  Attempt 1 (initial)         Attempt 2              Attempt 3              Attempt 4              Attempt 5 (→ DLQ)
  │                          │                      │                      │                      │
  ▼                          ▼                      ▼                      ▼                      ▼
  ├──────────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┼────────►
  t=0                       t+1s                  t+3s                  t+7s                 t+15s

  Formula: nextRetryAt = Date.now() + backoffMs × 2^retryCount

  │ retryCount │ Formula       │ Delay    │ Effective Retry Time │
  │ 0          │ 1000 × 2^0    │ 1,000ms  │ t + 1 second          │
  │ 1          │ 1000 × 2^1    │ 2,000ms  │ t + 3 seconds         │
  │ 2          │ 1000 × 2^2    │ 4,000ms  │ t + 7 seconds         │
  │ 3          │ 1000 × 2^3    │ 8,000ms  │ t + 15 seconds        │
  │ 4          │ 1000 × 2^4    │ 16,000ms │ t + 31 seconds        │
  │ 5          │ maxReached    │ —        │ → Dead Letter Queue   │

  Source: inbox.repository.ts:105 (delay calculation)
          inbox.service.ts:241 (threshold check)
```

### 4.5 InboxProcessor Background Loop

```
                    ┌─────────────────────────┐
                    │                         │
                    │  Cron / setInterval     │
                    │  (e.g., every 10 sec)   │
                    │                         │
                    └────────┬────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ findRetryable(50)    │
                  │                      │
                  │ WHERE status=FAILED  │◄──── inbox.repository.ts:134-145
                  │ AND retryCount <     │
                  │       maxRetries     │
                  │ AND nextRetryAt <=   │
                  │       NOW()          │
                  └───────┬──────────────┘
                          │
                    events.length
                          │
              ┌───────────┴───────────┐
              │                       │
             0                    > 0
              │                       │
              ▼                       ▼
          return 0          ┌─────────────────────┐
                            │ for each event:     │
                            │                     │
                            │  handler = handlers  │
                            │   .get(eventType)    │
                            │                     │
                            │  if !handler:        │◄── inbox-processor.ts:71-77
                            │    warn + skip       │
                            │                     │
                            │  try:                │
                            │   inboxService       │
                            │   .retryEvent(       │
                            │    event, handler    │
                            │   )                  │
                            │   retried++          │
                            │  catch:              │
                            │   log + continue     │◄── inbox-processor.ts:80-88
                            └─────────────────────┘
                                      │
                                      ▼
                              return retried
```

### 4.6 OutboxProcessor Background Loop

```
                    ┌─────────────────────────┐
                    │                         │
                    │  Cron / setInterval     │
                    │  (e.g., every 5 sec)    │
                    │                         │
                    └────────┬────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ repo.find({          │
                  │   processed: false,  │◄──── outbox-processor.ts:38-42
                  │   order: ASC,        │
                  │   take: batchSize    │
                  │ })                   │
                  └───────┬──────────────┘
                          │
                    events.length
                          │
              ┌───────────┴───────────┐
              │                       │
             0                    > 0
              │                       │
              ▼                       ▼
          return 0          ┌─────────────────────────┐
                            │ for each event:         │
                            │                         │
                            │  try:                   │
                            │   publishWithResilience(│
                            │    producer, {          │
                            │     topic: 'domain-     │
                            │       events',          │
                            │     messages: [{        │
                            │       key: event.id,    │
                            │       value: JSON.      │
                            │         stringify(      │
                            │         event.payload), │
                            │       headers: {        │
                            │         x-event-type:   │
                            │           event.type,   │
                            │         x-event-id:     │
                            │           event.id,     │
                            │       }                 │
                            │     }]                  │
                            │   })                    │
                            │                         │
                            │   event.processed=true  │
                            │   repo.save(event)      │
                            │   published++           │
                            │  catch:                 │
                            │   log + continue        │
                            └─────────────────────────┘
                                      │
                                      ▼
                              return published
```

---

## 5. EVENT LIFECYCLE — FULL TRACE

Scenario: A user places an order. The "Order Created" event must be consumed by the
Inventory Service to reserve stock. All values are concrete.

**Initial conditions**:
- Order ID: `ord-456`
- Event ID: `evt-order-789`
- Correlation ID: `corr-abc-123`
- Producer service: `order-service`
- Consumer service: `inventory-service`

### Step 1 — Producer: UnitOfWork commits order + outbox

```
await unitOfWork.execute(
  (manager) => manager.save(OrderOrmEntity, {
    id: 'ord-456',
    userId: 'usr-99',
    items: [{productId: 'prod-1', quantity: 3, price: 29}],
    totalAmount: 87,
    status: 'PENDING',
  }),
  [{
    eventId: 'evt-order-789',
    eventType: 'order.created',
    occurredOn: new Date('2026-06-10T10:30:00.000Z'),
  }],
);
```

Inside the transaction (unit-of-work.ts:46-68):

```
outbox_events table gets:
┌──────────────────────┬────────────────┬─────────────────────────────────┬───────────┬────────────────────┐
│ id                   │ type           │ payload                         │ processed │ created_at         │
├──────────────────────┼────────────────┼─────────────────────────────────┼───────────┼────────────────────┤
│ "b7e9f1a4-..."       │ "order.created"│ {"eventId":"evt-order-789",     │ false     │ 2026-06-10T10:30:00 │
│                      │                │  "eventType":"order.created",   │           │                    │
│                      │                │  "occurredOn":"2026-06-10T..."} │           │                    │
└──────────────────────┴────────────────┴─────────────────────────────────┴───────────┴────────────────────┘
```

Both the order row `ord-456` and this outbox row are committed atomically.

### Step 2 — OutboxProcessor publishes to Kafka

```typescript
await outboxProcessor.processOutbox();
// outbox-processor.ts:37-76
```

- Queries `outbox_events` WHERE `processed = false`, finds our row
- Calls `publishWithResilience(producer, { ... })`
- Kafka message sent to topic `domain-events`:

```
Key:   "b7e9f1a4-..."
Value: {"eventId":"evt-order-789","eventType":"order.created","occurredOn":"2026-06-10T10:30:00.000Z"}
Headers:
  x-event-type:  "order.created"
  x-event-id:    "b7e9f1a4-..."
```

- Marks `outbox_events.processed = true`

### Step 3 — Kafka delivers to consumer

The Inventory Service's NestJS controller receives the message:

```typescript
@EventPattern('order.created')
async onOrderCreated(@Payload() data: Record<string, unknown>, @Ctx() context) {
  await this.orderCreatedConsumer.consume(data, context.getHeaders());
}
```

### Step 4 — BaseEventConsumer extracts metadata

```typescript
// base-event-consumer.ts:89-120

// extractEventId() — tries x-event-id header, falls back to payload.eventId
// → result: "b7e9f1a4-..." from Kafka header

// extractAggregateId() — tries payload.aggregateId, then orderId, userId, productId
// → result: undefined (simple IDomainEvent has no aggregateId field in payload)

// extractSource() — reads x-source header
// → result: undefined (not set by outbox processor in this example)
```

Then delegates:

```typescript
await this.inboxService.handleIncoming({
  eventId: 'evt-order-789',            // From payload
  eventType: 'order.created',          // Consumer's abstract eventType
  aggregateId: undefined,
  payload: {eventId: 'evt-order-789', ...},
  topic: 'order.events',
  headers: {
    'x-event-type': Buffer.from('order.created'),
    'x-event-id': Buffer.from('b7e9f1a4-...'),
    'x-correlation-id': Buffer.from('corr-abc-123'),
  },
  handler: (data, meta) => this.inventoryService.reserveStock(data.items),
  source: undefined,
});
```

### Step 5 — InboxService: dedup → lock → execute

```typescript
// inbox.service.ts:69-176

// 5a. Build entity
InboxEventEntity {
  id:            "f81d3c6a-..."         // crypto.randomUUID()
  eventId:       "evt-order-789"
  eventType:     "order.created"
  aggregateId:   undefined
  source:        undefined
  payload:       {eventId: "evt-order-789", ...}
  status:        RECEIVED
  retryCount:    0
  maxRetries:    5
  correlationId: "corr-abc-123"          // From x-correlation-id header
  nextRetryAt:   undefined
  processedAt:   undefined
  createdAt:     2026-06-10T10:30:05
  updatedAt:     2026-06-10T10:30:05
}

// 5b. Atomic dedup (inbox.repository.ts:28-56)
await inboxRepo.tryInsert(inboxEvent);
// → INSERT INTO inbox_events (...) VALUES (...) ON CONFLICT (event_id) DO NOTHING
// → result.raw.length > 0 → true (new event)
// → isNew = true

// 5c. CAS lock (inbox.repository.ts:65-71)
await inboxRepo.markProcessing("f81d3c6a-...");
// → UPDATE inbox_events
//     SET status = 'PROCESSING'
//   WHERE id = 'f81d3c6a-...' AND status = 'RECEIVED'
// → affected = 1 → acquired = true

// 5d. Execute handler in transaction (inbox.service.ts:163-165)
await dataSource.transaction(async (manager) => {
  await handler(
    {eventId: "evt-order-789", ...},                        // payload
    {eventId: "evt-order-789", eventType: "order.created",   // metadata
     aggregateId: undefined, correlationId: "corr-abc-123",
     source: undefined, receivedAt: 2026-06-10T10:30:05}
  );
  // → inventoryService.reserveStock() runs inside the transaction
});

// 5e. Mark processed (inbox.repository.ts:87-92)
await inboxRepo.markProcessed("f81d3c6a-...");
// → UPDATE inbox_events
//     SET status = 'PROCESSED', processed_at = NOW()
//   WHERE id = 'f81d3c6a-...'
```

Final state in `inbox_events`:

```
id="f81d3c6a-..." | eventId="evt-order-789" | status=PROCESSED | retryCount=0 | processedAt=2026-06-10T10:30:05
```

### Step 6 — FAILURE PATH: handler throws

If `inventoryService.reserveStock()` throws `Error("Out of stock for product prod-1")`:

```typescript
// inbox.service.ts:228-268 — handleFailure()

// current retryCount = 0, maxRetries = 5
newRetryCount = 0 + 1 = 1

// 1 < 5 → markFailed (NOT dead-letter)
await inboxRepo.markFailed(
  "f81d3c6a-...",
  "Out of stock for product prod-1",
  1,
  1000,  // backoffMs
);
// → UPDATE inbox_events
//     SET status = 'FAILED',
//         error_message = 'Out of stock for product prod-1',
//         retry_count = 1,
//         next_retry_at = NOW() + 1000ms * 2^1 = NOW() + 2000ms
//   WHERE id = 'f81d3c6a-...'
```

### Step 7 — InboxProcessor retries

After 2 seconds, the scheduler runs:

```typescript
// inbox-processor.ts:61-95
const events = await inboxRepo.findRetryable(50);
// → finds: [{id: "f81d3c6a-...", eventType: "order.created", retryCount: 1, ...}]

const handler = this.handlers.get("order.created");
// → returns the reserveStock handler

await this.inboxService.retryEvent(event, handler);
// → CAS: FAILED → PROCESSING (inbox.repository.ts:76-82)
// → Runs handler in transaction
// → On success: markProcessed
// → On failure: handleFailure (increment to retryCount=2, delay=4000ms)
```

### Step 8 — DEAD LETTER PATH: retries exhausted

After 5 failed attempts (retryCount reaches 5):

```typescript
// inbox.service.ts:241-255
newRetryCount = 5 >= maxRetries (5) → escalate to DLQ

await inboxRepo.markDeadLetter("f81d3c6a-...", "Out of stock for product prod-1");
// → SET status = 'DEAD_LETTER', error_message = '...'

await dlqProducer.sendToDlq("order.events", {
  key: "evt-order-789",
  value: '{"eventId":"evt-order-789",...}',
  headers: {
    'x-dlq-reason':         'Out of stock for product prod-1',
    'x-dlq-timestamp':      '2026-06-10T10:32:31.000Z',
    'x-dlq-original-topic': 'order.events',
    'x-dlq-service':        'inventory-service',
    'x-correlation-id':     'corr-abc-123',
    'x-retry-count':        '5',
  }
}, error, 5);
// → Publishes to topic: order.events.dlq
```

### Step 9 — Cleanup

30 days later, the daily cleanup runs:

```typescript
// inbox-cleanup.service.ts:38-53
cutoffDate = 2026-06-10 - 30 = 2026-05-11

await inboxRepo.deleteProcessedBefore(cutoffDate);
// → DELETE FROM inbox_events
//   WHERE status IN ('PROCESSED', 'DEAD_LETTER')
//     AND processed_at <= '2026-05-11'
// → Deletes our event (now 30 days old)
```

---

## 6. FULL-STACK FLOW — SWIMLANE DIAGRAM

```
Time
│   Producer    UnitOfWork   PostgreSQL   OutboxProc.   Kafka     Consumer    BaseEvent   InboxSvc.   InboxRepo   Handler     DLQ
│   App                                                                 App         Consumer
│
├──► execute() ──► BEGIN
│
│                 ──► INSERT order
│                     INSERT outbox ──► ├─ orders
│                     COMMIT            └─ outbox_events
│
│   (later: cron tick)
├──►                                    processOutb
│                                        ox()
│
│                                                 ──► SELECT unpro
│                                                      cessed
│                                                      ◄── rows
│
│                                                 ──► publish(evt) ──► store msg
│                                                 ──► UPDATE proc=
│                                                      true
│
│   (Kafka delivers msg)                                         deliver msg ──► consume()
│                                                                                     │
│                                                                                     ├── extractEventId()
│                                                                                     ├── extractAggregateId()
│                                                                                     └── handleIncoming()
│                                                                                            │
│                                                                                            ├── tryInsert()
│                                                                                            │
│                                                                                            │   ──► INSERT..ON
│                                                                                            │        CONFLICT
│                                                                                            │        ◄── {inserted}
│                                                                                            │
│                                                                                            ├── markProcessing()
│                                                                                            │
│                                                                                            │   ──► UPDATE CAS
│                                                                                            │        ◄── {acquired}
│                                                                                            │
│                                                                                            ├── handler(payload,
│                                                                                            │        metadata) ──►
│                                                                                            │
│                                                                                            │              reserveStock()
│                                                                                            │              ◄── ok/thrown
│                                                                                            │
│                                                                                            ├── [on success]
│                                                                                            │    markProcessed()
│                                                                                            │
│                                                                                            │   ──► UPDATE PRO-
│                                                                                            │        CESSED
│                                                                                            │
│                                                                                            └── [on failure]
│                                                                                                handleFailure()
│                                                                                                   │
│                                                                                                   ├── retry<max:
│                                                                                                   │   markFailed()──►
│                                                                                                   │        UPDATE FAILED
│                                                                                                   │
│                                                                                                   └── retry>=max:
│                                                                                                       markDeadLetter()──►
│                                                                                                            UPDATE DL
│                                                                                                       sendToDlq()──►──►
```

---

## 7. DESIGN DECISIONS

### 7.1 UNIQUE constraint on eventId instead of application-level SELECT+INSERT

**Why**: Two concurrent workers could both SELECT and find no row, then both INSERT
— the second would create a duplicate. Application-level checks have a race condition
window between SELECT and INSERT.

**What breaks without it**: Duplicate processing of the same event by concurrent
consumers, leading to double-charging, double-reservation, or other data corruption.

**Implementation**: `inbox-event.entity.ts:36` — `@Column({ unique: true })`

### 7.2 CAS updates instead of row-level locks (SELECT FOR UPDATE)

**Why**: CAS (`UPDATE WHERE status=RECEIVED SET status=PROCESSING`) is lock-free and
returns `affected` rows — the caller knows instantly who won. Row-level locks
(`SELECT FOR UPDATE`) block other workers, creating contention under load.

**What breaks without it**: Under high concurrency, `SELECT FOR UPDATE` causes
lock contention and reduced throughput as workers queue up waiting for row locks.

**Implementation**: `inbox.repository.ts:65-71` — `markProcessing()` uses conditional UPDATE.

### 7.3 Exponential backoff instead of fixed-delay retry

**Why**: During a downstream outage, all failed events would retry simultaneously
at the same fixed interval, creating a thundering herd. Exponential backoff spreads
retry times, increasing the probability that downstream recovers between overload bursts.

**What breaks without it**: During an inventory-service outage of 5 seconds, fixed
1000ms retries would hammer the failing service 5 times per event. With exponential
backoff (1000, 3000, 7000, 15000, 31000ms), the system gives the downstream service
increasing headroom to recover.

**Implementation**: `inbox.repository.ts:105` — `backoffMs * Math.pow(2, retryCount)`

### 7.4 Separate InboxRepository from InboxService

**Why**: Separation of concerns — repository handles SQL/TypeORM details; service
handles orchestration logic (dedup decisions, locking strategy, failure escalation).
This makes each testable in isolation.

**What breaks without it**: Testing retry logic becomes coupled to database setup;
swapping the database layer (e.g., from TypeORM to Prisma) requires rewriting
business logic.

### 7.5 Abstract BaseEventConsumer instead of direct InboxService calls

**Why**: Forces each consumer to declare `eventType` and `topic` at compile time,
ensuring consistent metadata extraction (eventId from standardized header).
Reduces boilerplate — services don't repeat the same extraction + delegation code.

**What breaks without it**: Different consumers use inconsistent header keys for
the event ID (some use `x-event-id`, others use `event_id`, others look in the
payload), making deduplication unreliable.

### 7.6 publishWithResilience with NON_BLOCKING strategy

**Why**: The outbox pattern already guarantees at-least-once delivery — the event
will be retried on the next OutboxProcessor poll. Blocking the producer's HTTP
response on Kafka publish adds latency with no benefit.

**What breaks without it**: Producer HTTP responses become gated on Kafka
connectivity. A Kafka partition leader election (~100ms) would add visible
latency to every `POST /orders` request.

**Implementation**: `kafka-resilient.ts:32` — `StrategyType.NON_BLOCKING`

### 7.7 InboxCleanupService as separate component

**Why**: Cleanup is a separate concern that runs on a different schedule (daily)
than retries (every 10 seconds). Keeping it separate avoids coupling the retry
processor's scheduling to retention policy.

**What breaks without it**: Changing retention from 30 to 7 days would require
touching the retry processor's configuration, creating a coupling that has
nothing to do with retries.

### 7.8 DLQ as Kafka topic instead of database table

**Why**: Operators use Kafka tooling to inspect, filter, and replay dead-lettered
events. Kafka topics preserve ordering and are natively integrated with monitoring.
A database table would require custom tooling for inspection and replay.

**What breaks without it**: Replaying a dead-lettered event requires a custom
SQL script or admin API instead of simply republishing from one Kafka topic to
another using existing Kafka CLI tools.

**Implementation**: `dlq-producer.ts:43-77` — publishes to `<originalTopic>.dlq`

---

## 8. EDGE CASES TABLE

| Scenario | How Handled | Source |
|---|---|---|
| **Duplicate Kafka delivery** (same eventId processed twice) | `tryInsert()` returns false → `findByEventId()` → if status=PROCESSED, returns silently | `inbox.service.ts:106-116` |
| **Concurrent workers pick same RECEIVED event** | `markProcessing()` CAS fails → `affected=0` → second worker exits | `inbox.service.ts:138-146`, `inbox.repository.ts:65-71` |
| **Concurrent workers pick same FAILED event for retry** | `markRetryProcessing()` CAS fails → `affected=0` → second worker exits | `inbox.service.ts:187-190`, `inbox.repository.ts:76-82` |
| **Handler throws mid-transaction** | Transaction rolls back → `handleFailure()` marks FAILED or DEAD_LETTER | `inbox.service.ts:173-175` |
| **Kafka publish fails (network blip)** | `publishWithResilience` uses NON_BLOCKING + 2 retries; outbox event stays `processed=false`, picked up next poll | `kafka-resilient.ts:29-39`, `outbox-processor.ts:67-71` |
| **eventId missing from both headers and payload** | `BaseEventConsumer.extractEventId()` returns undefined → consumer logs error and drops message with `return` | `base-event-consumer.ts:96-101`, `base-event-consumer.ts:135-151` |
| **No handler registered for event type** | `InboxProcessor.processRetries()` skips event with warning log; event stays FAILED until handler is registered | `inbox-processor.ts:71-77` |
| **DLQ Kafka send fails** | `safeExecute` with NON_BLOCKING swallows the error; the inbox event is already marked DEAD_LETTER in DB | `dlq-producer.ts:51-76` |
| **Cleanup deletes event while retry is in-flight** | DELETE only targets status IN (PROCESSED, DEAD_LETTER) — never touches RECEIVED, PROCESSING, or FAILED | `inbox.repository.ts:159-165` |
| **Insert race on dedup** | PostgreSQL UNIQUE constraint provides true atomicity — `ON CONFLICT DO NOTHING` is safe even under high concurrency | `inbox.repository.ts:28-56` |
| **Crash during markProcessing (status stuck at PROCESSING)** | No timeout mechanism exists; event stays PROCESSING indefinitely. Mitigated by: processing is fast (single handler call), and crashes are rare in production systems | `inbox.service.ts:138-146` |
| **OutboxEvents table grows unbounded** | No automatic cleanup for `processed=true` outbox rows. Mitigation would require a separate OutboxCleanupService (not implemented) | design consideration |

---

## 9. INTEGRATION POINT

### 9.1 Producer Side: Using UnitOfWork

```typescript
// From unit-of-work.ts:19-25 (docblock example)

// In your service (e.g., OrderService):
@Injectable()
export class OrderService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly orderRepo: Repository<OrderOrmEntity>,
  ) {}

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    // 1. Build domain aggregate (rich domain model)
    const order = Order.create(dto);
    //    order.id       → "ord-456"
    //    order.pullDomainEvents() → [{eventId: "evt-order-789", eventType: "order.created", occurredOn: now}]

    // 2. Map domain → ORM entity
    const ormOrder = this.orderRepo.create({
      id: order.id,
      userId: order.userId,
      items: order.items,
      totalAmount: order.totalAmount,
      status: order.status,
    });

    // 3. Atomically save order + write outbox events
    await this.unitOfWork.execute(
      // work callback — receives transactional EntityManager
      (manager) => manager.save(OrderOrmEntity, ormOrder),
      //     ^^^^^^^ TypeORM EntityManager scoped to the transaction
      //             All saves/repositories must use THIS manager,
      //             not the class-level repository.

      // events — domain events to persist in outbox
      order.pullDomainEvents(),
      //      ^^^^^^^^^^^^^^^^^ returns IDomainEvent[]
      //      Each event becomes an OutboxEventEntity row in the
      //      same transaction as the order INSERT.
    );

    return order;
  }
}
```

### 9.2 Consumer Side: Extending BaseEventConsumer

```typescript
// From base-event-consumer.ts:17-44 (docblock example)

// inventory-service/src/consumers/order-created.consumer.ts

@Injectable()
export class OrderCreatedConsumer extends BaseEventConsumer {
  // REQUIRED abstract fields — declared at compile time to ensure consistency
  readonly eventType = ORDER_TOPICS.CREATED;   // → "order.created"
  readonly topic = 'order.events';             // → for DLQ routing if this fails

  constructor(
    dataSource: DataSource,
    dlqProducer: KafkaDlqProducer,
    private readonly inventoryService: InventoryService,
  ) {
    super(
      dataSource,          // TypeORM DataSource for inbox table access
      dlqProducer,         // DLQ producer for dead-letter escalation
      'inventory-service', // Service name — appears in DLQ metadata headers
    );
  }

  // REQUIRED abstract method — called inside DB transaction after dedup + CAS lock
  async handle(
    payload: OrderCreatedEvent,    // Deserialized event from Kafka + JSONB
    meta: InboxEventMetadata,      // {eventId: "evt-order-789", correlationId: "corr-abc-123", ...}
  ): Promise<void> {
    await this.inventoryService.reserveStock(payload.items);
    //                                     ^^^^^^^^^^^^^^ Throwing here triggers retry logic.
    // If this throws → InboxService.handleFailure() →
    //   markFailed (backoff) → InboxProcessor retry → eventually DLQ
  }
}

// In your Kafka controller (separate file):
@Controller()
export class InventoryEventController {
  constructor(private readonly orderCreated: OrderCreatedConsumer) {}

  @EventPattern(ORDER_TOPICS.CREATED)  // "order.created"
  async onOrderCreated(
    @Payload() data: Record<string, unknown>,  // Kafka message value
    @Ctx() context: KafkaContext,              // Kafka metadata
  ): Promise<void> {
    await this.orderCreated.consume(
      data,                           // payload → forwarded to handle()
      context.getHeaders(),           // raw Kafka headers → BaseEventConsumer extracts:
    );                                //   eventId from x-event-id header
  }                                   //   aggregateId from payload fields
}
```

---

## 10. FILE MAP

```
packages/core/src/
├── index.ts                                     — Barrel export of entire @core package
│
├── persistence/
│   ├── index.ts                                 — Barrel: re-exports all public persistence APIs
│   ├── unit-of-work.ts                          — Atomic DB transaction + outbox event write (producer side)
│   │
│   ├── inbox/
│   │   ├── index.ts                             — Barrel: re-exports all inbox APIs
│   │   ├── inbox.types.ts                       — Enums (InboxEventStatus), interfaces (InboxConfig, InboxHandlerFn, InboxEventMetadata), defaults
│   │   ├── inbox-event.entity.ts                — TypeORM entity: 13 columns, 4 indices, status lifecycle states
│   │   ├── inbox.repository.ts                  — SQL data access: INSERT ON CONFLICT dedup, CAS state transitions, retryable queries, retention deletes
│   │   ├── inbox.service.ts                     — Orchestration: dedup decision tree, CAS lock acquisition, transactional handler execution, failure escalation
│   │   ├── inbox-processor.ts                   — Background poller: finds FAILED events past backoff, routes to registered handlers, delegates to InboxService.retryEvent()
│   │   ├── inbox-cleanup.service.ts             — Retention job: deletes PROCESSED/DEAD_LETTER events older than retentionDays
│   │   └── base-event-consumer.ts               — Abstract Kafka consumer: extracts eventId/aggregateId/source from headers+payload, delegates to InboxService.handleIncoming()
│   │
│   └── outbox/
│       ├── index.ts                             — Barrel: re-exports outbox APIs
│       ├── outbox-event.entity.ts                — TypeORM entity: 4 columns (id, type, payload JSONB, processed bool)
│       └── outbox-processor.ts                  — Background poller: finds unprocessed events, publishes to Kafka with resilience, marks processed
│
├── kafka/
│   ├── index.ts                                 — Barrel: re-exports all Kafka utilities
│   ├── dlq-producer.ts                          — Dead-letter queue: publishes to <topic>.dlq with diagnostic headers
│   ├── correlation.ts                           — Correlation ID: extract from headers (getCorrelationId) or set in headers (setCorrelationHeaders)
│   └── kafka-resilient.ts                       — Resilient publish: wraps Kafka produce with NON_BLOCKING + retry via safeExecute
│
├── resilience/
│   ├── index.ts                                 — Barrel: re-exports all resilience utilities
│   ├── safe-execute.ts                          — Generic async wrapper: timeout → retry → circuit breaker, with Prometheus metrics + OTel tracing
│   └── strategies.ts                            — Failure strategies: FAIL_OPEN (degrade), FAIL_CLOSE (throw), NON_BLOCKING (swallow)
│
├── security/                                    — Internal auth guard (not directly related)
├── observability/                               — Metrics, tracing, logging (not directly related)
├── filters/                                     — Global exception filter (not directly related)
└── interceptors/                                — HTTP logging, metrics (not directly related)

packages/events/src/
├── envelope.ts                                  — EventEnvelope Zod schema: type, schemaVersion, source, correlationId, timestamp, payload
├── order.events.ts                              — OrderCreated, OrderStateChanged schemas and TypeScript interfaces
├── payment.events.ts                            — Payment event schemas and interfaces
├── inventory.events.ts                          — Inventory event schemas and interfaces
├── user.events.ts                               — User event schemas and interfaces
├── cart.events.ts                               — Cart event schemas and interfaces
├── product.events.ts                            — Product event schemas and interfaces
├── notification.events.ts                       — Notification event schemas and interfaces
└── index.ts                                     — Barrel: re-exports all event types
```
