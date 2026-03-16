# Order Service

The **Order Service** is a production-grade NestJS microservice responsible for managing the complete order lifecycle in a distributed ecommerce platform. It handles order creation, payment orchestration, fulfillment tracking, and emits domain events for downstream services via Kafka.

Built with **Domain-Driven Design (DDD)**, **Clean Architecture**, **CQRS**, and the **Saga pattern**.

---

## Table of Contents

- [Responsibilities](#responsibilities)
- [Architecture Overview](#architecture-overview)
- [Order Lifecycle](#order-lifecycle)
- [Folder Structure](#folder-structure)
- [Event Flow](#event-flow)
- [API Overview](#api-overview)
- [Setup Instructions](#setup-instructions)
- [Local Development](#local-development)
- [Running the Service](#running-the-service)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Observability](#observability)
- [Related Documentation](#related-documentation)

---

## Responsibilities

- **Creating orders** — Accepts cart items with validation and computes totals using integer-cents money representation
- **Managing order lifecycle** — Enforces a state machine with 8 statuses and guarded transitions
- **Saga orchestration** — Coordinates the distributed checkout flow across inventory and payment services
- **Emitting domain events** — Publishes events via the transactional outbox pattern to Kafka
- **Idempotent event processing** — Deduplicates consumed events using the `processed_events` table
- **Optimistic concurrency control** — Uses versioned updates to prevent race conditions

---

## Architecture Overview

The service follows a strict **4-layer Clean Architecture** with an inward dependency rule:

```mermaid
graph TB
    subgraph Interface["Interface Layer"]
        C[OrderController]
        HC[HealthController]
        MC[MetricsController]
        DTO[DTOs + Validation]
        F[DomainExceptionFilter]
    end

    subgraph Application["Application Layer"]
        CMD[Commands<br/>Create, Cancel, Ship,<br/>Deliver, Refund, ConfirmPayment]
        QRY[Queries<br/>GetOrderById, GetOrdersByUser]
        H[Handlers × 8]
        AP[Ports: IEventPublisher,<br/>IInventoryService, IPaymentService]
    end

    subgraph Domain["Domain Layer — Pure TypeScript"]
        E[Order Aggregate Root]
        EI[OrderItem Entity]
        VO[Value Objects<br/>OrderId, UserId, Money, OrderStatus]
        DE[Domain Events × 8]
        ERR[Domain Errors]
        DP[Ports: IOrderRepository,<br/>IProcessedEventRepository]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        DB[TypeORM Repositories]
        K[Kafka Publisher + Consumers]
        S[Checkout Saga Orchestrator]
        OB[Outbox Relay Service]
        EXT[External Service Clients]
        OBS[Prometheus Metrics]
    end

    Interface --> Application
    Application --> Domain
    Infrastructure --> Domain
    Infrastructure --> Application
```

> **Key rule:** The `domain/` layer has **zero `@nestjs` imports** — it is pure TypeScript, fully testable without framework bootstrap.

---

## Order Lifecycle

Orders follow a strict state machine with 8 statuses. Invalid transitions throw `InvalidOrderStatusTransitionError`.

```mermaid
stateDiagram-v2
    [*] --> CREATED: Order.create()
    CREATED --> PENDING_PAYMENT: Inventory reserved
    CREATED --> CANCELLED: Reservation failed

    PENDING_PAYMENT --> PAID: Payment completed
    PENDING_PAYMENT --> CANCELLED: Payment failed

    PAID --> CONFIRMED: Order.confirm()
    PAID --> REFUNDED: Order.refund()

    CONFIRMED --> SHIPPED: Order.ship()
    CONFIRMED --> CANCELLED: Order.cancel()

    SHIPPED --> DELIVERED: Order.deliver()

    DELIVERED --> REFUNDED: Order.refund()

    CANCELLED --> [*]
    REFUNDED --> [*]
```

| Status | Description | Terminal |
|--------|-------------|---------|
| `CREATED` | Order placed, awaiting inventory reservation | No |
| `PENDING_PAYMENT` | Inventory reserved, payment requested | No |
| `PAID` | Payment confirmed | No |
| `CONFIRMED` | Order confirmed for fulfillment | No |
| `SHIPPED` | Order dispatched with tracking number | No |
| `DELIVERED` | Order received by customer | No |
| `CANCELLED` | Order cancelled (compensation applied) | Yes |
| `REFUNDED` | Full refund issued | Yes |

For detailed lifecycle documentation, see [docs/order-lifecycle.md](docs/order-lifecycle.md).

---

## Folder Structure

```
src/
├── main.ts                              # Application bootstrap
├── app.module.ts                        # Root module (TypeORM + OrderModule)
├── domain/                              # Pure business logic (zero @nestjs imports)
│   ├── entities/                        # Order (aggregate root), OrderItem
│   ├── value-objects/                   # OrderId, UserId, Money, OrderStatus
│   ├── events/                          # 8 domain events + BaseDomainEvent
│   ├── errors/                          # DomainException, InvalidOrderStatusTransition, InvalidOrderOperation
│   └── ports/                           # IOrderRepository, IProcessedEventRepository
├── application/                         # Use case orchestration
│   ├── commands/                        # 6 command DTOs (CreateOrder, ConfirmPayment, Cancel, Ship, Deliver, Refund)
│   ├── queries/                         # 2 query DTOs (GetOrderById, GetOrdersByUser)
│   ├── handlers/                        # 8 handlers (6 command + 2 query)
│   └── ports/                           # IEventPublisher, IInventoryService, IPaymentService
├── infrastructure/                      # Technical implementations
│   ├── persistence/
│   │   ├── entities/                    # TypeORM ORM entities
│   │   ├── mappers/                     # Domain ↔ ORM bidirectional mappers
│   │   └── repositories/               # TypeORM repository implementations
│   ├── kafka/
│   │   ├── consumers/                   # PaymentEventConsumer, InventoryEventConsumer
│   │   ├── saga/                        # CheckoutSagaOrchestrator
│   │   ├── kafka-event-publisher.ts     # Outbox-based event publishing
│   │   └── outbox-relay.service.ts      # Scheduled outbox → Kafka relay
│   ├── external-services/               # KafkaInventoryService, KafkaPaymentService
│   └── observability/                   # OrderMetricsService, MetricsController
└── interfaces/                          # HTTP and messaging interface
    ├── controllers/                     # OrderController, HealthController
    ├── dto/                             # Request validation DTOs (class-validator)
    ├── filters/                         # DomainExceptionFilter
    └── order.module.ts                  # DI wiring for entire service
```

---

## Event Flow

The checkout saga orchestrates distributed transactions across services using Kafka events:

```mermaid
sequenceDiagram
    participant Client
    participant Order as Order Service
    participant Inventory as Inventory Service
    participant Payment as Payment Service
    participant Notification as Notification Service

    Client->>Order: POST /orders
    Order->>Order: Create Order (CREATED)
    Order-->>Inventory: order.created (via Kafka)

    alt Inventory Reserved
        Inventory-->>Order: stock.reserved
        Order->>Order: requestPayment() → PENDING_PAYMENT
        Order-->>Payment: order.payment.requested

        alt Payment Success
            Payment-->>Order: payment.completed
            Order->>Order: confirmPayment() → PAID
            Order-->>Notification: order.paid
        else Payment Failed
            Payment-->>Order: payment.failed
            Order->>Order: cancel() → CANCELLED
            Order-->>Inventory: order.cancelled (release stock)
        end
    else Reservation Failed
        Inventory-->>Order: stock.reservation.failed
        Order->>Order: cancel() → CANCELLED
    end
```

### Domain Events Published

| Event | Kafka Topic | Trigger |
|-------|-------------|---------|
| `order.created` | `order.events` | New order placed |
| `order.payment.requested` | `order.events` | Inventory reserved |
| `order.paid` | `order.events` | Payment confirmed |
| `order.confirmed` | `order.events` | Order confirmed |
| `order.cancelled` | `order.events` | Order cancelled |
| `order.shipped` | `order.events` | Order shipped |
| `order.completed` | `order.events` | Order delivered |
| `order.refunded` | `order.events` | Order refunded |

### Events Consumed

| Kafka Topic | Event | Action |
|-------------|-------|--------|
| `payment.events` | `payment.completed` | Confirm payment → PAID |
| `payment.events` | `payment.failed` | Cancel order → CANCELLED |
| `inventory.events` | `stock.reserved` | Request payment → PENDING_PAYMENT |
| `inventory.events` | `stock.reservation.failed` | Cancel order → CANCELLED |

For detailed event documentation, see [docs/order-service-events.md](docs/order-service-events.md).

---

## API Overview

All endpoints are under the `/orders` prefix. Validation uses `class-validator` with `whitelist: true`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Create a new order |
| `GET` | `/orders/:id` | Get order by ID |
| `GET` | `/orders/user/:userId` | Get all orders for a user |
| `PATCH` | `/orders/:id/ship` | Mark order as shipped |
| `PATCH` | `/orders/:id/deliver` | Mark order as delivered |
| `PATCH` | `/orders/:id/cancel` | Cancel an order |
| `PATCH` | `/orders/:id/refund` | Refund an order |
| `GET` | `/health` | Health check |
| `GET` | `/metrics` | Prometheus metrics |

For detailed API documentation, see [docs/order-api-flow.md](docs/order-api-flow.md).

---

## Setup Instructions

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** (workspace package manager)
- **PostgreSQL** ≥ 14
- **Apache Kafka** (or Docker Compose for local dev)

### Install Dependencies

```bash
# From the monorepo root
pnpm install
```

### Database Setup

```bash
# Create the database
createdb order_db

# TypeORM auto-syncs schema in development (synchronize: true)
# For production, use migrations
```

### Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your local configuration
```

---

## Local Development

```bash
# Start in watch mode (auto-restart on file changes)
pnpm run start:dev

# Start with debug mode
pnpm run start:debug
```

The service starts on `http://localhost:3006` by default (configured via `PORT` env var).

> **Note:** Ensure PostgreSQL and Kafka are running locally. Use Docker Compose from the project root for a full local environment.

---

## Running the Service

```bash
# Development
pnpm run start

# Watch mode
pnpm run start:dev

# Production build
pnpm run build
pnpm run start:prod

# Docker
docker build -t order-service .
docker run -p 3006:3006 --env-file .env order-service
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3006` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/order_db` |
| `KAFKA_BROKERS` | Comma-separated Kafka broker addresses | `localhost:29092` |
| `NODE_ENV` | Environment (`development` / `production`) | `development` |

> In development, TypeORM `synchronize` and `logging` are enabled automatically. In production, both are disabled.

See [.env.example](.env.example) for a fully commented reference.

---

## Testing

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:cov

# Type-check without emitting
npx tsc --noEmit

# Lint
pnpm run lint
```

### Test Structure

Tests are co-located with source files in `__tests__/` directories:

- `domain/entities/__tests__/` — Order aggregate and OrderItem unit tests
- `domain/value-objects/__tests__/` — Money value object tests
- `application/handlers/__tests__/` — Command handler tests (CreateOrder, ConfirmPayment, CancelOrder)

---

## Observability

### Prometheus Metrics

Exposed at `GET /metrics` via `prom-client`:

| Metric | Type | Description |
|--------|------|-------------|
| `orders_created_total` | Counter | Total orders created |
| `orders_cancelled_total` | Counter | Total orders cancelled |
| `payment_failures_total` | Counter | Total payment failures |
| `order_processing_duration_seconds` | Histogram | Order processing latency |

### Structured Logging

- Development: verbose logging with TypeORM query logs
- Production: structured JSON logs (configured via `NODE_ENV`)

### Health Check

```
GET /health → { "status": "ok", "service": "order-service", "timestamp": "..." }
```

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [order-service-architecture.md](docs/order-service-architecture.md) | Layered architecture, design decisions |
| [order-data-model.md](docs/order-data-model.md) | Domain model, database schema, ER diagram |
| [order-lifecycle.md](docs/order-lifecycle.md) | State machine, transitions, happy/failure paths |
| [order-service-events.md](docs/order-service-events.md) | Domain events, payloads, consumers |
| [order-api-flow.md](docs/order-api-flow.md) | API endpoints, request flow, examples |
| [order-service-saga.md](docs/order-service-saga.md) | Checkout saga, compensation matrix |
| [order-service-database.md](docs/order-service-database.md) | Database tables, indexes, OCC |
