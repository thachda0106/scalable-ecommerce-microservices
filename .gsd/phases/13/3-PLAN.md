---
phase: 13
plan: 3
wave: 2
---

# Plan 13.3: CQRS Commands & Handlers

## Objective
Implement the command side of CQRS — commands that mutate order state.
Each handler orchestrates domain aggregate, repository, and event publishing.

## Context
- .gsd/SPEC.md
- apps/order-service/src/domain/ (from Plans 13.1-13.2)
- apps/order-service/src/application/ports/ (from Plan 13.2)
- apps/cart-service/src/application/commands/ (established CQRS pattern)
- apps/inventory-service/src/application/commands/ (established CQRS pattern)

## Tasks

<task type="auto">
  <name>Create Command DTOs</name>
  <files>
    apps/order-service/src/application/commands/create-order.command.ts
    apps/order-service/src/application/commands/confirm-payment.command.ts
    apps/order-service/src/application/commands/cancel-order.command.ts
    apps/order-service/src/application/commands/ship-order.command.ts
    apps/order-service/src/application/commands/deliver-order.command.ts
    apps/order-service/src/application/commands/refund-order.command.ts
    apps/order-service/src/application/commands/index.ts
  </files>
  <action>
    Plain command classes (no decorators, just data carriers):

    **CreateOrderCommand**: userId (string), items ({ productId, productName, quantity, unitPrice }[])
    **ConfirmPaymentCommand**: orderId (string), paymentId (string)
    **CancelOrderCommand**: orderId (string), reason (string)
    **ShipOrderCommand**: orderId (string), trackingNumber (string)
    **DeliverOrderCommand**: orderId (string)
    **RefundOrderCommand**: orderId (string), reason (string)

    Each command has a readonly constructor for immutability.
    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>6 command DTOs created — CreateOrder, ConfirmPayment, CancelOrder, ShipOrder, DeliverOrder, RefundOrder.</done>
</task>

<task type="auto">
  <name>Create Command Handlers</name>
  <files>
    apps/order-service/src/application/handlers/create-order.handler.ts
    apps/order-service/src/application/handlers/confirm-payment.handler.ts
    apps/order-service/src/application/handlers/cancel-order.handler.ts
    apps/order-service/src/application/handlers/ship-order.handler.ts
    apps/order-service/src/application/handlers/deliver-order.handler.ts
    apps/order-service/src/application/handlers/refund-order.handler.ts
    apps/order-service/src/application/handlers/index.ts
  </files>
  <action>
    Each handler follows: inject repository + event publisher via port tokens → load aggregate → call domain method → save → publish events.

    **CreateOrderHandler**:
    1. Create OrderItem[] from command items with Money VOs
    2. Call Order.create({ userId, items })
    3. Save via IOrderRepository
    4. Publish domain events via IEventPublisher
    5. Return order id

    **ConfirmPaymentHandler**:
    1. Load order by id from IOrderRepository
    2. Throw if not found
    3. Call order.confirmPayment()
    4. Save
    5. Publish events

    **CancelOrderHandler**:
    1. Load order by id
    2. Call order.cancel()
    3. Save + publish events

    **ShipOrderHandler**:
    1. Load order by id
    2. Call order.ship()
    3. Save + publish events

    **DeliverOrderHandler**:
    1. Load order by id
    2. Call order.deliver()
    3. Save + publish events

    **RefundOrderHandler**:
    1. Load order by id
    2. Call order.refund()
    3. Save + publish events

    Use @Inject(ORDER_REPOSITORY) and @Inject(EVENT_PUBLISHER) for DI.
    Handlers are @Injectable() NestJS providers.
    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>6 command handlers orchestrating domain + repository + events. Each follows load-mutate-save-publish pattern.</done>
</task>

## Success Criteria
- [ ] 6 command DTOs (immutable data carriers)
- [ ] 6 command handlers with DI via port tokens
- [ ] Handlers delegate ALL business logic to domain aggregate
- [ ] Events published after successful save
- [ ] `npx tsc --noEmit` passes
