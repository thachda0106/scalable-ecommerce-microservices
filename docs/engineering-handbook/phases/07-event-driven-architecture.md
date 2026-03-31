# Phase 07 — Event-Driven Architecture

---

## 1. Overview

Establish the event backbone: define every event schema, Kafka topic, consumer group,
DLQ, and retry strategy. Make events the primary communication between services.

## 2. Goals

- Complete event catalog with schemas and versioning
- Kafka topics with correct partitioning and retention
- Outbox/Inbox verified on all services
- DLQ routing and replay capability
- Saga orchestration with timeout compensation

## 3. Architecture Design

See [Event Catalog](../global/event-catalog.md) and [Event Flows](../global/event-flows.md).

**Core principle:** Topic-per-domain (not topic-per-event). 7 main topics + 7 DLQ topics.

## 4. Technology Choices

| Component | Choice | Why |
|-----------|--------|-----|
| Kafka (MSK) | Ordered, durable, replayable, multi-consumer |
| kafkajs | Pure Node.js, idempotent producer |
| JSON Schema (in-code) | TypeScript-native, no registry overhead |
| Outbox (PostgreSQL) | Atomic with business writes |
| Inbox (PostgreSQL) | Transaction-safe deduplication |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-023 | Topic-per-domain | 7 topics vs 30+, ordering maintained per entity |
| ADR-024 | At-least-once + idempotent consumers | Simpler than exactly-once Kafka transactions |
| ADR-025 | Saga timeout at 5 min | Prevents stuck sagas from forever-reserving stock |

## 6. Data Flow / Request Flow

See [Event Flows](../global/event-flows.md) for all async paths including retry and DLQ.

## 7. Components Involved

- Kafka (MSK): 7 topics + 7 DLQ topics
- All producer services: Auth, Product, Cart, Order, Inventory, Payment
- All consumer services: User, Search, Inventory, Payment, Order, Notification
- Outbox tables in 6 PostgreSQL databases
- Inbox tables in 5 consuming services

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Event catalog finalization, topic creation, envelope factory, produce→consume test |
| Week 2 | Outbox/inbox deployment verification on all services, DLQ routing |
| Week 3 | Saga state machine, step handlers, compensation handlers, timeout scheduler |
| Week 4 | Event replay endpoint, monitoring dashboards, consumer lag alerts, documentation |

## 9. Tasks Checklist

```
- [ ] Finalize event catalog (all events, schemas, versions)
- [ ] Create 7 Kafka topics + 7 DLQ topics
- [ ] Set replication=3, min.insync.replicas=2
- [ ] Verify outbox relay on all 6 producer services
- [ ] Verify inbox dedup on all 5 consumer services
- [ ] DLQ routing after 3 failed retries
- [ ] Saga state machine (CREATED → STOCK_RESERVED → CONFIRMED)
- [ ] Saga compensation (PaymentFailed → ReleaseStock)
- [ ] Saga timeout (5 min → auto-compensate)
- [ ] Event replay endpoint (admin-only)
- [ ] Consumer lag monitoring + alerting
- [ ] DLQ monitoring + alerting
- [ ] Event catalog documentation published
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| Event catalog | docs/event-catalog/ published |
| All topics created | kafka-topics.sh --list |
| Outbox relay working | Events in Kafka within 5s of DB write |
| Inbox dedup working | Duplicate event skipped |
| DLQ routing | Failed events in .dlq topics after 3 retries |
| Saga works E2E | Success + failure + timeout paths tested |

## 11. Dependencies

- Phase 05 (Outbox, Inbox, KafkaProducer, BaseEventConsumer)
- Phase 06 (Services exist with consumers/producers)
- Phase 04 (MSK cluster running)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Consumer lag during spikes | Pre-provision partitions, auto-scale consumers |
| Poison pill events | DLQ routing + schema validation |
| Saga deadlocks | Timeout + compensation + monitoring |

## 13. Common Mistakes

- No partition key → out-of-order processing per entity
- Infinite retry loops on non-retryable errors
- DLQ with no monitoring (nobody watches it)
- No saga timeout → stock reserved forever
- Publishing outside transactions → data inconsistency

## 14. Best Practices

- Always use entity ID as partition key
- Distinguish retryable (timeout) from non-retryable (bad data) errors
- Alert on DLQ count > 0 and consumer lag > 10K
- Test every saga failure path before the success path
