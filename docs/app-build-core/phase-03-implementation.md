# Phase 3 — Platform / Core Shared Modules: Implementation Roadmap

---

## GOALS

Build the **shared engineering platform** that every service imports. This is infrastructure code —
not business logic. Done right, service teams write zero boilerplate for logging, error handling,
Kafka integration, database connections, or resilience patterns. Done wrong, you have 10 services
with 10 different logging formats.

**Outcome:** Three published npm packages (`@ecommerce/core`, `@ecommerce/events`, `@ecommerce/shared-types`)
that any new service can `pnpm add` and immediately have production-grade infrastructure.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **Package Manager** | pnpm workspaces | Workspace linking, strict deps, fast installs |
| **Build Tool** | TypeScript compiler (tsc) | Simple, no bundler overhead for Node libraries |
| **ORM** | TypeORM | NestJS-native, PostgreSQL support, migrations, active-record & data-mapper |
| **Redis Client** | ioredis | Cluster support, pipelining, Lua scripts |
| **Kafka Client** | kafkajs | Native Node.js, no Java deps, idempotent producer |
| **OpenSearch Client** | @opensearch-project/opensearch | Official client, type-safe |
| **Logging** | Custom structured logger (JSON stdout) | CloudWatch/ELK compatible, no dependency on Winston |
| **Metrics** | prom-client | Prometheus standard, Grafana compatible |
| **Tracing** | @opentelemetry/sdk-node | Vendor-neutral, auto-instrumentation |
| **Validation** | class-validator + class-transformer | NestJS-native, decorator-based |
| **Health Checks** | @nestjs/terminus | Built-in DB, Redis, memory indicators |
| **Rate Limiting** | Custom Redis-based | Distributed rate limits (shared across instances) |

---

## ARCHITECTURE DECISIONS

### ADR-010: NestJS Dynamic Modules for Shared Code

```
Decision: All shared modules use NestJS DynamicModule.forRoot(options) pattern
Rationale:
  - Services configure modules per their needs (e.g., different DB connection strings)
  - NestJS dependency injection handles lifecycle
  - No implicit globals — explicit imports in each service's AppModule
Example:
  DatabaseModule.forRoot({ host: 'db-host', database: 'order_db' })
  KafkaModule.forRoot({ brokers: ['kafka:9092'], groupId: 'order-service' })
```

### ADR-011: Outbox Pattern with Polling (Not CDC)

```
Decision: Poll outbox table every 5 seconds (not Change Data Capture)
Rationale:
  - CDC (Debezium) requires managing a connector, ZooKeeper, schema registry
  - Polling is simple, sufficient for our throughput (< 10K events/sec)
  - Easy to debug (query the outbox table directly)
When to switch to CDC: If outbox polling latency (5s) becomes unacceptable
  or we exceed 10K events/sec sustained
```

### ADR-012: Inbox Pattern with PostgreSQL (Not Redis)

```
Decision: Inbox deduplication uses PostgreSQL (same DB as the service) not Redis
Rationale:
  - Deduplication check and business logic can be in the same DB transaction
  - No additional dependency (Redis might be down when DB is up)
  - Unique constraint on event_id provides natural deduplication
Trade-off: Slightly slower than Redis lookups, but consistency is more important
```

---

## IMPLEMENTATION STEPS

### Build Order

