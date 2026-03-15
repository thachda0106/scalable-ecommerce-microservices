# Cart Service

> Part of the **scalable-ecommerce-microservices** platform.

Shopping cart microservice built with NestJS, DDD, Clean Architecture, and CQRS.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| Primary Store | Redis (WATCH/MULTI/EXEC optimistic locking) |
| Cache | Redis (write-through, 1h TTL) |
| Events | Kafka via Redis Stream outbox |
| Observability | Prometheus metrics, OpenTelemetry tracing, Pino structured logging |
| Health Checks | `@nestjs/terminus` + Redis PING |
| Rate Limiting | `@nestjs/throttler` (60 req/60s default) |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start in development mode (requires Redis on localhost:6379)
pnpm run start:dev

# Run tests
pnpm test

# Run tests with coverage
pnpm test:cov

# Build for production
pnpm run build
```

## Environment Variables

See [.env.example](.env.example) for all available configuration.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3004` | HTTP listen port |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `KAFKA_BROKER` | `localhost:9092` | Kafka broker address |
| `PRODUCT_SERVICE_URL` | — | Product service base URL |
| `INVENTORY_SERVICE_URL` | — | Inventory service base URL |

## API Endpoints

All endpoints are versioned under `/v1` and require the `x-user-id` header (set by the API Gateway).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/cart/:userId` | Fetch cart (cache-first) |
| `POST` | `/v1/cart/:userId/items` | Add item (201 Created) |
| `PATCH` | `/v1/cart/:userId/items/:productId` | Update item quantity |
| `DELETE` | `/v1/cart/:userId/items/:productId` | Remove item |
| `DELETE` | `/v1/cart/:userId` | Clear cart |
| `GET` | `/health` | Health check (Redis connectivity) |
| `GET` | `/metrics` | Prometheus metrics |

## Architecture

See [`docs/`](docs/) for detailed documentation:

- [Architecture Overview](docs/cart-service-architecture.md)
- [Data Architecture](docs/cart-service-data-architecture.md)
- [API Endpoints & Flows](docs/cart-service-endpoints-flow.md)

## Docker

```bash
# Build from monorepo root
docker build -f apps/cart-service/Dockerfile -t cart-service .

# Run
docker run -p 3004:3004 \
  -e REDIS_HOST=host.docker.internal \
  -e KAFKA_BROKER=host.docker.internal:9092 \
  cart-service
```

## Project Structure

```
src/
├── domain/           # Pure business logic — zero framework deps
├── application/      # CQRS commands, queries, handlers, ports
├── infrastructure/   # Redis, Kafka, HTTP client adapters
├── interfaces/       # Controllers, DTOs, guards, filters, interceptors
├── config/           # Validated configuration
├── cart.module.ts    # DI wiring
├── app.module.ts     # Root module (logger, metrics, terminus)
└── main.ts           # Bootstrap (versioning, validation, tracing)
```

## Testing

```bash
# 8 suites, 58 tests
pnpm test

# Available test suites:
# - cart.entity.spec.ts (17 domain logic tests)
# - add-item.handler.spec.ts (7 tests incl. product/stock validation)
# - remove-item.handler.spec.ts (4 tests)
# - update-item-quantity.handler.spec.ts (4 tests)
# - clear-cart.handler.spec.ts (3 tests)
# - get-cart.handler.spec.ts (5 tests)
# - user-id.guard.spec.ts (4 tests)
# - domain-exception.filter.spec.ts (7 tests)
```

## License

Private — part of the scalable-ecommerce-microservices monorepo.
