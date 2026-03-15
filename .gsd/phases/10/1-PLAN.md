---
phase: 10
plan: 1
wave: 1
depends_on: []
files_modified:
  - apps/cart-service/src/domain/entities/cart.entity.ts
  - apps/cart-service/src/domain/entities/cart-item.entity.ts
  - apps/cart-service/src/domain/value-objects/product-id.vo.ts
  - apps/cart-service/src/domain/value-objects/quantity.vo.ts
  - apps/cart-service/src/domain/events/item-added.event.ts
  - apps/cart-service/src/domain/events/item-removed.event.ts
  - apps/cart-service/src/domain/events/cart-cleared.event.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Cart aggregate enforces: quantity 1–99, no duplicate product entries (merge quantity), clear() resets items"
    - "Domain layer has zero NestJS or infrastructure imports"
    - "All domain events carry strongly-typed payloads"
  artifacts:
    - "apps/cart-service/src/domain/entities/cart.entity.ts exists"
    - "apps/cart-service/src/domain/entities/cart-item.entity.ts exists"
    - "apps/cart-service/src/domain/value-objects/product-id.vo.ts exists"
    - "apps/cart-service/src/domain/value-objects/quantity.vo.ts exists"
    - "apps/cart-service/src/domain/events/item-added.event.ts exists"
    - "apps/cart-service/src/domain/events/item-removed.event.ts exists"
    - "apps/cart-service/src/domain/events/cart-cleared.event.ts exists"
---

# Plan 10.1: Domain Layer — Entities, Value Objects & Events

<objective>
Build the pure domain layer for the cart-service with zero infrastructure dependencies.
This is the foundation all other plans depend on.

Purpose: Establish the Cart aggregate root, CartItem entity, value objects (ProductId, Quantity), and domain events following the same pattern as auth-service's User entity.
Output: 7 TypeScript files in src/domain/
</objective>

<context>
Load for context:
- apps/cart-service/src/cart/cart.service.ts   (current naive impl to understand surface area)
- apps/auth-service/src/domain/entities/user.entity.ts   (reference pattern for aggregate)
- apps/auth-service/src/domain/value-objects/   (reference pattern for VOs)
- .gsd/ARCHITECTURE.md   (Cart domain model: userId, CartItem with snapshottedPrice, Redis TTL 7 days)
</context>

<tasks>

