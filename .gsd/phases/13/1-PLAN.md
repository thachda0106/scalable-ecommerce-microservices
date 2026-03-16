---
phase: 13
plan: 1
wave: 1
---

# Plan 13.1: Order Domain Layer — Aggregate Root, Entities & Value Objects

## Objective
Create the Order aggregate root with rich domain model following DDD.
This is the foundation — all business rules, status transitions, and domain events originate here.
The domain layer MUST have zero `@nestjs` imports to guarantee framework independence.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md (Phase 13 description)
- apps/order-service/src/orders/entities/order.entity.ts (current flat entity — will be replaced)
- apps/inventory-service/src/domain/ (established DDD pattern to follow)
- apps/cart-service/src/domain/ (established DDD pattern to follow)

## Tasks

<task type="auto">
  <name>Create Value Objects (OrderId, UserId, Money, OrderStatus)</name>
  <files>
    apps/order-service/src/domain/value-objects/order-id.vo.ts
    apps/order-service/src/domain/value-objects/user-id.vo.ts
    apps/order-service/src/domain/value-objects/money.vo.ts
    apps/order-service/src/domain/value-objects/order-status.vo.ts
    apps/order-service/src/domain/value-objects/index.ts
  </files>
  <action>
    Create immutable value objects:

    **OrderId** — wraps UUID string, validates format, provides `equals()` and `toString()`
    **UserId** — wraps UUID string, validates format, provides `equals()` and `toString()`
    **Money** — wraps amount (number) and currency (string, default 'USD'). Provides `add()`, `multiply()`, `equals()`, `isPositive()`. Uses integer cents internally to avoid floating-point issues.
    **OrderStatus** — enum-like VO with full lifecycle:
      CREATED → PENDING_PAYMENT → PAID → CONFIRMED → SHIPPED → DELIVERED → CANCELLED → REFUNDED
      Provides static transition validation: `canTransitionTo(from, to): boolean`
      Valid transitions:
        CREATED → PENDING_PAYMENT, CANCELLED
        PENDING_PAYMENT → PAID, CANCELLED
        PAID → CONFIRMED, REFUNDED
        CONFIRMED → SHIPPED, CANCELLED
        SHIPPED → DELIVERED
        DELIVERED → REFUNDED
        CANCELLED → (terminal)
        REFUNDED → (terminal)

    Barrel export from index.ts.
    NO @nestjs imports anywhere in domain/.
  </action>
  <verify>grep -r "@nestjs" apps/order-service/src/domain/ | wc -l → 0</verify>
  <done>4 value objects created with validation, immutability, and equality semantics. OrderStatus has full lifecycle transition rules.</done>
</task>

<task type="auto">
  <name>Create Order Aggregate Root and OrderItem Entity</name>
  <files>
    apps/order-service/src/domain/entities/order-item.entity.ts
    apps/order-service/src/domain/entities/order.entity.ts
    apps/order-service/src/domain/entities/index.ts
  </files>
  <action>
    **OrderItem** entity:
    - Properties: id (string), productId (string), productName (string), quantity (number), unitPrice (Money)
    - Computed: `totalPrice(): Money` → unitPrice.multiply(quantity)
    - Validation: quantity > 0, unitPrice must be positive
    - Static factory: `OrderItem.create({ productId, productName, quantity, unitPrice })`

    **Order** aggregate root:
    - Properties: id (OrderId), userId (UserId), items (OrderItem[]), status (OrderStatus), totalPrice (Money), createdAt (Date), updatedAt (Date)
    - Private constructor — use static factory `Order.create({ userId, items })`
    - On creation: status = CREATED, totalPrice computed from items, domain event OrderCreatedEvent raised
    - Domain behaviors that enforce business rules:
      - `requestPayment()` → transitions CREATED → PENDING_PAYMENT, raises OrderPaymentRequestedEvent
      - `confirmPayment()` → transitions PENDING_PAYMENT → PAID, raises OrderPaidEvent
      - `confirm()` → transitions PAID → CONFIRMED, raises OrderConfirmedEvent
      - `cancel()` → validates transition is legal, transitions → CANCELLED, raises OrderCancelledEvent
      - `ship()` → transitions CONFIRMED → SHIPPED, raises OrderShippedEvent
      - `deliver()` → transitions SHIPPED → DELIVERED, raises OrderCompletedEvent
      - `refund()` → transitions PAID/DELIVERED → REFUNDED, raises OrderRefundedEvent
    - `addItem()` and `removeItem()` only allowed when status is CREATED
    - Each behavior updates `updatedAt`
    - Internal `domainEvents: DomainEvent[]` array with `pullDomainEvents()` method to collect and clear events

    All state transitions MUST go through OrderStatus.canTransitionTo() — throw DomainException if invalid.

    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Order aggregate and OrderItem entity created. All business rules enforced in domain. Status transitions validated. Domain events raised on every state change.</done>
</task>

<task type="auto">
  <name>Create Domain Events and Domain Errors</name>
  <files>
    apps/order-service/src/domain/events/domain-event.base.ts
    apps/order-service/src/domain/events/order-created.event.ts
    apps/order-service/src/domain/events/order-payment-requested.event.ts
    apps/order-service/src/domain/events/order-paid.event.ts
    apps/order-service/src/domain/events/order-confirmed.event.ts
    apps/order-service/src/domain/events/order-cancelled.event.ts
    apps/order-service/src/domain/events/order-shipped.event.ts
    apps/order-service/src/domain/events/order-completed.event.ts
    apps/order-service/src/domain/events/order-refunded.event.ts
    apps/order-service/src/domain/events/index.ts
    apps/order-service/src/domain/errors/domain-exception.ts
    apps/order-service/src/domain/errors/invalid-order-status-transition.error.ts
    apps/order-service/src/domain/errors/invalid-order-operation.error.ts
    apps/order-service/src/domain/errors/index.ts
  </files>
  <action>
    **DomainEvent base class:**
    - Properties: eventId (UUID), occurredOn (Date), eventType (string)
    - Abstract class, each concrete event extends it

    **Concrete events** — each includes orderId, relevant data (e.g., OrderPaidEvent includes paymentId, amount), and eventType string matching Kafka topics:
    - OrderCreatedEvent → 'order.created' (includes userId, items, totalPrice)
    - OrderPaymentRequestedEvent → 'order.payment.requested' (includes orderId, totalPrice)
    - OrderPaidEvent → 'order.paid' (includes orderId, paymentId)
    - OrderConfirmedEvent → 'order.confirmed' (includes orderId)
    - OrderCancelledEvent → 'order.cancelled' (includes orderId, reason)
    - OrderShippedEvent → 'order.shipped' (includes orderId, trackingNumber)
    - OrderCompletedEvent → 'order.completed' (includes orderId)
    - OrderRefundedEvent → 'order.refunded' (includes orderId, refundAmount)

    **Domain errors:**
    - DomainException (base) — extends Error
    - InvalidOrderStatusTransitionError — includes from/to status
    - InvalidOrderOperationError — for operations like addItem when status != CREATED

    Barrel exports from index.ts files.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>8 domain event classes and 3 domain error classes created. Events carry all data needed for Kafka publication. No framework dependencies.</done>
</task>

## Success Criteria
- [ ] 4 value objects with validation and immutability
- [ ] Order aggregate with full lifecycle state machine (8 statuses)
- [ ] OrderItem entity with computed totalPrice
- [ ] 8 domain events raised by aggregate behaviors
- [ ] 3 domain error types for business rule violations
- [ ] Zero `@nestjs` imports in src/domain/
- [ ] `npx tsc --noEmit` passes
