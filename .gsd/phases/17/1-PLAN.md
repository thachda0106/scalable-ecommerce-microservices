---
phase: 17
plan: 1
wave: 1
---

# Plan 17.1: Product Domain Layer — Aggregate Root, Value Objects, Events & Errors

## Objective
Create the Product aggregate root with rich domain model following DDD.
This is the foundation — all business rules, status transitions, and domain events originate here.
The domain layer MUST have zero `@nestjs` imports to guarantee framework independence.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md (Phase 17 description)
- .gsd/phases/17/RESEARCH.md (domain model design, status state machine)
- apps/product-service/src/products/entities/product.entity.ts (current flat entity — will be replaced)
- apps/order-service/src/domain/ (established DDD pattern to follow)
- apps/cart-service/src/domain/ (established DDD pattern to follow)

## Tasks

<task type="auto">
  <name>Create Value Objects (ProductId, Money, ProductStatus)</name>
  <files>
    apps/product-service/src/domain/value-objects/product-id.vo.ts
    apps/product-service/src/domain/value-objects/money.vo.ts
    apps/product-service/src/domain/value-objects/product-status.vo.ts
    apps/product-service/src/domain/value-objects/index.ts
  </files>
  <action>
    Create immutable value objects following the order-service pattern:

    **ProductId** — wraps UUID string, static `create(id: string)` and `generate()`, provides `equals()` and `toString()`. Private constructor.

    **Money** — wraps amountInCents (number) and currency (string, default 'USD'). Provides `add()`, `multiply()`, `equals()`, `isPositive()`, `toDecimal()`, `static fromDecimal(amount, currency)`, `static fromCents(cents, currency)`, `static zero(currency)`. Uses integer cents internally to avoid floating-point issues. Follow the exact same pattern as `apps/order-service/src/domain/value-objects/money.vo.ts`.

    **ProductStatus** — Value object wrapping `ProductStatusEnum`:
      Enum values: ACTIVE, INACTIVE, OUT_OF_STOCK, ARCHIVED
      Valid transitions:
        ACTIVE → INACTIVE, OUT_OF_STOCK, ARCHIVED
        INACTIVE → ACTIVE, ARCHIVED
        OUT_OF_STOCK → ACTIVE, ARCHIVED
        ARCHIVED → (terminal, no transitions out)
      Provides: `canTransitionTo(target)`, `transitionTo(target)`, `isTerminal()`, `equals()`, `toString()`
      Static factories: `create(value)`, `active()` (default)

    Barrel export from index.ts.
    NO @nestjs imports anywhere in domain/.
  </action>
  <verify>grep -r "@nestjs" apps/product-service/src/domain/ | wc -l → 0</verify>
  <done>3 value objects created with validation, immutability, and equality semantics. ProductStatus has full lifecycle transition rules with ARCHIVED as terminal state.</done>
</task>

<task type="auto">
  <name>Create Product Aggregate Root</name>
  <files>
    apps/product-service/src/domain/entities/product.entity.ts
    apps/product-service/src/domain/entities/index.ts
  </files>
  <action>
    **Product** aggregate root:
    - Private fields: _id (ProductId), _name (string), _description (string), _price (Money), _categoryId (string), _status (ProductStatus), _version (number), _createdAt (Date), _updatedAt (Date), _domainEvents (BaseDomainEvent[])
    - Private constructor — use static factories
    - `static create(props: CreateProductProps)` — validates name non-empty, price positive; sets status = ACTIVE, version = 1; raises ProductCreatedEvent
    - `static reconstitute(props: ReconstituteProductProps)` — rebuilds from persistence (no events raised)
    - Domain behaviors:
      - `updateDetails(props: { name?, description?, price?, categoryId? })` — only allowed when not ARCHIVED; raises ProductUpdatedEvent
      - `activate()` → transitions to ACTIVE; raises ProductUpdatedEvent
      - `deactivate()` → transitions to INACTIVE; raises ProductUpdatedEvent
      - `markOutOfStock()` → transitions to OUT_OF_STOCK; raises ProductStockUpdatedEvent
      - `archive()` → transitions to ARCHIVED; raises ProductUpdatedEvent
      - `restock()` → transitions OUT_OF_STOCK → ACTIVE; raises ProductStockUpdatedEvent
    - `pullDomainEvents()` — returns and clears domain events array
    - `toJSON()` — serialize to plain object
    - All getters for private fields (readonly access)

    All state transitions MUST go through ProductStatus.canTransitionTo() — throw DomainException if invalid.

    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Product aggregate root created. All business rules enforced in domain. Status transitions validated. Domain events raised on every state change.</done>
