---
phase: 11
plan: 6
wave: 2
depends_on: [1, 2, 3, 4, 5]
files_modified:
  - apps/inventory-service/src/inventory.module.ts
  - apps/inventory-service/src/app.module.ts
  - apps/inventory-service/src/main.ts
  - apps/inventory-service/package.json
  - apps/inventory-service/.env.example
autonomous: true
user_setup: []

must_haves:
  truths:
    - "InventoryModule registers CqrsModule, all handlers, all port bindings with Symbol tokens"
    - "AppModule uses ConfigModule.forRoot with config factories, TypeOrmModule.forRootAsync using database config"
    - "synchronize is bound to databaseConfig.synchronize (defaults to false)"
    - "Old src/inventory/, src/consumer/, src/outbox/ directories are cleaned up or replaced"
    - "main.ts applies global ValidationPipe, logger, and exception filter"
    - "package.json has all required new dependencies added"
  artifacts:
    - "apps/inventory-service/src/inventory.module.ts wires all providers"
    - "apps/inventory-service/src/app.module.ts uses ConfigModule"
    - "apps/inventory-service/package.json has ioredis, @nestjs/cqrs, class-validator, @willsoto/nestjs-prometheus"
---

# Plan 11.6: Module Wiring, AppModule & Dependency Setup

<objective>
Wire all modules together: create InventoryModule binding all ports to implementations, upgrade AppModule to use ConfigModule with config factories, update main.ts with global pipes and filters, add missing dependencies to package.json, and clean up old scaffold files.

Purpose: This plan brings the entire service to a runnable state by connecting all layers.
Output: Updated module files, package.json, .env.example, cleaned up old files.
</objective>

<context>
Load for context:
- apps/inventory-service/src/app.module.ts  (current module — needs major upgrade)
- apps/inventory-service/src/main.ts  (current bootstrap)
- apps/inventory-service/package.json  (current deps)
- apps/cart-service/src/cart.module.ts  (reference for module wiring pattern)
- apps/cart-service/src/app.module.ts  (reference for AppModule pattern)
- All files created in Plans 11.1-11.5
</context>

<tasks>

<task type="auto">
  <name>Create InventoryModule and update AppModule with config-driven setup</name>
  <files>
    apps/inventory-service/src/inventory.module.ts
    apps/inventory-service/src/app.module.ts
    apps/inventory-service/src/main.ts
  </files>
  <action>
    **inventory.module.ts** — the feature module that wires everything:
    ```ts
    @Module({
      imports: [
        CqrsModule,
        TypeOrmModule.forFeature([
          ProductInventoryOrmEntity,
          StockReservationOrmEntity,
          StockMovementOrmEntity,
          OutboxEventOrmEntity,
          ProcessedEventOrmEntity,
        ]),
      ],
      controllers: [InventoryController],
      providers: [
        // Handlers
        ReserveStockHandler,
        ReleaseStockHandler,
        ConfirmStockHandler,
        ReplenishStockHandler,
        GetInventoryHandler,

        // Port bindings — Symbol → Concrete
        { provide: INVENTORY_REPOSITORY, useClass: TypeOrmInventoryRepository },
        { provide: STOCK_CACHE, useClass: RedisStockCacheAdapter },
        { provide: EVENT_PUBLISHER, useClass: KafkaEventPublisher },

        // Infrastructure services
        RedisLockService,
        OutboxRelayService,
        OrderEventConsumer,
        ReservationExpiryWorker,

        // Resilience
        RetryPolicy,
        CircuitBreaker,
      ],
      exports: [INVENTORY_REPOSITORY],
    })
    export class InventoryModule {}
    ```

    **app.module.ts** — root module with config-driven setup:
    ```ts
    @Module({
      imports: [
        // Config
        ConfigModule.forRoot({
          isGlobal: true,
          load: [inventoryConfig, redisConfig, kafkaConfig, databaseConfig],
        }),

        // Logger
        getLoggerModule(),

        // Scheduler for cron jobs (outbox relay, expiry worker)
        ScheduleModule.forRoot(),

        // Database — config-driven, NOT hardcoded
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres' as const,
            url: config.get('database.url'),
            entities: [
              ProductInventoryOrmEntity,
              StockReservationOrmEntity,
              StockMovementOrmEntity,
              OutboxEventOrmEntity,
              ProcessedEventOrmEntity,
            ],
            synchronize: config.get('database.synchronize', false),
            extra: {
              min: config.get('database.poolMin', 5),
              max: config.get('database.poolMax', 20),
            },
          }),
        }),

        // Feature modules
        InventoryModule,
        HealthModule,
        InventoryMetricsModule,
      ],
      providers: [
        // Redis client factory — shared across modules
        {
          provide: 'REDIS_CLIENT',
          useFactory: (config: ConfigService) => {
            const Redis = require('ioredis');
            return new Redis({
              host: config.get('redis.host'),
              port: config.get('redis.port'),
              password: config.get('redis.password'),
              lazyConnect: true,
              retryStrategy: (times: number) => Math.min(times * 100, 3000),
            });
          },
          inject: [ConfigService],
        },
      ],
      exports: ['REDIS_CLIENT'],
    })
    export class AppModule {}
    ```

    **main.ts** — production-ready bootstrap:
    ```ts
    import { NestFactory } from '@nestjs/core';
    import { ValidationPipe } from '@nestjs/common';
    import { AppModule } from './app.module';
    import { Logger } from '@ecommerce/core';
    import { DomainExceptionFilter } from './interfaces/filters/domain-exception.filter';

    async function bootstrap() {
      const app = await NestFactory.create(AppModule, { bufferLogs: true });
      app.useLogger(app.get(Logger));

      // Global validation pipe
      app.useGlobalPipes(new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }));

      // Global exception filter
      app.useGlobalFilters(new DomainExceptionFilter());

      const port = process.env.PORT ?? 3006;
      await app.listen(port);
    }
    bootstrap();
    ```

    Delete old files that are now replaced:
    - Delete `src/app.controller.ts` and `src/app.controller.spec.ts` (replaced by InventoryController + HealthController)
    - Delete `src/app.service.ts` (no longer needed)
    - Delete `src/inventory/` directory (replaced by new DDD structure)
    - Delete `src/consumer/` directory (replaced by OrderEventConsumer)
    - Delete `src/outbox/` directory (replaced by new outbox infrastructure)

    AVOID keeping any references to old cart/outbox/consumer modules in AppModule.
    AVOID hardcoded database URLs — use ConfigService.
    CRITICAL: `synchronize` MUST default to `false` — only override via env var for development.
  </action>
  <verify>npx tsc --noEmit 2>&1 | tail -20</verify>
  <done>InventoryModule wires CqrsModule + all handlers + all 3 port bindings via Symbol tokens. AppModule uses ConfigModule.forRoot with TypeOrmModule.forRootAsync (config-driven). main.ts applies global ValidationPipe (whitelist, transform, forbidNonWhitelisted) and DomainExceptionFilter. Old scaffold files deleted.</done>
