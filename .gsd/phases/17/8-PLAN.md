---
phase: 17
plan: 8
wave: 4
---

# Plan 17.8: Infrastructure — Observability (Metrics & Tracing)

## Objective
Add Prometheus metrics and a metrics endpoint to the product-service.
Follow the established observability pattern from the order-service.

## Context
- apps/order-service/src/infrastructure/observability/order-metrics.service.ts (established metrics pattern)
- apps/order-service/src/infrastructure/observability/metrics.controller.ts (metrics endpoint)
- apps/order-service/src/infrastructure/observability/index.ts

## Tasks

<task type="auto">
  <name>Create ProductMetricsService and MetricsController</name>
  <files>
    apps/product-service/src/infrastructure/observability/product-metrics.service.ts
    apps/product-service/src/infrastructure/observability/metrics.controller.ts
    apps/product-service/src/infrastructure/observability/index.ts
  </files>
  <action>
    **ProductMetricsService** — follow same pattern as OrderMetricsService:
    - @Injectable() class with private Registry from prom-client
    - Metrics:
      - `products_created_total` (Counter) — total products created
      - `products_updated_total` (Counter) — total products updated
      - `products_deleted_total` (Counter) — total products deleted
      - `product_cache_hits_total` (Counter) — cache hits
      - `product_cache_misses_total` (Counter) — cache misses
      - `product_query_duration_seconds` (Histogram, labels: ['operation'], buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]) — query duration
      - `product_status_changes_total` (Counter, labels: ['from_status', 'to_status']) — status transitions

    Methods:
    - `incrementProductsCreated(): void`
    - `incrementProductsUpdated(): void`
    - `incrementProductsDeleted(): void`
    - `incrementCacheHit(): void`
    - `incrementCacheMiss(): void`
    - `recordStatusChange(from: string, to: string): void`
    - `startTimer(operation: string): () => void`
    - `getMetrics(): Promise<string>`

    **MetricsController:**
    - @Controller('metrics')
    - @Get() → return productMetricsService.getMetrics() with content-type text/plain

    Barrel export of both classes.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>ProductMetricsService with 7 metrics (counters, histogram) and MetricsController exposing /metrics endpoint. Follows established prom-client pattern.</done>
</task>

## Success Criteria
- [ ] ProductMetricsService with Counter, Histogram metrics
- [ ] Cache hit/miss counters for monitoring cache effectiveness
- [ ] MetricsController at /metrics returns Prometheus text format
- [ ] All metric methods match what handlers call
- [ ] `npx tsc --noEmit` passes
