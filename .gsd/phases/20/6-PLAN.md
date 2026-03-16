---
phase: 20
plan: 6
wave: 3
---

# Plan 20.6: Observability — Tracing, Metrics & Correlation

## Objective
Wire OpenTelemetry tracing, Prometheus metrics, and structured logging consistently across all 10 services. Add correlationId propagation end-to-end. Currently only cart-service initializes tracing, and metrics are in only 4 services.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 5 findings)
- packages/core/src/observability/tracing.ts (initTracing function)
- packages/core/src/observability/metrics.ts (MetricsModule)
- packages/core/src/observability/logging.ts (getLoggerModule)
- apps/cart-service/src/main.ts (reference — has initTracing)
- apps/cart-service/src/app.module.ts (reference — has MetricsModule)

## Tasks

<task type="auto">
  <name>Add initTracing and getLoggerModule to all services</name>
  <files>
    apps/api-gateway/src/main.ts (MODIFY)
    apps/order-service/src/main.ts (MODIFY)
    apps/product-service/src/main.ts (MODIFY — verify)
    apps/payment-service/src/main.ts (MODIFY — verify)
    apps/inventory-service/src/main.ts (MODIFY)
    apps/notification-service/src/main.ts (MODIFY — verify)
    apps/search-service/src/main.ts (MODIFY)
    apps/user-service/src/main.ts (MODIFY)
    apps/auth-service/src/main.ts (MODIFY)
  </files>
  <action>
    For each service's `main.ts`:
    1. Add `import { initTracing } from '@ecommerce/core';` at top
    2. Call `initTracing('<service-name>');` BEFORE `NestFactory.create()`
    3. Follow the cart-service pattern:
       ```typescript
       import { initTracing } from '@ecommerce/core';
       initTracing('order-service');
       // then NestFactory.create(...)
       ```

    For each service's `app.module.ts`:
    1. Add `getLoggerModule()` import if missing (user-service, order-service)
    2. Add `MetricsModule` import if missing (api-gateway, auth-service, user-service, product-service, search-service, order-service)
    3. Follow cart-service pattern:
       ```typescript
       import { getLoggerModule, MetricsModule } from '@ecommerce/core';
       @Module({
         imports: [getLoggerModule(), MetricsModule, ...],
       })
       ```
  </action>
  <verify>grep -rn "initTracing" apps/*/src/main.ts | wc -l</verify>
  <done>10 results — all services initialize OTel tracing</done>
</task>

<task type="auto">
  <name>Add correlationId propagation to API gateway and Kafka headers</name>
  <files>
    apps/api-gateway/src/common/http-client.ts (MODIFY)
    apps/api-gateway/src/middleware/request-id.middleware.ts (MODIFY or verify)
    packages/core/src/kafka/correlation.ts (NEW)
    packages/core/src/index.ts (MODIFY)
  </files>
  <action>
    1. In API gateway `http-client.ts`, add `x-correlation-id` header propagation:
       ```typescript
       const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || randomUUID();
       headers['x-correlation-id'] = correlationId;
       ```
    2. Create `packages/core/src/kafka/correlation.ts`:
       - Export `getCorrelationId(headers: IHeaders): string` — extracts from Kafka message headers
       - Export `setCorrelationHeaders(correlationId: string): Record<string, string>` — creates headers for Kafka producers
    3. Export from `packages/core/src/index.ts`

    This ensures every HTTP request → downstream service → Kafka event chain carries the same correlationId.
  </action>
  <verify>grep -rn "x-correlation-id" apps/api-gateway/src/common/http-client.ts</verify>
  <done>API gateway sets x-correlation-id on all forwarded requests</done>
</task>

## Success Criteria
- [ ] All 10 services call `initTracing()` in main.ts
- [ ] All 10 services import `MetricsModule` in app.module.ts
- [ ] All 10 services import `getLoggerModule()` in app.module.ts
- [ ] API gateway propagates `x-correlation-id` to all downstream services
- [ ] `packages/core` exports correlation helpers for Kafka
- [ ] `pnpm -r build` passes
