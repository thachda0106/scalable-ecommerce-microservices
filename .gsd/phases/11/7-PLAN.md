---
phase: 11
plan: 7
wave: 3
depends_on: [1, 2, 3, 4, 5, 6]
files_modified:
  - apps/inventory-service/src/domain/entities/__tests__/product-inventory.spec.ts
  - apps/inventory-service/src/domain/entities/__tests__/stock-reservation.spec.ts
  - apps/inventory-service/src/application/handlers/__tests__/reserve-stock.handler.spec.ts
  - apps/inventory-service/src/application/handlers/__tests__/get-inventory.handler.spec.ts
  - apps/inventory-service/docs/inventory-service-architecture.md
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Domain tests cover: reserve (success + insufficient stock), release, confirm, replenish, invariant enforcement, low stock event trigger"
    - "StockReservation tests cover: create, confirm/release/expire state transitions, reject invalid transitions"
    - "Handler tests use jest mocks for all ports — never import Redis, Kafka, or TypeORM"
    - "ReserveStockHandler test covers: idempotency check, lock acquisition, domain call, audit movement creation"
    - "GetInventoryHandler tests cover: cache hit path and cache miss path"
    - "Architecture doc covers all 15 sections from the original requirements"
  artifacts:
    - "apps/inventory-service/src/domain/entities/__tests__/product-inventory.spec.ts exists"
    - "apps/inventory-service/src/domain/entities/__tests__/stock-reservation.spec.ts exists"
    - "apps/inventory-service/src/application/handlers/__tests__/reserve-stock.handler.spec.ts exists"
    - "apps/inventory-service/src/application/handlers/__tests__/get-inventory.handler.spec.ts exists"
    - "apps/inventory-service/docs/inventory-service-architecture.md exists"
---

# Plan 11.7: Tests & Architecture Documentation

<objective>
Write unit tests for the ProductInventory aggregate, StockReservation entity, and the two most critical handlers. Generate comprehensive architecture documentation.

Purpose: Domain tests prove invariants hold. Handler tests prove orchestration logic is correct. Architecture doc serves as the reference for the engineering team.
Output: 4 spec files, 1 architecture doc.
</objective>

<context>
Load for context:
- apps/inventory-service/src/domain/entities/product-inventory.ts
- apps/inventory-service/src/domain/entities/stock-reservation.ts
- apps/inventory-service/src/domain/value-objects/product-id.vo.ts
- apps/inventory-service/src/domain/value-objects/quantity.vo.ts
- apps/inventory-service/src/domain/errors/insufficient-stock.error.ts
- apps/inventory-service/src/application/handlers/reserve-stock.handler.ts
- apps/inventory-service/src/application/handlers/get-inventory.handler.ts
- apps/inventory-service/src/domain/ports/inventory-repository.port.ts
- apps/cart-service/src/domain/entities/__tests__/cart.entity.spec.ts  (reference test pattern)
- apps/cart-service/src/application/handlers/__tests__/add-item.handler.spec.ts  (reference handler test)
</context>

<tasks>

