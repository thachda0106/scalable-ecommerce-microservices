---
phase: 20
plan: 5
wave: 3
---

# Plan 20.5: Reliability — DLQ, Idempotency & Graceful Shutdown

## Objective
Add DLQ routing and idempotent processing to all Kafka consumers that lack it. Add graceful shutdown hooks to all services. Replace in-memory retry counters with persistent state. This ensures no message loss and clean service restarts.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 4 findings)
- apps/payment-service/src/infrastructure/kafka/consumers/payment-command.consumer.ts (DLQ reference)
- apps/inventory-service/src/infrastructure/messaging/order-event-consumer.ts (idempotent reference)
- apps/notification-service/src/infrastructure/kafka/consumers/ (missing idempotency)
- apps/search-service/src/infrastructure/kafka/consumers/product-event.consumer.ts (missing both)

## Tasks

<task type="auto">
  <name>Add shared KafkaDlqProducer to packages/core</name>
  <files>
    packages/core/src/kafka/dlq-producer.ts (NEW)
    packages/core/src/index.ts (MODIFY)
  </files>
  <action>
    Create `packages/core/src/kafka/dlq-producer.ts`:

    ```typescript
    export class KafkaDlqProducer {
      constructor(private readonly producer: Producer) {}

      async sendToDlq(
        originalTopic: string,
        message: KafkaMessage,
        error: Error,
      ): Promise<void> {
        await this.producer.send({
          topic: `${originalTopic}.dlq`,
          messages: [{
            key: message.key,
            value: message.value,
            headers: {
              ...message.headers,
              'x-dlq-reason': error.message,
              'x-dlq-timestamp': new Date().toISOString(),
              'x-dlq-original-topic': originalTopic,
            },
          }],
        });
      }
    }
    ```

    Export from `packages/core/src/index.ts`.

    This eliminates per-service DLQ boilerplate. Convention: `<original-topic>.dlq`.
  </action>
  <verify>grep -n "KafkaDlqProducer" packages/core/src/index.ts</verify>
  <done>KafkaDlqProducer exported from @ecommerce/core</done>
</task>

<task type="auto">
  <name>Add DLQ + idempotency to notification-service and search-service consumers</name>
  <files>
    apps/notification-service/src/infrastructure/kafka/consumers/order-events.consumer.ts (MODIFY)
    apps/notification-service/src/infrastructure/kafka/consumers/user-events.consumer.ts (MODIFY)
    apps/notification-service/src/infrastructure/kafka/consumers/cart-events.consumer.ts (MODIFY)
    apps/search-service/src/infrastructure/kafka/consumers/product-event.consumer.ts (MODIFY)
  </files>
  <action>
    For notification-service consumers:
    1. Create a `processed_events` in-memory Set (notification doesn't use PostgreSQL currently)
    2. Check `processedSet.has(eventId)` before processing
    3. Add `processedSet.add(eventId)` after successful processing
    4. Wrap message processing in try/catch; on max retries, call `dlqProducer.sendToDlq()`
    5. Import `KafkaDlqProducer` from `@ecommerce/core`

    For search-service consumer:
    1. Add same in-memory idempotency (search indexing is inherently idempotent, but dedup prevents wasted work)
    2. Replace the `// In production: publish to product.events.dlq topic` TODO with actual DLQ call
    3. Import `KafkaDlqProducer` from `@ecommerce/core`

    Also add DLQ to:
    - order-service `InventoryEventConsumer` and `PaymentEventConsumer` (already idempotent, just missing DLQ)
    - inventory-service `OrderEventConsumer` (already idempotent, just missing DLQ)
  </action>
  <verify>grep -rn "sendToDlq\|dlq" apps/notification-service/src/ apps/search-service/src/ apps/order-service/src/ apps/inventory-service/src/ --include="*.ts" | wc -l</verify>
  <done>DLQ calls present in all consumer files across 4 services</done>
</task>

<task type="auto">
  <name>Add enableShutdownHooks to all main.ts files</name>
  <files>
    apps/api-gateway/src/main.ts (MODIFY)
    apps/order-service/src/main.ts (MODIFY)
    apps/product-service/src/main.ts (MODIFY)
    apps/payment-service/src/main.ts (MODIFY)
    apps/inventory-service/src/main.ts (MODIFY)
    apps/notification-service/src/main.ts (MODIFY)
    apps/search-service/src/main.ts (MODIFY)
  </files>
  <action>
    For each service that doesn't already have it (user-service, cart-service, auth-service already do):

    Add `app.enableShutdownHooks();` after `NestFactory.create()` in `main.ts`.

    This ensures all `OnModuleDestroy` hooks fire on SIGTERM/SIGINT, allowing Kafka consumers to disconnect cleanly and DB connections to close.

    This is a 1-line change per service.
  </action>
  <verify>grep -rn "enableShutdownHooks" apps/*/src/main.ts | wc -l</verify>
  <done>10 results (all services have enableShutdownHooks)</done>
</task>

## Success Criteria
- [ ] `KafkaDlqProducer` shared utility in `@ecommerce/core`
- [ ] All Kafka consumers have DLQ routing (send to `<topic>.dlq` on max retries)
- [ ] notification-service + search-service consumers have idempotency checks
- [ ] All 10 services call `enableShutdownHooks()` in `main.ts`
- [ ] `pnpm -r build` passes
- [ ] `pnpm -r test` passes
