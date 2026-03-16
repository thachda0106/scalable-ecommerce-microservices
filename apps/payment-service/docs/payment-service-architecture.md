# Payment Service Architecture

## Architecture Overview
The `payment-service` is designed using Domain-Driven Design (DDD) and Clean Architecture principles, ensuring scalability, maintainability, and loose coupling from external technologies.

### Modules

1. **Domain Layer**:
   - The heart of the service.
   - Contains the `Payment` Aggregate Root and value objects such as `Money` and `PaymentStatus`.
   - Defines pure interfaces (Ports) for persistence (`IPaymentRepository`) and provider integration (`IPaymentProvider`).
   - Generates Domain Events (`PaymentCreatedEvent`, `PaymentFailedEvent`, etc.)

2. **Application Layer**:
   - Implements CQRS (Command Query Responsibility Segregation).
   - Handlers orchestrate business processes (e.g., `ProcessPaymentHandler` coordinates idempotency checks, domain logic, and provider execution).

3. **Infrastructure Layer**:
   - Implements the defined domain ports.
   - Contains TypeORM models (`PaymentOrmEntity`, `OutboxEventOrmEntity`) and mapping logic.
   - Houses Kafka consumer sets and Outbox Relays for event publishing.
   - Contains the Payment Strategy Implementations (`StripeProvider`, `PayPalProvider`, `MockProvider`).

4. **Interface Layer**:
   - Very thin layer containing standard HTTP controllers (`PaymentController`).

## Event Flow

The primary trigger for the application is heavily asynchronous via Kafka messages rather than HTTP requests:

1. A message arrives on `payment.commands` (e.g., `ProcessPayment`).
2. The `PaymentCommandConsumer` deserializes the message, validates its format, and verifies **idempotency** using the `processed_events` table (to prevent double-charges).
3. The internal CQRS command is passed to `ProcessPaymentHandler`.
4. The handler invokes the third-party payment gateway via the abstracted Provider Factory.
5. The `Payment` aggregate state changes (`SUCCESS` or `FAILED`). Domain events are extracted.
6. The `TypeOrmPaymentRepository` saves both the `payment_transactions` rows and `outbox_events` rows within **a single ACID database transaction**.
7. The `OutboxRelayService` runs natively via a cron (or tailing process), picks up un-dispatched rows from `outbox_events`, and pushes them to `payment.events`. This guarantees event emission semantics.

## Queue Processing

- **payment.commands**: The central queue that holds action requests. Handled by the generic `PaymentCommandConsumer`.
- **payment.events**: The central broadcast queue displaying final states of payment attempts.
- **DLQ (Dead Letter Queue)**: Built into the Kafka ecosystem. Unprocessable requests or systemic failures that reach the max retry bounds in the consumer logic are shuttled to `payment.commands.dlq` for human intervention or delayed retry logic.
