---
phase: 17
plan: 5
wave: 3
---

# Plan 17.5: Infrastructure — Kafka Event Publisher & Outbox Relay

## Objective
Implement the Transactional Outbox pattern for reliable event publishing.
Events are written to the outbox table in the same DB transaction as domain state changes.
A relay service polls the outbox and publishes to Kafka.

## Context
- .gsd/phases/17/RESEARCH.md (event design, outbox pattern)
- apps/product-service/src/application/ports/event-publisher.port.ts (from Plan 17.2)
- apps/product-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts (from Plan 17.4)
- apps/order-service/src/infrastructure/kafka/kafka-event-publisher.ts (established outbox publisher pattern)
- apps/order-service/src/infrastructure/kafka/outbox-relay.service.ts (established relay pattern — MUST read this)
- apps/order-service/src/infrastructure/kafka/kafka-client.factory.ts (Kafka client factory pattern)

## Tasks

<task type="auto">
  <name>Create Kafka Client Factory and Event Publisher</name>
  <files>
    apps/product-service/src/infrastructure/kafka/kafka-client.factory.ts
    apps/product-service/src/infrastructure/kafka/kafka-event-publisher.ts
    apps/product-service/src/infrastructure/kafka/index.ts
  </files>
  <action>
    **KafkaClientFactory** — same pattern as order-service:
    - @Injectable() class implementing OnApplicationBootstrap, OnApplicationShutdown
    - Creates Kafka client with clientId 'product-service' and brokers from `process.env.KAFKA_BROKERS || 'localhost:29092'`
    - Creates and connects Producer on bootstrap, disconnects on shutdown
    - Exposes `getProducer(): Producer`

    **KafkaEventPublisher** — implements IEventPublisher via Transactional Outbox:
    - Follow exact pattern from apps/order-service/src/infrastructure/kafka/kafka-event-publisher.ts
    - Inject: @InjectRepository(OutboxEventOrmEntity), DataSource
    - `publish(event)` → delegates to `publishAll([event])`
    - `publishAll(events)` → wraps in DB transaction, creates OutboxEventOrmEntity for each event (id: crypto.randomUUID(), type: event.eventType, payload: serialized event, processed: false), saves via queryRunner
    - Private `serializeEvent(event)` → JSON.parse(JSON.stringify(event))

    Events are NOT sent to Kafka directly — they are written to the outbox table.

    Barrel export.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>KafkaClientFactory and KafkaEventPublisher created. Events stored in outbox table (not sent directly to Kafka). Follows transactional outbox pattern from order-service.</done>
</task>

<task type="auto">
  <name>Create Outbox Relay Service</name>
  <files>
    apps/product-service/src/infrastructure/kafka/outbox-relay.service.ts
  </files>
  <action>
    **OutboxRelayService** — polls outbox table and publishes to Kafka:
    - Follow pattern from apps/order-service/src/infrastructure/kafka/outbox-relay.service.ts
    - @Injectable() class
    - Inject: @InjectRepository(OutboxEventOrmEntity), KafkaClientFactory
    - @Cron(CronExpression.EVERY_SECOND) `relayEvents()`:
      1. Query unprocessed events: `{ where: { processed: false }, order: { createdAt: 'ASC' }, take: 50 }`
      2. If no events, return early
      3. Map events to Kafka messages: `key = payload.id || event.id` (partition key), `value = JSON.stringify({ eventId, type, payload, timestamp })`
      4. Send to `product.events` topic via KafkaClientFactory.getProducer()
      5. Mark events as processed (set processed = true, save batch)
      6. Log relay count
    - Error handling: catch and log, don't crash on failures

    This replaces the existing apps/product-service/src/outbox/outbox-relay.service.ts (which will be removed when old files are cleaned up in Plan 17.7).
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>OutboxRelayService polls outbox_events table every second, batch-publishes to 'product.events' Kafka topic with productId partition key. Graceful error handling.</done>
</task>

## Success Criteria
- [ ] KafkaClientFactory manages Kafka producer lifecycle
- [ ] KafkaEventPublisher writes events to outbox table (NOT directly to Kafka)
- [ ] OutboxRelayService polls and publishes unprocessed events every second
- [ ] Events published to `product.events` topic with entity ID as partition key
- [ ] Batch processing (up to 50 events per poll)
- [ ] Graceful error handling (log errors, don't crash)
- [ ] `npx tsc --noEmit` passes
