---
phase: 18
plan: 4
wave: 2
---

# Plan 18.4: Infrastructure — Kafka Consumers & Redis Cache

## Objective
Replace the current raw Kafka consumer (`ProductSyncService`) with a proper event consumer following the established pattern from notification-service.
Add Redis cache adapter implementing `ISearchCachePort` for query caching.
Wire consumers to dispatch CQRS commands via CommandBus.

## Context
- .gsd/phases/18/RESEARCH.md (caching strategy, indexing anti-patterns)
- apps/search-service/src/consumer/product-sync.service.ts (current — will be replaced)
- apps/notification-service/src/infrastructure/kafka/ (reference Kafka consumer pattern)
- apps/search-service/src/domain/ports/search-cache.port.ts (from Plan 18.1)
- apps/search-service/src/application/commands/ (from Plan 18.2)

## Tasks

<task type="auto">
  <name>Create Kafka Product Event Consumer</name>
  <files>
    apps/search-service/src/infrastructure/kafka/consumers/product-event.consumer.ts
    apps/search-service/src/infrastructure/kafka/kafka.config.ts
    apps/search-service/src/infrastructure/kafka/kafka.module.ts
  </files>
  <action>
    **Kafka Config** (kafka.config.ts):
    - Use @nestjs/config ConfigService for KAFKA_BROKERS, KAFKA_GROUP_ID
    - Export config object with clientId ('search-service'), brokers, groupId ('search-service-product-sync')

    **ProductEventConsumer**:
    - Implements OnModuleInit, OnModuleDestroy (lifecycle hooks)
    - Inject CommandBus from @nestjs/cqrs
    - Subscribe to topic `product.events` (consistent with current behavior)
    - Handle event types:
      - `ProductCreated` / `product.created` → dispatch IndexProductCommand
      - `ProductUpdated` / `product.updated` → dispatch IndexProductCommand (upsert)
      - `ProductDeleted` / `product.deleted` → dispatch RemoveProductCommand
    - Support both 'ProductCreated' and 'product.created' event type formats for compatibility
    - Error handling:
      - Catch and log errors per message
      - After 3 failures for same message, log to DLQ topic `product.events.dlq` (or just log error if DLQ topic not configured)
      - Never let a single bad message crash the consumer
    - Structured logging with event type, product ID, success/failure

    **Kafka Module** (kafka.module.ts):
    - Imports: ConfigModule
    - Providers: ProductEventConsumer
    - Note: Do NOT import CqrsModule here — it will be imported at AppModule level

    Delete old `src/consumer/` directory files after new ones are created.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Kafka consumer dispatches CQRS commands. Handles all 3 product event types. Error handling with retry tracking. Old consumer files removed.</done>
</task>

<task type="auto">
  <name>Create Redis Cache Adapter</name>
  <files>
    apps/search-service/src/infrastructure/cache/redis-cache.adapter.ts
    apps/search-service/src/infrastructure/cache/cache.module.ts
  </files>
  <action>
    **RedisCacheAdapter** (implements ISearchCachePort):
    - Inject Redis client (ioredis) via provider token REDIS_CLIENT
    - `get<T>(key)` — `redis.get(key)` → JSON.parse, return null on miss/error
    - `set<T>(key, value, ttlSeconds)` — `redis.setex(key, ttlSeconds, JSON.stringify(value))`
    - `delete(key)` — `redis.del(key)`
    - `generateKey(query: SearchQuery)` — create deterministic hash from query params:
      - Stringify: `{ q: query.query, f: query.filters, s: query.sort, p: query.pagination }`
      - Use simple hash function (e.g., sha256 or djb2 string hash)
      - Prefix with `search:` namespace → `search:<hash>`
    - **Graceful degradation**: All methods catch Redis errors and degrade gracefully
      - `get` returns null on error (cache miss behavior)
      - `set` silently fails on error (search still works)
      - Log warnings on Redis errors

    **Cache Module** (cache.module.ts):
    - Create Redis client provider using ConfigService (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD)
    - Provider token: REDIS_CLIENT
    - Provide SEARCH_CACHE_PORT → RedisCacheAdapter
    - Export SEARCH_CACHE_PORT
    - Handle Redis connection errors gracefully (don't crash service if Redis unavailable)

    Add `ioredis` to package.json dependencies.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Redis cache adapter implements ISearchCachePort with graceful degradation. Cache key generation uses deterministic hashing with `search:` namespace prefix.</done>
</task>

## Success Criteria
- [ ] Kafka consumer dispatches IndexProductCommand for created/updated events
- [ ] Kafka consumer dispatches RemoveProductCommand for deleted events
- [ ] Consumer handles both 'ProductCreated' and 'product.created' event type formats
- [ ] Error handling prevents single bad message from crashing consumer
- [ ] Redis cache adapter degrades gracefully on Redis unavailability
- [ ] Cache key generation is deterministic for same query params
- [ ] Old `src/consumer/` files removed
- [ ] `ioredis` added to package.json
- [ ] `npx tsc --noEmit` passes