</task>

<task type="auto">
  <name>Update package.json dependencies and create .env.example</name>
  <files>
    apps/inventory-service/package.json
    apps/inventory-service/.env.example
  </files>
  <action>
    **package.json** — add to dependencies:
    - `"@nestjs/config": "^3.0.0"` (if not present)
    - `"@nestjs/cqrs": "^10.2.7"` (CQRS module)
    - `"class-validator": "^0.14.0"` (DTO validation)
    - `"class-transformer": "^0.5.1"` (DTO transformation)
    - `"ioredis": "^5.3.0"` (Redis client)
    - `"@willsoto/nestjs-prometheus": "^6.0.0"` (Prometheus metrics)
    - `"prom-client": "^15.0.0"` (Prometheus client)

    Keep existing deps: `@ecommerce/core`, `@ecommerce/events`, `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/schedule`, `@nestjs/typeorm`, `kafkajs`, `pg`, `typeorm`, `uuid`, `reflect-metadata`, `rxjs`

    Remove if present: any deps that are no longer needed

    Add devDependencies:
    - `"@types/ioredis": "^5.0.0"` (if available, though ioredis 5.x has built-in types)

    **.env.example** — document all environment variables:
    ```env
    # Database
    DATABASE_URL=postgres://postgres:postgres@localhost:5432/inventory
    DB_SYNCHRONIZE=false
    DB_POOL_MIN=5
    DB_POOL_MAX=20

    # Redis
    REDIS_HOST=localhost
    REDIS_PORT=6379
    REDIS_PASSWORD=
    REDIS_LOCK_TTL_MS=5000
    REDIS_CACHE_TTL_SECONDS=10

    # Kafka
    KAFKA_BROKERS=localhost:29092
    KAFKA_CLIENT_ID=inventory-service
    KAFKA_CONSUMER_GROUP=inventory-service-group

    # Inventory
    RESERVATION_TTL_MINUTES=15
    LOW_STOCK_THRESHOLD=100
    MAX_RESERVE_ITEMS=50
    EXPIRY_WORKER_INTERVAL=10
    EXPIRY_WORKER_BATCH_SIZE=100

    # Service
    PORT=3006

    # Security
    INTERNAL_API_KEY=your-internal-api-key-here

    # Feature Flags
    FF_REDIS_CACHE=true
    FF_RESERVATION_EXPIRY=true
    FF_LOW_STOCK_ALERTS=true
    ```

    AVOID removing existing deps that may still be needed.
    After updating package.json, run `pnpm install` from inventory-service root.
  </action>
  <verify>cd apps/inventory-service && pnpm install 2>&1 | tail -5 && npx tsc --noEmit 2>&1 | tail -20</verify>
  <done>package.json has all required dependencies. .env.example documents all environment variables with sensible defaults. pnpm install succeeds. TypeScript compiles without errors. synchronize defaults to false.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `pnpm install` succeeds in inventory-service
- [ ] `npx tsc --noEmit` from inventory-service shows zero errors
- [ ] AppModule imports ConfigModule.forRoot with all config factories
- [ ] TypeOrmModule.forRootAsync uses ConfigService (not hardcoded URL)
- [ ] Old src/inventory/, src/consumer/, src/outbox/ directories are removed
- [ ] .env.example lists all environment variables
- [ ] main.ts applies global ValidationPipe + DomainExceptionFilter
</verification>

<success_criteria>
- [ ] All modules wired correctly
- [ ] Config-driven database/redis/kafka setup
- [ ] `pnpm install` and `npx tsc --noEmit` both succeed
- [ ] Old scaffold files cleaned up
- [ ] .env.example is comprehensive
</success_criteria>
