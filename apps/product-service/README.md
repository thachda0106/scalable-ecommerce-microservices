# Product Service

## Service Overview
The `product-service` is a core backend microservice responsible for managing the ecommerce platform's product catalog. It handles everything from product creation and updates to inventory status management and provides high-performance, paginated, and filterable product catalog views for consumers and other services.

## Product Catalog Responsibilities
- **Product Catalog Management**: Create, read, update, and delete products in the catalog.
- **Product Details & Attributes**: Manage rich product descriptions, pricing, currencies, and category associations.
- **Product Availability**: Track and manage product stock statuses (Active, Inactive, Out of Stock, Archived).
- **Event Publishing**: Broadcast lifecycle changes to other microservices via Kafka.

## Architecture Overview
The service is built using **Domain-Driven Design (DDD)** and **Clean Architecture**, implemented with **NestJS**.
1. **Domain Layer**: Contains the core business logic, the `Product` aggregate, value objects, domain events, and repository interfaces. Framework agnostic.
2. **Application Layer**: Implements CQRS with specific commands and queries, orchestrating domain behaviors and coordinating with infrastructure ports.
3. **Infrastructure Layer**: Implements technical details like TypeORM for PostgreSQL persistence, Redis for caching, and Kafka for event publishing (via Transactional Outbox).
4. **Interface Layer**: REST API controllers, DTOs with validation rules, and exception filters.

## Folder Structure
```
src/
├── application/
│   ├── commands/     # CQRS Commands
│   ├── queries/      # CQRS Queries
│   ├── handlers/     # Command & Query Handlers
│   └── ports/        # Application-level interfaces
├── domain/
│   ├── entities/     # Models and Aggregates
│   ├── events/       # Domain Events
│   ├── errors/       # Custom Exceptions
│   ├── value-objects/# VOs (Money, ProductId, ProductStatus)
│   └── ports/        # Domain-level interfaces
├── infrastructure/
│   ├── persistence/  # TypeORM entities, repositories, mappers
│   ├── kafka/        # Kafka publisher, Outbox relay
│   ├── redis/        # Redis cache repository
│   └── observability/# Prometheus metrics
├── interfaces/
│   ├── controllers/  # REST endpoints
│   ├── dtos/         # Request DTOs
│   ├── filters/      # Exception filters
│   └── product.module.ts # Dependency injection
└── app.module.ts     # Root module
```

## API Overview
- `POST /products` - Create a new product
- `GET /products` - Get paginated products with filtering (category, status, price) and sorting
- `GET /products/:id` - Get product details by ID (cached)
- `PATCH /products/:id` - Update product details
- `PATCH /products/:id/status` - Update product availability status
- `DELETE /products/:id` - Soft-delete/Archive product

## Event Flow
The service acts as the source of truth for product data. It uses the **Transactional Outbox Pattern** to guarantee at-least-once delivery of events to Kafka:
1. Product mutation occurs in a DB transaction.
2. A domain event is saved to an `outbox_events` table in the same transaction.
3. A background relay service polls the outbox and publishes to Kafka (`product.events` topic).
4. Other services (like search-service, order-service) consume these events.

## Setup Instructions
1. Ensure you have Node.js 20+, `pnpm`, PostgreSQL, Redis, and Apache Kafka running.
2. Clone the repository and navigate to `apps/product-service`.
3. Install dependencies: `pnpm install`

## Running Locally

```bash
# Provide environment variables
cp .env.example .env

# Run in development mode
pnpm start:dev

# Build for production
pnpm build
pnpm start:prod
```

## Environment Variables
See `.env.example` for required environment variables. Add them to a `.env` file before running the application.

## Testing

```bash
# Run unit tests
pnpm test

# Run e2e tests
pnpm test:e2e

# Check test coverage
pnpm test:cov
```
