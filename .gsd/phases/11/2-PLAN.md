---
phase: 11
plan: 2
wave: 1
depends_on: [1]
files_modified:
  - apps/inventory-service/src/domain/ports/inventory-repository.port.ts
  - apps/inventory-service/src/domain/ports/stock-cache.port.ts
  - apps/inventory-service/src/application/ports/event-publisher.port.ts
  - apps/inventory-service/src/application/commands/reserve-stock.command.ts
  - apps/inventory-service/src/application/commands/release-stock.command.ts
  - apps/inventory-service/src/application/commands/confirm-stock.command.ts
  - apps/inventory-service/src/application/commands/replenish-stock.command.ts
  - apps/inventory-service/src/application/queries/get-inventory.query.ts
  - apps/inventory-service/src/application/handlers/reserve-stock.handler.ts
  - apps/inventory-service/src/application/handlers/release-stock.handler.ts
  - apps/inventory-service/src/application/handlers/confirm-stock.handler.ts
  - apps/inventory-service/src/application/handlers/replenish-stock.handler.ts
  - apps/inventory-service/src/application/handlers/get-inventory.handler.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "All business logic lives in handlers calling domain methods, not controllers"
    - "Handlers depend only on port interfaces, not concrete Redis/Kafka/TypeORM classes"
    - "GetInventoryHandler checks cache before hitting repository"
    - "ReserveStockHandler checks idempotency, acquires lock, retries OCC conflicts up to 3 times"
    - "All command handlers create StockMovement audit records"
    - "Ports are interfaces with Symbol injection tokens — no concrete implementations"
  artifacts:
    - "apps/inventory-service/src/domain/ports/inventory-repository.port.ts defines IInventoryRepository"
    - "apps/inventory-service/src/domain/ports/stock-cache.port.ts defines IStockCache"
    - "apps/inventory-service/src/application/ports/event-publisher.port.ts defines IEventPublisher"
    - "All 5 handlers implement ICommandHandler or IQueryHandler from @nestjs/cqrs"
---

# Plan 11.2: Application Layer — CQRS Commands, Queries, Ports & Handlers

<objective>
Implement the CQRS application layer: port interfaces, commands, queries, and handlers.
Handlers contain all orchestration logic (idempotency checks, lock acquisition, OCC retry, domain method calls, audit logging, event publishing) and depend only on port abstractions.

Purpose: Controllers will be thin wrappers calling CommandBus/QueryBus. All logic lives here.
Output: 3 ports, 4 commands, 1 query, 5 handlers.
</objective>

<context>
Load for context:
- apps/inventory-service/src/domain/entities/product-inventory.ts  (aggregate root, Plan 11.1 output)
- apps/inventory-service/src/domain/entities/stock-reservation.ts
- apps/inventory-service/src/domain/entities/stock-movement.ts
- apps/inventory-service/src/domain/errors/insufficient-stock.error.ts
- apps/cart-service/src/application/handlers/add-item.handler.ts  (reference for handler pattern)
- apps/cart-service/src/application/ports/cart-repository.port.ts  (reference for port pattern)
- .gsd/ARCHITECTURE.md
</context>

<tasks>

