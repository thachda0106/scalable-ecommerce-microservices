---
phase: 11
plan: 4
wave: 2
depends_on: [1, 2]
files_modified:
  - apps/inventory-service/src/infrastructure/cache/redis-stock-cache.adapter.ts
  - apps/inventory-service/src/infrastructure/cache/redis-lock.service.ts
  - apps/inventory-service/src/infrastructure/messaging/kafka-event-publisher.ts
  - apps/inventory-service/src/infrastructure/messaging/outbox-relay.service.ts
  - apps/inventory-service/src/infrastructure/messaging/order-event-consumer.ts
  - apps/inventory-service/src/infrastructure/resilience/retry.policy.ts
  - apps/inventory-service/src/infrastructure/resilience/circuit-breaker.ts
  - apps/inventory-service/src/infrastructure/jobs/reservation-expiry.worker.ts
  - apps/inventory-service/src/config/inventory.config.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "RedisStockCacheAdapter implements IStockCache with acquireLock/releaseLock using SET NX PX"
    - "Lock release uses Lua script to prevent releasing another client's lock"
    - "KafkaEventPublisher implements IEventPublisher using outbox pattern (writes to DB, not directly to Kafka)"
    - "OutboxRelayService polls outbox_events table and publishes to Kafka topic inventory.events"
    - "OrderEventConsumer handles order.confirmed and order.failed events with idempotency"
    - "ReservationExpiryWorker runs on @Cron schedule, finds expired reservations, releases stock"
    - "RetryPolicy implements exponential backoff with configurable max retries"
    - "Config uses @nestjs/config registerAs pattern with validation"
  artifacts:
    - "apps/inventory-service/src/infrastructure/cache/redis-stock-cache.adapter.ts implements IStockCache"
    - "apps/inventory-service/src/infrastructure/messaging/order-event-consumer.ts exists"
    - "apps/inventory-service/src/infrastructure/jobs/reservation-expiry.worker.ts exists"
    - "apps/inventory-service/src/config/inventory.config.ts exists"
---

# Plan 11.4: Infrastructure — Redis, Kafka, Background Jobs & Config

<objective>
Implement Redis cache + lock, Kafka event publisher (via outbox), event consumers, background reservation expiry worker, retry/circuit breaker utilities, and centralized config.

Purpose: Connect the application layer to external systems. Redis provides caching + distributed locking. Kafka provides event mesh integration. Background worker prevents resource leaks from orphaned reservations.
Output: 9 infrastructure files.
</objective>

<context>
Load for context:
- apps/inventory-service/src/domain/ports/stock-cache.port.ts  (IStockCache interface to implement)
- apps/inventory-service/src/application/ports/event-publisher.port.ts  (IEventPublisher interface)
- apps/inventory-service/src/outbox/outbox-relay.service.ts  (current outbox — upgrade)
- apps/inventory-service/src/consumer/inventory-consumer.service.ts  (current consumer — replace)
- apps/cart-service/src/infrastructure/redis/cart-cache.repository.ts  (reference pattern)
- apps/cart-service/src/infrastructure/kafka/cart-events.producer.ts  (reference pattern)
- packages/core/src/observability/metrics.ts  (shared metrics module)
</context>

<tasks>

