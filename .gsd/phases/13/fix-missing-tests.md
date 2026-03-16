---
phase: 13
plan: fix-missing-tests
wave: 1
gap_closure: true
---

# Fix Plan: Implement Missing Order Service Tests

## Problem
Plan 13.9 specified 7 unit test files, but only 3 were implemented. Missing tests leave domain objects and CQRS handlers uncovered.

## Tasks

<task type="auto">
  <name>Write Missing Unit Tests</name>
  <files>
    apps/order-service/src/domain/entities/__tests__/order-item.entity.spec.ts
    apps/order-service/src/domain/value-objects/__tests__/money.vo.spec.ts
    apps/order-service/src/domain/value-objects/__tests__/order-status.vo.spec.ts
    apps/order-service/src/application/handlers/__tests__/create-order.handler.spec.ts
    apps/order-service/src/application/handlers/__tests__/confirm-payment.handler.spec.ts
    apps/order-service/src/application/handlers/__tests__/cancel-order.handler.spec.ts
  </files>
  <action>
    Implement the missing tests as outlined in Plan 13.9:
    1. `order-item.entity.spec.ts`: Test quantity, creation, constraints.
    2. `money.vo.spec.ts` & `order-status.vo.spec.ts`: Test operations, equality, status transitions.
    3. Handler specs: Mock repositories and event publisher, verify logic routes order mutations appropriately.
  </action>
  <verify>cd apps/order-service && pnpm test</verify>
  <done>All tests execute successfully and `pnpm test` checks all 7 spec files.</done>
</task>
