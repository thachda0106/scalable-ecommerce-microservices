---
phase: 13
level: 3
researched_at: 2026-03-16
---

# Phase 13 Research: Production-Grade Order Service

## Questions Investigated
1. What domain model patterns are established in this codebase (inventory-service, cart-service)?
2. How should Saga orchestration work for the checkout flow with Kafka?
3. What is the correct idempotent consumer pattern with TypeORM?
4. How should the transactional outbox pattern be implemented?
5. What Money value object design avoids floating-point issues?
6. What Kafka consumer/producer patterns are already established?
7. How should order status transitions be modeled as a state machine?

## Findings

### 1. Established Domain Aggregate Pattern

**Source:** `inventory-service/src/domain/entities/product-inventory.ts`, `cart-service/src/domain/entities/cart.entity.ts`

Two conventions coexist in the codebase:

| Pattern | Inventory Service | Cart Service |
|---------|------------------|--------------|
| State storage | Individual private fields (`_productId`, `_sku`) | Props object (`this.props`) |
| Constructor | `private constructor() {}` | `private constructor(props)` |
| Factory create | Sets fields manually | Passes props to constructor |
| Factory reconstitute | Sets fields manually | Passes props to constructor |
| Domain events | `_domainEvents: BaseDomainEvent[]` | `domainEvents` in props |
| pullEvents() | ✅ returns copy + clears | ✅ returns copy + clears |
| Version | `_version` field | `version` in props |
| toJSON() | ✅ manual serialization | ✅ manual serialization |

**Recommendation:** Use the **inventory-service pattern** (individual private fields) for the Order aggregate — it's more explicit and avoids potential issues with nested mutability in props objects. The Order aggregate is more complex than Cart and benefits from explicit field access.

### 2. BaseDomainEvent Convention

**Source:** `inventory-service/src/domain/events/base-domain.event.ts`

```typescript
export abstract class BaseDomainEvent {
  public readonly occurredOn: Date = new Date();
  public abstract readonly eventType: string;
}
```

**Recommendation:** Follow this exact pattern. Each concrete event extends `BaseDomainEvent` with a specific `eventType` string. The order-service should define its own `BaseDomainEvent` with the same interface (not import from inventory — each service is independent).

### 3. Repository Port Pattern

**Source:** `inventory-service/src/domain/ports/inventory-repository.port.ts`

Uses `Symbol()` for injection tokens:
```typescript
export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');
```

**Recommendation:** Use `Symbol()` tokens (not string tokens). This matches the established pattern and prevents token collisions.

### 4. Transactional Outbox Pattern

**Source:** `inventory-service/src/infrastructure/messaging/kafka-event-publisher.ts`

Events are NOT published directly to Kafka. They're written to `outbox_events` table. `OutboxRelayService` polls and publishes.

Flow: Domain event → Handler calls `IEventPublisher.publish()` → Written to outbox table → OutboxRelayService polls (cron) → Published to Kafka topic → Marked as processed.

**Recommendation:** Copy this exact pattern for order-service. The existing order-service already has a basic outbox — refactor it to match the inventory-service's cleaner implementation using the `IEventPublisher` port.

### 5. Idempotent Consumer Pattern

**Source:** `inventory-service/src/infrastructure/messaging/order-event-consumer.ts`, `processed-event.orm-entity.ts`

```typescript
// 1. Extract eventId from message
const eventId = event.id || event.payload?.idempotencyKey;
// 2. Check processed_events table
const alreadyProcessed = await this.processedRepo.findOneBy({ eventId });
if (alreadyProcessed) return; // Skip duplicate
// 3. Process event via CommandBus
await this.commandBus.execute(new SomeCommand(...));
// 4. Mark as processed
const processed = new ProcessedEventOrmEntity();
processed.eventId = eventId;
await this.processedRepo.save(processed);
```

`ProcessedEventOrmEntity`:
```
eventId: PrimaryColumn('uuid')
processedAt: CreateDateColumn('timestamptz')
```

**Recommendation:** Follow this exact pattern. The inventory-service's consumer uses `CommandBus` from `@nestjs/cqrs` to dispatch — this is clean but requires the CQRS module. However, our plans don't use NestJS CQRS module (we use manual handlers). Keep manual handler injection instead.

**Decision:** Use manual handler injection (not `@nestjs/cqrs` CommandBus) to stay consistent with the plans and avoid additional NestJS coupling. The consumers will inject handlers directly.

### 6. Kafka Consumer Pattern

**Source:** `inventory-service/src/infrastructure/messaging/order-event-consumer.ts`

Pattern:
- `OnModuleInit` → connect + subscribe + run
- `OnModuleDestroy` → disconnect
- `eachMessage` handler with error catching (no re-throw to prevent crash loop)
- Kafka config from `ConfigType` injection
- Switch statement on `eventType` to dispatch

**Recommendation:** Follow this pattern exactly. Key detail: **do NOT re-throw errors** in the message handler — this prevents consumer crash loops.

### 7. Saga Orchestration Approach

**Current state:** The existing `CheckoutSagaService` mixes orchestration and choreography. It listens to inventory/payment events and updates order status. This is a **choreography-based** saga in disguise.

**Web research findings:**
- **Orchestration-based**: Dedicated orchestrator tells services what to do. More control, easier to debug.
- **Choreography-based**: Services react to events independently. Simpler, but harder to trace failures.

