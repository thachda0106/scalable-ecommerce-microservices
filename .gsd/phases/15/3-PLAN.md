---
phase: 15
plan: 3
wave: 2
---

# Plan 15.3: Update Existing Docs & Create order-data-model.md

## Objective
Enhance the existing documentation files to match the quality level expected by the phase requirements. Create the missing `order-data-model.md` (required by the user spec) and update `order-service-architecture.md` and `order-events.md` to include mermaid diagrams and additional context. Rename `order-service-database.md` to `order-data-model.md` and expand it.

## Context
- apps/order-service/docs/order-service-architecture.md (existing: 79 lines, good but no mermaid diagrams)
- apps/order-service/docs/order-service-events.md (existing: 45 lines, good but ASCII diagrams)
- apps/order-service/docs/order-service-database.md (existing: 65 lines, covers DB schema — to become order-data-model.md)
- apps/order-service/docs/order-service-saga.md (existing: 62 lines, good)
- apps/order-service/src/domain/entities/order.entity.ts (Order aggregate)
- apps/order-service/src/domain/entities/order-item.entity.ts (OrderItem entity)
- apps/order-service/src/domain/value-objects/ (OrderId, UserId, Money, OrderStatus)
- apps/order-service/src/domain/events/ (8 domain events)
- apps/order-service/src/infrastructure/persistence/entities/ (TypeORM entities)

## Tasks

<task type="auto">
  <name>Create docs/order-data-model.md</name>
  <files>apps/order-service/docs/order-data-model.md</files>
  <action>
    Create a comprehensive data model document that explains both the domain model and the database schema.

    Include:
    1. **Domain Model** section:
       - Order aggregate root — properties (id, userId, items, status, totalPrice, version, createdAt, updatedAt), factory methods (create, reconstitute), domain behaviors
       - OrderItem entity — properties (productId, productName, quantity, unitPrice, totalPrice)
       - Value Objects — OrderId (UUID), UserId (string), Money (integer cents + currency), OrderStatus (enum + state machine)
       - Domain events list
    2. **Database Schema** section (incorporate content from order-service-database.md):
       - orders table
       - order_items table
       - outbox_events table
       - processed_events table
    3. **Entity Relationship Diagram** — mermaid erDiagram showing orders, order_items, outbox_events, processed_events and their relationships
    4. **Domain ↔ ORM Mapping** — explain the mapper pattern: how domain Order/OrderItem maps to TypeORM OrderEntity/OrderItemEntity
    5. **Order Statuses** — table of all 8 statuses with descriptions
    6. **Relationships with Other Services** — how order data relates to cart-service, payment-service, inventory-service, notification-service (via events, not direct DB joins)

    DO NOT delete order-service-database.md — keep it as a reference but add a note pointing to order-data-model.md.
  </action>
  <verify>Check that order-data-model.md exists with domain model, DB schema, ER diagram, and service relationships.</verify>
  <done>order-data-model.md has complete domain model, DB schema, mermaid ER diagram, mapper explanation, and cross-service relationships.</done>
</task>

<task type="auto">
  <name>Enhance existing docs with mermaid diagrams</name>
  <files>
    apps/order-service/docs/order-service-architecture.md
    apps/order-service/docs/order-service-events.md
  </files>
  <action>
    Update the two existing docs:

    **order-service-architecture.md:**
    - Replace the ASCII layer diagram with a mermaid flowchart showing the 4 layers and dependency arrows
    - Add a mermaid component diagram showing modules within each layer
    - Add a section on event publishing (outbox pattern) with mermaid sequence diagram
    - Keep the existing Key Design Decisions table (it's good)

    **order-service-events.md:**
    - Replace the ASCII event flow diagram with a mermaid sequence diagram
    - Add event payload structure section with JSON examples for each of the 8 events
    - Add a section explaining which services consume each event (notification, inventory, payment)
    - Keep the existing tables (they're good)

    DO NOT change the meaning or accuracy of existing content, only enhance the presentation.
  </action>
  <verify>Check that both files now have mermaid diagrams and no ASCII art diagrams remain.</verify>
  <done>Both architecture and events docs enhanced with mermaid diagrams, event payloads, and consumer info.</done>
</task>

## Success Criteria
- [ ] docs/order-data-model.md created with domain model, DB schema, ER diagram
- [ ] docs/order-service-architecture.md enhanced with mermaid diagrams
- [ ] docs/order-service-events.md enhanced with mermaid diagrams and event payloads
- [ ] All documented information matches the actual codebase
- [ ] docs/ folder now contains all 5 required files: order-service-architecture.md, order-data-model.md, order-lifecycle.md, order-events.md, order-api-flow.md