```
Week 1: Foundation Layer
────────────────────────
  Step 1: Initialize pnpm workspace + package scaffolding        [Day 1]
  Step 2: @ecommerce/shared-types package                        [Day 1]
  Step 3: @ecommerce/events — event definitions + envelope       [Day 1-2]
  Step 4: Logger module                                           [Day 2]
  Step 5: Config module                                           [Day 2]
  Step 6: Global exception filter + error handling               [Day 3]

Week 2: Persistence + Security
──────────────────────────────
  Step 7: Database module (TypeORM dynamic module)               [Day 4]
  Step 8: Base entity (id, createdAt, updatedAt, tenantId)       [Day 4]
  Step 9: Base repository                                         [Day 4-5]
  Step 10: Redis module                                           [Day 5]
  Step 11: JWT auth guard + roles guard                          [Day 5-6]
  Step 12: Tenant context middleware                              [Day 6]
  Step 13: Health check module                                    [Day 6]

Week 3: Event Infrastructure
────────────────────────────
  Step 14: Kafka producer service                                 [Day 7]
  Step 15: Outbox entity + outbox service                        [Day 7-8]
  Step 16: Outbox relay (background poller)                      [Day 8]
  Step 17: Inbox entity + inbox service                          [Day 8-9]
  Step 18: Base event consumer (dedup + error handling)          [Day 9]
  Step 19: Inbox processor (retry failed events)                 [Day 9]
  Step 20: Inbox cleanup service                                  [Day 10]

Week 4: Resilience + Observability
──────────────────────────────────
  Step 21: Circuit breaker                                        [Day 11]
  Step 22: Retry decorator / utility                             [Day 11]
  Step 23: Rate limiter (Redis-based)                            [Day 12]
  Step 24: Idempotency service                                   [Day 12]
  Step 25: Metrics service (Prometheus)                          [Day 13]
  Step 26: Tracing module (OpenTelemetry)                        [Day 13]
  Step 27: Logging interceptor (http request/response)           [Day 14]
  Step 28: Timeout interceptor                                    [Day 14]
  Step 29: Integration testing + publish packages                [Day 14]
```

---

## TASK BREAKDOWN

