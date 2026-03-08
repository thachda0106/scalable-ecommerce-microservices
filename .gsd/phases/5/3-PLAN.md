---
phase: 5
plan: 3
wave: 2
---

# Plan 5.3: Implement Inventory & Payment Services

## Objective
Provide the capabilities to reserve items and process payments using Kafka events, demonstrating optimistic concurrency in inventory and mocked state machine in payments.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\apps\inventory-service\src
- c:\source\apps\payment-service\src

## Tasks

<task type="auto">
  <name>Inventory Reservation via OCC</name>
  <files>c:\source\apps\inventory-service\src\inventory\inventory.service.ts, c:\source\apps\inventory-service\src\app.module.ts</files>
  <action>
    - Install TypeORM and PostgreSQL dependencies for Inventory Service.
    - Create a `Stock` entity (`productId`, `availableQuantity`, `reservedQuantity`, `@VersionColumn version`).
    - Create `OutboxEvent` schema.
    - Implement reservation logic: transactionally update stock (checking availability) and publish `InventoryReserved` or `InventoryReservationFailed` directly to Outbox.
    - Implement a Kafka consumer that listens to `OrderCreated` and triggers the reservation logic.
    - Implement an Outbox Relay that flushes local Outbox events to `inventory.events`.
  </action>
  <verify>Test-Path c:\source\apps\inventory-service\src\inventory\inventory.service.ts</verify>
  <done>Inventory accepts or rejects stock reservation safely using OCC and emits an event</done>
</task>

<task type="auto">
  <name>Mock Payment Processing</name>
  <files>c:\source\apps\payment-service\src\payment\payment.service.ts, c:\source\apps\payment-service\src\app.module.ts</files>
  <action>
    - Install TypeORM and PostgreSQL for Payment Service.
    - Create a `PaymentTransaction` entity (`orderId`, `status`).
    - Implement a Kafka consumer listening to `InventoryReserved`.
    - Mock a 3rd party processing step. Randomly simulate success (90%) or failure (10%).
    - Write the transaction result and publish `PaymentProcessed` or `PaymentFailed` via an Outbox/Kafka mechanism.
  </action>
  <verify>Test-Path c:\source\apps\payment-service\src\payment\payment.service.ts</verify>
  <done>Payment Service consumes reservation events, models success/failure, and publishes events</done>
</task>

## Success Criteria
- [ ] Inventory service connects to PostgreSQL and uses OCC for safe stock management.
- [ ] Both Inventory and Payment services consume events and publish results seamlessly.