<task type="auto">
  <name>Implement Redis cache adapter with distributed locking and config module</name>
  <files>
    apps/inventory-service/src/infrastructure/cache/redis-stock-cache.adapter.ts
    apps/inventory-service/src/infrastructure/cache/redis-lock.service.ts
    apps/inventory-service/src/config/inventory.config.ts
  </files>
  <action>
    **inventory.config.ts** — centralized config with @nestjs/config:
    ```ts
    import { registerAs } from '@nestjs/config';

    export const inventoryConfig = registerAs('inventory', () => ({
      reservationTtlMinutes: parseInt(process.env.RESERVATION_TTL_MINUTES || '15'),
      lowStockThreshold: parseInt(process.env.LOW_STOCK_THRESHOLD || '100'),
      maxReserveItems: parseInt(process.env.MAX_RESERVE_ITEMS || '50'),
      expiryWorkerIntervalSeconds: parseInt(process.env.EXPIRY_WORKER_INTERVAL || '10'),
      expiryWorkerBatchSize: parseInt(process.env.EXPIRY_WORKER_BATCH_SIZE || '100'),
    }));

    export const redisConfig = registerAs('redis', () => ({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      lockTtlMs: parseInt(process.env.REDIS_LOCK_TTL_MS || '5000'),
      cacheTtlSeconds: parseInt(process.env.REDIS_CACHE_TTL_SECONDS || '10'),
    }));

    export const kafkaConfig = registerAs('kafka', () => ({
      brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(','),
      clientId: process.env.KAFKA_CLIENT_ID || 'inventory-service',
      consumerGroupId: process.env.KAFKA_CONSUMER_GROUP || 'inventory-service-group',
    }));

    export const databaseConfig = registerAs('database', () => ({
      url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/inventory',
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      poolMin: parseInt(process.env.DB_POOL_MIN || '5'),
      poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
    }));
    ```
    NOTE: `synchronize` defaults to FALSE (production safe). Only `true` when explicitly set.

    **redis-lock.service.ts** — standalone lock service:
    ```ts
    @Injectable()
    export class RedisLockService {
      private readonly RELEASE_LOCK_SCRIPT = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      constructor(@Inject('REDIS_CLIENT') private redis: Redis) {}

      async acquireLock(key: string, requestId: string, ttlMs: number = 5000): Promise<boolean> {
        const result = await this.redis.set(key, requestId, 'PX', ttlMs, 'NX');
        return result === 'OK';
      }

      async releaseLock(key: string, requestId: string): Promise<void> {
        await this.redis.eval(this.RELEASE_LOCK_SCRIPT, 1, key, requestId);
      }
    }
    ```
    The Lua script ensures only the lock owner can release the lock — prevents accidental release of another request's lock.

    **redis-stock-cache.adapter.ts** — implements `IStockCache`:
    - `@Injectable()` class `RedisStockCacheAdapter implements IStockCache`
    - Inject: `@Inject('REDIS_CLIENT') private redis: Redis`, `private lockService: RedisLockService`, `@Inject('inventory') private config`
    - `get(productId)`: `redis.get(\`inventory:stock:${productId}\`)` → parse JSON → `ProductInventory.reconstitute(parsed)` → return or null
    - `set(productId, inventory)`: `redis.setex(\`inventory:stock:${productId}\`, config.cacheTtlSeconds, JSON.stringify(inventory.toJSON()))`
    - `invalidate(productId)`: `redis.del(\`inventory:stock:${productId}\`)`
    - `acquireLock(productId, requestId, ttlMs?)`: delegate to `lockService.acquireLock(\`inventory:lock:${productId}\`, requestId, ttlMs ?? config.lockTtlMs)`
    - `releaseLock(productId, requestId)`: delegate to `lockService.releaseLock(\`inventory:lock:${productId}\`, requestId)`
    - Wrap ALL redis calls in try/catch — log warning but don't crash on Redis failure (cache is optional, locks degrade gracefully)

    AVOID hardcoding Redis config — use injected config.
    AVOID throwing on Redis failures in get/set/invalidate (cache is best-effort).
    DO throw on lock failure in acquireLock (return false, let handler decide).
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "cache|config" || echo "Redis cache and config compile OK"</verify>
  <done>RedisStockCacheAdapter implements IStockCache with cache-aside pattern and distributed locking. Lock uses Lua script for safe release. Config uses registerAs pattern with env var defaults. synchronize defaults to false.</done>
</task>