```
Phase 3 — Platform / Core Shared Modules
├── [ ] 3.1 — Package Scaffolding
│   ├── [ ] Create packages/shared-types/package.json
│   ├── [ ] Create packages/events/package.json
│   ├── [ ] Create packages/core/package.json
│   ├── [ ] Configure pnpm-workspace.yaml
│   ├── [ ] Configure tsconfig.base.json with path aliases
│   ├── [ ] Verify cross-package imports work
│   └── [ ] Add build scripts (pnpm -r build)
│
├── [ ] 3.2 — @ecommerce/shared-types
│   ├── [ ] Pagination types (PaginatedResult, PaginationQuery)
│   ├── [ ] API response types (ApiResponse, ApiError)
│   ├── [ ] Common types (UUID, ISO timestamp, Money)
│   ├── [ ] Enum types (OrderStatus, PaymentStatus, UserRole)
│   └── [ ] Export all from index.ts
│
├── [ ] 3.3 — @ecommerce/events
│   ├── [ ] Event envelope interface (EventEnvelope<T>)
│   ├── [ ] Product events (ProductCreated, ProductUpdated, ProductDeleted)
│   ├── [ ] Order events (OrderCreated, OrderConfirmed, OrderFailed, etc.)
│   ├── [ ] Inventory events (StockReserved, StockReleased, etc.)
│   ├── [ ] Payment events (PaymentProcessed, PaymentFailed, RefundProcessed)
│   ├── [ ] User events (UserRegistered, UserProfileUpdated)
│   ├── [ ] Cart events (CartCheckedOut)
│   ├── [ ] Notification events (NotificationSent)
│   ├── [ ] Topic constants (PRODUCT_EVENTS_TOPIC, etc.)
│   └── [ ] Export all from index.ts
│
├── [ ] 3.4 — Logger Module
│   ├── [ ] StructuredLogger service (JSON stdout)
│   ├── [ ] Log levels (error, warn, info, debug)
│   ├── [ ] Context propagation (traceId, userId, tenantId)
│   ├── [ ] LoggerModule.forRoot({ serviceName })
│   └── [ ] Unit test: log format is valid JSON
│
├── [ ] 3.5 — Config Module
│   ├── [ ] ServiceConfigModule.forRoot()
│   ├── [ ] Environment-aware .env loading
│   ├── [ ] Typed config validation (class-validator)
│   └── [ ] Support for SSM Parameter Store (optional)
│
├── [ ] 3.6 — Error Handling
│   ├── [ ] GlobalExceptionFilter
│   ├── [ ] Standardized error response format
│   ├── [ ] HttpException mapping
│   ├── [ ] Kafka deserialization error handling
│   ├── [ ] Log error with full stack trace + context
│   └── [ ] Unit test: error response format
│
├── [ ] 3.7 — Database Module
│   ├── [ ] DatabaseModule.forRoot(options) dynamic module
│   ├── [ ] TypeORM configuration (SSL, pool size, logging)
│   ├── [ ] BaseEntity (id UUID, createdAt, updatedAt)
│   ├── [ ] TenantAwareEntity (adds tenantId column)
│   ├── [ ] Migration runner configuration
│   └── [ ] Test: connect to local PostgreSQL
│
├── [ ] 3.8 — Base Repository
│   ├── [ ] Generic CRUD (findById, findAll, create, update, delete)
│   ├── [ ] Pagination with cursor support
│   ├── [ ] Tenant-scoped queries
│   ├── [ ] Soft delete support
│   └── [ ] Unit test: all CRUD operations
│
├── [ ] 3.9 — Redis Module
│   ├── [ ] RedisModule.forRoot({ host, port, password })
│   ├── [ ] RedisService with get/set/del/expire
│   ├── [ ] Connection pool management
│   ├── [ ] Health check indicator
│   └── [ ] Test: connect to local Redis
│
├── [ ] 3.10 — Security Modules
│   ├── [ ] JwtAuthGuard (verify Bearer token)
│   ├── [ ] RolesGuard (check user roles from JWT)
│   ├── [ ] @Roles() decorator
│   ├── [ ] @Public() decorator (skip auth)
│   ├── [ ] TenantContextMiddleware (extract tenantId from JWT)
│   ├── [ ] @CurrentUser() parameter decorator
│   └── [ ] Unit test: valid/invalid/expired tokens
│
├── [ ] 3.11 — Health Check Module
│   ├── [ ] /health endpoint (liveness)
│   ├── [ ] /health/ready endpoint (readiness — checks DB, Redis, Kafka)
│   ├── [ ] TypeORM health indicator
│   ├── [ ] Redis health indicator
│   ├── [ ] Memory health indicator
│   └── [ ] Test: health returns 200 when healthy
│
├── [ ] 3.12 — Kafka Producer
│   ├── [ ] KafkaProducerService (connect, disconnect, publish)
│   ├── [ ] Idempotent producer configuration
│   ├── [ ] Header injection (correlation-id, event-type, source)
│   ├── [ ] Error handling with retry
│   └── [ ] Test: publish message to test topic
│
├── [ ] 3.13 — Outbox Pattern
│   ├── [ ] OutboxEventEntity (TypeORM entity)
│   ├── [ ] OutboxService.save(event) — saves in current transaction
│   ├── [ ] OutboxRelayService — polls every 5s, publishes to Kafka
│   ├── [ ] Cleanup: delete published events older than 24h
│   ├── [ ] Retry count tracking
│   ├── [ ] Metrics: outbox_pending_count, outbox_relay_duration
│   └── [ ] Test: event reaches Kafka after outbox save
│
├── [ ] 3.14 — Inbox Pattern
│   ├── [ ] InboxEventEntity (TypeORM entity)
│   ├── [ ] InboxService.isDuplicate(eventId)
│   ├── [ ] InboxService.store(event)
│   ├── [ ] InboxService.markProcessed(eventId)
│   ├── [ ] InboxService.markFailed(eventId, error)
│   ├── [ ] InboxProcessor — retries FAILED events with backoff
│   ├── [ ] InboxCleanupService — deletes PROCESSED events older than 7 days
│   ├── [ ] BaseEventConsumer abstract class
│   │   ├── [ ] Deduplication via InboxService
│   │   ├── [ ] Error handling → markFailed
│   │   └── [ ] Logging with correlationId
│   └── [ ] Test: duplicate events are skipped
│
├── [ ] 3.15 — Resilience Patterns
│   ├── [ ] CircuitBreaker class
│   │   ├── [ ] States: CLOSED → OPEN → HALF_OPEN
│   │   ├── [ ] Configurable threshold and timeout
│   │   └── [ ] Metrics: circuit_breaker_state, failures_total
│   ├── [ ] withRetry() utility
│   │   ├── [ ] Exponential backoff with jitter
│   │   ├── [ ] Configurable retryable errors
│   │   └── [ ] Max retry count (default 3)
│   ├── [ ] RateLimiter (Redis sliding window)
│   │   ├── [ ] Per-key rate limiting
│   │   ├── [ ] X-RateLimit-Remaining header
│   │   └── [ ] 429 response with Retry-After
│   └── [ ] IdempotencyService
│       ├── [ ] Redis-backed with TTL
│       ├── [ ] Lock-based execution
│       └── [ ] Test: duplicate calls return cached result
│
├── [ ] 3.16 — Observability Modules
│   ├── [ ] MetricsService (prom-client counters, histograms)
│   ├── [ ] /metrics endpoint (Prometheus scraping)
│   ├── [ ] TracingModule.forRoot() (OpenTelemetry)
│   ├── [ ] Auto-instrumentation for HTTP, PostgreSQL, Redis
│   ├── [ ] LoggingInterceptor (log request/response with duration)
│   ├── [ ] TimeoutInterceptor (configurable per-route timeout)
│   └── [ ] CorrelationIdMiddleware (generate/propagate X-Correlation-Id)
│
└── [ ] 3.17 — Integration Testing & Publishing
    ├── [ ] Create a test service that imports all modules
    ├── [ ] Verify: Logger, Config, DB, Redis, Kafka, Health all boot
    ├── [ ] Build all packages: pnpm -r build
    ├── [ ] Verify: imports resolve correctly from other packages
    └── [ ] Document module usage guide in packages/core/README.md
```