**Current codebase reality:** The existing order-service uses a **hybrid** approach:
1. Order created → outbox publishes `OrderCreated` event
2. Inventory service listens and reserves stock (choreography)
3. Payment service listens to `InventoryReserved` and processes payment (choreography)
4. Order service's `CheckoutSagaService` listens to inventory and payment events (orchestration for status updates)

**Recommendation:** Maintain the hybrid orchestration approach but make it explicit:
- The `CheckoutSagaOrchestrator` in the order-service consumes events from inventory and payment services
- It dispatches commands to these services via Kafka command topics
- Order status transitions act as the implicit saga state
- This approach is already working — refactoring to a full orchestration pattern would break the existing event flows between services

### 8. Money Value Object Design

**Web research + best practice:**

Options:
1. **Integer cents** — store as integer (e.g., $19.99 = 1999 cents). Simple, no floating-point issues.
2. **Decimal with precision** — use `number` but always round to 2 decimal places.
3. **BigDecimal library** — use `decimal.js` or similar. Precise but adds dependency.

**Recommendation:** Use **integer cents internally** with `amount: number` representing cents and `currency: string`. Expose `toDecimal()` for display. This avoids floating-point precision issues without adding external dependencies. TypeORM stores as `decimal(12,2)` — the mapper converts between cents (domain) and decimal (DB).

### 9. Order Status State Machine

Designed lifecycle:

```
CREATED ──→ PENDING_PAYMENT ──→ PAID ──→ CONFIRMED ──→ SHIPPED ──→ DELIVERED
  │              │                │          │                          │
  └──→ CANCELLED ←──────────────┘ └→REFUNDED │                   ──→ REFUNDED
                                              │
                                              └──→ CANCELLED
```

Valid transitions matrix:
| From | To (valid) |
|------|-----------|
| CREATED | PENDING_PAYMENT, CANCELLED |
| PENDING_PAYMENT | PAID, CANCELLED |
| PAID | CONFIRMED, REFUNDED |
| CONFIRMED | SHIPPED, CANCELLED |
| SHIPPED | DELIVERED |
| DELIVERED | REFUNDED |
| CANCELLED | *(terminal)* |
| REFUNDED | *(terminal)* |

**Recommendation:** Encode this as a `Map<string, string[]>` in the `OrderStatus` value object. The `canTransitionTo()` method checks the map. The Order aggregate calls this before every status change.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Aggregate pattern | Private fields (inventory style) | More explicit for complex aggregate |
| Injection tokens | `Symbol()` | Matches inventory-service pattern, prevents collisions |
| Event base class | Own `BaseDomainEvent` | Each service is independent |
| Event publishing | Transactional outbox | Exactly-once semantics, established pattern |
| Idempotency | `processed_events` table with eventId PK | Proven pattern in inventory-service |
| Saga approach | Hybrid orchestration (status as state) | Matches existing service interactions |
| Money storage | Integer cents in domain, decimal in DB | Avoid floating-point, no extra dependency |
| CQRS dispatch | Manual handler injection (not CommandBus) | Less NestJS coupling in infrastructure |
| Consumer error handling | Catch + log, never re-throw | Prevent consumer crash loop |

## Patterns to Follow
- Private constructor + `create()` / `reconstitute()` static factories
- `pullEvents()` to collect and clear domain events
- `_version` field for optimistic concurrency control
- `toJSON()` for serialization
- `Symbol()` injection tokens for ports
- Outbox pattern: write to DB first, relay to Kafka via cron
- Idempotent consumer: check `processed_events` → process → mark processed
- Consumer: `OnModuleInit`/`OnModuleDestroy` lifecycle, no error re-throw
- Switch on `eventType` for event dispatch
- `@Injectable()` handlers with `@Inject(TOKEN)` for port DI

## Anti-Patterns to Avoid
- **Direct Kafka publish from handlers**: Breaks exactly-once semantics if DB transaction fails but Kafka message already sent. Use outbox.
- **Business logic in controllers**: Controller must only map HTTP to commands/queries and delegate.
- **Business logic in infrastructure**: Consumers and repos must not contain domain rules.
- **Importing `@nestjs` in domain layer**: Breaks framework independence.
- **Throwing errors in Kafka consumer**: Causes crash loop. Catch, log, and skip.
- **String injection tokens**: Can collide across modules. Use `Symbol()`.
- **Floating-point money**: Use integer cents to avoid rounding errors.
- **Saga state in external table**: Use Order status transitions as implicit saga state — simpler and already proven.

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `class-validator` | `^0.14` | DTO validation decorators |
| `class-transformer` | `^0.5` | DTO transformation |
| `prom-client` | `^15.0` | Prometheus metrics |
| `kafkajs` | `^2.2` | Already installed — Kafka client |
| `typeorm` | `^0.3` | Already installed — ORM |
| `uuid` | `^13.0` | Already installed — UUID generation |

## Risks

- **Saga complexity**: The hybrid orchestration approach means saga state is implicit in Order status. If more compensation steps are needed (e.g., notification rollback), this becomes harder to manage. Mitigation: Document all flows clearly, add structured logging per step.
- **Eventual consistency**: Between outbox write and Kafka relay, there's a brief window where events are not yet published. Mitigation: 1-second polling interval, log lag.
- **Consumer ordering**: Multiple Kafka partitions can cause out-of-order processing. Mitigation: Use orderId as partition key to ensure per-order ordering.
- **Idempotency gap**: Between processing and marking as processed, a crash could cause re-processing. Mitigation: Design all handlers to be naturally idempotent (check current status before transitioning).

## Ready for Planning
- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
- [x] Established patterns documented
- [x] Risks identified with mitigations
