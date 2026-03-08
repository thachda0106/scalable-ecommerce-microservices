---
phase: 5
plan: 1
wave: 1
---

# Plan 5.1: Scaffold Transactional Core Services

## Objective
Initialize the NestJS applications for the `cart-service`, `order-service`, `inventory-service`, and `payment-service` to prepare for the saga orchestrator implementation.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md

## Tasks

<task type="auto">
  <name>Scaffold Cart and Order Services</name>
  <files>c:\source\apps\cart-service\src\main.ts, c:\source\apps\order-service\src\main.ts</files>
  <action>
    - Initialize standard NestJS boilerplates for `cart-service` and `order-service` under `apps/` using `@nestjs/cli`.
    - Modify `main.ts` in both to use `@ecommerce/core` logging.
    - Wire `@ecommerce/core` and `@ecommerce/events` as exact workspace dependencies in their `package.json`.
    - Setup `/health` endpoints.
  </action>
  <verify>Test-Path c:\source\apps\order-service\src\main.ts</verify>
  <done>Cart and Order services exist with core logging and health checks</done>
</task>

<task type="auto">
  <name>Scaffold Inventory and Payment Services</name>
  <files>c:\source\apps\inventory-service\src\main.ts, c:\source\apps\payment-service\src\main.ts</files>
  <action>
    - Initialize standard NestJS boilerplates for `inventory-service` and `payment-service` under `apps/` using `@nestjs/cli`.
    - Modify `main.ts` in both to use `@ecommerce/core` logging.
    - Wire `@ecommerce/core` and `@ecommerce/events` as exact workspace dependencies in their `package.json`.
    - Setup `/health` endpoints.
  </action>
  <verify>Test-Path c:\source\apps\inventory-service\src\main.ts</verify>
  <done>Inventory and Payment services exist with core logging and health checks</done>
</task>

## Success Criteria
- [ ] Cart, Order, Inventory, and Payment NestJS services are running.
- [ ] Dependencies and core logging setup is verified across all four services.