---

## FOLDER STRUCTURE

```
packages/
├── shared-types/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── pagination.ts
│       ├── api-response.ts
│       ├── enums/
│       │   ├── order-status.enum.ts
│       │   ├── payment-status.enum.ts
│       │   └── user-role.enum.ts
│       └── common.types.ts
│
├── events/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── envelope.ts
│       ├── topics.ts                    # PRODUCT_EVENTS_TOPIC, ORDER_EVENTS_TOPIC, etc.
│       ├── product.events.ts
│       ├── order.events.ts
│       ├── inventory.events.ts
│       ├── payment.events.ts
│       ├── user.events.ts
│       ├── cart.events.ts
│       └── notification.events.ts
│
└── core/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts                     # Public API — exports everything
        │
        ├── config/
        │   ├── config.module.ts
        │   └── config.validation.ts
        │
        ├── filters/
        │   └── global-exception.filter.ts
        │
        ├── interceptors/
        │   ├── logging.interceptor.ts
        │   └── timeout.interceptor.ts
        │
        ├── kafka/
        │   ├── kafka.module.ts
        │   ├── kafka-producer.service.ts
        │   ├── base-event-consumer.ts
        │   ├── outbox/
        │   │   ├── outbox.entity.ts
        │   │   ├── outbox.service.ts
        │   │   └── outbox-relay.service.ts
        │   └── inbox/
        │       ├── inbox.entity.ts
        │       ├── inbox.service.ts
        │       ├── inbox-processor.ts
        │       └── inbox-cleanup.service.ts
        │
        ├── observability/
        │   ├── logger.service.ts
        │   ├── metrics.service.ts
        │   ├── metrics.controller.ts
        │   ├── tracing.module.ts
        │   └── correlation-id.middleware.ts
        │
        ├── persistence/
        │   ├── database.module.ts
        │   ├── base.entity.ts
        │   ├── tenant-aware.entity.ts
        │   └── base.repository.ts
        │
        ├── resilience/
        │   ├── circuit-breaker.ts
        │   ├── retry.ts
        │   ├── rate-limiter.ts
        │   └── idempotency.service.ts
        │
        ├── security/
        │   ├── jwt-auth.guard.ts
        │   ├── roles.guard.ts
        │   ├── roles.decorator.ts
        │   ├── public.decorator.ts
        │   ├── current-user.decorator.ts
        │   └── tenant-context.middleware.ts
        │
        ├── health/
        │   ├── health.module.ts
        │   ├── health.controller.ts
        │   ├── redis-health.indicator.ts
        │   └── kafka-health.indicator.ts
        │
        └── redis/
            ├── redis.module.ts
            └── redis.service.ts
```

---

## EXAMPLE CONFIGS

### Package.json for @ecommerce/core

```json
{
  "name": "@ecommerce/core",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "build:watch": "tsc -w -p tsconfig.json",
    "lint": "eslint src/",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/terminus": "^11.0.0",
    "@nestjs/typeorm": "^11.0.0",
    "typeorm": "^0.3.20",
    "kafkajs": "^2.2.4",
    "ioredis": "^5.3.2",
    "prom-client": "^15.1.0",
    "@opentelemetry/sdk-node": "^0.50.0",
    "@ecommerce/events": "workspace:*",
    "@ecommerce/shared-types": "workspace:*"
  }
}
```

### How a Service Uses Core Modules

