---
phase: 5
plan: 2
wave: 2
---

# Plan 5.2: Implement Cart & Basic Order Services

## Objective
Implement Cart storage in Redis and establish the foundational `Order` and `OutboxEvent` tables in PostgreSQL for the orchestration of orders.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\apps\cart-service\src
- c:\source\apps\order-service\src

## Tasks

<task type="auto">
  <name>Implement Cart Service (Redis)</name>
  <files>c:\source\apps\cart-service\src\cart\cart.service.ts</files>
  <action>
    - Install `ioredis` or `@nestjs/redis` in Cart Service.
    - Create a Cart module/service that maintains cart state (e.g. `cart:{userId}`) containing `productId`, `quantity`, and `price`.
    - Implement endpoints to add items, remove items, and clear the cart.
  </action>
  <verify>Test-Path c:\source\apps\cart-service\src\cart\cart.service.ts</verify>
  <done>Cart Service correctly persists state to local Redis instance</done>
</task>

<task type="auto">
  <name>Database and Outbox Setup for Order Service</name>
  <files>c:\source\apps\order-service\src\orders\entities\order.entity.ts, c:\source\apps\order-service\src\app.module.ts</files>
  <action>
    - Install `@nestjs/typeorm` and `pg`.
    - Connect Order Service to PostgreSQL in `app.module.ts`.
    - Create an `Order` entity (`id`, `userId`, `totalAmount`, `status` [PENDING, CONFIRMED, FAILED]).
    - Create an `OutboxEvent` entity to capture transactional publishing of Order states.
    - Implement a basic `create` method in `OrdersService` that inserts a `PENDING` order and an `OrderCreated` Outbox event transactionally.
  </action>
  <verify>Test-Path c:\source\apps\order-service\src\orders\entities\order.entity.ts</verify>
  <done>Order service saves PENDING orders with corresponding Outbox records</done>
</task>

## Success Criteria
- [ ] Cart endpoints interact correctly with Redis.
- [ ] Order database schema validates and Outbox events are written on insertion.
