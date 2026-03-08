---
phase: 4
plan: 3
wave: 2
---

# Plan 4.3: Kafka CQRS Synchronization

## Objective
Implement background processes: an Outbox relay in Product Service that publishes to Kafka, and a Kafka consumer in Search Service that indexes documents in OpenSearch, realizing the CQRS synchronization.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\apps\product-service\src
- c:\source\apps\search-service\src

## Tasks

<task type="auto">
  <name>Implement Outbox Relay in Product Service</name>
  <files>c:\source\apps\product-service\src\outbox\outbox-relay.service.ts</files>
  <action>
    - Install Kafka client (e.g., `kafkajs` or `@nestjs/microservices`) in Product Service.
    - Implement a cron job or background interval using `@nestjs/schedule` that queries unprocessed `OutboxEvent` rows.
    - Publish queried events to the `product.events` Kafka topic.
    - Mark events as processed in the database after successful publishing.
  </action>
  <verify>Test-Path c:\source\apps\product-service\src\outbox\outbox-relay.service.ts</verify>
  <done>Unprocessed outbox events are published to Kafka reliably</done>
</task>

<task type="auto">
  <name>Implement Kafka Consumer in Search Service</name>
  <files>c:\source\apps\search-service\src\consumer\product-sync.service.ts</files>
  <action>
    - Install Kafka client in Search Service.
    - Implement a Kafka consumer subscribing to the `product.events` topic.
    - Handle `ProductCreated`, `ProductUpdated`, `ProductDeleted` events by indexing, updating, or deleting documents in OpenSearch using the established client.
    - Implement basic idempotency/versioning checks.
  </action>
  <verify>Test-Path c:\source\apps\search-service\src\consumer\product-sync.service.ts</verify>
  <done>Search Service successfully consumes messages and updates OpenSearch</done>
</task>

## Success Criteria
- [ ] Product Service polls Outbox and publishes to Kafka.
- [ ] Search Service consumes from Kafka and syncs with OpenSearch.
