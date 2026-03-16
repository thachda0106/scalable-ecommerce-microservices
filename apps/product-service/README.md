# Product Service

Production-grade product catalog microservice built with DDD, Clean Architecture, and modular NestJS.

## Architecture

4-layer Clean Architecture:
- **Domain** — Product aggregate, value objects, domain events, errors (zero framework deps)
- **Application** — CQRS commands/queries, handlers, application ports
- **Infrastructure** — TypeORM persistence, Redis cache, Kafka event publisher, Prometheus metrics
- **Interface** — REST controllers, DTOs with validation, exception filters

## Quick Start

```bash
# Install dependencies
pnpm install

# Set environment variables (or copy .env.example → .env)
cp .env.example .env

# Run in development
pnpm start:dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/products` | Create product |
| GET | `/products` | List products (paginated, filterable) |
| GET | `/products/:id` | Get product by ID |
| PATCH | `/products/:id` | Update product details |
| PATCH | `/products/:id/status` | Change product status |
| DELETE | `/products/:id` | Delete product |
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/ecommerce` | PostgreSQL connection |
| `KAFKA_BROKERS` | `localhost:29092` | Kafka broker addresses |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `PORT` | `3000` | HTTP server port |

## Documentation

- [Architecture](docs/product-service-architecture.md)
- [Events](docs/product-service-events.md)
- [Data Access](docs/product-service-data-access.md)
