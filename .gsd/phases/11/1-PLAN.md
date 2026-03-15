---
phase: 11
plan: 1
wave: 1
depends_on: []
files_modified:
  - apps/inventory-service/src/domain/entities/product-inventory.ts
  - apps/inventory-service/src/domain/entities/stock-reservation.ts
  - apps/inventory-service/src/domain/entities/stock-movement.ts
  - apps/inventory-service/src/domain/value-objects/product-id.vo.ts
  - apps/inventory-service/src/domain/value-objects/quantity.vo.ts
  - apps/inventory-service/src/domain/value-objects/reservation-status.vo.ts
  - apps/inventory-service/src/domain/errors/insufficient-stock.error.ts
  - apps/inventory-service/src/domain/errors/reservation-not-found.error.ts
  - apps/inventory-service/src/domain/errors/stock-invariant-violation.error.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "ProductInventory enforces invariant: availableStock + reservedStock + soldStock = totalStock"
    - "ProductInventory.reserve() atomically decrements available and increments reserved, throws InsufficientStockError if available < quantity"
    - "ProductInventory.confirm() decrements reserved and increments sold"
    - "ProductInventory.release() decrements reserved and restores available"
    - "StockReservation has status state machine: ACTIVE → CONFIRMED | RELEASED | EXPIRED"
    - "Domain layer has zero NestJS or infrastructure imports"
    - "All entities produce domain events via pullEvents()"
  artifacts:
    - "apps/inventory-service/src/domain/entities/product-inventory.ts exists"
    - "apps/inventory-service/src/domain/entities/stock-reservation.ts exists"
    - "apps/inventory-service/src/domain/entities/stock-movement.ts exists"
    - "apps/inventory-service/src/domain/value-objects/product-id.vo.ts exists"
    - "apps/inventory-service/src/domain/value-objects/quantity.vo.ts exists"
    - "apps/inventory-service/src/domain/value-objects/reservation-status.vo.ts exists"
---

# Plan 11.1: Domain Layer — Entities, Value Objects & Errors

<objective>
Build the pure domain layer for the inventory-service with zero infrastructure dependencies.
This is the foundation all other plans depend on.

Purpose: Establish the ProductInventory aggregate root (with reserve/release/confirm/replenish business methods), StockReservation entity (with status state machine), StockMovement audit entity, value objects (ProductId, Quantity, ReservationStatus), and domain errors.
Output: 9 TypeScript files in src/domain/
</objective>

<context>
Load for context:
- apps/inventory-service/src/inventory/entities/stock.entity.ts  (current naive entity to understand existing fields)
- apps/inventory-service/src/inventory/inventory.service.ts  (current business logic — moving to domain)
- apps/cart-service/src/domain/entities/cart.entity.ts  (reference pattern for aggregate root)
- apps/cart-service/src/domain/value-objects/product-id.vo.ts  (reference pattern for VOs)
- .gsd/ARCHITECTURE.md  (Inventory domain model definition)
</context>

<tasks>

