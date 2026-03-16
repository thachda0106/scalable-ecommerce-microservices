---
phase: 17
plan: 6
wave: 3
---

# Plan 17.6: Infrastructure — Redis Cache Implementation

## Objective
Implement the Redis cache adapter that fulfills the IProductCache port.
Uses cache-aside pattern: check cache first on reads, invalidate on writes.
Only individual product lookups are cached (NOT paginated queries).

## Context
- .gsd/phases/17/RESEARCH.md (caching strategy — 1h TTL, single-product reads only)
- apps/product-service/src/application/ports/product-cache.port.ts (from Plan 17.2)
- apps/cart-service/src/infrastructure/redis/cart-cache.repository.ts (established Redis cache pattern — MUST follow)
- apps/cart-service/src/application/ports/cart-cache.port.ts (port pattern)

## Tasks

<task type="auto">
  <name>Create Redis Product Cache Repository</name>
  <files>
    apps/product-service/src/infrastructure/redis/product-cache.repository.ts
    apps/product-service/src/infrastructure/redis/index.ts
  </files>
  <action>
    **ProductCacheRepository** implements IProductCache:
    - Follow exact same pattern as apps/cart-service/src/infrastructure/redis/cart-cache.repository.ts
    - @Injectable() class implementing OnModuleInit, OnModuleDestroy
    - Inject: `@Inject('REDIS_CLIENT') private readonly redis: Redis` (ioredis)

    **Constants:**
    - `PRODUCT_CACHE_TTL = 3600` (1 hour, per RESEARCH.md — products change less frequently than carts)
    - Key format: `product:{productId}`

    **onModuleInit():** Connect to Redis, log success, catch and warn on failure
    **onModuleDestroy():** Disconnect gracefully

    **getById(productId: string): Promise<Product | null>:**
    - `redis.get(`product:${productId}`)` → parse JSON → reconstitute Product domain entity via Product.reconstitute()
    - Return null on cache miss or error (graceful degradation)
    - Log warnings on errors, never throw

    **setById(productId: string, product: Product): Promise<void>:**
    - `redis.setex(`product:${productId}`, PRODUCT_CACHE_TTL, JSON.stringify(product.toJSON()))`
    - Swallow errors, log warnings

    **invalidateById(productId: string): Promise<void>:**
    - `redis.del(`product:${productId}`)`
    - Swallow errors, log warnings

    Key design: ALL Redis operations are wrapped in try/catch with warning logs.
    Redis failures MUST NOT fail the request — fall through to PostgreSQL.

    Barrel export.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>ProductCacheRepository implements IProductCache with 1-hour TTL, graceful degradation on Redis failures, and proper lifecycle management.</done>
</task>

## Success Criteria
- [ ] ProductCacheRepository implements IProductCache
- [ ] Uses ioredis with 'REDIS_CLIENT' injection token
- [ ] Key format: `product:{productId}`
- [ ] TTL: 3600 seconds (1 hour)
- [ ] All Redis operations wrapped in try/catch (graceful degradation)
- [ ] OnModuleInit/OnModuleDestroy for lifecycle management
- [ ] `npx tsc --noEmit` passes