<task type="auto">
  <name>Define port interfaces (IInventoryRepository, IStockCache, IEventPublisher)</name>
  <files>
    apps/inventory-service/src/domain/ports/inventory-repository.port.ts
    apps/inventory-service/src/domain/ports/stock-cache.port.ts
    apps/inventory-service/src/application/ports/event-publisher.port.ts
  </files>
  <action>
    **inventory-repository.port.ts**:
    ```ts
    import { ProductInventory } from '../entities/product-inventory';
    import { StockReservation } from '../entities/stock-reservation';
    import { StockMovement } from '../entities/stock-movement';

    export const INVENTORY_REPOSITORY = Symbol('INVENTORY_REPOSITORY');

    export interface IInventoryRepository {
      findByProductId(productId: string): Promise<ProductInventory | null>;
      save(inventory: ProductInventory): Promise<void>;
      saveWithReservationAndMovement(
        inventory: ProductInventory,
        reservation: StockReservation,
        movement: StockMovement,
      ): Promise<void>;
      saveWithMovement(
        inventory: ProductInventory,
        movement: StockMovement,
      ): Promise<void>;
      findReservationsByReference(referenceId: string, referenceType: string): Promise<StockReservation[]>;
      findActiveReservation(referenceId: string, productId: string): Promise<StockReservation | null>;
      findExpiredReservations(limit: number): Promise<StockReservation[]>;
      saveReservation(reservation: StockReservation): Promise<void>;
      checkIdempotencyKey(key: string): Promise<boolean>;
      saveIdempotencyKey(key: string): Promise<void>;
    }
    ```
    NOTE: `saveWithReservationAndMovement` wraps inventory update + reservation insert + movement insert in a SINGLE DB transaction. This is critical for atomicity.

    **stock-cache.port.ts**:
    ```ts
    import { ProductInventory } from '../entities/product-inventory';

    export const STOCK_CACHE = Symbol('STOCK_CACHE');

    export interface IStockCache {
      get(productId: string): Promise<ProductInventory | null>;
      set(productId: string, inventory: ProductInventory): Promise<void>;
      invalidate(productId: string): Promise<void>;
      acquireLock(productId: string, requestId: string, ttlMs?: number): Promise<boolean>;
      releaseLock(productId: string, requestId: string): Promise<void>;
    }
    ```
    NOTE: Lock acquisition and release are part of the cache port because Redis handles both caching and distributed locking.

    **event-publisher.port.ts**:
    ```ts
    import { BaseDomainEvent } from '../../domain/events/base-domain.event';

    export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

    export interface IEventPublisher {
      publish(event: BaseDomainEvent): Promise<void>;
      publishBatch(events: BaseDomainEvent[]): Promise<void>;
    }
    ```

    AVOID making ports concrete classes. They are interfaces with Symbol tokens only.
    AVOID NestJS decorators in port files.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "port" || echo "Ports compile OK"</verify>
  <done>3 port files exist. IInventoryRepository has atomic save methods for transactional writes. IStockCache includes lock acquisition. IEventPublisher supports batch publishing. Each exports a Symbol token and an interface. No concrete implementations.</done>
</task>