<task type="auto">
  <name>Write ProductInventory aggregate and StockReservation unit tests</name>
  <files>
    apps/inventory-service/src/domain/entities/__tests__/product-inventory.spec.ts
    apps/inventory-service/src/domain/entities/__tests__/stock-reservation.spec.ts
  </files>
  <action>
    **product-inventory.spec.ts** — comprehensive aggregate tests:

    ```ts
    import { ProductInventory } from '../product-inventory';
    import { InsufficientStockError } from '../../errors/insufficient-stock.error';
    import { StockInvariantViolationError } from '../../errors/stock-invariant-violation.error';

    describe('ProductInventory Aggregate', () => {
      const createInventory = (available = 100) =>
        ProductInventory.create({ productId: '550e8400-e29b-41d4-a716-446655440000', sku: 'WIDGET-001', initialStock: available, lowStockThreshold: 10 });

      describe('create()', () => {
        it('should create inventory with correct initial values', () => {
          const inv = createInventory(100);
          expect(inv.availableStock).toBe(100);
          expect(inv.reservedStock).toBe(0);
          expect(inv.soldStock).toBe(0);
          expect(inv.totalStock).toBe(100);
          expect(inv.version).toBe(1);
        });
      });

      describe('reserve()', () => {
        it('should decrement available and increment reserved', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'cart-1', 'CART');
          expect(inv.availableStock).toBe(90);
          expect(inv.reservedStock).toBe(10);
          expect(inv.totalStock).toBe(100); // invariant holds
        });

        it('should throw InsufficientStockError when quantity exceeds available', () => {
          const inv = createInventory(5);
          expect(() => inv.reserve(10, 'res-1', 'cart-1', 'CART'))
            .toThrow(InsufficientStockError);
        });

        it('should emit StockReservedEvent', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'cart-1', 'CART');
          const events = inv.pullEvents();
          expect(events.length).toBeGreaterThanOrEqual(1);
          expect(events[0].eventType).toBe('inventory.reserved');
        });

        it('should emit LowStockDetectedEvent when below threshold', () => {
          const inv = createInventory(15);
          inv.reserve(10, 'res-1', 'cart-1', 'CART');
          const events = inv.pullEvents();
          const lowStockEvent = events.find(e => e.eventType === 'inventory.low_stock');
          expect(lowStockEvent).toBeDefined();
        });

        it('should NOT emit LowStockDetectedEvent when above threshold', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'cart-1', 'CART');
          const events = inv.pullEvents();
          const lowStockEvent = events.find(e => e.eventType === 'inventory.low_stock');
          expect(lowStockEvent).toBeUndefined();
        });
      });

      describe('release()', () => {
        it('should restore available and decrement reserved', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'cart-1', 'CART');
          inv.pullEvents();
          inv.release(10, 'res-1', 'cart-1', 'cart_expired');
          expect(inv.availableStock).toBe(100);
          expect(inv.reservedStock).toBe(0);
          expect(inv.totalStock).toBe(100);
        });

        it('should throw when releasing more than reserved', () => {
          const inv = createInventory(100);
          expect(() => inv.release(10, 'res-1', 'cart-1', 'test')).toThrow();
        });

        it('should emit StockReleasedEvent', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'cart-1', 'CART');
          inv.pullEvents();
          inv.release(10, 'res-1', 'cart-1', 'cancelled');
          const events = inv.pullEvents();
          expect(events[0].eventType).toBe('inventory.released');
        });
      });

      describe('confirm()', () => {
        it('should decrement reserved and increment sold', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'order-1', 'ORDER');
          inv.pullEvents();
          inv.confirm(10, 'res-1', 'order-1');
          expect(inv.availableStock).toBe(90);
          expect(inv.reservedStock).toBe(0);
          expect(inv.soldStock).toBe(10);
          expect(inv.totalStock).toBe(100);
        });

        it('should throw when confirming more than reserved', () => {
          const inv = createInventory(100);
          expect(() => inv.confirm(10, 'res-1', 'order-1')).toThrow();
        });

        it('should emit StockConfirmedEvent', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'res-1', 'order-1', 'ORDER');
          inv.pullEvents();
          inv.confirm(10, 'res-1', 'order-1');
          const events = inv.pullEvents();
          expect(events[0].eventType).toBe('inventory.confirmed');
        });
      });

      describe('replenish()', () => {
        it('should increase available and total', () => {
          const inv = createInventory(50);
          inv.replenish(100);
          expect(inv.availableStock).toBe(150);
          expect(inv.totalStock).toBe(150);
        });
      });

      describe('invariant', () => {
        it('should maintain available + reserved + sold = total through all operations', () => {
          const inv = createInventory(100);
          inv.reserve(30, 'r1', 'c1', 'CART');
          expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(inv.totalStock);
          inv.confirm(20, 'r2', 'o1');
          // reserved only had 30, confirming 20 leaves 10
          expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(inv.totalStock);
          inv.release(10, 'r3', 'c1', 'expired');
          expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(inv.totalStock);
          inv.replenish(50);
          expect(inv.availableStock + inv.reservedStock + inv.soldStock).toBe(inv.totalStock);
        });
      });

      describe('pullEvents()', () => {
        it('should return empty after pulling', () => {
          const inv = createInventory(100);
          inv.reserve(10, 'r1', 'c1', 'CART');
          inv.pullEvents();
          expect(inv.pullEvents()).toHaveLength(0);
        });
      });
    });
    ```

    **stock-reservation.spec.ts** — state machine tests:
    ```ts
    import { StockReservation } from '../stock-reservation';
    import { ReservationStatus } from '../../value-objects/reservation-status.vo';

    describe('StockReservation', () => {
      const createReservation = () =>
        StockReservation.create({
          productId: '550e8400-e29b-41d4-a716-446655440000',
          referenceId: 'cart-123',
          referenceType: 'CART',
          quantity: 5,
          ttlMinutes: 15,
          idempotencyKey: 'reserve-cart-123-prod-1',
        });

      it('should create with ACTIVE status', () => {
        const res = createReservation();
        expect(res.status).toBe(ReservationStatus.ACTIVE);
        expect(res.isActive()).toBe(true);
      });

      it('should set expiresAt to now + ttlMinutes', () => {
        const before = Date.now();
        const res = createReservation();
        const expectedExpiry = before + 15 * 60 * 1000;
        expect(res.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
        expect(res.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000);
      });

      describe('confirm()', () => {
        it('should transition to CONFIRMED', () => {
          const res = createReservation();
          res.confirm();
          expect(res.status).toBe(ReservationStatus.CONFIRMED);
        });
        it('should throw if not ACTIVE', () => {
          const res = createReservation();
          res.confirm();
          expect(() => res.confirm()).toThrow();
        });
      });

      describe('release()', () => {
        it('should transition to RELEASED', () => {
          const res = createReservation();
          res.release();
          expect(res.status).toBe(ReservationStatus.RELEASED);
        });
        it('should throw if not ACTIVE', () => {
          const res = createReservation();
          res.release();
          expect(() => res.release()).toThrow();
        });
      });

      describe('expire()', () => {
        it('should transition to EXPIRED', () => {
          const res = createReservation();
          res.expire();
          expect(res.status).toBe(ReservationStatus.EXPIRED);
        });
        it('should throw if not ACTIVE', () => {
          const res = createReservation();
          res.confirm();
          expect(() => res.expire()).toThrow();
        });
      });

      describe('isExpired()', () => {
        it('should return false for non-expired ACTIVE reservation', () => {
          const res = createReservation();
          expect(res.isExpired()).toBe(false);
        });
      });
    });
    ```

    AVOID using TestingModule from @nestjs/testing for domain tests — pure unit tests only.
    AVOID importing infrastructure in test files.
  </action>
  <verify>cd apps/inventory-service && pnpm test -- --testPathPattern="(product-inventory|stock-reservation).spec" 2>&1 | tail -20</verify>
  <done>ProductInventory tests: create, reserve (success + insufficient + events), release, confirm, replenish, invariant through all operations, pullEvents. StockReservation tests: create, confirm/release/expire state transitions, reject invalid transitions, expiresAt calculation. All tests PASS.</done>
