---
phase: 12
level: 2
researched_at: 2026-03-16
---

# Phase 12 Research — Production-Grade Notification Service

## Questions Investigated

1. What event payload schemas exist for events the notification-service must consume?
2. What Kafka consumer patterns are established in the codebase?
3. What dependencies are missing from notification-service for the planned architecture?
4. How should DLQ (Dead Letter Queue) be implemented — first in the platform?
5. What idempotency patterns are already established?
6. How do existing services handle event type field naming inconsistencies?

## Findings

### 1. Event Payload Schemas — Actual Format from Producers

Each producer service formats events differently. The notification-service consumers must handle these exact schemas.

**UserRegisteredEvent** (auth-service → `user.events` topic):
```ts
// Source: apps/auth-service/src/domain/events/user-registered.event.ts
{
  userId: string,
  email: string,
  provider?: string,       // 'google', 'github', or undefined for local
  occurredAt: string,      // ISO date
}
```
- ⚠️ No `userName` field — auth-service only knows email, not name. The notification orchestrator should use email as the userName fallback, or the template should only use `{{email}}`.

**OrderCreated / OrderConfirmed / OrderFailed** (order-service → `order.events` topic):
```ts
// Source: apps/order-service/src/sagas/checkout-saga.service.ts
// Events are published via Outbox Pattern
// Format: { type: 'OrderConfirmed', payload: { id: orderId, ...orderFields } }
{
  type: 'OrderConfirmed' | 'OrderFailed' | 'OrderCreated',
  payload: {
    id: string,            // orderId
    userId: string,
    totalAmount: number,
    status: string,
    // ...other order entity fields
  }
}
```
- ⚠️ No `email` or `userName` in order events. The notification-service will need to either:
  - (a) Look up user data from a user service call, OR
  - (b) Accept a minimal notification (userId + orderId only) and operate without user-facing fields initially
  - **Decision**: Use approach (b) — accept that templates will have `{{userId}}` not `{{userName}}` until a user-service integration is added. Keep it simple.

**CartAbandoned** (cart-service):
- Cart events are published via `CartEventsProducer` with topic = `event.eventType`.
- ⚠️ There is currently NO `CartAbandoned` event. Cart domain events are: `item.added`, `item.removed`, `cart.cleared`, `item.quantity.updated`.
- **Decision**: The `CartAbandoned` consumer should be scaffolded but will not receive events until a cart-abandonment detection job is implemented (future work). Plan 12.3 should note this.

### 2. Kafka Consumer Patterns — Established Codebase Conventions

Two patterns exist in the codebase:

**Pattern A — Raw KafkaJS (majority)**: Used by order-service, payment-service, search-service, notification-service, cart-service
```ts
// Direct KafkaJS: new Kafka({...}).consumer({groupId})
// OnModuleInit: connect → subscribe → run { eachMessage }
// OnModuleDestroy: disconnect
```

**Pattern B — Advanced with Idempotency** (inventory-service):
```ts
// Same as Pattern A but adds:
// - ProcessedEventOrmEntity for idempotency tracking
// - ConfigType injection for Kafka config
// - Handles both 'type' and 'eventType' field names
// - Error swallowed (no re-throw to prevent consumer crash loop)
```

