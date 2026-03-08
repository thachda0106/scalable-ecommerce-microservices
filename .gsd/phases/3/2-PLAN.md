---
phase: 3
plan: 2
wave: 2
---

# Plan 3.2: Shared Event Definitions Library

## Objective
Construct the central Kafka event definition schema and typing layer. This ensures all services emitting/consuming events have a strongly typed contract.

## Context
- .gsd/ARCHITECTURE.md

## Tasks

<task type="auto">
  <name>Build Shared Events Library</name>
  <files>c:\source\packages\events\package.json, c:\source\packages\events\src\index.ts, c:\source\packages\events\src\order.events.ts, c:\source\packages\events\src\payment.events.ts, c:\source\packages\events\src\inventory.events.ts</files>
  <action>
    - Scaffold the `packages/events` TypeScript Node project.
    - Define interfaces for the events described in Architecture `6. Distributed Transaction Design (Saga Flow)`.
    - E.g: `OrderCreatedEvent`, `InventoryReservedEvent`, `InventoryReservationFailedEvent`, `PaymentProcessedEvent`, `PaymentFailedEvent`.
    - Ensure topics are stored as constants (e.g. `ORDER_TOPICS`, `INVENTORY_TOPICS`).
  </action>
  <verify>Test-Path c:\source\packages\events\src\order.events.ts</verify>
  <done>Event patterns are formally defined as code boundaries</done>
</task>

## Success Criteria
- [ ] A dedicated `events` package defines the inter-service communication payloads.
