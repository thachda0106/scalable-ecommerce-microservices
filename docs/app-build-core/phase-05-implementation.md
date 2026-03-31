# Phase 5 — Event-Driven Architecture: Implementation Roadmap

---

## GOALS

Establish the **event backbone** that connects all services. Define every event schema, every Kafka
topic, every consumer group, every DLQ, and every retry strategy. After this phase, events flow
reliably between services with exactly-once processing semantics.

**Outcome:** A fully documented event catalog, working Outbox/Inbox infrastructure, Saga
orchestration, DLQ handling, and event replay capability.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **Message Broker** | Apache Kafka (MSK) | Ordered, durable, replayable, partitioned |
| **Client Library** | kafkajs | Pure Node.js, no Java/ZooKeeper deps |
| **Schema Registry** | JSON Schema (in code) | Simple, TypeScript-native, no Avro/Protobuf overhead |
| **DLQ Storage** | Kafka DLQ topics | Same infrastructure, easy to replay |
| **Outbox Storage** | PostgreSQL (same DB as service) | Atomic with business writes |
| **Inbox Storage** | PostgreSQL (same DB as service) | Transaction-safe deduplication |
| **Saga State** | PostgreSQL (Order DB) | Durable state machine, survives restarts |

### Why Kafka Over SQS/RabbitMQ?

```
Kafka:
  ✅ Ordered within partition (partition key = entity ID)
  ✅ Replayable (consumer can reset offset)
  ✅ Persistent (7-30 day retention)
  ✅ Multiple consumer groups (fanout without duplication)
  ✅ High throughput (100K+ messages/sec)

SQS:
  ❌ No ordering guarantee (standard) or limited (FIFO 300 msg/sec)
  ❌ No replay (message deleted after consumption)
  ❌ No fanout (need SNS → SQS for multiple consumers)

RabbitMQ:
  ❌ No ordering within queue by default
  ❌ No native replay
  ✅ Lower latency (ms vs Kafka 10-50ms)
  ✅ Simpler for small-scale pub/sub
```

---

## ARCHITECTURE DECISIONS

### ADR-015: Topic-per-Domain, Not Topic-per-Event

```
Decision: Use one Kafka topic per domain (product.events, order.events)
  Differentiate event types via message headers, not topic names
Rationale:
  - 7 topics instead of 30+ topics
  - Partition ordering per entity ID maintained
  - Consumer groups subscribe to domain, filter by event type in code
Trade-off: Consumers receive events they don't care about (but skip them cheaply)
```

### ADR-016: At-Least-Once Delivery + Idempotent Consumers

```
Decision: Kafka configured for at-least-once delivery
  Each consumer implements idempotency via Inbox pattern
Rationale:
  - Exactly-once in Kafka requires transactional producers + consumers
    (complex, performance overhead)
  - At-least-once is simpler and more resilient
  - Inbox pattern deduplicates at the application level
```

### ADR-017: Saga Timeout with Scheduled Cleanup

```
Decision: If the Saga doesn't complete within 5 minutes, automatically compensate
Implementation: Background scheduler queries orders in non-terminal states
  older than 5 minutes → triggers compensation
Rationale: Prevents stuck sagas from permanently reserving stock
```

---

## IMPLEMENTATION STEPS

### Build Order

```
Week 1: Event Foundation
────────────────────────
  Step 1: Finalize event catalog (all events, schemas, versions)    [Day 1]
  Step 2: Create Kafka topics in dev environment                     [Day 1]
  Step 3: Create DLQ topics for each main topic                     [Day 1]
  Step 4: Implement event envelope factory                           [Day 2]
  Step 5: Test: produce → consume → verify headers                  [Day 2]

Week 2: Outbox + Inbox
──────────────────────
  Step 6: Deploy outbox table migrations to all services             [Day 3]
  Step 7: Deploy inbox table migrations to all services              [Day 3]
  Step 8: Verify outbox relay publishes events (per service)        [Day 4]
  Step 9: Verify inbox deduplication works (per consumer)           [Day 4]
  Step 10: Implement DLQ routing on max retry exceeded              [Day 5]

Week 3: Saga Implementation
───────────────────────────
  Step 11: Implement saga state machine (Order Service)             [Day 6-7]
  Step 12: Implement saga step handlers                             [Day 7-8]
  Step 13: Implement compensation (rollback) handlers               [Day 8]
  Step 14: Implement saga timeout scheduler                         [Day 9]
  Step 15: Test: success path + all failure paths                   [Day 9-10]

Week 4: Hardening
─────────────────
  Step 16: Implement event replay endpoint                          [Day 11]
  Step 17: DLQ monitoring + alerting                                [Day 11]
  Step 18: Consumer lag monitoring                                  [Day 12]
  Step 19: Load test event throughput                               [Day 12]
  Step 20: Document event catalog for team                          [Day 13]
```

