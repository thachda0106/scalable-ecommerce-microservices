---
phase: 13
plan: 8
wave: 3
---

# Plan 13.8: Observability, Production Hardening & Dependencies

## Objective
Add structured logging, Prometheus metrics, retry mechanisms, dead letter queue,
and update package.json with any new dependencies needed.

## Context
- .gsd/SPEC.md
- apps/order-service/package.json (current dependencies)
- apps/inventory-service/src/metrics/ (established pattern)
- apps/inventory-service/src/infrastructure/resilience/ (established pattern)

## Tasks

<task type="auto">
  <name>Add Metrics, Logging & Retry/DLQ Infrastructure</name>
  <files>
    apps/order-service/src/infrastructure/metrics/order-metrics.service.ts
    apps/order-service/src/infrastructure/metrics/index.ts
    apps/order-service/src/infrastructure/resilience/retry.service.ts
    apps/order-service/src/infrastructure/resilience/dead-letter.service.ts
    apps/order-service/src/infrastructure/resilience/index.ts
    apps/order-service/src/interfaces/controllers/metrics.controller.ts
  </files>
  <action>
    **OrderMetricsService** — Prometheus metrics using prom-client:
    - Counter: `orders_created_total` (labels: status)
    - Counter: `orders_cancelled_total` (labels: reason)
    - Counter: `payment_failures_total`
    - Histogram: `order_processing_duration_seconds` (labels: operation)
    - Gauge: `orders_pending_count`
    Expose metrics via a `getMetrics()` method.
    Inject into command handlers to record metrics on each operation.

    **MetricsController**:
    - `GET /metrics` → return Prometheus text format from OrderMetricsService

    **RetryService** — configurable retry with exponential backoff:
    - `executeWithRetry(fn, options: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 })`
    - Exponential backoff with jitter
    - Used by Kafka consumers for transient failures

    **DeadLetterService**:
    - When retry exhausted, publish failed message to DLQ topic: 'order.events.dlq'
    - Include original message, error details, attempt count, timestamp
    - Log dead letter events as ERROR level
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Prometheus metrics (4 metric types), retry with exponential backoff, DLQ for failed events, /metrics endpoint.</done>
</task>

<task type="auto">
  <name>Update Dependencies and Configuration</name>
  <files>
    apps/order-service/package.json [MODIFY]
    apps/order-service/src/config/order-service.config.ts [NEW]
    apps/order-service/src/config/index.ts [NEW]
  </files>
  <action>
    **package.json** — add new dependencies:
    - `class-validator` — DTO validation
    - `class-transformer` — DTO transformation
    - `prom-client` — Prometheus metrics

    **OrderServiceConfig** — centralized configuration:
    - database: url, synchronize flag
    - kafka: brokers, clientId, consumer group prefix
    - retry: maxRetries, baseDelay, maxDelay
    - outbox: pollIntervalMs, batchSize
    Read from environment variables with sensible defaults.

    Update AppModule to use ConfigModule if not already present.
  </action>
  <verify>npx tsc --noEmit --project apps/order-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Dependencies added, centralized config module, all configuration via env vars with defaults.</done>
</task>

## Success Criteria
- [ ] 4 Prometheus metric types tracking order operations
- [ ] `/metrics` endpoint returns Prometheus text format
- [ ] Retry with exponential backoff (max 3 retries, 1s-30s delay)
- [ ] Dead letter queue publishing for exhausted retries
- [ ] Centralized config from environment variables
- [ ] New deps in package.json (class-validator, class-transformer, prom-client)
- [ ] `npx tsc --noEmit` passes
