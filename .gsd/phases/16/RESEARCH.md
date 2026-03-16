---
phase: 16
level: 2
researched_at: 2026-03-16
---

# Phase 16 Research — Production-Grade Payment Service

## Questions Investigated

1. What is the current payment-service implementation and what gaps exist?
2. What DDD/CQRS patterns are established in sibling services (order-service, notification-service)?
3. How does the order-service currently integrate with the payment-service (Saga contract)?
4. What shared packages exist and how should they be leveraged?
5. What event contracts exist and which topics/event types must be supported?
6. What provider abstraction strategy is appropriate for Stripe/PayPal/Mock?

## Findings

### 1. Current Payment Service — Gap Analysis

**Current state**: 13 source files in flat NestJS structure — no DDD layers, no CQRS, no provider abstraction.

| Component | Current | Target | Gap |
|-----------|---------|--------|-----|
| Entity | `PaymentTransaction` (id, orderId, status, failReason) | Payment aggregate with Money VO, PaymentStatus state machine, provider, userId, transactionId | Missing userId, amount, currency, provider, transactionId; no domain behaviors |
| Status values | PENDING, PROCESSED, FAILED | PENDING, PROCESSING, SUCCESS, FAILED, REFUNDED | Missing PROCESSING and REFUNDED states |
| Payment logic | Hardcoded 90% random success | Provider strategy pattern (Stripe/PayPal/Mock) | No real provider abstraction |
| Consumer | Consumes `inventory.events` (InventoryReserved) | Consume `payment.commands` (ProcessPayment) | **Critical**: order-service sends to `payment.commands`, but payment-service listens on `inventory.events` — topic mismatch |
| Amount handling | Hardcoded `100` in consumer | Money VO with integer cents | No amount/currency tracking |
| Producer | Outbox relay to `payment.events` | Same (keep outbox pattern) | Event types need alignment: `PaymentProcessed`/`PaymentFailed` format |
| Idempotency | None | Idempotency keys + processed_events table | Not implemented |
| Retry/DLQ | None | Exponential backoff + DLQ | Not implemented |
| Tests | Boilerplate `AppController` test only | Domain, handler, provider, integration tests | Nearly zero coverage |
| Architecture | Flat (payment/, consumer/, outbox/) | 4-layer (domain/application/infrastructure/interfaces) | Full restructure needed |

**Critical discovery**: The order-service's `KafkaPaymentService` publishes to `payment.commands` topic, but the current payment-service consumer subscribes to `inventory.events`. This means the payment-service MUST add a `payment.commands` consumer.

### 2. Established DDD/CQRS Patterns (from order-service and notification-service)

Both services follow identical architectural patterns:

**Folder structure**:
```
src/
├── domain/          # Pure domain logic, ZERO NestJS imports
│   ├── entities/    # Aggregate roots, child entities
│   ├── value-objects/ # Immutable VOs (Money, Status, IDs)
│   ├── events/      # Domain events with pull mechanism
│   ├── errors/      # Domain-specific exceptions
│   └── ports/       # Repository interfaces (Symbol-based)
├── application/     # Use cases, orchestration
│   ├── commands/    # Command DTOs
│   ├── queries/     # Query DTOs
│   ├── handlers/    # Command/query handlers
│   ├── ports/       # External service interfaces
│   └── services/    # Application services
├── infrastructure/  # Framework integrations
│   ├── persistence/ # TypeORM entities, mappers, repos
│   ├── kafka/       # Producers, consumers
│   ├── providers/   # External integrations
│   └── metrics/     # Prometheus metrics
└── interfaces/      # HTTP layer
    ├── controllers/ # Thin controllers
    └── dto/         # Request/response DTOs
```

**Key patterns**:
- **Aggregate root**: Private constructor, `static create()` for new, `static reconstitute()` for DB hydration
- **Money VO**: Integer cents internally, `fromCents()`, `fromDecimal()`, `toDecimal()`, currency tracking
- **Status VO**: Enum + class wrapper with `transitionTo()` method enforcing valid transitions via state machine map
- **Domain events**: `BaseDomainEvent` base class, events collected internally, flushed via `pullDomainEvents()`
- **Ports**: `Symbol('PORT_NAME')` for DI tokens, interface with `I` prefix
- **Repository port**: `save()`, `findById()`, `findByX()` methods
- **Event publisher port**: `publish(event)`, `publishAll(events)` methods

### 3. Saga Integration Contract

The order-service `CheckoutSagaOrchestrator` drives the checkout flow:

```
InventoryReserved → order.requestPayment() → IPaymentService.requestPayment()
  ↓
Publishes to `payment.commands` topic:
  { type: 'ProcessPayment', payload: { orderId, amountInCents, currency, userId } }
  ↓
Payment service processes payment
  ↓
Publishes to `payment.events` topic:
  { eventId, type: 'PaymentProcessed'|'PaymentFailed', payload: { orderId, transactionId, success, reason } }
  ↓
Order-service consumes `payment.events`:
  - PaymentProcessed → ConfirmPaymentCommand(orderId, paymentId)
  - PaymentFailed → CancelOrderCommand(orderId, 'Payment failed')
```