---

## TASK BREAKDOWN

```
Phase 5 — Event-Driven Architecture
│
├── [ ] 5.1 — Event Catalog
│   ├── [ ] Document all events per service (name, schema, version)
│   ├── [ ] Define event envelope schema (JSON Schema)
│   ├── [ ] Define partition key strategy per topic
│   ├── [ ] Define consumer group naming: {service}-{purpose}
│   ├── [ ] Define retention per topic (7 or 30 days)
│   ├── [ ] Define partition count per topic (3, 6, or 12)
│   └── [ ] Publish event catalog to docs/event-catalog/
│
├── [ ] 5.2 — Kafka Topic Management
│   ├── [ ] Create all main topics (7 topics)
│   ├── [ ] Create all DLQ topics (7 DLQ topics)
│   ├── [ ] Set replication factor = 3
│   ├── [ ] Set min.insync.replicas = 2
│   ├── [ ] Disable auto.create.topics
│   ├── [ ] Script topic creation for each environment
│   └── [ ] Verify topic configuration with kafka-topics.sh
│
├── [ ] 5.3 — Event Envelope & Factory
│   ├── [ ] EventEnvelopeFactory.create(type, payload, context)
│   ├── [ ] Auto-generate eventId (UUID v4)
│   ├── [ ] Auto-set timestamp (ISO 8601)
│   ├── [ ] Inject correlationId from request context
│   ├── [ ] Inject tenantId from request context
│   ├── [ ] Set version from event type definition
│   └── [ ] Unit test: envelope has all required fields
│
├── [ ] 5.4 — Outbox Implementation (Per Service)
│   ├── [ ] Run outbox migration on all 6 PostgreSQL services
│   ├── [ ] Verify OutboxService.save() within transaction
│   ├── [ ] Verify OutboxRelayService polls every 5 seconds
│   ├── [ ] Verify published events have correct topic + headers
│   ├── [ ] Verify cleanup removes published events > 24h old
│   ├── [ ] Add metrics: outbox_pending_count, outbox_relay_duration
│   └── [ ] Test: service restart doesn't lose unpublished events
│
├── [ ] 5.5 — Inbox Implementation (Per Service)
│   ├── [ ] Run inbox migration on all consuming services
│   ├── [ ] Verify BaseEventConsumer deduplicates by eventId
│   ├── [ ] Verify FAILED events are retried by InboxProcessor
│   ├── [ ] Verify max retries → DLQ routing
│   ├── [ ] Verify cleanup removes PROCESSED events > 7 days
│   ├── [ ] Add metrics: inbox_processed_count, inbox_failed_count
│   └── [ ] Test: replay an event → skipped (idempotent)
│
├── [ ] 5.6 — Dead Letter Queue (DLQ)
│   ├── [ ] DLQ message format (original message + error metadata)
│   ├── [ ] Route to DLQ after max retries (3)
│   ├── [ ] DLQ consumer for monitoring/alerting
│   ├── [ ] DLQ replay tool (reprocess specific messages)
│   ├── [ ] Alert: DLQ messages > 0 for 15 minutes → P2
│   └── [ ] Dashboard: DLQ message count per topic
│
├── [ ] 5.7 — Saga Orchestration
│   ├── [ ] Define saga state machine (state transitions)
│   ├── [ ] Saga state column in orders table
│   ├── [ ] Step 1: OrderCreated → publish ReserveStock
│   ├── [ ] Step 2: StockReserved → publish ProcessPayment
│   ├── [ ] Step 3: PaymentProcessed → confirm order + publish OrderConfirmed
│   ├── [ ] Comp 1: StockReservationFailed → mark order FAILED
│   ├── [ ] Comp 2: PaymentFailed → publish ReleaseStock + mark FAILED
│   ├── [ ] Saga timeout: orders stuck > 5 min → auto-compensate
│   ├── [ ] Saga state logging (every transition logged)
│   ├── [ ] Test: success path (full flow)
│   ├── [ ] Test: failure at step 1 (no stock)
│   ├── [ ] Test: failure at step 2 (payment declined)
│   └── [ ] Test: timeout (no response from inventory)
│
├── [ ] 5.8 — Event Replay
│   ├── [ ] Admin endpoint: POST /admin/replay/{topic}
│   ├── [ ] Selective replay (by date range, by entity ID)
│   ├── [ ] Rate-limited replay (don't overwhelm consumers)
│   ├── [ ] Full reindex trigger (Product → Search)
│   └── [ ] Document replay procedures in runbook
│
├── [ ] 5.9 — Monitoring & Observability
│   ├── [ ] Metric: kafka_events_published_total{topic, event_type}
│   ├── [ ] Metric: kafka_events_consumed_total{topic, event_type, status}
│   ├── [ ] Metric: kafka_consumer_lag{topic, consumer_group}
│   ├── [ ] Metric: saga_step_duration_seconds{step, outcome}
│   ├── [ ] Metric: saga_completion_total{outcome: success|failure|timeout}
│   ├── [ ] Dashboard: Event flow (pub/consume rates per topic)
│   ├── [ ] Dashboard: Saga success/failure/timeout rates
│   ├── [ ] Alert: Consumer lag > 10K for 5 min → P2
│   └── [ ] Alert: Saga timeout rate > 1% → P1
│
└── [ ] 5.10 — Documentation
    ├── [ ] Event catalog with all events + schemas
    ├── [ ] Event flow diagram (who publishes, who consumes)
    ├── [ ] Saga sequence diagram
    ├── [ ] DLQ handling runbook
    ├── [ ] Event replay procedure
    └── [ ] Consumer group management guide
```