</task>

<task type="auto">
  <name>Write handler tests and architecture documentation</name>
  <files>
    apps/inventory-service/src/application/handlers/__tests__/reserve-stock.handler.spec.ts
    apps/inventory-service/src/application/handlers/__tests__/get-inventory.handler.spec.ts
    apps/inventory-service/docs/inventory-service-architecture.md
  </files>
  <action>
    **reserve-stock.handler.spec.ts** — mock all 3 ports:
    ```ts
    describe('ReserveStockHandler', () => {
      let handler: ReserveStockHandler;
      let mockRepo: jest.Mocked<IInventoryRepository>;
      let mockCache: jest.Mocked<IStockCache>;
      let mockPublisher: jest.Mocked<IEventPublisher>;

      beforeEach(() => {
        mockRepo = {
          findByProductId: jest.fn(),
          save: jest.fn(),
          saveWithReservationAndMovement: jest.fn(),
          saveWithMovement: jest.fn(),
          findReservationsByReference: jest.fn(),
          findActiveReservation: jest.fn(),
          findExpiredReservations: jest.fn(),
          saveReservation: jest.fn(),
          checkIdempotencyKey: jest.fn(),
          saveIdempotencyKey: jest.fn(),
        };
        mockCache = {
          get: jest.fn(),
          set: jest.fn(),
          invalidate: jest.fn(),
          acquireLock: jest.fn(),
          releaseLock: jest.fn(),
        };
        mockPublisher = {
          publish: jest.fn(),
          publishBatch: jest.fn(),
        };
        handler = new ReserveStockHandler(mockRepo, mockCache, mockPublisher);
      });

      it('should return early on duplicate idempotency key', async () => {
        mockRepo.checkIdempotencyKey.mockResolvedValue(true);
        const cmd = new ReserveStockCommand(
          [{ productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 }],
          'cart-1', 'CART', 'idem-key-1',
        );
        await handler.execute(cmd);
        expect(mockCache.acquireLock).not.toHaveBeenCalled();
      });

      it('should acquire lock, reserve stock, and create movement', async () => {
        mockRepo.checkIdempotencyKey.mockResolvedValue(false);
        mockCache.acquireLock.mockResolvedValue(true);
        const inventory = ProductInventory.create({
          productId: '550e8400-e29b-41d4-a716-446655440000',
          sku: 'W-001', initialStock: 100,
        });
        mockRepo.findByProductId.mockResolvedValue(inventory);
        mockRepo.saveWithReservationAndMovement.mockResolvedValue();
        mockCache.invalidate.mockResolvedValue();
        mockCache.releaseLock.mockResolvedValue();
        mockPublisher.publishBatch.mockResolvedValue();
        mockRepo.saveIdempotencyKey.mockResolvedValue();

        const cmd = new ReserveStockCommand(
          [{ productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 10 }],
          'cart-1', 'CART', 'idem-key-2',
        );
        const result = await handler.execute(cmd);

        expect(mockCache.acquireLock).toHaveBeenCalled();
        expect(mockRepo.saveWithReservationAndMovement).toHaveBeenCalled();
        expect(mockCache.invalidate).toHaveBeenCalled();
        expect(mockCache.releaseLock).toHaveBeenCalled();
        expect(mockPublisher.publishBatch).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should throw when lock acquisition fails', async () => {
        mockRepo.checkIdempotencyKey.mockResolvedValue(false);
        mockCache.acquireLock.mockResolvedValue(false);
        const cmd = new ReserveStockCommand(
          [{ productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 }],
          'cart-1', 'CART', 'idem-key-3',
        );
        await expect(handler.execute(cmd)).rejects.toThrow();
      });

      it('should return failure for insufficient stock', async () => {
        mockRepo.checkIdempotencyKey.mockResolvedValue(false);
        mockCache.acquireLock.mockResolvedValue(true);
        const inventory = ProductInventory.create({
          productId: '550e8400-e29b-41d4-a716-446655440000',
          sku: 'W-001', initialStock: 5,
        });
        mockRepo.findByProductId.mockResolvedValue(inventory);
        mockCache.releaseLock.mockResolvedValue();

        const cmd = new ReserveStockCommand(
          [{ productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 10 }],
          'cart-1', 'CART', 'idem-key-4',
        );
        // Should either throw InsufficientStockError or return { success: false }
        // depending on implementation strategy
        await expect(handler.execute(cmd)).rejects.toThrow();
        expect(mockCache.releaseLock).toHaveBeenCalled(); // lock released even on failure
      });
    });
    ```

    **get-inventory.handler.spec.ts** — cache hit and miss:
    ```ts
    describe('GetInventoryHandler', () => {
      let handler: GetInventoryHandler;
      let mockRepo: jest.Mocked<Pick<IInventoryRepository, 'findByProductId'>>;
      let mockCache: jest.Mocked<Pick<IStockCache, 'get' | 'set'>>;

      beforeEach(() => {
        mockRepo = { findByProductId: jest.fn() };
        mockCache = { get: jest.fn(), set: jest.fn() };
        handler = new GetInventoryHandler(mockRepo as any, mockCache as any);
      });

      it('should return cached inventory without hitting DB', async () => {
        const cached = ProductInventory.create({
          productId: '550e8400-e29b-41d4-a716-446655440000',
          sku: 'W-001', initialStock: 100,
        });
        mockCache.get.mockResolvedValue(cached);
        const result = await handler.execute(new GetInventoryQuery('550e8400-e29b-41d4-a716-446655440000'));
        expect(mockRepo.findByProductId).not.toHaveBeenCalled();
        expect(result.productId).toBe('550e8400-e29b-41d4-a716-446655440000');
      });

      it('should fetch from DB on cache miss and warm cache', async () => {
        mockCache.get.mockResolvedValue(null);
        const inventory = ProductInventory.create({
          productId: '550e8400-e29b-41d4-a716-446655440000',
          sku: 'W-001', initialStock: 100,
        });
        mockRepo.findByProductId.mockResolvedValue(inventory);
        mockCache.set.mockResolvedValue();

        const result = await handler.execute(new GetInventoryQuery('550e8400-e29b-41d4-a716-446655440000'));
        expect(mockRepo.findByProductId).toHaveBeenCalled();
        expect(mockCache.set).toHaveBeenCalled();
        expect(result.availableStock).toBe(100);
      });

      it('should throw NotFoundException for unknown product', async () => {
        mockCache.get.mockResolvedValue(null);
        mockRepo.findByProductId.mockResolvedValue(null);
        await expect(
          handler.execute(new GetInventoryQuery('550e8400-e29b-41d4-a716-446655440000'))
        ).rejects.toThrow();
      });
    });
    ```

    **inventory-service-architecture.md** — comprehensive architecture document:
    Generate a detailed architecture document covering ALL 15 sections from the original requirements:
    1. Critical problems identified in original design
    2. Production-ready architecture diagram (Mermaid)
    3. Data model (3 entities with field descriptions)
    4. State machine (AVAILABLE → RESERVED → SOLD, RESERVED → RELEASED)
    5. API design (5 endpoints with request/response)
    6. Concurrency strategy (3-layer defense)
    7. Cart integration event flows
    8. Event-driven architecture (Kafka topics, events, schemas)
    9. Storage strategy (hybrid PostgreSQL + Redis)
    10. Performance strategy (caching, reads, writes)
    11. Resilience (retries, circuit breakers, timeouts, fallbacks)
    12. Observability (logging, metrics, tracing)
    13. Security model (auth, authorization, validation, rate limiting)
    14. Production hardening (health, config, secrets, feature flags)
    15. SQL schema (3 tables + indexes + constraints)
    16. Code structure (folder tree)
    17. Implementation roadmap (7 plans, 3 waves)

    Use Mermaid diagrams for architecture and event flow visualization.
    Include the file tree of the new src/ directory.

    AVOID placeholders — every section must be fully written.
    AVOID using TestingModule for unit tests — instantiate directly with mocks.
  </action>
  <verify>cd apps/inventory-service && pnpm test 2>&1 | tail -20</verify>
  <done>ReserveStockHandler tests: idempotency early return, lock + reserve + movement, lock failure, insufficient stock with lock cleanup. GetInventoryHandler tests: cache hit, cache miss + warm cache, not found. Architecture doc covers all 15+ sections with Mermaid diagrams. All tests PASS.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `pnpm test` from inventory-service root shows all 4 spec files PASS
- [ ] No test imports Redis, Kafka, or TypeORM (grep confirms)
- [ ] ProductInventory domain tests: at minimum 12 `it()` tests covering all business rules + invariant
- [ ] StockReservation tests: at minimum 8 `it()` covering all state transitions
- [ ] Handler tests use mocked ports only
- [ ] `docs/inventory-service-architecture.md` exists and covers all 15 sections
- [ ] `npx tsc --noEmit` shows zero errors
</verification>

<success_criteria>
- [ ] `pnpm test` passes all spec files
- [ ] Domain tests cover all invariants and business rules
- [ ] Handler tests cover idempotency, lock, happy path, and error paths
- [ ] Architecture doc is comprehensive (all 15 sections)
- [ ] `npx tsc --noEmit` reports zero errors
- [ ] No `@nestjs` imports in `domain/` directory
</success_criteria>
