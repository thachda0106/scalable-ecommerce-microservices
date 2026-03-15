# Inventory Service

> Part of the **scalable-ecommerce-microservices** platform.

Production-grade inventory management service for large-scale e-commerce. Handles millions of concurrent stock operations with **zero overselling guarantee**.

## Architecture

- **Pattern**: DDD + Clean Architecture + CQRS + Event-Driven
- **Data**: PostgreSQL (source of truth, OCC) + Redis (cache, distributed locks)
- **Messaging**: Kafka via Transactional Outbox pattern
- **Concurrency**: 3-layer defense (Redis lock → PostgreSQL OCC → Transaction isolation)

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env

# Development
pnpm start:dev

# Tests
pnpm test

# Production
pnpm build
pnpm start:prod
```

## Environment Variables

See [`.env.example`](.env.example) for all required configuration. Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://...localhost:5432/inventory` | PostgreSQL connection |
| `REDIS_HOST` | `localhost` | Redis for cache + locks |
| `KAFKA_BROKERS` | `localhost:29092` | Kafka brokers |
| `PORT` | `3006` | HTTP listen port |
| `INTERNAL_API_KEY` | — | Service-to-service auth |
| `RESERVATION_TTL_MINUTES` | `15` | Cart reservation TTL |
| `LOW_STOCK_THRESHOLD` | `100` | Low stock alert trigger |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/inventory/:productId` | Get current stock levels |
| `POST` | `/inventory/reserve` | Reserve stock for cart/order |
| `POST` | `/inventory/release` | Release reserved stock |
| `POST` | `/inventory/confirm` | Confirm reserved → sold |
| `POST` | `/inventory/replenish` | Restock inventory |
| `GET` | `/health` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe (DB + Redis) |

All mutation endpoints accept `idempotencyKey` for safe retries.

## Project Structure

```
src/
├── domain/                    # Pure business logic (ZERO framework deps)
│   ├── entities/              # ProductInventory, StockReservation, StockMovement
│   ├── value-objects/         # ProductId, Quantity, ReservationStatus
│   ├── errors/                # InsufficientStockError, ReservationNotFoundError
│   ├── events/                # Domain events (Reserved, Released, Confirmed, LowStock)
│   └── ports/                 # IInventoryRepository, IStockCache
├── application/               # CQRS use-case orchestration
│   ├── commands/              # ReserveStock, ReleaseStock, ConfirmStock, Replenish
│   ├── queries/               # GetInventory
│   ├── handlers/              # 5 CQRS handlers
│   └── ports/                 # IEventPublisher
├── infrastructure/            # Concrete adapters
│   ├── persistence/           # TypeORM entities, mappers, repository
│   ├── cache/                 # Redis lock + cache adapter
│   ├── messaging/             # Kafka publisher (outbox), relay, consumer
│   ├── jobs/                  # Reservation expiry cron worker
│   └── resilience/            # RetryPolicy, CircuitBreaker
├── interfaces/                # HTTP boundary
│   ├── controllers/           # InventoryController (thin, CQRS delegation)
│   ├── dto/                   # Request/response DTOs with class-validator
│   ├── guards/                # ServiceAuthGuard
│   └── filters/               # DomainExceptionFilter
├── health/                    # Liveness + readiness probes
├── metrics/                   # Prometheus metrics (9 counters/histograms)
├── config/                    # Centralized config (registerAs)
├── inventory.module.ts        # Feature module with port bindings
├── app.module.ts              # Root module
└── main.ts                    # Bootstrap
```

## Documentation

- [`docs/inventory-service-architecture.md`](docs/inventory-service-architecture.md) — Service architecture overview
- [`docs/inventory-service-data-architecture.md`](docs/inventory-service-data-architecture.md) — Data layer design
- [`docs/inventory-service-endpoints-flow.md`](docs/inventory-service-endpoints-flow.md) — API reference & execution flows

## Tests

```bash
pnpm test                    # Run all tests
pnpm test:cov                # With coverage
pnpm test:watch              # Watch mode
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@nestjs/cqrs` | CQRS command/query bus |
| `@nestjs/typeorm` + `typeorm` | PostgreSQL ORM with OCC |
| `ioredis` | Redis client (cache + distributed locks) |
| `kafkajs` | Kafka producer/consumer |
| `class-validator` + `class-transformer` | DTO validation |
| `@nestjs/schedule` | Cron jobs (outbox relay, expiry worker) |
| `@willsoto/nestjs-prometheus` | Prometheus metrics |
| `@ecommerce/core` | Shared logging/metrics/tracing |
