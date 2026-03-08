---
phase: 5
plan: 4
wave: 3
---

# Plan 5.4: Implement Checkout Saga Orchestrator

## Objective
Finalize the saga pattern by orchestrating events inside the Order Service. Construct the state machine required for compensating failures.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\apps\order-service\src
- c:\source\apps\inventory-service\src

## Tasks

<task type="auto">
  <name>Saga Event Consumption in Order Service</name>
  <files>c:\source\apps\order-service\src\sagas\checkout-saga.ts</files>
  <action>
    - Setup an Outbox Relay in the Order Service to flush `order.events`.
    - Setup a Kafka Consumer in the Order Service.
    - Consume `InventoryReserved`: Trigger Payment via Outbox (or direct payment event format, depending on choreo/orchestration pattern).
    - Consume `InventoryReservationFailed`: Update Order to `FAILED`.
    - Consume `PaymentProcessed`: Update Order to `CONFIRMED`.
    - Consume `PaymentFailed`: Update Order to `FAILED` and emit a compensating `OrderFailed` event via Outbox.
  </action>
  <verify>Test-Path c:\source\apps\order-service\src\sagas\checkout-saga.ts</verify>
  <done>Order service accurately mutates its status and orchestration events based on downstream systems</done>
</task>

<task type="auto">
  <name>Inventory Compensation Logic</name>
  <files>c:\source\apps\inventory-service\src\inventory\inventory.service.ts</files>
  <action>
    - Add logic to the Inventory Service consumer to handle `OrderFailed` events.
    - When `OrderFailed` is received, look up the reserved quantity by `orderId` (or pass quantity in the event payload) and free the lock by adding `reservedQuantity` back to `availableQuantity`.
    - Prevent double compensation using processed event idempotency tables.
  </action>
  <verify>Test-Path c:\source\apps\inventory-service\src\inventory\inventory.service.ts</verify>
  <done>Inventory system can reliably rollback failed transactions without leaking stock</done>
</task>

## Success Criteria
- [ ] The full saga checkout flow works end to end.
- [ ] Compensations restore global consistency correctly when payment fails.