<task type="auto">
  <name>Create commands, queries and all 5 handlers</name>
  <files>
    apps/inventory-service/src/application/commands/reserve-stock.command.ts
    apps/inventory-service/src/application/commands/release-stock.command.ts
    apps/inventory-service/src/application/commands/confirm-stock.command.ts
    apps/inventory-service/src/application/commands/replenish-stock.command.ts
    apps/inventory-service/src/application/queries/get-inventory.query.ts
    apps/inventory-service/src/application/handlers/reserve-stock.handler.ts
    apps/inventory-service/src/application/handlers/release-stock.handler.ts
    apps/inventory-service/src/application/handlers/confirm-stock.handler.ts
    apps/inventory-service/src/application/handlers/replenish-stock.handler.ts
    apps/inventory-service/src/application/handlers/get-inventory.handler.ts
  </files>
  <action>
    **Commands** (plain TS classes, no decorators):
    - `ReserveStockCommand`: constructor(public items: { productId: string; quantity: number }[], public referenceId: string, public referenceType: 'CART' | 'ORDER', public idempotencyKey: string, public ttlMinutes: number = 15, public correlationId?: string)
    - `ReleaseStockCommand`: constructor(public referenceId: string, public referenceType: 'CART' | 'ORDER', public productIds?: string[], public idempotencyKey: string, public reason: string = 'manual', public correlationId?: string)
    - `ConfirmStockCommand`: constructor(public referenceId: string, public referenceType: 'ORDER', public idempotencyKey: string, public correlationId?: string)
    - `ReplenishStockCommand`: constructor(public items: { productId: string; quantity: number; reason: string }[], public performedBy: string, public idempotencyKey: string, public correlationId?: string)

    **Query:**
    - `GetInventoryQuery`: constructor(public productId: string)

    **ReserveStockHandler** (`@CommandHandler(ReserveStockCommand)`):
    - Inject via `@Inject(INVENTORY_REPOSITORY) private repo: IInventoryRepository`, `@Inject(STOCK_CACHE) private cache: IStockCache`, `@Inject(EVENT_PUBLISHER) private publisher: IEventPublisher`
    - `execute(cmd: ReserveStockCommand)`:
      1. **Idempotency check**: `if (await this.repo.checkIdempotencyKey(cmd.idempotencyKey)) return previousResult;`
      2. **For each item** in `cmd.items`:
         a. Generate `requestId = crypto.randomUUID()`
         b. **Acquire lock**: `await this.cache.acquireLock(item.productId, requestId)` — throw ConflictException if fails
         c. **Load inventory**: `await this.repo.findByProductId(item.productId)` — throw NotFoundException if null
         d. **Create reservation**: `StockReservation.create({ productId, referenceId, referenceType, quantity, ttlMinutes, idempotencyKey })`
         e. **Domain mutation**: `inventory.reserve(quantity, reservation.id, referenceId, referenceType)`
         f. **Create movement**: `StockMovement.create({ productId, movementType: RESERVE, quantity, referenceId: reservation.id, previousAvailable, newAvailable, previousReserved, newReserved, reason: 'stock_reservation', correlationId })`
         g. **Atomic save**: `await this.repo.saveWithReservationAndMovement(inventory, reservation, movement)`
         h. **Invalidate cache**: `await this.cache.invalidate(item.productId)`
         i. **Release lock**: `await this.cache.releaseLock(item.productId, requestId)` in finally block
      3. **Publish events**: `await this.publisher.publishBatch(allEvents)` — pull from all inventory aggregates
      4. **Save idempotency key**: `await this.repo.saveIdempotencyKey(cmd.idempotencyKey)`
      5. If ANY item fails with InsufficientStockError → rollback ALL previous reservations in this batch (compensate), then return failure response with `failedItems`

    **ReleaseStockHandler** (`@CommandHandler(ReleaseStockCommand)`):
    - Idempotency check first
    - Find all ACTIVE reservations for `referenceId` (optionally filtered by productIds)
    - For each reservation: load inventory → call `inventory.release(qty, reservationId, referenceId, reason)` → `reservation.release()` → create StockMovement → atomic save → invalidate cache
    - Publish events, save idempotency key

    **ConfirmStockHandler** (`@CommandHandler(ConfirmStockCommand)`):
    - Idempotency check first
    - Find all ACTIVE reservations for `referenceId`
    - For each: load inventory → call `inventory.confirm(qty, reservationId, referenceId)` → `reservation.confirm()` → create StockMovement(CONFIRM) → atomic save → invalidate cache
    - Publish events, save idempotency key

    **ReplenishStockHandler** (`@CommandHandler(ReplenishStockCommand)`):
    - Idempotency check first
    - For each item: load inventory (create new ProductInventory if not found) → call `inventory.replenish(quantity)` → create StockMovement(REPLENISH) → save → invalidate cache
    - Publish events, save idempotency key

    **GetInventoryHandler** (`@QueryHandler(GetInventoryQuery)`):
    - Inject `STOCK_CACHE` and `INVENTORY_REPOSITORY`
    - `execute(query)`:
      1. Cache lookup: `const cached = await this.cache.get(query.productId)` — if found, return `cached.toJSON()`
      2. Cache miss: load from repo. If null, throw NotFoundException
      3. Warm cache: `await this.cache.set(query.productId, inventory)`
      4. Return `inventory.toJSON()`

    AVOID importing Redis, Kafka, or TypeORM directly in any handler. Use only the port interfaces via @Inject.
    AVOID putting business rule validation in handlers — that lives in the domain entity methods.
    AVOID throwing in event publishing — wrap in try/catch, log warning but don't fail the operation.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "handler|command|query" || echo "Application layer compiles OK"</verify>
  <done>5 handlers implement @CommandHandler/@QueryHandler. ReserveStockHandler has idempotency + lock + OCC + batch support. GetInventoryHandler checks cache first. All handlers use port interfaces. Every mutation creates a StockMovement audit record. All handlers handle idempotency via idempotencyKey.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for application/ files
- [ ] No direct Redis, Kafka, or TypeORM import appears in any handler file (grep confirms)
- [ ] ReserveStockHandler implements idempotency check as first step
- [ ] ReserveStockHandler acquires lock before DB operations
- [ ] All mutation handlers create StockMovement audit records
- [ ] GetInventoryHandler uses both STOCK_CACHE and INVENTORY_REPOSITORY injection tokens
</verification>

<success_criteria>
- [ ] 3 ports, 4 commands, 1 query, and 5 handlers created
- [ ] Handlers inject ports by Symbol, not concrete classes
- [ ] TypeScript compiles without errors
- [ ] Every mutation path creates audit movement records
</success_criteria>