---

## DEPENDENCIES

```
Phase 5 depends on:
  └── Phase 3 (Outbox, Inbox, KafkaProducer, BaseEventConsumer modules)
  └── Phase 4 (Services exist with Kafka consumers/producers)
  └── Phase 2 (MSK Kafka cluster running, topics created)

Internal dependencies:
  5.1 Event Catalog       → reference for all other steps
  5.2 Topic Management    → required before any publishing/consuming
  5.3 Envelope Factory    → required by 5.4 Outbox
  5.4 Outbox              → required by 5.5 Inbox (publishers must exist)
  5.5 Inbox               → required by 5.7 Saga (consumers must deduplicate)
  5.6 DLQ                 → depends on 5.5 (routes from failed inbox)
  5.7 Saga                → depends on 5.4 + 5.5 (pub + consume)
  5.8 Replay              → depends on 5.4 (re-publish from source)
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | Event catalog with all schemas | Published in docs/event-catalog/ |
| D2 | All Kafka topics created with correct config | kafka-topics.sh --list shows all |
| D3 | Outbox relay publishing for all services | Events in Kafka within 5 seconds of DB write |
| D4 | Inbox deduplication for all consumers | Duplicate event → no duplicate processing |
| D5 | DLQ routing after max retries | Failed events appear in .dlq topics |
| D6 | Saga success path works E2E | Order → Stock → Payment → Confirmed |
| D7 | Saga compensation works | PaymentFailed → StockReleased → OrderFailed |
| D8 | Saga timeout fires and compensates | Stuck order auto-fails after 5 min |
| D9 | Event monitoring dashboard | Consumer lag visible in Grafana/CloudWatch |
| D10 | DLQ alert fires when messages accumulate | Alert received within 15 min |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. No partition key strategy.** Without partition keys, events for the same entity
> land on different partitions → out-of-order processing. Always use entity ID as key.
>
> **2. Infinite retry loops.** If an event fails due to bad data (not transient), retrying
> forever blocks the consumer. After max retries → DLQ. Never retry non-retryable errors.
>
> **3. DLQ with no monitoring.** DLQ is useless if nobody watches it. Alert on DLQ count > 0.
>
> **4. No saga timeout.** A saga that never completes keeps stock reserved forever.
> Always implement timeout with automatic compensation.
>
> **5. Publishing events outside transactions.** If you `publish()` then `db.save()` fails,
> you've published an event for data that doesn't exist. Always use the Outbox pattern.
>
> **6. Consumer processes events out of order.** A ProductDeleted arriving before ProductCreated
> can cause errors. Handle gracefully: if entity doesn't exist, NOP or queue for later.

---

> **Next →** [Phase 6 — CI/CD Implementation](./phase-06-implementation.md)