**Event format consumed by order-service**:
```json
{
  "eventId": "uuid",
  "type": "PaymentProcessed",
  "payload": {
    "orderId": "string",
    "paymentId": "string (mapped to transactionId or eventId)",
    "success": true,
    "reason": ""
  },
  "timestamp": "ISO date"
}
```

### 4. Shared Packages

| Package | Exports | Usage |
|---------|---------|-------|
| `@ecommerce/core` | `getLoggerModule()`, `Logger` (nestjs-pino), tracing, metrics | Already used in `main.ts` |
| `@ecommerce/events` | `PAYMENT_TOPICS` (`payment.processed`, `payment.failed`), `PaymentProcessedEvent`, `PaymentFailedEvent` interfaces | Should use for event typing |

### 5. Provider Strategy Pattern

**Recommendation**: Strategy pattern with factory.

```
IPaymentProvider (port in domain)
  ├── StripeProvider (infrastructure)
  ├── PayPalProvider (infrastructure)
  └── MockProvider (infrastructure, for testing)
```

Interface:
```typescript
interface IPaymentProvider {
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
  refundPayment(transactionId: string, amount: Money): Promise<RefundResult>;
  getName(): string;
}
```

Factory selects provider based on payment request or configuration.

### 6. Reliability Patterns

- **Idempotency keys**: Store in `processed_events` table (same pattern as order-service), keyed on `orderId + provider` or explicit key
- **Retry logic**: Exponential backoff with jitter (1s, 2s, 4s, max 3 retries) for provider calls
- **DLQ**: Route failed messages to `payment.commands.dlq` topic after max retries
- **Timeout**: Provider call timeout of 30s with AbortController or Promise.race
- **Outbox pattern**: Already implemented, keep and improve

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | 4-layer DDD (domain/application/infrastructure/interfaces) | Consistent with order-service and notification-service |
| Consumer topic | `payment.commands` (not `inventory.events`) | Matches order-service `KafkaPaymentService` publisher |
| Publisher topic | `payment.events` (keep existing) | Already consumed by order-service's `PaymentEventConsumer` |
| Event format | Keep `{ eventId, type, payload, timestamp }` envelope | Backward-compatible with order-service consumer |
| Money representation | Integer cents (reuse Money VO pattern) | Consistent with order-service, avoids floating-point |
| Provider pattern | Strategy pattern with factory | Extensible — add new providers without modifying domain |
| State machine | PaymentStatus VO with transition map | Consistent with OrderStatus VO pattern |
| CQRS | Commands (ProcessPayment, RefundPayment), Queries (GetPaymentById, GetPaymentsByOrder) | Consistent with sibling service patterns |
| Idempotency | processed_events table dedup | Same pattern as order-service |
| Outbox | Keep existing outbox relay pattern | Proven transactional consistency pattern |

## Patterns to Follow

- Private constructor aggregate root with `create()` and `reconstitute()` factory methods
- Money VO (integer cents, currency), reusable across services
- Status VO with explicit state machine transitions
- Symbol-based DI tokens for ports
- Domain events collected in aggregate, flushed via `pullDomainEvents()`
- Thin controller → handler → domain aggregate flow
- Outbox pattern for transactional event publishing
- `processed_events` table for consumer idempotency

## Anti-Patterns to Avoid

- **Direct Kafka in domain layer**: Domain must be framework-agnostic (zero `@nestjs` imports)
- **Hardcoded amounts**: Never hardcode payment amounts — always pass from command
- **Random success simulation in production**: Mock provider should be explicit, not mixed into domain logic
- **Fat services**: No God-service — split into handlers per command/query
- **TypeORM entities as domain entities**: Use separate ORM entities with mappers
- **Swallowing errors silently**: Log and route to DLQ instead of catching and ignoring

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/cqrs` | `^11.x` | Command/Query bus (add to package.json) |
| `@nestjs/common` | `^11.0.1` | Already installed |
| `@nestjs/typeorm` | `^11.0.0` | Already installed |
| `kafkajs` | `^2.2.4` | Already installed |
| `uuid` | `^13.0.0` | Already installed |
| `class-validator` | latest | For DTO validation (add) |
| `class-transformer` | latest | For DTO transformation (add) |
| `@ecommerce/core` | workspace:* | Already installed |
| `@ecommerce/events` | workspace:* | Already installed |

## Risks

| Risk | Mitigation |
|------|------------|
| Topic mismatch between order-service and payment-service | Consume `payment.commands` + keep backward compat with `inventory.events` during transition |
| Event format breaking changes | Keep existing `{ eventId, type, payload }` envelope format |
| Provider timeout causing Saga timeout | 30s provider timeout + exponential backoff with circuit breaker |
| Duplicate payments | Idempotency key on orderId + dedup via processed_events |
| Test isolation | Mock provider for unit/integration tests, no real provider calls |

## Ready for Planning

- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
- [x] Integration contracts documented
- [x] Gap analysis completed
- [x] Risks and mitigations identified
