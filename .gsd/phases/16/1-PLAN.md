---
phase: 16
plan: 1
wave: 1
---

# Plan 16.1: Domain Layer — Payment Aggregate, Value Objects, Events & Ports

## Objective
Build the pure domain layer for the payment-service. This is the foundation — no NestJS imports allowed. Establishes the Payment aggregate root, PaymentStatus state machine, Money VO (reuse pattern from order-service), PaymentProvider enum, domain events, domain errors, and repository/provider port interfaces.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md
- .gsd/phases/16/RESEARCH.md
- apps/order-service/src/domain/ (reference patterns)
- apps/payment-service/src/ (current code to replace)

## Tasks

<task type="auto">
  <name>Create value objects: PaymentId, PaymentStatus, Money, Currency</name>
  <files>
    apps/payment-service/src/domain/value-objects/payment-id.vo.ts [NEW]
    apps/payment-service/src/domain/value-objects/payment-status.vo.ts [NEW]
    apps/payment-service/src/domain/value-objects/money.vo.ts [NEW]
    apps/payment-service/src/domain/value-objects/index.ts [NEW]
  </files>
  <action>
    1. **PaymentId** — UUID wrapper VO with `static create(id: string)` and `static generate()` factory methods, private constructor. Follow `OrderId` pattern from order-service.

    2. **PaymentStatus** — Enum `PaymentStatusEnum` with values: PENDING, PROCESSING, SUCCESS, FAILED, REFUNDED. Class `PaymentStatus` wrapping enum with:
       - `static create(value)`, `static pending()` factory methods
       - `canTransitionTo(target)` with valid transition map:
         - PENDING → [PROCESSING, FAILED]
         - PROCESSING → [SUCCESS, FAILED]
         - SUCCESS → [REFUNDED]
         - FAILED → [] (terminal)
         - REFUNDED → [] (terminal)
       - `transitionTo(target)` throws `InvalidPaymentStatusTransitionError` on invalid transition
       - `isTerminal()`, `equals()`, `toString()`

    3. **Money** — Reuse exact same pattern as order-service `Money` VO: integer cents internally, `fromCents()`, `fromDecimal()`, `zero()`, `add()`, `multiply()`, `toDecimal()`, `equals()`, `toString()`. Include currency tracking.

    4. **index.ts** — Re-export all VOs.

    **Anti-patterns to avoid:**
    - Do NOT import any `@nestjs` package — domain must be framework-agnostic
    - Do NOT use `number` for money — use integer cents
    - Do NOT allow invalid status transitions
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - 4 files created in domain/value-objects/
    - PaymentStatus has 5 enum values with enforced state machine
    - Money uses integer cents internally
    - Zero `@nestjs` imports in any domain file
  </done>
</task>

<task type="auto">
  <name>Create Payment aggregate root, domain events, errors, and ports</name>
  <files>
    apps/payment-service/src/domain/entities/payment.entity.ts [NEW]
    apps/payment-service/src/domain/entities/index.ts [NEW]
    apps/payment-service/src/domain/events/base-domain.event.ts [NEW]
    apps/payment-service/src/domain/events/payment-created.event.ts [NEW]
    apps/payment-service/src/domain/events/payment-processing.event.ts [NEW]
    apps/payment-service/src/domain/events/payment-completed.event.ts [NEW]
    apps/payment-service/src/domain/events/payment-failed.event.ts [NEW]
    apps/payment-service/src/domain/events/payment-refunded.event.ts [NEW]
    apps/payment-service/src/domain/events/index.ts [NEW]
    apps/payment-service/src/domain/errors/domain-exception.ts [NEW]
    apps/payment-service/src/domain/errors/invalid-payment-status-transition.error.ts [NEW]
    apps/payment-service/src/domain/errors/invalid-payment-operation.error.ts [NEW]
    apps/payment-service/src/domain/errors/index.ts [NEW]
    apps/payment-service/src/domain/enums/payment-provider.enum.ts [NEW]
    apps/payment-service/src/domain/enums/index.ts [NEW]
    apps/payment-service/src/domain/ports/payment-repository.port.ts [NEW]
    apps/payment-service/src/domain/ports/payment-provider.port.ts [NEW]
    apps/payment-service/src/domain/ports/index.ts [NEW]
  </files>
  <action>
    1. **Payment aggregate root** (`payment.entity.ts`):
       - Private fields: _id (PaymentId), _orderId (string), _userId (string), _amount (Money), _status (PaymentStatus), _provider (PaymentProviderEnum), _transactionId (string|null), _idempotencyKey (string|null), _failReason (string|null), _createdAt (Date), _updatedAt (Date), _domainEvents (BaseDomainEvent[])
       - `static create(props: CreatePaymentProps)` — initializes with PENDING status, generates PaymentId, raises PaymentCreatedEvent
       - `static reconstitute(props: ReconstitutePaymentProps)` — hydrates from DB without raising events
       - Domain behaviors:
         - `startProcessing()` — PENDING → PROCESSING, raises PaymentProcessingEvent
         - `complete(transactionId: string)` — PROCESSING → SUCCESS, raises PaymentCompletedEvent
         - `fail(reason: string)` — PENDING|PROCESSING → FAILED, raises PaymentFailedEvent
         - `refund(reason: string)` — SUCCESS → REFUNDED, raises PaymentRefundedEvent
       - `pullDomainEvents()` — returns and clears collected events
       - Getters for all fields, `toJSON()`

    2. **Domain events** — Each event extends BaseDomainEvent with relevant fields:
       - PaymentCreatedEvent: paymentId, orderId, userId, amountInCents, currency, provider
       - PaymentProcessingEvent: paymentId, orderId, provider
       - PaymentCompletedEvent: paymentId, orderId, transactionId, amountInCents, currency
       - PaymentFailedEvent: paymentId, orderId, reason
       - PaymentRefundedEvent: paymentId, orderId, amountInCents, currency, reason

    3. **Errors** — DomainException base, InvalidPaymentStatusTransitionError (from→to), InvalidPaymentOperationError (operation, message). Follow order-service error patterns.

    4. **PaymentProviderEnum** — STRIPE, PAYPAL, MOCK

    5. **Ports**:
       - `IPaymentRepository` (Symbol PAYMENT_REPOSITORY): save(payment), findById(id), findByOrderId(orderId), findByIdempotencyKey(key)
       - `IPaymentProvider` (Symbol PAYMENT_PROVIDER): processPayment(request) → Promise<PaymentProviderResult>, refundPayment(transactionId, amount) → Promise<RefundResult>, getName() → PaymentProviderEnum

    **Anti-patterns to avoid:**
    - Do NOT expose setters — all mutations through behavior methods
    - Do NOT import NestJS — domain is pure TypeScript
    - Do NOT leak infrastructure concerns into domain
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - Payment aggregate has create(), reconstitute(), 4 behavior methods
    - 5 domain events created
    - 3 error classes created
    - 2 port interfaces with Symbol DI tokens
    - Zero @nestjs imports across entire domain/ directory
  </done>
</task>

## Success Criteria
- [ ] `npx tsc --noEmit` passes for payment-service
- [ ] No `@nestjs` import in any file under `src/domain/`
- [ ] Payment aggregate enforces status state machine (PENDING→PROCESSING→SUCCESS→REFUNDED)
- [ ] All domain events carry sufficient data for downstream consumers
- [ ] Port interfaces define clear contracts for repository and provider
