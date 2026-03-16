---
phase: 13
plan: 9
wave: 4
---

# Plan 13.9: Tests & Architecture Documentation

## Objective
Write unit tests for the domain layer and command handlers.
Generate comprehensive architecture documentation covering order lifecycle,
events, saga flows, and database design.

## Context
- .gsd/SPEC.md
- apps/order-service/src/domain/ (domain layer)
- apps/order-service/src/application/handlers/ (command handlers)
- apps/inventory-service/src/domain/entities/__tests__/ (established test pattern)
- apps/cart-service/src/application/handlers/__tests__/ (established test pattern)

## Tasks

<task type="auto">
  <name>Write Domain and Handler Unit Tests</name>
  <files>
    apps/order-service/src/domain/entities/__tests__/order.entity.spec.ts
    apps/order-service/src/domain/entities/__tests__/order-item.entity.spec.ts
    apps/order-service/src/domain/value-objects/__tests__/money.vo.spec.ts
    apps/order-service/src/domain/value-objects/__tests__/order-status.vo.spec.ts
    apps/order-service/src/application/handlers/__tests__/create-order.handler.spec.ts
    apps/order-service/src/application/handlers/__tests__/confirm-payment.handler.spec.ts
    apps/order-service/src/application/handlers/__tests__/cancel-order.handler.spec.ts
  </files>
  <action>
    **Order entity tests** (order.entity.spec.ts):
    - Create order with valid items → status CREATED, events contain OrderCreatedEvent
    - requestPayment() → status PENDING_PAYMENT, events contain OrderPaymentRequestedEvent
    - confirmPayment() → status PAID, events contain OrderPaidEvent
    - confirm() → status CONFIRMED
    - ship() from CONFIRMED → status SHIPPED
    - deliver() from SHIPPED → status DELIVERED
    - cancel() from CREATED → status CANCELLED
    - cancel() from DELIVERED → throws InvalidOrderStatusTransitionError
    - addItem() when status != CREATED → throws InvalidOrderOperationError
    - totalPrice computed correctly from items

    **OrderItem entity tests** (order-item.entity.spec.ts):
    - Create with valid data
    - totalPrice = unitPrice × quantity
    - Reject quantity <= 0
    - Reject negative unitPrice

    **Money VO tests** (money.vo.spec.ts):
    - Create with amount and currency
    - add() two Money objects
    - multiply() by quantity
    - Reject different currencies in add()
    - isPositive() / equals()

    **OrderStatus VO tests** (order-status.vo.spec.ts):
    - Valid transitions (e.g., CREATED → PENDING_PAYMENT)
    - Invalid transitions (e.g., DELIVERED → CREATED) → throws
    - Terminal states (CANCELLED, REFUNDED) → no valid transitions

    **CreateOrderHandler tests** (create-order.handler.spec.ts):
    - Mock IOrderRepository and IEventPublisher
    - Execute CreateOrderCommand → order saved, events published
    - Verify order has correct status and items

    **ConfirmPaymentHandler tests** (confirm-payment.handler.spec.ts):
    - Mock repo returning order in PENDING_PAYMENT status
    - Execute ConfirmPaymentCommand → order status updated to PAID
    - Order not found → throws

    **CancelOrderHandler tests** (cancel-order.handler.spec.ts):
    - Mock repo returning order in CREATED status
    - Execute CancelOrderCommand → order status CANCELLED
    - Cancel from terminal state → throws

    Use Jest. Mock repositories via jest.fn() objects implementing port interfaces.
  </action>
  <verify>cd apps/order-service && npx jest --passWithNoTests 2>&1 | tail -20</verify>
  <done>7 test files covering Order aggregate lifecycle, value objects, and 3 key command handlers. All tests pass.</done>
</task>

<task type="auto">
  <name>Generate Architecture Documentation</name>
  <files>
    apps/order-service/docs/order-service-architecture.md
    apps/order-service/docs/order-service-events.md
    apps/order-service/docs/order-service-saga.md
    apps/order-service/docs/order-service-database.md
  </files>
  <action>
    **order-service-architecture.md**:
    - Service overview and responsibilities
    - Layered architecture diagram (domain → application → infrastructure → interfaces)
    - Layer responsibilities table
    - Order aggregate model
    - CQRS pattern (6 commands, 2 queries)
    - Port/adapter bindings
    - Final folder structure

    **order-service-events.md**:
    - All domain events with payloads (8 events)
    - Kafka topics and message formats
    - Consumed events from other services (payment.events, inventory.events)
    - Event flow diagrams (producer → topic → consumer)
    - Idempotency via processed_events table

    **order-service-saga.md**:
    - Checkout saga flow (happy path)
    - Compensation flows (payment failure, inventory failure)
    - Sequence diagrams showing service interactions
    - Idempotency and at-least-once delivery handling
    - Saga state tracked via Order status transitions

    **order-service-database.md**:
    - Table schemas (orders, order_items, processed_events, outbox_events)
    - Index strategy and rationale
    - Optimistic locking (version column)
    - Migration guidance
    - Query patterns and performance considerations

    All docs in markdown format.
  </action>
  <verify>ls apps/order-service/docs/*.md | wc -l → 4</verify>
  <done>4 architecture documentation files covering service architecture, events, saga flows, and database design.</done>
</task>

## Success Criteria
- [ ] 7 test files with comprehensive coverage of domain model and handlers
- [ ] `npx jest` passes with all tests green
- [ ] `npx tsc --noEmit` shows zero errors
- [ ] 4 documentation files covering architecture, events, saga, database
- [ ] Tests use mocked repositories (no DB dependency)
- [ ] Zero @nestjs imports in src/domain/