```typescript
// apps/order-service/src/app.module.ts
import {
  DatabaseModule,
  KafkaModule,
  RedisModule,
  HealthModule,
  LoggerModule,
  SecurityModule,
} from '@ecommerce/core';

@Module({
  imports: [
    LoggerModule.forRoot({ serviceName: 'order-service' }),
    DatabaseModule.forRoot({
      host: process.env.DB_HOST,
      port: 5432,
      database: 'order_db',
      entities: [OrderOrmEntity, OrderItemOrmEntity, OutboxEventEntity, InboxEventEntity],
    }),
    RedisModule.forRoot({
      host: process.env.REDIS_HOST,
      port: 6379,
    }),
    KafkaModule.forRoot({
      brokers: process.env.KAFKA_BROKERS.split(','),
      groupId: 'order-service',
    }),
    SecurityModule.forRoot({
      jwtSecret: process.env.JWT_SECRET,
    }),
    HealthModule,
    // ... service-specific modules
  ],
})
export class AppModule {}
```

---

## DEPENDENCIES

```
Phase 3 depends on:
  └── Phase 1 (event schemas, data models, API spec)
  └── Phase 2 (running dev environment with PostgreSQL, Redis, Kafka)

Internal dependencies (build order):
  3.2 shared-types       → required by 3.3 events, 3.8 base-repo
  3.3 events             → required by 3.12 kafka-producer, 3.14 inbox
  3.4 logger             → required by EVERYTHING (logging is foundational)
  3.5 config             → required by 3.7 database, 3.9 redis
  3.7 database           → required by 3.8 base-repo, 3.13 outbox, 3.14 inbox
  3.9 redis              → required by 3.10 security (blacklist), 3.15 resilience
  3.12 kafka-producer    → required by 3.13 outbox-relay
  3.13 outbox            → required by 3.14 inbox (same pattern)
  3.14 inbox             → required by Phase 4 (consumers)

  Parallel waves:
    Wave 1: 3.1 scaffolding + 3.2 shared-types
    Wave 2: 3.3 events + 3.4 logger + 3.5 config
    Wave 3: 3.6 errors + 3.7 database + 3.9 redis
    Wave 4: 3.8 base-repo + 3.10 security + 3.11 health
    Wave 5: 3.12 kafka + 3.13 outbox + 3.14 inbox
    Wave 6: 3.15 resilience + 3.16 observability
    Wave 7: 3.17 integration test
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | `@ecommerce/shared-types` builds and exports all types | `pnpm --filter @ecommerce/shared-types build` passes |
| D2 | `@ecommerce/events` builds with all event types | Import event types compile correctly |
| D3 | `@ecommerce/core` builds with all modules | `pnpm --filter @ecommerce/core build` passes |
| D4 | A test service boots with all core modules imported | `pnpm start:dev` starts without errors |
| D5 | Health check endpoint returns service status | `curl localhost:3000/health` returns JSON |
| D6 | Logger outputs structured JSON | Log lines are valid JSON with correct fields |
| D7 | Outbox relay publishes events to Kafka | Event appears in Kafka topic after DB save |
| D8 | Inbox deduplication skips duplicate events | Second identical event is skipped |
| D9 | Circuit breaker opens after failure threshold | Subsequent calls rejected when open |
| D10 | README documents all module usage patterns | Engineers can import modules without asking |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Putting business logic in core.** The `@ecommerce/core` package should NEVER import from
> `apps/*`. If you need `OrderStatus` in core, it belongs in `@ecommerce/shared-types`.
>
> **2. Not testing modules in isolation.** Each module needs unit tests BEFORE services use it.
> Discovering a bug in `OutboxRelayService` after 5 services depend on it is expensive.
>
> **3. Over-abstracting.** A `BaseService<T>` that handles every possible business pattern
> becomes impossible to maintain. Keep base classes thin — CRUD only.
>
> **4. Synchronous Kafka publishing.** Never call `kafkaProducer.publish()` directly in an HTTP
> handler. Use the Outbox pattern — save to outbox table in the same DB transaction.
>
> **5. Ignoring module configuration defaults.** Every configurable value should have a sensible
> default. Don't force services to specify 20 config values to use a module.
>
> **6. Not logging module initialization.** Services should log "✅ DatabaseModule connected to
> order_db" on startup. Silent startup makes debugging boot failures impossible.

---

> **Next →** [Phase 4 — Microservices Implementation](./phase-04-implementation.md)
