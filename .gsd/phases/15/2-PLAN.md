---
phase: 15
plan: 2
wave: 1
---

# Plan 15.2: docs/order-lifecycle.md & docs/order-api-flow.md

## Objective
Create two new documentation files that the existing docs/ folder is missing: the order lifecycle state machine and the API request flow documentation. These are critical for new developers to understand how orders move through states and how API requests are handled.

## Context
- apps/order-service/docs/ (existing: order-service-architecture.md, order-service-events.md, order-service-database.md, order-service-saga.md)
- apps/order-service/src/domain/value-objects/order-status.vo.ts (8 statuses, VALID_TRANSITIONS map)
- apps/order-service/src/domain/entities/order.entity.ts (domain behaviors: create, requestPayment, confirmPayment, confirm, cancel, ship, deliver, refund)
- apps/order-service/src/interfaces/controllers/order.controller.ts (7 endpoints)
- apps/order-service/src/application/handlers/ (8 handlers: create, confirm-payment, cancel, ship, deliver, refund, get-order-by-id, get-orders-by-user)
- apps/order-service/src/application/commands/ (6 commands)
- apps/order-service/src/application/queries/ (2 queries)

## Tasks

<task type="auto">
  <name>Create docs/order-lifecycle.md</name>
  <files>apps/order-service/docs/order-lifecycle.md</files>
  <action>
    Create a new file documenting the complete order lifecycle.

    Include:
    1. **Overview** — brief intro to the order lifecycle concept
    2. **Order Statuses** — table of all 8 statuses (CREATED, PENDING_PAYMENT, PAID, CONFIRMED, SHIPPED, DELIVERED, CANCELLED, REFUNDED) with description and whether terminal
    3. **State Transition Diagram** — mermaid stateDiagram-v2 showing all valid transitions from VALID_TRANSITIONS map:
       - CREATED → PENDING_PAYMENT, CANCELLED
       - PENDING_PAYMENT → PAID, CANCELLED
       - PAID → CONFIRMED, REFUNDED
       - CONFIRMED → SHIPPED, CANCELLED
       - SHIPPED → DELIVERED
       - DELIVERED → REFUNDED
       - CANCELLED → (terminal)
       - REFUNDED → (terminal)
    4. **Transition Rules** — explain that OrderStatus.canTransitionTo() enforces the state machine, InvalidOrderStatusTransitionError is thrown on invalid transitions
    5. **Happy Path Flow** — walkthrough: Cart → CREATED → PENDING_PAYMENT → PAID → CONFIRMED → SHIPPED → DELIVERED with what triggers each transition
    6. **Failure/Compensation Paths** — cancellation and refund scenarios
    7. **Domain Events per Transition** — table mapping each transition to its emitted domain event

    Use the actual code from order-status.vo.ts and order.entity.ts as the source of truth.
    DO NOT invent statuses or transitions that don't exist in the code.
  </action>
  <verify>Check that the file has all 8 statuses, mermaid state diagram matching VALID_TRANSITIONS, and happy/failure paths documented.</verify>
  <done>order-lifecycle.md has complete state machine with 8 statuses, mermaid diagram, happy path, failure paths, and event mapping.</done>
</task>

<task type="auto">
  <name>Create docs/order-api-flow.md</name>
  <files>apps/order-service/docs/order-api-flow.md</files>
  <action>
    Create a new file documenting the API endpoints and their request flows.

    Include:
    1. **Overview** — how the API layer works in Clean Architecture (thin controller → handler → domain → repository → event publishing)
    2. **Endpoints** — detailed documentation for each of the 7 endpoints:
       - POST /orders — create order (request body with userId and items[], response with orderId)
       - GET /orders/:id — get order by ID
       - GET /orders/user/:userId — get orders by user
       - PATCH /orders/:id/ship — ship order (request body with trackingNumber)
       - PATCH /orders/:id/deliver — mark order delivered
       - PATCH /orders/:id/cancel — cancel order (request body with reason)
       - PATCH /orders/:id/refund — refund order (request body with reason)
    3. **Request Flow Diagram** — mermaid sequence diagram showing: Client → Controller → Handler → Domain Entity → Repository → Outbox → Kafka
    4. **Validation** — explain ValidationPipe, class-validator DTOs, whitelist: true, transform: true
    5. **Error Handling** — DomainExceptionFilter, InvalidOrderStatusTransitionError → 400, InvalidOrderOperationError → 400
    6. **Request/Response Examples** — JSON examples for POST /orders request body and response

    Use the actual code from order.controller.ts and dto/ files as the source of truth.
  </action>
  <verify>Check that all 7 endpoints are documented, mermaid sequence diagram exists, and request/response examples are included.</verify>
  <done>order-api-flow.md has all 7 endpoints documented, mermaid sequence diagram, validation explanation, error handling, and JSON examples.</done>
</task>

## Success Criteria
- [ ] docs/order-lifecycle.md created with complete state machine and mermaid diagram
- [ ] docs/order-api-flow.md created with all 7 endpoints and request flow diagram
- [ ] Both files are accurate to the actual codebase (no invented endpoints or statuses)
- [ ] Both files are clear enough for a new engineer to understand
