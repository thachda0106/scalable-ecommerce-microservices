# Payment Events

The `payment-service` operates securely within our Kafka event-driven ecosystem.

## Subscribed (Consumed) Events

The `payment-service` actively listens to Kafka topics to receive commands. Although they act as "commands" mapped to DDD Use Cases, they are still fundamentally Kafka events within the `payment.commands` topic.

| Topic              | Event Type     | Source Payload Schema | Source Service  |
|--------------------|----------------|-----------------------|-----------------|
| `payment.commands`  | ProcessPayment | `{ orderId: string, amountInCents: number, currency: string, userId: string }` | `order-service` |

## Emitted (Published) Events

The service utilizes the Transactional Outbox pattern internally to guarantee exactly-once publication semantics when it transitions its local aggregate root `Payment` into success or failure states. The `OutboxRelayService` reads and forwards the recorded entries.

| Topic              | Event Type       | Emitted Payload Schema | Intended Consumer |
|--------------------|------------------|------------------------|-------------------|
| `payment.events`   | PaymentProcessed | `{ orderId: string, paymentId: string, transactionId: string, success: true }` | `order-service` |
| `payment.events`   | PaymentFailed    | `{ orderId: string, paymentId: string, reason: string, success: false }` | `order-service` |

*(Note: In the pure Domain logic these correlate to `payment.completed` and `payment.failed`, but they are mapped explicitly to `PaymentProcessed` and `PaymentFailed` strings via the `KafkaEventPublisher` component to provide backward compatibility with down-stream schemas.)*

## Additional Event Types Note
The local `payment-service` domain records internal-only metrics and transitions, such as:
* `payment.created`
* `payment.processing`
* `payment.refunded`
These map inherently to the internal Aggregate Root state tracking, but their Kafka translation mappings are managed explicitly inside `infrastructure/kafka/`.
