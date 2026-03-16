---
phase: 13
plan: 5
wave: 2
---

# Plan 13.5: Infrastructure — Database Persistence Layer

## Objective
Implement TypeORM persistence for the Order aggregate. This includes TypeORM entities
(separate from domain entities), mappers to convert between domain and persistence models,
and concrete repository implementations fulfilling domain port contracts.

## Context
- .gsd/SPEC.md
- apps/order-service/src/domain/entities/ (domain models)
- apps/order-service/src/domain/ports/ (repository interfaces)
- apps/order-service/src/orders/entities/order.entity.ts (current entity — will be replaced)
- apps/inventory-service/src/infrastructure/persistence/ (established pattern)
- apps/cart-service/src/infrastructure/persistence/ (established pattern)

## Tasks

<task type="auto">
  <name>Create TypeORM Entities and Migration Schema</name>
  <files>
    apps/order-service/src/infrastructure/persistence/entities/order.orm-entity.ts
    apps/order-service/src/infrastructure/persistence/entities/order-item.orm-entity.ts
    apps/order-service/src/infrastructure/persistence/entities/processed-event.orm-entity.ts
    apps/order-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts
    apps/order-service/src/infrastructure/persistence/entities/index.ts
  </files>
  <action>
    **OrderOrmEntity** (table: 'orders'):
    - id: uuid PK
    - userId: varchar, indexed
    - status: varchar (enum string), indexed
    - totalAmount: decimal(12,2) — store in cents as integer or as decimal
    - currency: varchar(3), default 'USD'
    - createdAt: timestamp with time zone, indexed
    - updatedAt: timestamp with time zone
    - version: integer (for optimistic locking)
    - One-to-many relation to OrderItemOrmEntity

    **OrderItemOrmEntity** (table: 'order_items'):
    - id: uuid PK
    - orderId: uuid FK → orders.id, indexed
    - productId: varchar
    - productName: varchar
    - quantity: integer
    - unitPrice: decimal(12,2)
    - currency: varchar(3), default 'USD'
    - Many-to-one relation to OrderOrmEntity

    **ProcessedEventOrmEntity** (table: 'processed_events'):
    - eventId: varchar PK
    - eventType: varchar
    - processedAt: timestamp, default now()

    **OutboxEventOrmEntity** (table: 'outbox_events') — keep existing outbox pattern:
    - id: uuid PK
    - type: varchar
    - payload: jsonb
    - processed: boolean, default false
    - createdAt: timestamp

    Add indexes:
    - orders: (userId), (status), (createdAt), (userId, status) composite
    - order_items: (orderId), (productId)
    - processed_events: (eventId)

    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 TypeORM entities created with proper indexes. Schema supports orders, items, idempotency, and outbox.</done>
</task>

<task type="auto">
  <name>Create Mappers and Repository Implementations</name>
  <files>
    apps/order-service/src/infrastructure/persistence/mappers/order.mapper.ts
    apps/order-service/src/infrastructure/persistence/mappers/index.ts
    apps/order-service/src/infrastructure/persistence/repositories/typeorm-order.repository.ts
    apps/order-service/src/infrastructure/persistence/repositories/typeorm-processed-event.repository.ts
    apps/order-service/src/infrastructure/persistence/repositories/index.ts
  </files>
  <action>
    **OrderMapper** — static methods:
    - `toDomain(orm: OrderOrmEntity): Order` — reconstitute Order aggregate from ORM entity + items
    - `toPersistence(domain: Order): OrderOrmEntity` — flatten aggregate to ORM entity
    - `itemToDomain(orm: OrderItemOrmEntity): OrderItem`
    - `itemToPersistence(domain: OrderItem, orderId: string): OrderItemOrmEntity`
    Must handle Money VO → decimal conversion and OrderStatus VO → string conversion.

    **TypeOrmOrderRepository** implements IOrderRepository:
    - Inject TypeORM Repository<OrderOrmEntity> and Repository<OrderItemOrmEntity>
    - `save()`: map domain → ORM, save order + items in transaction (upsert pattern)
    - `findById()`: load order with items (eager/join), map ORM → domain
    - `findByUserId()`: query by userId, map results
    - `findByStatus()`: query by status string, map results
    - `nextId()`: generate UUID, wrap in OrderId VO

    **TypeOrmProcessedEventRepository** implements IProcessedEventRepository:
    - `exists()`: check by eventId
    - `markProcessed()`: insert row with eventId, eventType, current timestamp

    Barrel exports from index.ts files.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>OrderMapper for domain↔ORM conversion. TypeOrmOrderRepository and TypeOrmProcessedEventRepository implementing domain ports with proper transaction handling.</done>
</task>

## Success Criteria
- [ ] 4 TypeORM entities with proper column types and indexes
- [ ] OrderMapper handles bidirectional domain↔ORM conversion
- [ ] TypeOrmOrderRepository implements IOrderRepository (5 methods)
- [ ] TypeOrmProcessedEventRepository implements IProcessedEventRepository (2 methods)
- [ ] Composite index on (userId, status) for common query pattern
- [ ] `npx tsc --noEmit` passes
