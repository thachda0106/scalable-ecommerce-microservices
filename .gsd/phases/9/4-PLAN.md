---
phase: 9
plan: 4
wave: 3
depends_on: [2, 3]
files_modified:
  - apps/api-gateway/src/interceptors/timeout.interceptor.ts
  - apps/api-gateway/src/common/http-client.ts
  - apps/api-gateway/src/aggregation/cart-summary.service.ts
  - apps/api-gateway/src/aggregation/product-page.service.ts
  - apps/api-gateway/src/aggregation/order-details.service.ts
  - apps/api-gateway/src/controllers/gateway.controller.ts
autonomous: true
must_haves:
  truths:
    - "System is protected from cascading failures via timeouts and circuit breakers"
    - "Complex data retrievals spanning multiple services are aggregated cleanly at the gateway"
  artifacts:
    - "Aggregation services exist in apps/api-gateway/src/aggregation/"
---

# Plan 9.4: Resilience Patterns & Request Aggregation

<objective>
Introduce system stability (timeouts, retries, and circuit breaking) and build bespoke aggregation endpoints designed to unify payloads for the frontend.
Purpose: Prevent downtime spread and optimize client requests.
Output: Aggregation orchestrator services and a hardened HTTP interface.
</objective>

<context>
Load for context:
- .gsd/ROADMAP.md
- apps/api-gateway/src/common/http-client.ts
- apps/api-gateway/src/controllers/gateway.controller.ts
</context>

<tasks>

<task type="auto">
  <name>Implement Resilience Patterns</name>
  <files>
    - apps/api-gateway/src/interceptors/timeout.interceptor.ts
    - apps/api-gateway/src/common/http-client.ts
    - apps/api-gateway/src/app.module.ts
  </files>
  <action>
    Create `timeout.interceptor.ts` utilizing `rxjs` `timeout()` to abort incoming HTTP client requests lingering beyond e.g. 5000ms. Register globally.
    Enhance `common/http-client.ts` integration to implement retry policies and a baseline circuit breaker pattern (using `opossum`, `axios-retry`, or custom RxJS logic) for downstream calls to drop traffic instantly during service outages.
  </action>
  <verify>npm run build --prefix apps/api-gateway</verify>
  <done>Timeout and retry logic wrap standard proxy and aggregation requests</done>
</task>

<task type="auto">
  <name>Add Request Aggregation Endpoints</name>
  <files>
    - apps/api-gateway/src/aggregation/cart-summary.service.ts
    - apps/api-gateway/src/aggregation/product-page.service.ts
    - apps/api-gateway/src/aggregation/order-details.service.ts
    - apps/api-gateway/src/controllers/gateway.controller.ts
  </files>
  <action>
    Create exact endpoint routes in `gateway.controller.ts` before the generic wildcard proxy logic catches them.
    Implement `/cart-summary` linking `cart-service`, `product-service`, and `inventory-service`.
    Implement `/product-page/{id}` linking `product`, `inventory`, and `search`.
    Implement `/order-details/{id}` linking `order`, `payment`, and `inventory`.
    Perform all requests concurrently using `Promise.all` inside the aggregation services leveraging the `http-client` wrapper.
  </action>
  <verify>npm run lint --prefix apps/api-gateway</verify>
  <done>Three distinct aggregation routes are bundled returning composite JSON</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] Aggregation models resolve via Promise.all
- [ ] Failed downstream resilience tests fallback to formatted Error responses instead of hanging UI
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>