<task type="auto">
  <name>Create value objects and domain errors</name>
  <files>
    apps/inventory-service/src/domain/value-objects/product-id.vo.ts
    apps/inventory-service/src/domain/value-objects/quantity.vo.ts
    apps/inventory-service/src/domain/value-objects/reservation-status.vo.ts
    apps/inventory-service/src/domain/errors/insufficient-stock.error.ts
    apps/inventory-service/src/domain/errors/reservation-not-found.error.ts
    apps/inventory-service/src/domain/errors/stock-invariant-violation.error.ts
  </files>
  <action>
    **product-id.vo.ts** — reuse same pattern as cart-service:
    - Class `ProductId` with private `value: string`
    - Static `create(value: string): ProductId` — validates UUID v4 with regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`), throws `Error('Invalid productId: must be UUID v4')` if invalid
    - Getter `getValue(): string`
    - Method `equals(other: ProductId): boolean`

    **quantity.vo.ts** — inventory quantity (different range from cart):
    - Class `Quantity` with private `value: number`
    - Static `create(value: number): Quantity` — validates `Number.isInteger(value) && value >= 1 && value <= 1_000_000`, throws `Error('Invalid quantity: must be integer 1-1000000')` if invalid
    - Getter `getValue(): number`
    - Method `add(other: Quantity): Quantity` — returns new Quantity
    - Method `subtract(other: Quantity): Quantity` — returns new Quantity, throws if result < 0
    - Note: max is 1M because this is warehouse inventory, not cart quantity

    **reservation-status.vo.ts**:
    - Enum `ReservationStatus { ACTIVE = 'ACTIVE', CONFIRMED = 'CONFIRMED', RELEASED = 'RELEASED', EXPIRED = 'EXPIRED' }`
    - Export as both enum and type

    **insufficient-stock.error.ts**:
    ```ts
    export class InsufficientStockError extends Error {
      constructor(
        public readonly productId: string,
        public readonly requested: number,
        public readonly available: number,
      ) {
        super(`Insufficient stock for product ${productId}: requested ${requested}, available ${available}`);
        this.name = 'InsufficientStockError';
      }
    }
    ```

    **reservation-not-found.error.ts**:
    ```ts
    export class ReservationNotFoundError extends Error {
      constructor(public readonly referenceId: string, public readonly productId?: string) {
        super(`Reservation not found for reference ${referenceId}${productId ? ` product ${productId}` : ''}`);
        this.name = 'ReservationNotFoundError';
      }
    }
    ```

    **stock-invariant-violation.error.ts**:
    ```ts
    export class StockInvariantViolationError extends Error {
      constructor(public readonly productId: string, public readonly details: string) {
        super(`Stock invariant violation for product ${productId}: ${details}`);
        this.name = 'StockInvariantViolationError';
      }
    }
    ```

    AVOID NestJS imports. Pure TypeScript only.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "value-objects|errors" || echo "VOs and errors compile OK"</verify>
  <done>3 VO files and 3 error files exist. ProductId validates UUID v4. Quantity range is 1–1,000,000 with add/subtract methods. ReservationStatus enum has 4 states. All errors have descriptive messages with relevant context fields.</done>
</task>

<task type="auto">
  <name>Create StockReservation and StockMovement entities</name>
  <files>
    apps/inventory-service/src/domain/entities/stock-reservation.ts
    apps/inventory-service/src/domain/entities/stock-movement.ts
  </files>
  <action>
    **stock-reservation.ts**:
    - Class `StockReservation` with private constructor
    - Properties: `id: string`, `productId: string`, `referenceId: string`, `referenceType: 'CART' | 'ORDER'`, `quantity: number`, `status: ReservationStatus`, `expiresAt: Date`, `idempotencyKey: string`, `createdAt: Date`, `updatedAt: Date`
    - Static `create(props: { productId: string, referenceId: string, referenceType: 'CART' | 'ORDER', quantity: number, ttlMinutes: number, idempotencyKey: string }): StockReservation`:
      - Generates UUID id via `crypto.randomUUID()`
      - Sets status = `ACTIVE`, expiresAt = now + ttlMinutes
    - Static `reconstitute(props: all fields): StockReservation` — for loading from DB without triggering events
    - Method `confirm(): void` — sets status to CONFIRMED if currently ACTIVE, throws if not ACTIVE
    - Method `release(): void` — sets status to RELEASED if currently ACTIVE, throws if not ACTIVE
    - Method `expire(): void` — sets status to EXPIRED if currently ACTIVE, throws if not ACTIVE
    - Method `isExpired(): boolean` — returns `this.status === 'ACTIVE' && new Date() > this.expiresAt`
    - Method `isActive(): boolean`
    - Getters for all properties
    - NO NestJS imports

    **stock-movement.ts** — immutable audit log entity:
    - Class `StockMovement` with private constructor
    - Properties: `id: string`, `productId: string`, `movementType: MovementType`, `quantity: number`, `referenceId: string`, `previousAvailable: number`, `newAvailable: number`, `previousReserved: number`, `newReserved: number`, `reason: string`, `performedBy: string`, `correlationId: string`, `createdAt: Date`
    - Enum `MovementType { RESERVE, RELEASE, CONFIRM, REPLENISH, EXPIRE, ADJUSTMENT }`
    - Static `create(props): StockMovement` — generates UUID, sets createdAt = now
    - All properties are readonly (immutable after creation)
    - Method `toJSON()` returning all fields as a plain object
    - NO NestJS imports
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "stock-reservation|stock-movement" || echo "Entity files compile OK"</verify>
  <done>StockReservation has create/reconstitute factories and confirm/release/expire state transitions (throws if not ACTIVE). StockMovement is fully immutable. Both use crypto.randomUUID() for IDs. Zero NestJS imports.</done>
</task>

<task type="auto">
  <name>Create ProductInventory aggregate root with domain events</name>
  <files>
    apps/inventory-service/src/domain/entities/product-inventory.ts
    apps/inventory-service/src/domain/events/base-domain.event.ts
    apps/inventory-service/src/domain/events/stock-reserved.event.ts
    apps/inventory-service/src/domain/events/stock-released.event.ts
    apps/inventory-service/src/domain/events/stock-confirmed.event.ts
    apps/inventory-service/src/domain/events/low-stock-detected.event.ts
  </files>
  <action>
    Create a shared base event at `domain/events/base-domain.event.ts`:
    ```ts
    export abstract class BaseDomainEvent {
      public readonly occurredOn: Date = new Date();
      public abstract readonly eventType: string;
    }
    ```

    Create domain events (each extends BaseDomainEvent, NO NestJS imports):

    **stock-reserved.event.ts**: eventType = 'inventory.reserved', fields: productId, quantity, reservationId, referenceId, referenceType, availableStock
    **stock-released.event.ts**: eventType = 'inventory.released', fields: productId, quantity, reservationId, referenceId, reason, availableStock
    **stock-confirmed.event.ts**: eventType = 'inventory.confirmed', fields: productId, quantity, reservationId, referenceId, availableStock, soldStock
    **low-stock-detected.event.ts**: eventType = 'inventory.low_stock', fields: productId, availableStock, threshold

    **product-inventory.ts** — THE aggregate root:
    - Class `ProductInventory` with private constructor
    - Properties: `productId: string`, `sku: string`, `availableStock: number`, `reservedStock: number`, `soldStock: number`, `totalStock: number`, `lowStockThreshold: number`, `version: number`, `createdAt: Date`, `updatedAt: Date`
    - Private `domainEvents: BaseDomainEvent[] = []`

    - Static `create(props: { productId: string, sku: string, initialStock: number, lowStockThreshold?: number }): ProductInventory`:
      - Sets availableStock = initialStock, reservedStock = 0, soldStock = 0, totalStock = initialStock, version = 1

    - Static `reconstitute(props: all fields): ProductInventory` — for loading from DB

    - Method `reserve(quantity: number, reservationId: string, referenceId: string, referenceType: 'CART' | 'ORDER'): void`:
      - If `availableStock < quantity` → throw `InsufficientStockError(productId, quantity, availableStock)`
      - `availableStock -= quantity`
      - `reservedStock += quantity`
      - `updatedAt = new Date()`
      - `validateInvariant()` — throws StockInvariantViolationError if invariant broken
      - Push `StockReservedEvent` to domainEvents
      - If `availableStock <= lowStockThreshold` → push `LowStockDetectedEvent`

    - Method `release(quantity: number, reservationId: string, referenceId: string, reason: string): void`:
      - If `reservedStock < quantity` → throw error
      - `reservedStock -= quantity`
      - `availableStock += quantity`
      - `updatedAt = new Date()`
      - `validateInvariant()`
      - Push `StockReleasedEvent`

    - Method `confirm(quantity: number, reservationId: string, referenceId: string): void`:
      - If `reservedStock < quantity` → throw error
      - `reservedStock -= quantity`
      - `soldStock += quantity`
      - `updatedAt = new Date()`
      - `validateInvariant()`
      - Push `StockConfirmedEvent`

    - Method `replenish(quantity: number): void`:
      - `availableStock += quantity`
      - `totalStock += quantity`
      - `updatedAt = new Date()`
      - `validateInvariant()`
      - If `availableStock > lowStockThreshold` → (low stock resolved, no event needed)

    - Private `validateInvariant(): void`:
      - If `availableStock + reservedStock + soldStock !== totalStock` → throw `StockInvariantViolationError`

    - Method `pullEvents(): BaseDomainEvent[]` — returns copy and clears array
    - Method `toJSON()` — all fields as plain object
    - Getters for all properties

    CRITICAL: The reserve() method is the core oversell prevention — it checks `availableStock < quantity` BEFORE mutating. Combined with OCC in the repository layer, this makes overselling impossible.

    AVOID importing NestJS. Use only domain imports and Node built-ins.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "product-inventory|events" || echo "Aggregate and events compile OK"</verify>
  <done>ProductInventory aggregate enforces stock invariant on every mutation. reserve() throws InsufficientStockError. confirm()/release() throw if reserved < quantity. pullEvents() returns domain events. 4 event classes exist. All domain code is framework-free.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` from inventory-service root shows zero errors for domain files
- [ ] No `@nestjs` import appears in any file under `src/domain/`
- [ ] `ProductInventory.reserve()` with quantity > availableStock throws InsufficientStockError
- [ ] `ProductInventory.reserve()` and confirm()/release() maintain invariant: available + reserved + sold = total
- [ ] `StockReservation.confirm()` on non-ACTIVE reservation throws
- [ ] `Quantity.create(0)` throws, `Quantity.create(1)` succeeds
</verification>

<success_criteria>
- [ ] 9+ domain files created (3 entities, 3 VOs, 4 events + base, 3 errors)
- [ ] Domain layer is infrastructure-free (grep confirms no `@nestjs` import)
- [ ] TypeScript compiles without errors in domain/
- [ ] Stock invariant enforced on every mutation method
</success_criteria>
