---
phase: 13
plan: 6
wave: 2
---

# Plan 13.6: Infrastructure — Kafka Producers, Consumers & Saga Orchestrator

## Objective
Implement Kafka integration for publishing domain events and consuming external events.
Implement the Saga orchestrator for distributed order workflow across services.
Add idempotent event processing using processed_events table.

## Context
- .gsd/SPEC.md
- apps/order-service/src/domain/events/ (domain events)
- apps/order-service/src/application/ports/ (IEventPublisher, IInventoryService, IPaymentService)
- apps/order-service/src/application/handlers/ (command handlers)
- apps/order-service/src/outbox/ (current outbox — will be refactored)
- apps/order-service/src/sagas/checkout-saga.service.ts (current saga — will be refactored)
- apps/inventory-service/src/infrastructure/messaging/ (established pattern)

## Tasks

<task type="auto">
  <name>Create Kafka Producer (Event Publisher) and Outbox Relay</name>
  <files>
    apps/order-service/src/infrastructure/kafka/kafka-event-publisher.ts
    apps/order-service/src/infrastructure/kafka/outbox-relay.service.ts
    apps/order-service/src/infrastructure/kafka/index.ts
  </files>
  <action>
    **KafkaEventPublisher** implements IEventPublisher:
    - Inject KafkaJS producer (configure via env vars)
    - `publish(event)`: Write to outbox_events table (transactional outbox pattern)
      Don't publish directly to Kafka — use outbox relay for exactly-once semantics.
    - `publishAll(events)`: Batch write to outbox

    **OutboxRelayService** (refactored from current):
    - @Cron(EVERY_SECOND) poll unprocessed outbox events
    - Map domain event types to Kafka topics:
      - 'order.created' → topic: 'order.events'
      - 'order.payment.requested' → topic: 'order.events'
      - 'order.paid' → topic: 'order.events'
      - 'order.confirmed' → topic: 'order.events'
      - 'order.cancelled' → topic: 'order.events'
      - 'order.shipped' → topic: 'order.events'
      - 'order.completed' → topic: 'order.events'
    - Use orderId as Kafka message key (ensures ordering per order)
    - Mark events as processed after successful send
    - Batch processing (up to 50 events per cycle)
    - Error handling with logging

    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>KafkaEventPublisher using transactional outbox pattern. OutboxRelayService polls and publishes to Kafka with proper ordering.</done>
</task>

<task type="auto">
  <name>Create Kafka Consumers and Saga Orchestrator</name>
  <files>
    apps/order-service/src/infrastructure/kafka/consumers/payment-event.consumer.ts
    apps/order-service/src/infrastructure/kafka/consumers/inventory-event.consumer.ts
    apps/order-service/src/infrastructure/kafka/consumers/index.ts
    apps/order-service/src/infrastructure/kafka/saga/checkout-saga.orchestrator.ts
    apps/order-service/src/infrastructure/kafka/saga/index.ts
  </files>
  <action>
    **PaymentEventConsumer** — NestJS service, OnModuleInit:
    - Subscribe to 'payment.events' topic
    - Consumer group: 'order-service-payment'
    - Dispatch events to handlers with idempotency check:
      - 'PaymentProcessed' / 'payment.completed' → ConfirmPaymentHandler
      - 'PaymentFailed' / 'payment.failed' → CancelOrderHandler (reason: 'Payment failed')
    - Idempotency: Check IProcessedEventRepository.exists(eventId) before processing
    - On success: markProcessed(eventId)
    - On error: log and skip (dead letter in Plan 13.8)

    **InventoryEventConsumer** — NestJS service, OnModuleInit:
    - Subscribe to 'inventory.events' topic
    - Consumer group: 'order-service-inventory'
    - Dispatch events:
      - 'InventoryReserved' → Saga: proceed to payment
      - 'InventoryReservationFailed' → CancelOrderHandler (reason: 'Inventory unavailable')
    - Same idempotency pattern

    **CheckoutSagaOrchestrator** (refactored from current):
    - Manages the distributed order workflow:
      Flow:
        1. OrderCreated → Reserve inventory (via IInventoryService)
        2. InventoryReserved → Request payment (via IPaymentService)
        3. PaymentProcessed → Confirm order (via ConfirmPaymentHandler)
      Compensation:
        1. InventoryFailed → Cancel order
        2. PaymentFailed → Release inventory + Cancel order
    - Saga state tracked through Order status transitions
    - Each step is idempotent (checks current order status before acting)
    - Inject command handlers + service ports for orchestration

    Barrel exports from index.ts files.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>2 Kafka consumers with idempotent processing. Saga orchestrator managing distributed checkout flow with compensation logic.</done>
</task>

<task type="auto">
  <name>Create External Service Clients</name>
  <files>
    apps/order-service/src/infrastructure/external-services/kafka-inventory.service.ts
    apps/order-service/src/infrastructure/external-services/kafka-payment.service.ts
    apps/order-service/src/infrastructure/external-services/index.ts
  </files>
  <action>
    **KafkaInventoryService** implements IInventoryService:
    - `reserveInventory()`: Publish command event to 'inventory.commands' topic
      Message: { type: 'ReserveInventory', payload: { orderId, items } }
    - `releaseInventory()`: Publish compensation event to 'inventory.commands' topic
      Message: { type: 'ReleaseInventory', payload: { orderId } }

    **KafkaPaymentService** implements IPaymentService:
    - `requestPayment()`: Publish command event to 'payment.commands' topic
      Message: { type: 'ProcessPayment', payload: { orderId, amount, userId } }

    Both services use KafkaJS producer directly.
    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>2 external service clients implementing ports via Kafka command messages. Clean anti-corruption layer between order and external services.</done>
</task>

## Success Criteria
- [ ] KafkaEventPublisher using transactional outbox (not direct Kafka publish)
- [ ] OutboxRelayService with topic mapping and batch processing
- [ ] PaymentEventConsumer and InventoryEventConsumer with idempotent processing
- [ ] CheckoutSagaOrchestrator with happy path + compensation flows
- [ ] KafkaInventoryService and KafkaPaymentService implementing ports
- [ ] All consumers check processed_events before handling
- [ ] `npx tsc --noEmit` passes
