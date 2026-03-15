---
phase: 10
plan: 4
wave: 3
depends_on: [1, 2, 3]
files_modified:
  - apps/cart-service/src/domain/entities/__tests__/cart.entity.spec.ts
  - apps/cart-service/src/application/handlers/__tests__/add-item.handler.spec.ts
  - apps/cart-service/src/application/handlers/__tests__/get-cart.handler.spec.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Domain unit tests cover: addItem (new item), addItem (duplicate merges qty), addItem (exceeds max qty throws), removeItem (existing), removeItem (missing throws), clear()"
    - "Handler tests use jest mocks for all ports — never import Redis or Kafka"
    - "GetCartHandler tests cover: cache hit path and cache miss path"
  artifacts:
    - "apps/cart-service/src/domain/entities/__tests__/cart.entity.spec.ts exists"
    - "apps/cart-service/src/application/handlers/__tests__/add-item.handler.spec.ts exists"
    - "apps/cart-service/src/application/handlers/__tests__/get-cart.handler.spec.ts exists"
---

# Plan 10.4: Tests — Domain Unit Tests & Handler Tests

<objective>
Write unit tests for the Cart domain aggregate and the two most critical application handlers.
Tests follow TDD-style: test the behavior, not the implementation.

Purpose: Domain tests prove business rules hold. Handler tests prove the orchestration logic is correct.
Output: 3 spec files.
</objective>

<context>
Load for context:
- apps/cart-service/src/domain/entities/cart.entity.ts
- apps/cart-service/src/domain/value-objects/product-id.vo.ts
- apps/cart-service/src/domain/value-objects/quantity.vo.ts
- apps/cart-service/src/application/handlers/add-item.handler.ts
- apps/cart-service/src/application/handlers/get-cart.handler.ts
- apps/cart-service/src/application/ports/cart-repository.port.ts
- apps/auth-service/src/application/handlers/__tests__/   (reference for handler test pattern if exists)
</context>

<tasks>

<task type="auto">
  <name>Write Cart aggregate domain unit tests</name>
  <files>
    apps/cart-service/src/domain/entities/__tests__/cart.entity.spec.ts
  </files>
  <action>
    Create comprehensive unit tests for the Cart aggregate covering ALL business rules:

    ```ts
    import { Cart } from '../cart.entity';
    import { ProductId } from '../../value-objects/product-id.vo';
    import { Quantity } from '../../value-objects/quantity.vo';

    describe('Cart Aggregate', () => {
      const pid = ProductId.create('550e8400-e29b-41d4-a716-446655440000');
      const qty1 = Quantity.create(1);
      const qty3 = Quantity.create(3);

      it('should create a cart with a unique id and empty items', () => {
        const cart = Cart.create('user-123');
        expect(cart.id).toBeDefined();
        expect(cart.userId).toBe('user-123');
        expect(cart.items).toHaveLength(0);
      });

      it('should add a new item to the cart', () => {
        const cart = Cart.create('user-123');
        cart.addItem(pid, qty1, 29.99);
        expect(cart.items).toHaveLength(1);
        expect(cart.items[0].quantity.getValue()).toBe(1);
      });

      it('should merge quantity when adding a duplicate item', () => {
        const cart = Cart.create('user-123');
        cart.addItem(pid, qty1, 29.99);
        cart.addItem(pid, qty3, 29.99);
        expect(cart.items).toHaveLength(1);
        expect(cart.items[0].quantity.getValue()).toBe(4);
      });

      it('should throw when merged quantity exceeds 99', () => {
        const cart = Cart.create('user-123');
        const qty50 = Quantity.create(50);
        cart.addItem(pid, qty50, 9.99);
        expect(() => cart.addItem(pid, qty50, 9.99)).toThrow();
      });

      it('should add a domain event on addItem', () => {
        const cart = Cart.create('user-123');
        cart.addItem(pid, qty1, 9.99);
        const events = cart.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('cart.item_added');
      });

      it('should remove an existing item', () => {
        const cart = Cart.create('user-123');
        cart.addItem(pid, qty1, 9.99);
        cart.pullEvents(); // clear
        cart.removeItem(pid);
        expect(cart.items).toHaveLength(0);
        const events = cart.pullEvents();
        expect(events[0].eventType).toBe('cart.item_removed');
      });

      it('should throw when removing an item not in cart', () => {
        const cart = Cart.create('user-123');
        expect(() => cart.removeItem(pid)).toThrow('Item not found');
      });

      it('should clear the cart', () => {
        const cart = Cart.create('user-123');
        cart.addItem(pid, qty1, 9.99);
        cart.pullEvents();
        cart.clear();
        expect(cart.items).toHaveLength(0);
        const events = cart.pullEvents();
        expect(events[0].eventType).toBe('cart.cleared');
      });

      it('should return empty events after pullEvents()', () => {
        const cart = Cart.create('user-123');
        cart.addItem(pid, qty1, 9.99);
        cart.pullEvents();
        expect(cart.pullEvents()).toHaveLength(0);
      });
    });

    describe('ProductId VO', () => {
      it('should accept valid UUID v4', () => {
        expect(() => ProductId.create('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
      });
      it('should reject invalid UUID', () => {
        expect(() => ProductId.create('not-a-uuid')).toThrow('Invalid productId');
      });
    });

    describe('Quantity VO', () => {
      it('should accept 1', () => expect(() => Quantity.create(1)).not.toThrow());
      it('should accept 99', () => expect(() => Quantity.create(99)).not.toThrow());
      it('should reject 0', () => expect(() => Quantity.create(0)).toThrow());
      it('should reject 100', () => expect(() => Quantity.create(100)).toThrow());
      it('should reject decimals', () => expect(() => Quantity.create(1.5)).toThrow());
    });
    ```
  </action>
  <verify>cd apps/cart-service && pnpm test -- --testPathPattern="cart.entity.spec" 2>&1 | tail -20</verify>
  <done>All domain unit tests pass. 100% of business rules tested. `pnpm test` shows PASS for cart.entity.spec.ts.</done>
