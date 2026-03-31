# Event Flows

> **Purpose:** Visualize every asynchronous event path through the system, showing how the
> Outbox/Inbox pattern and Kafka connect services without synchronous coupling.

---

## Event Infrastructure

```
  Producer Service          Outbox Relay (5s poll)        Kafka (MSK)           Consumer Service
  ┌──────────────┐         ┌──────────────────┐       ┌──────────────┐       ┌──────────────┐
  │              │         │                  │       │              │       │              │
  │ [DB TX]      │         │ Poll outbox      │       │ topic:       │       │ [Inbox]      │
  │ 1. Save data │         │ WHERE published  │       │ product      │       │ 1. Dedup     │
  │ 2. Save      │         │   = false        │       │ .events      │       │    check     │
  │    outbox     │────────►│                  │──────►│              │──────►│ 2. Process   │
  │    event      │         │ Mark published   │       │ Partitions:  │       │ 3. Mark      │
  │              │         │                  │       │ [0][1][2]    │       │    PROCESSED │
  └──────────────┘         └──────────────────┘       │ [3][4][5]    │       └──────────────┘
                                                       └──────────────┘
  Guarantees:                                                           On failure:
  ✅ Atomic write                                                       ├── Retry 1 (1s)
     (data + event in same TX)                                          ├── Retry 2 (5s)
  ✅ At-least-once delivery                                             ├── Retry 3 (30s)
  ✅ Exactly-once processing                                            └── DLQ (dead letter)
     (via Inbox dedup)
```

---

## Flow 1: Product Catalog Sync (CQRS)

```
  Product Service                      Kafka                        Search Service
       │                                 │                               │
       │ [DB] INSERT product             │                               │
       │ [DB] INSERT outbox:             │                               │
       │   ProductCreated                │                               │
       │                                 │                               │
       │ ── Outbox Relay (5s) ──────────►│                               │
       │                                 │ product.events                │
       │                                 │ key: productId                │
       │                                 │ partition: hash(productId)%6  │
       │                                 │──────────────────────────────►│
       │                                 │                               │ [Inbox] eventId check
       │                                 │                               │ [ES] Index document
       │                                 │                               │ [Inbox] PROCESSED
       │                                 │                               │
  Product Service                      Kafka                        Search Service
       │                                 │                               │
       │ [DB] UPDATE product             │                               │
       │ [DB] INSERT outbox:             │                               │
       │   ProductUpdated                │                               │
       │ ── Outbox Relay ───────────────►│                               │
       │                                 │──────────────────────────────►│
       │                                 │                               │ [ES] Update document
```

**Ordering guarantee:** All events for the same `productId` go to the same partition →
consumed in order. `ProductCreated` always arrives before `ProductUpdated` for the same product.

---

## Flow 2: Checkout Saga (Orchestrated)

```
  Order Service          Kafka         Inventory Svc      Payment Svc     Notification
       │                   │                │                  │               │
  ┌────┴────┐              │                │                  │               │
  │ CREATED │              │                │                  │               │
  └────┬────┘              │                │                  │               │
       │ ~~ ReserveStock ─►│               │                  │               │
       │                   │──────────────►│                  │               │
       │                   │               │ OCC reserve      │               │
       │                   │               │ ~~ StockReserved ►│              │
       │                   │◄──────────────│                  │               │
  ┌────┴──────────┐        │                │                  │               │
  │STOCK_RESERVED │        │                │                  │               │
  └────┬──────────┘        │                │                  │               │
       │ ~~ ProcessPayment─►│              │                  │               │
       │                   │───────────────────────────────►│               │
       │                   │               │                 │ Stripe charge  │
       │                   │               │                 │ ~~ PaymentProcessed
       │                   │◄──────────────────────────────│               │
  ┌────┴──────────┐        │                │                  │               │
  │  CONFIRMED    │        │                │                  │               │
  └────┬──────────┘        │                │                  │               │
       │ ~~ OrderConfirmed─►│              │                  │               │
       │                   │──────────────────────────────────────────────►│
       │                   │               │                  │    Send email │
```

### Compensation Flow (Payment Failed)

```
  Order Service          Kafka         Inventory Svc      Payment Svc
       │                   │                │                  │
       │◄── PaymentFailed ─│◄──────────────────────────────│
  ┌────┴──────────┐        │                │                  │
  │ COMPENSATING  │        │                │                  │
  └────┬──────────┘        │                │                  │
       │ ~~ ReleaseStock ─►│               │                  │
       │                   │──────────────►│                  │
       │                   │               │ Release stock    │
       │                   │               │ ~~ StockReleased ►│
       │                   │◄──────────────│                  │
  ┌────┴──────────┐        │                │                  │
  │    FAILED     │        │                │                  │
  └───────────────┘        │                │                  │
```

---

## Flow 3: User Registration Chain

```
  Auth Service             Kafka              User Service         Notification Svc
       │                     │                     │                      │
       │ ~~ UserRegistered ─►│                    │                      │
       │                     │ user.events         │                      │
       │                     │────────────────────►│                      │
       │                     │                     │ [Inbox] Dedup        │
       │                     │                     │ [DB] Create profile  │
       │                     │                     │ [Inbox] PROCESSED    │
       │                     │                     │                      │
       │                     │────────────────────────────────────────►│
       │                     │                     │                  │ [Inbox] Dedup
       │                     │                     │                  │ Send welcome email
       │                     │                     │                  │ [Inbox] PROCESSED

  Both consumers are in DIFFERENT consumer groups
  → both receive the same message independently.
```

---

## Flow 4: Retry + DLQ

```
  Kafka Message Arrives
       │
       ▼
  [Inbox] Check event_id
       │
       ├── Found + PROCESSED → Skip (idempotent, commit offset)
       │
       └── Not found or FAILED:
            │
            ▼
       INSERT inbox (PENDING)
            │
            ▼
       Execute business logic
            │
            ├── Success → UPDATE inbox SET status = 'PROCESSED'
            │              Commit Kafka offset
            │
            └── Failure:
                 │
                 ▼
            UPDATE inbox SET status = 'FAILED', retry_count++
                 │
                 ├── retry_count < 3 → InboxProcessor retries (backoff)
                 │   ├── Retry 1: after 1 second
                 │   ├── Retry 2: after 5 seconds
                 │   └── Retry 3: after 30 seconds
                 │
                 └── retry_count >= 3 → Route to DLQ topic
                      │
                      ▼
                 Publish to {topic}.dlq with error metadata
                 Alert on-call engineer
```

---

## Event Timing Expectations

| Flow | Latency (Outbox poll + Kafka + Consumer) | SLO |
|------|----------------------------------------|-----|
| Product → Search sync | 5-10 seconds | < 30 seconds |
| Order → Inventory reserve | 5-10 seconds | < 15 seconds |
| Order → Payment process | 5-10 seconds + Stripe API time | < 30 seconds |
| Order → Notification email | 5-15 seconds + SES delivery | < 60 seconds |
| Full checkout saga | 15-45 seconds total | < 60 seconds |
