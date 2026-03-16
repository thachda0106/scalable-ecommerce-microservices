---
phase: 16
plan: 6
wave: 3
---

# Plan 16.6: Tests — Domain Unit Tests, Handler Tests, Provider Mock Tests

## Objective
Write comprehensive tests covering domain logic, application handlers, and provider implementations. Achieve confidence that the payment lifecycle state machine, idempotency logic, and provider strategy work correctly.

## Context
- .gsd/phases/16/RESEARCH.md
- apps/payment-service/src/domain/ (Plan 16.1)
- apps/payment-service/src/application/ (Plan 16.2)
- apps/payment-service/src/infrastructure/providers/ (Plan 16.3)
- apps/payment-service/package.json (jest config)
- apps/order-service/src/domain/entities/__tests__/ (reference test patterns)
- apps/order-service/src/domain/value-objects/__tests__/ (reference test patterns)

## Tasks

<task type="auto">
  <name>Write domain unit tests (Payment aggregate, value objects, events)</name>
  <files>
    apps/payment-service/src/domain/entities/__tests__/payment.spec.ts [NEW]
    apps/payment-service/src/domain/value-objects/__tests__/payment-status.spec.ts [NEW]
    apps/payment-service/src/domain/value-objects/__tests__/money.spec.ts [NEW]
  </files>
  <action>
    1. **Payment aggregate tests** (`payment.spec.ts`):
       - `Payment.create()` — sets PENDING status, generates ID, raises PaymentCreatedEvent
       - `Payment.create()` — throws on zero or negative amount
       - `payment.startProcessing()` — transitions PENDING → PROCESSING, raises PaymentProcessingEvent
       - `payment.complete(txId)` — transitions PROCESSING → SUCCESS, raises PaymentCompletedEvent, stores transactionId
       - `payment.fail(reason)` — transitions PENDING|PROCESSING → FAILED, raises PaymentFailedEvent, stores failReason
       - `payment.refund(reason)` — transitions SUCCESS → REFUNDED, raises PaymentRefundedEvent
       - Invalid transitions — FAILED → PROCESSING throws InvalidPaymentStatusTransitionError
       - Invalid transitions — REFUNDED → any throws
       - `pullDomainEvents()` — returns events and clears internal array
       - `Payment.reconstitute()` — hydrates from props without raising events

    2. **PaymentStatus tests** (`payment-status.spec.ts`):
       - All valid transitions succeed
       - All invalid transitions throw
       - `isTerminal()` returns true for FAILED and REFUNDED
       - `equals()` works correctly

    3. **Money tests** (`money.spec.ts`):
       - `fromCents()` and `fromDecimal()` create correctly
       - `toDecimal()` converts correctly
       - `add()` works with same currency, throws on different
       - `multiply()` works, throws on negative
       - `equals()` comparison
       - `zero()` is zero

    **Run tests with:** `cd apps/payment-service && npx jest --testPathPattern="domain"` 
  </action>
  <verify>cd apps/payment-service && npx jest --testPathPattern="domain" --verbose</verify>
  <done>
    - Payment aggregate: 10+ test cases covering all state transitions and events
    - PaymentStatus: all valid/invalid transitions verified
    - Money: arithmetic and comparison verified
    - All tests pass
  </done>
</task>

<task type="auto">
  <name>Write handler tests and provider mock tests</name>
  <files>
    apps/payment-service/src/application/handlers/__tests__/process-payment.handler.spec.ts [NEW]
    apps/payment-service/src/application/handlers/__tests__/refund-payment.handler.spec.ts [NEW]
    apps/payment-service/src/infrastructure/providers/__tests__/payment-provider.factory.spec.ts [NEW]
    apps/payment-service/src/infrastructure/providers/__tests__/mock.provider.spec.ts [NEW]
  </files>
  <action>
    1. **ProcessPaymentHandler tests**:
       - Mock: IPaymentRepository, IPaymentProviderFactory, IEventPublisher
       - Test: successful payment processing — creates Payment, calls provider, completes, publishes events
       - Test: provider failure — creates Payment, provider throws, payment fails, publishes PaymentFailedEvent
       - Test: idempotency — when idempotencyKey already exists with SUCCESS, returns existing payment without re-processing
       - Test: idempotency — when idempotencyKey exists with FAILED, re-processes payment

    2. **RefundPaymentHandler tests**:
       - Mock: IPaymentRepository, IPaymentProviderFactory, IEventPublisher
       - Test: successful refund — finds payment, calls provider refund, transitions to REFUNDED
       - Test: payment not found — throws error
       - Test: payment not in SUCCESS state — domain throws InvalidPaymentStatusTransitionError

    3. **PaymentProviderFactory tests**:
       - Test: getProvider(MOCK) returns MockProvider
       - Test: getProvider(STRIPE) returns StripeProvider
       - Test: getProvider(PAYPAL) returns PayPalProvider
       - Test: getProvider(unknown) throws error

    4. **MockProvider tests**:
       - Test: processPayment returns successful result with transactionId
       - Test: refundPayment returns successful result
       - Test: getName() returns MOCK

    **Run tests with:** `cd apps/payment-service && npx jest --verbose`
  </action>
  <verify>cd apps/payment-service && npx jest --verbose</verify>
  <done>
    - ProcessPaymentHandler: 4 test cases including idempotency
    - RefundPaymentHandler: 3 test cases
    - PaymentProviderFactory: 4 test cases
    - MockProvider: 3 test cases
    - All tests pass with `npx jest --verbose`
  </done>
</task>

## Success Criteria
- [ ] `cd apps/payment-service && npx jest --verbose` — all tests pass
- [ ] Domain tests verify all 5 status transitions and invalid transition rejection
- [ ] Handler tests verify idempotency logic
- [ ] Provider factory tests verify strategy selection
- [ ] `npx tsc --noEmit` passes (type-check)
