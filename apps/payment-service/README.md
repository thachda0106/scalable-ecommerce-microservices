# Payment Service

## Service Overview
The `payment-service` is an essential microservice within the ecommerce platform. It is responsible for handling all payment-related operations, integrating seamlessly with external payment gateways (such as Stripe and PayPal), and ensuring robust and synchronized payment state management across the distributed system.

## Responsibilities
- **Payment Processing**: Execute charges for orders asynchronously.
- **Payment Lifecycle Management**: Track payment state from intent to completion or failure.
- **Provider Abstraction**: Integrate with multiple third-party payment providers identically.
- **Event Emission**: Broadcast payment outcomes to the broader system using domain events (Kafka), allowing other services to react (e.g., `order-service`, `notification-service`).

## Payment Lifecycle
The canonical payment state machine:
`PENDING` → `PROCESSING` → `SUCCESS` → `REFUNDED`
(Wait, it can also go to `FAILED` from PENDING/PROCESSING).
See detailed documentation in `docs/payment-lifecycle.md`.

## Architecture Overview
The service uses a Clean Architecture / DDD (Domain-Driven Design) approach.  
Layers:
- **Domain**: Contains aggregates (`Payment`), value objects (`Money`, `PaymentStatus`), entities, and domain events. Fully isolated from external frameworks.
- **Application**: Contains CQRS Commands/Queries, Handlers, and application-specific ports.
- **Infrastructure**: Houses Adapters—TypeORM persistence, Kafka event publishers and consumers, and Payment Provider Strategy implementations.
- **Interfaces**: Contains the NestJS REST controllers, DTOs, and Module definitions.

For a deeper dive, review `docs/payment-service-architecture.md`.

## Folder Structure Explanation
```text
src/
├── domain/         # Core business logic. Zero dependencies on NestJS/Infrastructure.
├── application/    # Orchestration of domain logic, Use Cases (CQRS Commands/Queries).
├── infrastructure/ # External concerns: Database (TypeORM), Messaging (Kafka), Providers (Stripe).
└── interfaces/     # Entry points: REST API Controllers and DTO validation.
```

## Event Flow
The service operates primarily asynchronously via Kafka:
1. Listens to `payment.commands` topic to initiate a payment.
2. Emits `PaymentProcessed` or `PaymentFailed` events to `payment.events` topic using the Transactional Outbox pattern.
For full details, read `docs/payment-events.md`.

## External Payment Providers Integration
Supports the Strategy pattern allowing different providers to handle transactions.
Currently implements:
- **MockProvider** (Development/Testing)
- **StripeProvider**
- **PayPalProvider**
Read `docs/payment-providers.md` for integration details.

## Setup Instructions
Ensure you have the following prerequisites:
- Node.js (>= 18)
- pnpm
- PostgreSQL running locally or via Docker
- Kafka & Zookeeper running

## Running Locally

1. Copy the example env file:
```bash
cp .env.example .env
```
2. Start the service (assumes dependencies are installed at root workspace):
```bash
pnpm start:dev payment-service
```

## Environment Variables
See the `.env.example` file for configurable variables required to run the service. Key ones include `DATABASE_URL`, `KAFKA_BROKER`, and `PAYMENT_PROVIDER`.

## Testing
Comprehensive testing is required for domain logic, handlers, and integration flows.
```bash
pnpm test
```

## Observability
Uses `@ecommerce/core` for built-in observability:
- **Metrics**: Exposed at `/metrics` (Prometheus counters, histograms).
- **Logging**: Structured JSON logging (Pino) mapping to OpenTelemetry standards.
- **Tracing**: Distributed tracing via OpenTelemetry decorators, ensuring spans trace across Kafka boundaries.