**Decision**: Use Pattern B as the gold standard for the notification-service consumers, but WITHOUT the ProcessedEventOrmEntity (since there's no TypeORM/Postgres in the notification-service yet — use in-memory tracking for now).

### 3. Missing Dependencies

The notification-service `package.json` is missing critical packages needed for the refactored architecture:

| Package | Version | Purpose | Required By |
|---------|---------|---------|-------------|
| `@nestjs/cqrs` | `^11.0.3` | CommandBus / QueryBus / Handler decorators | Plan 12.2, 12.5 |
| `class-validator` | `^0.14.0` | DTO validation decorators | Plan 12.5 |
| `class-transformer` | `^0.5.1` | DTO transformation | Plan 12.5 |

Currently installed packages (from package.json):
- `@ecommerce/core` (workspace) — Logger
- `@ecommerce/events` (workspace) — Event types
- `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices`, `@nestjs/platform-express`
- `kafkajs` — Direct Kafka client
- `reflect-metadata`, `rxjs`

**Action**: Plan 12.5 (module wiring task) must include `pnpm add @nestjs/cqrs class-validator class-transformer` as the first step.

### 4. DLQ Implementation — First in Platform

The ARCHITECTURE.md mentions DLQ (Section 12): "Poison Pill Event: route to `<topic>-dlq` after 3 retries". However, **NO service in the codebase currently implements DLQ**. The notification-service will be the first.

**DLQ Strategy Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Kafka DLQ Producer | Separate topic `notification.dlq`, failed messages produced to it | Requires monitoring the DLQ topic |
| B | In-memory DLQ Status | Store DLQ status in notification entity (status = DLQ) | Simple, no extra Kafka topic needed |
| C | Hybrid | Status = DLQ in entity + publish to Kafka DLQ topic for alerting | Best observability |

**Decision**: Option C (Hybrid). The `DlqProcessorService` marks notifications as DLQ in the repository AND publishes to a `notification.dlq` Kafka topic. This enables both:
- Query-based monitoring (find all DLQ notifications)
- Event-based alerting (downstream systems can subscribe to the DLQ topic)

**DLQ Topic Format**:
```json
{
  "originalNotificationId": "...",
  "channel": "EMAIL",
  "recipientId": "...",
  "templateSlug": "...",
  "failureReason": "...",
  "attempts": 3,
  "failedAt": "2026-03-16T..."
}
```

### 5. Idempotency Patterns

Inventory-service uses a `ProcessedEventOrmEntity` table to track processed event IDs. Since notification-service has no database yet:

**Decision**: Use in-memory `Set<string>` for idempotency tracking of consumed Kafka events. This means:
- Idempotency is lost on service restart (acceptable — duplicate notifications are better than lost ones)
- When a database is added later, migrate to a `processed_events` table

For notification-level idempotency (preventing same notification from being sent twice):
- Use `correlationId` as the dedup key in the NotificationRepository

### 6. Event Type Field Inconsistency

Events across the platform use two different field names for event type:
- **Order/Payment services**: `{ type: 'OrderConfirmed', payload: {...} }`
- **Inventory-service events**: `{ eventType: 'inventory.reserved', ...payload }`

Both the inventory-service consumer and the current notification-service consumer use `event.type`.

**Decision**: Consumers should extract type via `const eventType = event.type || event.eventType;` (exactly as inventory-service does on line 94 of `order-event-consumer.ts`).

### 7. Kafka Producer Pattern for Event Publishing

The cart-service `CartEventsProducer` establishes the pattern:
- Non-blocking publish (catchs errors, logs warning, does NOT throw)
- Key = userId for partition ordering
- Topic = event.eventType

**Decision**: The `KafkaEventPublisher` should follow this exact pattern for publishing notification domain events.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Consumer pattern | Pattern B (advanced with idempotency) | Established in inventory-service, most robust |
| DLQ strategy | Hybrid (entity status + Kafka DLQ topic) | Best observability, enables both query and event-based monitoring |
| Missing user data in order events | Use userId in templates, skip userName | Avoids cross-service calls; can be enhanced later |
| CartAbandoned event | Scaffold consumer but note event doesn't exist yet | Future-proof without blocking current scope |
| Idempotency | In-memory Set for now | No database; acceptable tradeoff for MVP |
| Event type field | `event.type \|\| event.eventType` | Handles both formats used across platform |
| New dependencies | `@nestjs/cqrs`, `class-validator`, `class-transformer` | Required for CQRS handlers and DTO validation |

## Patterns to Follow

- **Cart-service domain entities**: Private constructor + create/reconstitute factories + pullEvents()
- **Inventory-service consumer**: Idempotency check → event type switch → CommandBus dispatch → mark processed
- **Cart-service producer**: Non-blocking publish, topic = eventType, key = userId
- **Clean Architecture DI**: Symbol tokens in port files, `useClass` bindings in module
- **Error handling in consumers**: Catch all, log, do NOT re-throw (line 155 of order-event-consumer.ts)

## Anti-Patterns to Avoid

- **Throwing in event publisher**: Kafka publish failures must NOT crash the notification flow — log and continue
- **Cross-service calls in consumers**: Don't call user-service to get userName during event handling — use what's in the payload
- **fromBeginning: true**: Current notification-service uses this — causes full topic replay on restart. Must change to `false`
- **Hardcoded Kafka brokers**: Current service hardcodes `'localhost:29092'` — must use env-based config
- **Re-throwing in message handlers**: Causes consumer crash loop if Kafka retries the same message

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/cqrs` | `^11.0.3` | CQRS CommandBus/QueryBus/Handlers |
| `class-validator` | `^0.14.0` | DTO validation decorators |
| `class-transformer` | `^0.5.1` | DTO transformation for ValidationPipe |

No new external service dependencies (SendGrid, Twilio, Firebase are mocked).

## Risks

| Risk | Mitigation |
|------|------------|
| No persistent storage — in-memory repos lose data on restart | Acceptable for Phase 12; Phase 13 can add TypeORM/Postgres |
| No `CartAbandoned` event exists in cart-service | Scaffold the consumer; note in docs it's a future event |
| No `userName` in order events | Use `userId` as fallback in templates; enhance later |
| Idempotency lost on restart (in-memory Set) | At-most-once is acceptable for notifications; duplicates are benign |
| DLQ is first implementation in the platform | Keep it simple; establish the pattern for other services to follow |

## Impact on Existing Plans

Based on this research, the following plan modifications are recommended:

1. **Plan 12.2 (Orchestrator)**: Update `handleOrderPaid` to extract email from order payload if available, fall back to `user-{userId}@placeholder.com`. Update welcome-email to use `{{email}}` not `{{userName}}`.
2. **Plan 12.3 (Consumers)**: Add event type fallback (`event.type || event.eventType`). Note CartAbandoned is not yet emitted. Set `fromBeginning: false`.
3. **Plan 12.4 (Templates)**: Adjust template variables — use `{{userId}}` as a safe common denominator where `userName` is not available.
4. **Plan 12.5 (Module wiring)**: Add `pnpm add @nestjs/cqrs class-validator class-transformer` as first step.

## Ready for Planning

- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
- [x] Event schemas documented
- [x] DLQ strategy decided
- [x] Plan modifications identified
