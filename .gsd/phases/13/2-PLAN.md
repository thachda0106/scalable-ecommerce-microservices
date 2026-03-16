---
phase: 13
plan: 2
wave: 1
---

# Plan 13.2: Domain Ports (Repository & Service Interfaces)

## Objective
Define the port interfaces that the domain layer requires but does NOT implement.
These are contracts fulfilled by the infrastructure layer (Dependency Inversion Principle).

## Context
- .gsd/SPEC.md
- apps/order-service/src/domain/entities/ (from Plan 13.1)
- apps/inventory-service/src/domain/ports/ (established pattern)
- apps/cart-service/src/domain/repositories/ (established pattern)

## Tasks

<task type="auto">
  <name>Create Repository Port Interfaces</name>
  <files>
    apps/order-service/src/domain/ports/order-repository.port.ts
    apps/order-service/src/domain/ports/processed-event-repository.port.ts
    apps/order-service/src/domain/ports/index.ts
  </files>
  <action>
    **IOrderRepository** interface:
    - `save(order: Order): Promise<void>` — persist or update order aggregate
    - `findById(id: OrderId): Promise<Order | null>` — reconstitute full aggregate with items
    - `findByUserId(userId: UserId): Promise<Order[]>` — find all orders for a user
    - `findByStatus(status: OrderStatus): Promise<Order[]>` — find orders by status
    - `nextId(): OrderId` — generate new unique OrderId

    **IProcessedEventRepository** interface (for idempotency):
    - `exists(eventId: string): Promise<boolean>` — check if event already processed
    - `markProcessed(eventId: string, eventType: string): Promise<void>` — record event as processed

    Use injection token constants:
    - `ORDER_REPOSITORY = 'ORDER_REPOSITORY'`
    - `PROCESSED_EVENT_REPOSITORY = 'PROCESSED_EVENT_REPOSITORY'`

    No @nestjs imports — interfaces only with string token constants.
    Barrel export from index.ts.
  </action>
  <verify>grep -r "@nestjs" apps/order-service/src/domain/ | wc -l → 0</verify>
  <done>2 repository port interfaces defined with injection tokens. Domain layer complete — entities, VOs, events, errors, ports all framework-independent.</done>
</task>

<task type="auto">
  <name>Create Application Port Interfaces</name>
  <files>
    apps/order-service/src/application/ports/event-publisher.port.ts
    apps/order-service/src/application/ports/inventory-service.port.ts
    apps/order-service/src/application/ports/payment-service.port.ts
    apps/order-service/src/application/ports/index.ts
  </files>
  <action>
    **IEventPublisher** interface:
    - `publish(event: DomainEvent): Promise<void>` — publish a single domain event to Kafka
    - `publishAll(events: DomainEvent[]): Promise<void>` — publish batch of domain events

    **IInventoryService** interface (anti-corruption layer):
    - `reserveInventory(orderId: string, items: { productId: string; quantity: number }[]): Promise<void>`
    - `releaseInventory(orderId: string): Promise<void>`

    **IPaymentService** interface (anti-corruption layer):
    - `requestPayment(orderId: string, amount: number, userId: string): Promise<void>`

    Use injection token constants:
    - `EVENT_PUBLISHER = 'EVENT_PUBLISHER'`
    - `INVENTORY_SERVICE = 'INVENTORY_SERVICE'`
    - `PAYMENT_SERVICE = 'PAYMENT_SERVICE'`

    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>3 application port interfaces created — event publisher, inventory service, payment service. Clean boundary between application and infrastructure.</done>
</task>

## Success Criteria
- [ ] IOrderRepository with 5 methods
- [ ] IProcessedEventRepository with 2 methods for idempotency
- [ ] IEventPublisher for Kafka domain event publishing
- [ ] IInventoryService and IPaymentService anti-corruption layer ports
- [ ] All interfaces use string injection tokens (no @Inject decorators in domain)
- [ ] Zero @nestjs imports in domain/ and application/ports/