</task>

<task type="auto">
  <name>Create Domain Events, Errors, and Ports</name>
  <files>
    apps/product-service/src/domain/events/base-domain.event.ts
    apps/product-service/src/domain/events/product-created.event.ts
    apps/product-service/src/domain/events/product-updated.event.ts
    apps/product-service/src/domain/events/product-deleted.event.ts
    apps/product-service/src/domain/events/product-stock-updated.event.ts
    apps/product-service/src/domain/events/index.ts
    apps/product-service/src/domain/errors/domain-exception.ts
    apps/product-service/src/domain/errors/invalid-product-status-transition.error.ts
    apps/product-service/src/domain/errors/invalid-product-operation.error.ts
    apps/product-service/src/domain/errors/product-not-found.error.ts
    apps/product-service/src/domain/errors/index.ts
    apps/product-service/src/domain/ports/product-repository.port.ts
    apps/product-service/src/domain/ports/index.ts
  </files>
  <action>
    **BaseDomainEvent** abstract class:
    - Same pattern as apps/order-service/src/domain/events/base-domain.event.ts
    - Properties: `occurredOn: Date` (default new Date()), abstract `eventType: string`

    **Concrete events** — each extends BaseDomainEvent:
    - ProductCreatedEvent → eventType: 'product.created' (includes productId, name, price, currency, categoryId, status)
    - ProductUpdatedEvent → eventType: 'product.updated' (includes productId, name, price, currency, categoryId, status)
    - ProductDeletedEvent → eventType: 'product.deleted' (includes productId)
    - ProductStockUpdatedEvent → eventType: 'product.stock.updated' (includes productId, status)

    **Domain errors:**
    - DomainException (base) — extends Error, includes `code: string`
    - InvalidProductStatusTransitionError — includes from/to status
    - InvalidProductOperationError — for operations on archived products
    - ProductNotFoundError — for lookup failures

    **Repository port** — IProductRepository interface:
    - `save(product: Product): Promise<void>`
    - `findById(id: ProductId): Promise<Product | null>`
    - `findAll(query: ProductQuery): Promise<PaginatedResult<Product>>`
    - `findByCategoryId(categoryId: string): Promise<Product[]>`
    - `delete(id: ProductId): Promise<void>`

    Define `ProductQuery` interface: `{ page?, limit?, sortBy?, sortOrder?, status?, categoryId?, minPrice?, maxPrice?, search? }`
    Define `PaginatedResult<T>` interface: `{ data: T[], total: number, page: number, limit: number, totalPages: number }`

    Use injection token: `PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY')`

    Barrel exports from all index.ts files.
  </action>
  <verify>grep -r "@nestjs" apps/product-service/src/domain/ | wc -l → 0</verify>
  <done>4 domain event classes, 4 domain error classes, and repository port with pagination support created. Zero framework dependencies in domain layer.</done>
</task>

## Success Criteria
- [ ] 3 value objects (ProductId, Money, ProductStatus) with validation and immutability
- [ ] Product aggregate with status state machine (4 statuses, ARCHIVED terminal)
- [ ] 4 domain events matching Kafka topic names
- [ ] 4 domain error types for business rule violations
- [ ] IProductRepository port with pagination/filtering/sorting support
- [ ] Zero `@nestjs` imports in src/domain/
- [ ] `npx tsc --noEmit` passes