<task type="auto">
  <name>Implement Kafka publisher, outbox relay, event consumer, expiry worker, and resilience utilities</name>
  <files>
    apps/inventory-service/src/infrastructure/messaging/kafka-event-publisher.ts
    apps/inventory-service/src/infrastructure/messaging/outbox-relay.service.ts
    apps/inventory-service/src/infrastructure/messaging/order-event-consumer.ts
    apps/inventory-service/src/infrastructure/jobs/reservation-expiry.worker.ts
    apps/inventory-service/src/infrastructure/resilience/retry.policy.ts
    apps/inventory-service/src/infrastructure/resilience/circuit-breaker.ts
  </files>
  <action>
    **kafka-event-publisher.ts** — implements `IEventPublisher` via OUTBOX:
    - IMPORTANT: Does NOT publish directly to Kafka. Instead, writes events to the outbox_events table.
    - `@Injectable()` class `KafkaEventPublisher implements IEventPublisher`
    - Inject: `@InjectRepository(OutboxEventOrmEntity) private outboxRepo: Repository<OutboxEventOrmEntity>`
    - `publish(event)`: Create OutboxEventOrmEntity → populate id, type, payload, processed=false → save to DB
    - `publishBatch(events)`: Map all events to OutboxEventOrmEntity → `this.outboxRepo.save(entities)`
    - This ensures events are only published AFTER the business transaction commits

    **outbox-relay.service.ts** — upgrade from existing:
    - `@Injectable()` class `OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown`
    - Inject Kafka config, `@InjectRepository(OutboxEventOrmEntity) private outboxRepo`
    - Create Kafka producer in `onApplicationBootstrap`, disconnect in `onApplicationShutdown`
    - `@Cron(CronExpression.EVERY_SECOND)` method `relayEvents()`:
      - Query up to 50 unprocessed events ordered by createdAt ASC
      - Map to Kafka messages with `key = payload.productId || id`, `value = JSON.stringify(event envelope)`
      - Send to topic `inventory.events`
      - Mark events as `processed = true`
      - Wrap in single try/catch — log errors, retry next cycle
    - This is essentially the same as the current outbox but using config injection instead of hardcoded brokers

    **order-event-consumer.ts** — replaces current consumer:
    - `@Injectable()` class `OrderEventConsumer implements OnModuleInit, OnModuleDestroy`
    - Inject: `CommandBus` from @nestjs/cqrs, `@InjectRepository(ProcessedEventOrmEntity)` for idempotency
    - Create Kafka consumer in constructor using kafka config
    - Subscribe to topics: `order.events`, `cart.events`
    - `handleMessage(event)`:
      - **Idempotency check**: If eventId already in processed_events, skip
      - If `type === 'OrderConfirmed'`: Execute `ConfirmStockCommand` via CommandBus
      - If `type === 'OrderFailed'` or `type === 'OrderCancelled'`: Execute `ReleaseStockCommand` via CommandBus with reason 'order_failed'
      - If `type === 'CartExpired'`: Execute `ReleaseStockCommand` via CommandBus with reason 'cart_expired'
      - Save eventId to processed_events after successful handling
      - Wrap in try/catch — log error, DO NOT re-throw (prevents consumer group rebalance crash loop). If error persists after 3 retries, publish to DLQ topic.

    **reservation-expiry.worker.ts** — background cron job:
    - `@Injectable()` class `ReservationExpiryWorker`
    - Inject: `@Inject(INVENTORY_REPOSITORY) private repo: IInventoryRepository`, `@Inject(STOCK_CACHE) private cache: IStockCache`, `@Inject(EVENT_PUBLISHER) private publisher: IEventPublisher`, `@Inject('inventory') private config`
    - `@Cron('*/10 * * * * *')` method `handleExpiredReservations()` — runs every 10 seconds:
      1. `const expired = await this.repo.findExpiredReservations(config.expiryWorkerBatchSize)`
      2. For each expired reservation:
         a. Load inventory by productId
         b. Call `inventory.release(reservation.quantity, reservation.id, reservation.referenceId, 'reservation_expired')`
         c. Call `reservation.expire()`
         d. Create StockMovement(EXPIRE)
         e. Save inventory + movement, update reservation status
         f. Invalidate cache
      3. Publish all accumulated events
      4. Log: `Released ${expired.length} expired reservations`
    - Wrap in try/catch per reservation — one failure shouldn't block others

    **retry.policy.ts**:
    ```ts
    @Injectable()
    export class RetryPolicy {
      async execute<T>(fn: () => Promise<T>, opts?: { maxRetries?: number; baseDelayMs?: number; retryableErrors?: string[] }): Promise<T> {
        const maxRetries = opts?.maxRetries ?? 3;
        const baseDelay = opts?.baseDelayMs ?? 100;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try { return await fn(); }
          catch (error) {
            if (attempt === maxRetries) throw error;
            if (opts?.retryableErrors && !opts.retryableErrors.includes((error as Error).name)) throw error;
            await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
          }
        }
        throw new Error('Unreachable');
      }
    }
    ```

    **circuit-breaker.ts**:
    ```ts
    @Injectable()
    export class CircuitBreaker {
      private failures = 0;
      private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
      private nextRetryAt = 0;

      constructor(
        private readonly threshold: number = 5,
        private readonly resetTimeMs: number = 30000,
      ) {}

      async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
          if (Date.now() < this.nextRetryAt) {
            if (fallback) return fallback();
            throw new Error('Circuit breaker is OPEN');
          }
          this.state = 'HALF_OPEN';
        }
        try {
          const result = await fn();
          this.onSuccess();
          return result;
        } catch (error) {
          this.onFailure();
          if (fallback) return fallback();
          throw error;
        }
      }

      private onSuccess() { this.failures = 0; this.state = 'CLOSED'; }
      private onFailure() {
        this.failures++;
        if (this.failures >= this.threshold) {
          this.state = 'OPEN';
          this.nextRetryAt = Date.now() + this.resetTimeMs;
        }
      }
    }
    ```

    AVOID direct Kafka publish in KafkaEventPublisher — MUST use outbox pattern.
    AVOID re-throwing in OrderEventConsumer message handler — prevents crash loop.
    AVOID blocking the expiry worker on a single failed reservation.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "messaging|jobs|resilience" || echo "Kafka, jobs, resilience compile OK"</verify>
  <done>KafkaEventPublisher writes to outbox (not directly to Kafka). OutboxRelayService polls and publishes. OrderEventConsumer handles order.confirmed/failed with idempotency. ReservationExpiryWorker scans every 10s. RetryPolicy has exponential backoff. CircuitBreaker has CLOSED/OPEN/HALF_OPEN states.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for infrastructure files
- [ ] KafkaEventPublisher writes to outbox_events table, NOT directly to Kafka
- [ ] OrderEventConsumer checks processed_events before handling (idempotency)
- [ ] ReservationExpiryWorker queries expired reservations and releases stock
- [ ] Config values come from environment variables with sensible defaults
- [ ] Redis lock uses Lua script for safe release
</verification>

<success_criteria>
- [ ] 9 infrastructure files created
- [ ] Outbox pattern enforced for all event publishing
- [ ] Consumer idempotency via processed_events table
- [ ] Background expiry worker operational
- [ ] TypeScript compiles without errors
</success_criteria>
