---
phase: 10
plan: 2
wave: 2
depends_on: [1]
files_modified:
  - apps/cart-service/src/application/commands/add-item.command.ts
  - apps/cart-service/src/application/commands/remove-item.command.ts
  - apps/cart-service/src/application/commands/clear-cart.command.ts
  - apps/cart-service/src/application/queries/get-cart.query.ts
  - apps/cart-service/src/application/handlers/add-item.handler.ts
  - apps/cart-service/src/application/handlers/remove-item.handler.ts
  - apps/cart-service/src/application/handlers/clear-cart.handler.ts
  - apps/cart-service/src/application/handlers/get-cart.handler.ts
  - apps/cart-service/src/application/ports/cart-repository.port.ts
  - apps/cart-service/src/application/ports/cart-cache.port.ts
  - apps/cart-service/src/application/ports/cart-events.port.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "All business logic lives in handlers, not controllers"
    - "Handlers depend only on ports (interfaces), not concrete infrastructure"
    - "GetCartHandler checks cache before hitting repository"
    - "AddItemHandler publishes domain events via port; does NOT import Kafka directly"
  artifacts:
    - "apps/cart-service/src/application/ports/cart-repository.port.ts defines ICartRepository"
    - "apps/cart-service/src/application/ports/cart-cache.port.ts defines ICartCache"
    - "apps/cart-service/src/application/ports/cart-events.port.ts defines ICartEventsProducer"
    - "All 4 handlers implement ICommandHandler or IQueryHandler from @nestjs/cqrs"
---

# Plan 10.2: Application Layer — CQRS Commands, Queries & Handlers

<objective>
Implement the CQRS application layer: commands, queries, port interfaces, and handlers.
Handlers contain all business logic and depend only on port abstractions — never on concrete Redis or Kafka classes.

Purpose: Controllers will be thin wrappers calling CommandBus/QueryBus. All logic lives here.
Output: 3 commands, 1 query, 3 ports, 4 handlers.
</objective>

<context>
Load for context:
- apps/cart-service/src/domain/entities/cart.entity.ts       (domain aggregate, Plan 10.1 output)
- apps/cart-service/src/domain/entities/cart-item.entity.ts
- apps/cart-service/src/domain/value-objects/product-id.vo.ts
- apps/cart-service/src/domain/value-objects/quantity.vo.ts
- apps/auth-service/src/application/handlers/login.handler.ts  (reference for handler pattern)
- .gsd/ARCHITECTURE.md
</context>

<tasks>

<task type="auto">
  <name>Define port interfaces (ICartRepository, ICartCache, ICartEventsProducer)</name>
  <files>
    apps/cart-service/src/application/ports/cart-repository.port.ts
    apps/cart-service/src/application/ports/cart-cache.port.ts
    apps/cart-service/src/application/ports/cart-events.port.ts
  </files>
  <action>
    `cart-repository.port.ts`:
    ```ts
    import { Cart } from '../../domain/entities/cart.entity';
    export const CART_REPOSITORY = Symbol('CART_REPOSITORY');
    export interface ICartRepository {
      findByUserId(userId: string): Promise<Cart | null>;
      save(cart: Cart): Promise<void>;
    }
    ```

    `cart-cache.port.ts`:
    ```ts
    import { Cart } from '../../domain/entities/cart.entity';
    export const CART_CACHE = Symbol('CART_CACHE');
    export interface ICartCache {
      get(userId: string): Promise<Cart | null>;
      set(userId: string, cart: Cart): Promise<void>;
      invalidate(userId: string): Promise<void>;
    }
    ```

    `cart-events.port.ts`:
    ```ts
    import { BaseDomainEvent } from '../../domain/events/base-domain.event';
    export const CART_EVENTS_PRODUCER = Symbol('CART_EVENTS_PRODUCER');
    export interface ICartEventsProducer {
      publish(event: BaseDomainEvent): Promise<void>;
    }
    ```

    AVOID making ports concrete classes. They are interfaces only.
    AVOID NestJS decorators in port files.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep "port" || echo "Ports compile OK"</verify>
  <done>3 port files exist. Each exports a Symbol injection token and an interface. No concrete implementations in port files.</done>
