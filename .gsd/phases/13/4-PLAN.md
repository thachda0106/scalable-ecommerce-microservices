---
phase: 13
plan: 4
wave: 2
---

# Plan 13.4: CQRS Queries & Handlers

## Objective
Implement the query side of CQRS — read-only operations that return order data
without affecting state. Queries go through repository ports directly.

## Context
- .gsd/SPEC.md
- apps/order-service/src/domain/ports/ (from Plan 13.2)
- apps/cart-service/src/application/queries/ (established pattern)

## Tasks

<task type="auto">
  <name>Create Query DTOs and Handlers</name>
  <files>
    apps/order-service/src/application/queries/get-order-by-id.query.ts
    apps/order-service/src/application/queries/get-orders-by-user.query.ts
    apps/order-service/src/application/queries/index.ts
    apps/order-service/src/application/handlers/get-order-by-id.handler.ts
    apps/order-service/src/application/handlers/get-orders-by-user.handler.ts
  </files>
  <action>
    **GetOrderByIdQuery**: orderId (string)
    **GetOrdersByUserQuery**: userId (string)

    **GetOrderByIdHandler**:
    1. Inject IOrderRepository via ORDER_REPOSITORY token
    2. Find order by OrderId VO
    3. Return order or throw NotFoundException

    **GetOrdersByUserHandler**:
    1. Inject IOrderRepository via ORDER_REPOSITORY token
    2. Find orders by UserId VO
    3. Return order array

    Both handlers are @Injectable() NestJS providers.
    Update handlers/index.ts barrel to include query handlers.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>2 query DTOs and 2 query handlers created. Full CQRS pattern complete — 6 commands + 2 queries.</done>
</task>

## Success Criteria
- [ ] 2 query DTOs
- [ ] 2 query handlers with repository injection
- [ ] Handlers are read-only (no state mutation)
- [ ] `npx tsc --noEmit` passes