</task>

<task type="auto">
  <name>Write AddItemHandler and GetCartHandler unit tests</name>
  <files>
    apps/cart-service/src/application/handlers/__tests__/add-item.handler.spec.ts
    apps/cart-service/src/application/handlers/__tests__/get-cart.handler.spec.ts
  </files>
  <action>
    **add-item.handler.spec.ts** — mock all 3 ports:
    ```ts
    describe('AddItemHandler', () => {
      let handler: AddItemHandler;
      let mockRepo: jest.Mocked<ICartRepository>;
      let mockCache: jest.Mocked<ICartCache>;
      let mockProducer: jest.Mocked<ICartEventsProducer>;

      beforeEach(() => {
        mockRepo = { findByUserId: jest.fn(), save: jest.fn() };
        mockCache = { get: jest.fn(), set: jest.fn(), invalidate: jest.fn() };
        mockProducer = { publish: jest.fn() };
        handler = new AddItemHandler(mockRepo, mockCache, mockProducer);
      });

      it('should create a new cart if one does not exist', async () => {
        mockRepo.findByUserId.mockResolvedValue(null);
        mockRepo.save.mockResolvedValue();
        mockCache.invalidate.mockResolvedValue();
        mockProducer.publish.mockResolvedValue();

        const cmd = new AddItemCommand('user-1', '550e8400-e29b-41d4-a716-446655440000', 2, 19.99);
        const result = await handler.execute(cmd);
        expect(mockRepo.save).toHaveBeenCalledTimes(1);
        expect(mockCache.invalidate).toHaveBeenCalledWith('user-1');
        expect(mockProducer.publish).toHaveBeenCalledTimes(1);
        expect(result.items).toHaveLength(1);
      });

      it('should add to existing cart if one exists', async () => {
        const existingCart = Cart.create('user-1');
        mockRepo.findByUserId.mockResolvedValue(existingCart);
        mockRepo.save.mockResolvedValue();
        mockCache.invalidate.mockResolvedValue();
        mockProducer.publish.mockResolvedValue();

        const cmd = new AddItemCommand('user-1', '550e8400-e29b-41d4-a716-446655440000', 1, 9.99);
        const result = await handler.execute(cmd);
        expect(result.items).toHaveLength(1);
      });
    });
    ```

    **get-cart.handler.spec.ts** — test cache hit and cache miss:
    ```ts
    describe('GetCartHandler', () => {
      // cache HIT path
      it('should return cached cart without calling repository', async () => {
        const cachedCart = Cart.reconstitute('cart-1', 'user-1', []);
        mockCache.get.mockResolvedValue(cachedCart);
        const result = await handler.execute(new GetCartQuery('user-1'));
        expect(mockRepo.findByUserId).not.toHaveBeenCalled();
        expect(result.userId).toBe('user-1');
      });

      // cache MISS path
      it('should fetch from repo on cache miss and warm cache', async () => {
        mockCache.get.mockResolvedValue(null);
        const dbCart = Cart.reconstitute('cart-1', 'user-1', []);
        mockRepo.findByUserId.mockResolvedValue(dbCart);
        mockCache.set.mockResolvedValue();

        const result = await handler.execute(new GetCartQuery('user-1'));
        expect(mockRepo.findByUserId).toHaveBeenCalledWith('user-1');
        expect(mockCache.set).toHaveBeenCalledWith('user-1', dbCart);
        expect(result.userId).toBe('user-1');
      });

      // empty cart
      it('should return empty cart if not found', async () => {
        mockCache.get.mockResolvedValue(null);
        mockRepo.findByUserId.mockResolvedValue(null);
        const result = await handler.execute(new GetCartQuery('user-404'));
        expect(result.items).toEqual([]);
      });
    });
    ```

    AVOID using TestingModule from @nestjs/testing for unit tests — instantiate directly with mocks for speed.
    AVOID importing Redis or Kafka in test files.
  </action>
  <verify>cd apps/cart-service && pnpm test -- --testPathPattern="handler.spec" 2>&1 | tail -20</verify>
  <done>AddItemHandler tests: creates cart if null, adds to existing. GetCartHandler tests: cache hit skips repo, cache miss warms cache, returns empty for null. All tests PASS.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `pnpm test` from cart-service root shows all 3 spec files PASS
- [ ] No test imports Redis or Kafka (grep confirms)
- [ ] Cart domain tests: at minimum 9 `it()` tests covering all business rules
</verification>

<success_criteria>
- [ ] `pnpm test` passes for all 3 spec files
- [ ] Domain tests cover all business rules (add, duplicate merge, remove, clear, events)
- [ ] Handler tests cover happy path and edge cases using mocked ports
</success_criteria>
