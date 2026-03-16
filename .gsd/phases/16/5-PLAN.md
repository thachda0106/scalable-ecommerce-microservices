---
phase: 16
plan: 5
wave: 3
---

# Plan 16.5: Observability — Structured Logging, Prometheus Metrics, OpenTelemetry Tracing

## Objective
Add production-grade observability to the payment-service: structured JSON logging with correlation IDs, Prometheus metrics for payment processing, and OpenTelemetry distributed tracing.

## Context
- .gsd/phases/16/RESEARCH.md
- packages/core/src/ (@ecommerce/core already provides getLoggerModule, tracing, metrics)
- apps/payment-service/src/main.ts (already uses @ecommerce/core Logger)
- apps/payment-service/src/infrastructure/ (Plan 16.3)

## Tasks

<task type="auto">
  <name>Create Prometheus metrics service and integrate structured logging</name>
  <files>
    apps/payment-service/src/infrastructure/metrics/payment-metrics.service.ts [NEW]
    apps/payment-service/src/infrastructure/metrics/index.ts [NEW]
  </files>
  <action>
    1. **PaymentMetricsService** — Injectable NestJS service exposing Prometheus counters and histograms:
       - `payments_processed_total` — Counter with labels: { status: 'success'|'failed', provider: string }
       - `payments_refunded_total` — Counter with labels: { provider: string }
       - `payment_processing_duration_seconds` — Histogram with labels: { provider: string }
       - `provider_request_duration_seconds` — Histogram with labels: { provider: string, operation: 'process'|'refund' }
       - Methods: recordPaymentProcessed(status, provider), recordPaymentRefunded(provider), startProcessingTimer() → returns end function, startProviderTimer(provider, op) → returns end function

    2. **Integrate logging** — Ensure all handlers use NestJS Logger (from @ecommerce/core) with structured context:
       - ProcessPaymentHandler: log orderId, provider, status at each step
       - RefundPaymentHandler: log paymentId, reason, result
       - PaymentCommandConsumer: log eventId, type, processing result
       - OutboxRelay: log batch size, success/failure

    3. **Add metrics to handlers** — Inject PaymentMetricsService into ProcessPaymentHandler and RefundPaymentHandler:
       - Track processing duration (start timer before provider call, end after)
       - Record success/failure counts
       - Record provider request duration

    **Anti-patterns to avoid:**
    - Do NOT use console.log — always use NestJS Logger
    - Do NOT create custom metrics format — use prom-client standard
    - Do NOT block the request pipeline with metrics — fire-and-forget
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - PaymentMetricsService exposes 4 Prometheus metrics
    - All handlers use structured NestJS Logger
    - Processing and provider durations tracked via histograms
    - Payment success/failure counters increment correctly
  </done>
</task>

<task type="auto">
  <name>Add /metrics endpoint and health check enrichment</name>
  <files>
    apps/payment-service/src/app.controller.ts [MODIFY]
    apps/payment-service/src/payment.module.ts [MODIFY]
  </files>
  <action>
    1. **Add /metrics endpoint** — Use prom-client's `register.metrics()` to expose Prometheus scrape endpoint at GET /metrics.

    2. **Enrich health endpoint** — GET /health returns:
       ```json
       { "status": "up", "service": "payment-service", "kafka": "connected|disconnected", "database": "connected|disconnected", "timestamp": "ISO date" }
       ```

    3. **Wire PaymentMetricsService** — Add to PaymentModule providers, inject into handlers.

    **Note:** OpenTelemetry tracing is already provided by @ecommerce/core's tracing module. Ensure it's imported in AppModule via getLoggerModule() which already includes context propagation.
  </action>
  <verify>npx tsc --noEmit --project apps/payment-service/tsconfig.json</verify>
  <done>
    - GET /metrics returns Prometheus-formatted metrics
    - GET /health returns enriched health status with service dependencies
    - PaymentMetricsService wired into module
  </done>
</task>

## Success Criteria
- [ ] `npx tsc --noEmit` passes for payment-service
- [ ] GET /metrics returns Prometheus counters and histograms
- [ ] All payment operations log structured context (orderId, provider, status)
- [ ] Processing duration tracked via histogram