<task type="auto">
  <name>Create ProductId and Quantity value objects</name>
  <files>
    apps/cart-service/src/domain/value-objects/product-id.vo.ts
    apps/cart-service/src/domain/value-objects/quantity.vo.ts
  </files>
  <action>
    Create `product-id.vo.ts`:
    - Class `ProductId` with private `value: string`
    - Static `create(value: string): ProductId` — validates UUID v4 with a regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`), throws `Error('Invalid productId: must be UUID v4')` if invalid
    - Getter `getValue(): string`
    - Method `equals(other: ProductId): boolean`
    - NO NestJS imports, NO class-validator — pure TypeScript

    Create `quantity.vo.ts`:
    - Class `Quantity` with private `value: number`
    - Static `create(value: number): Quantity` — validates `Number.isInteger(value) && value >= 1 && value <= 99`, throws `Error('Invalid quantity: must be integer 1-99')` if invalid
    - Getter `getValue(): number`
    - Method `add(other: Quantity): Quantity` — returns new `Quantity.create(this.value + other.value)` but throws if resulting value > 99
    - NO NestJS imports
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "product-id|quantity" || echo "VO files compile OK"</verify>
  <done>Both VO files exist. ProductId rejects non-UUID strings. Quantity rejects values outside 1-99. Quantity.add() enforces max 99.</done>
</task>

<task type="auto">
  <name>Create CartItem entity and Cart aggregate root</name>
  <files>
    apps/cart-service/src/domain/entities/cart-item.entity.ts
    apps/cart-service/src/domain/entities/cart.entity.ts
  </files>
  <action>
    Create `cart-item.entity.ts`:
    - Class `CartItem` with `readonly productId: ProductId`, `quantity: Quantity`, `snapshottedPrice: number`
    - Static factory `CartItem.create(productId: ProductId, quantity: Quantity, snapshottedPrice: number): CartItem`
    - Method `increaseQuantity(additional: Quantity): CartItem` — returns new CartItem with merged quantity (throws if > 99 via Quantity.add)
    - Method `toJSON()` returning `{ productId: string, quantity: number, snapshottedPrice: number }`
    - AVOID making it a @Injectable() or NestJS decorator

    Create `cart.entity.ts`:
    - Class `Cart` with private constructor, props: `id: string`, `userId: string`, `items: CartItem[]`, `domainEvents: BaseDomainEvent[]`
    - Static factory `Cart.create(userId: string): Cart` — generates UUID id using `crypto.randomUUID()` (Node built-in, NO uuid package needed)
    - Static `Cart.reconstitute(id: string, userId: string, items: CartItem[]): Cart` — for loading from persistence without triggering events
    - Method `addItem(productId: ProductId, quantity: Quantity, snapshottedPrice: number): void`:
      - Check if item with same productId exists → if yes call `existingItem.increaseQuantity(quantity)` and replace in array
      - If no → push new `CartItem.create(productId, quantity, snapshottedPrice)`
      - Push `ItemAddedEvent` onto `domainEvents`
    - Method `removeItem(productId: ProductId): void`:
      - Filter items; if productId not found throw `Error('Item not found in cart')`
      - Push `ItemRemovedEvent` onto `domainEvents`
    - Method `clear(): void`:
      - Set items to []
      - Push `CartClearedEvent` onto `domainEvents`
    - Method `pullEvents(): BaseDomainEvent[]` — returns copy and clears the array (consumed by handlers)
    - Getters: `id`, `userId`, `items`
    - Method `toJSON()` — { id, userId, items: items.map(i => i.toJSON()) }
    - AVOID importing from NestJS/infrastructure. Use only Node built-ins and local domain imports.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "cart.entity|cart-item" || echo "Entity files compile OK"</verify>
  <done>Cart.create() returns cart with unique id. addItem() merges duplicate product entries. addItem() rejects quantity > 99 total. removeItem() throws for unknown productId. clear() empties items. pullEvents() returns and clears events.</done>
</task>

<task type="auto">
  <name>Create domain events</name>
  <files>
    apps/cart-service/src/domain/events/item-added.event.ts
    apps/cart-service/src/domain/events/item-removed.event.ts
    apps/cart-service/src/domain/events/cart-cleared.event.ts
  </files>
  <action>
    Create a shared base first inline or at `apps/cart-service/src/domain/events/base-domain.event.ts`:
    ```ts
    export abstract class BaseDomainEvent {
      public readonly occurredOn: Date = new Date();
      public abstract readonly eventType: string;
    }
    ```

    Create `item-added.event.ts`:
    ```ts
    export class ItemAddedEvent extends BaseDomainEvent {
      public readonly eventType = 'cart.item_added';
      constructor(
        public readonly cartId: string,
        public readonly userId: string,
        public readonly productId: string,
        public readonly quantity: number,
        public readonly snapshottedPrice: number,
      ) { super(); }
    }
    ```

    Create `item-removed.event.ts` with same pattern, fields: cartId, userId, productId, eventType = 'cart.item_removed'

    Create `cart-cleared.event.ts` with fields: cartId, userId, eventType = 'cart.cleared'

    AVOID importing from NestJS. These are plain TypeScript classes only.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep "event" || echo "Domain events compile OK"</verify>
  <done>3 event files exist. Each extends BaseDomainEvent. Each has typed fields and eventType string literal. Zero NestJS imports in all domain files.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` from cart-service root shows zero errors for domain files
- [ ] No `@nestjs` import appears in any file under `src/domain/`
- [ ] `Cart.addItem()` with same productId twice → items array has length 1 (merged)
- [ ] `Quantity.create(0)` throws error
- [ ] `Quantity.create(100)` throws error
</verification>

<success_criteria>
- [ ] 7 domain files created (2 entities, 2 VOs, 3 events + base event)
- [ ] Domain layer is infrastructure-free (grep confirms no `@nestjs` import)
- [ ] TypeScript compiles without errors in domain/
</success_criteria>