</task>

<task type="auto">
  <name>Create commands, queries and their handlers</name>
  <files>
    apps/cart-service/src/application/commands/add-item.command.ts
    apps/cart-service/src/application/commands/remove-item.command.ts
    apps/cart-service/src/application/commands/clear-cart.command.ts
    apps/cart-service/src/application/queries/get-cart.query.ts
    apps/cart-service/src/application/handlers/add-item.handler.ts
    apps/cart-service/src/application/handlers/remove-item.handler.ts
    apps/cart-service/src/application/handlers/clear-cart.handler.ts
    apps/cart-service/src/application/handlers/get-cart.handler.ts
  </files>
  <action>
    **Commands** (plain TS classes, no decorators):
    - `AddItemCommand`: constructor(public userId: string, public productId: string, public quantity: number, public snapshottedPrice: number)
    - `RemoveItemCommand`: constructor(public userId: string, public productId: string)
    - `ClearCartCommand`: constructor(public userId: string)

    **Query:**
    - `GetCartQuery`: constructor(public userId: string)

    **AddItemHandler** (`@CommandHandler(AddItemCommand)`):
    - Inject via `@Inject(CART_REPOSITORY) private repo: ICartRepository`, `@Inject(CART_CACHE) private cache: ICartCache`, `@Inject(CART_EVENTS_PRODUCER) private producer: ICartEventsProducer`
    - `execute(cmd: AddItemCommand)`:
      1. Load cart: `await this.repo.findByUserId(cmd.userId)` — if null, create `Cart.create(cmd.userId)`
      2. Create VOs: `ProductId.create(cmd.productId)`, `Quantity.create(cmd.quantity)`
      3. Call `cart.addItem(productId, quantity, cmd.snapshottedPrice)` — domain validates rules
      4. `await this.repo.save(cart)`
      5. `await this.cache.invalidate(cmd.userId)` — cache invalidation on mutation
      6. Pull events: `const events = cart.pullEvents()` → `await Promise.all(events.map(e => this.producer.publish(e)))`
      7. Return `cart.toJSON()`

    **RemoveItemHandler** (`@CommandHandler(RemoveItemCommand)`):
    - Same injection pattern
    - `execute`: load cart (throw `NotFoundException` if null), `cart.removeItem(ProductId.create(cmd.productId))`, save, invalidate cache, publish events

    **ClearCartHandler** (`@CommandHandler(ClearCartCommand)`):
    - `execute`: load cart (throw NotFoundException if null), `cart.clear()`, save, `await this.cache.invalidate(cmd.userId)`, publish events

    **GetCartHandler** (`@QueryHandler(GetCartQuery)`):
    - Inject `CART_CACHE` and `CART_REPOSITORY`
    - `execute(query: GetCartQuery)`:
      1. Cache lookup: `const cached = await this.cache.get(query.userId)` — if found, return `cached.toJSON()`
      2. Cache miss: `const cart = await this.repo.findByUserId(query.userId)` — if null return `{ id: null, userId: query.userId, items: [] }`
      3. `await this.cache.set(query.userId, cart)` (warm cache)
      4. Return `cart.toJSON()`

    AVOID importing Redis or Kafka directly in any handler. Use only the port interfaces.
    AVOID putting business rule validation in handlers (e.g. max qty check) — that lives in the domain entity.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "handler|command|query" || echo "Application layer compiles OK"</verify>
  <done>4 handlers implement @CommandHandler/@QueryHandler correctly. AddItemHandler creates new cart if not found. GetCartHandler checks cache first. All handlers use port interfaces, not concrete classes.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for application/ files
- [ ] No direct Redis or Kafka import appears in any handler file (grep confirms)
- [ ] GetCartHandler uses both CART_CACHE and CART_REPOSITORY injection tokens
- [ ] AddItemHandler calls `cart.pullEvents()` and publishes each via producer port
</verification>

<success_criteria>
- [ ] 3 commands, 1 query, 3 ports, and 4 handlers created
- [ ] Handlers inject ports by Symbol, not concrete classes
- [ ] TypeScript compiles without errors
</success_criteria>
