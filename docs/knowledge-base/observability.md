# Observability in Distributed Systems

> **Audience:** Senior / Staff Backend Engineers
> **Context:** NestJS / Node.js Microservices Architecture

Observability is not just about writing logs or collecting data; it is the discipline of making a system's internal state inferable from its external outputs. In a distributed microservices environment where a single user request can touch dozens of services, observability is the only way to debug, monitor, and ensure reliability at scale.

This document serves as the definitive guide to the Observability layer implemented in this project (`packages/core/src/observability`).

---

## 1. Foundational Theory

The "Three Pillars of Observability" work together to answer complete operational questions. 

| Pillar | Focus | Ultimate Question Answered |
|--------|-------|----------------------------|
| **Logging** | Discrete, high-context events. | *"What exactly went wrong and why?"* |
| **Metrics** | Quantitative data over time. | *"Is the system healthy? How much/often is this happening?"* |
| **Tracing** | Request mapping across boundaries. | *"Where is the bottleneck? What is the execution path?"* |

### Why is this critical?
In a monolith, a stack trace is usually enough to find a bug. In a distributed system, a frontend failure could be caused by a database timeout deep in a downstream service (`API Gateway -> Order Service -> Inventory Service -> DB`). Without correlation and telemetry, debugging becomes an impossible guessing game.

---

## 2. Concepts Deep Dive

### Logging
- **Structured Logging:** Instead of `console.log("User 123 logged in")`, we emit JSON: `{"event": "user_login", "userId": 123}`. This allows log aggregators (ELK, Loki, Datadog) to index and query fields instantly.
- **Log Levels:**
  - `ERROR`: System is in distress or an operation failed. Needs attention.
  - `WARN`: Unexpected condition but the system recovered.
  - `INFO`: Normal operational events (e.g., service started, request completed).
  - `DEBUG`: Verbose information useful during development or targeted debugging.
- **Correlation ID:** A unique UUID passed via HTTP headers (e.g., `x-correlation-id`) or Kafka headers to link all logs of a single semantic transaction across multiple microservices.

### Metrics
- **Types of Metrics:**
  - **Counter:** Only goes up (e.g., total HTTP requests).
  - **Gauge:** Goes up and down (e.g., current memory usage, active connections).
  - **Histogram:** Measures distributions, into buckets (e.g., request latency, payload size), allowing for percentile calculations (p95, p99).
- **RED Methodology (for Services):** **R**ate (requests/sec), **E**rrors (failures/sec), **D**uration (latency distributions).
- **USE Methodology (for Resources):** **U**tilization, **S**aturation, **E**rrors.
- **Scraping:** Prometheus uses a pull model, hitting a `/metrics` endpoint periodically to collect data.

### Tracing
- **Distributed Tracing:** The process of tracking a single request across network boundaries.
- **Trace vs. Span:** 
  - A **Trace** represents the entire journey of a request.
  - A **Span** is a single operation within that trace (e.g., a DB query, an HTTP call). Spans have a start time, end time, and parent-child relationships.
- **Context Propagation:** Passing the `traceparent` and `tracestate` headers across HTTP requests or messaging queues (like Kafka) so the downstream service knows it's part of an existing trace.

---

## 3. Project Code Analysis

Our implementation resides in `packages/core/src/observability`. It abstracts the complexity and provides ready-to-use modules for our NestJS applications.

### `logging.ts` (Pino & Structured Logging)
```typescript
import { LoggerModule } from "nestjs-pino";
// ...
```
- **What it does:** Initializes `nestjs-pino` as the primary application logger.
- **Key Features:**
  - Uses `pinoHttp` to automatically log incoming HTTP requests and outgoing responses.
  - Dynamically adapts based on `NODE_ENV`. In production, it outputs highly performant JSON logs. In non-production, it pipes output through `pino-pretty` for human-readable console styling.
  - Overrides the `formatters.level` and sets `messageKey: "message"`. This ensures our log schema aligns perfectly with standard commercial observability backends like Datadog and AWS CloudWatch, which expect the severity level to be under `level` and the main log text under `message`.

### `metrics.ts` (Prometheus)
```typescript
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
// ...
```
- **What it does:** Integrates Prometheus metrics into the NestJS lifecycle.
- **Key Features:**
  - Automatically exposes a `/metrics` HTTP endpoint where Prometheus or the OpenTelemetry Collector can scrape data.
  - Enables `defaultMetrics`, which automatically collects crucial Node.js runtime metrics (e.g., Garbage Collection duration, event loop lag, active handles, memory consumption).

### `tracing.ts` (OpenTelemetry Node SDK)
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
// ...
```
- **What it does:** Bootstraps the OpenTelemetry (OTel) SDK.
- **Key Features:**
  - **Initialization (`initTracing`):** Must be called as early as possible (before importing other libraries) so OTel can monkey-patch core HTTP, DB, and framework modules.
  - **Auto-Instrumentation:** Uses `@opentelemetry/auto-instrumentations-node` which seamlessly intercepts `express`, `http`, `pg`/`mysql`, `ioredis`, and more, creating spans automatically without manual code changes.
  - **Exporting Data:** Sends tracing data over HTTP to an OTLP endpoint (defaulting to `localhost:4318/v1/traces`), which usually feeds into an OTel Collector or Jaeger.
  - **Graceful Shutdown:** Hooks into `process.on('SIGTERM')` to flush pending spans before the process dies.

---

## 4. How Everything Works Together

1. **The Request Arrives:** Look at the `API Gateway`. A user makes a request. OpenTelemetry (`tracing.ts`) auto-instruments the incoming HTTP request, generating a `traceId` and a root span.
2. **Logging the Request:** `nestjs-pino` kicks in. Because Pino is async-context aware, every `logger.info()` you write during this request automatically includes the `traceId` and `spanId`.
3. **Internal Processing:** The service calls Postgres. The OTel auto-instrumentation detects the `pg` driver and creates a child span representing the DB query.
4. **Moving to another service:** If Gateway calls the `OrderService` via HTTP or a Kafka message, OTel automatically injects the `traceparent` (W3C standard) into the HTTP/Kafka headers. The `OrderService` picks this up and continues the *same* trace.
5. **Metrics Aggregation:** While all this happens, Prometheus (`metrics.ts`) is incrementing the `http_requests_total` counter and updating the latency histogram.

**Data Flow Summary:**
Logs, Metrics, and Tracing are bound together by the `traceId` and `correlationId`. Metrics tell you *when* to look. Tracing tells you *where* to look. Logs tell you *what* happened.

---

## 5. Practical Usage

### Example 1: Debug a failed API implementation
1. **Metrics:** An alert triggers showing a spike in HTTP 500s for POST `/orders`.
2. **Logs:** You open Kibana/Datadog and filter by `status: 500`. You find a generated error log: `"Error writing to database"`.
3. **Tracing:** You copy the `traceId` attached to that log and paste it into Jaeger/Datadog APM.
4. **Result:** The trace shows `API Gateway (2ms)` -> `Order Service (5000ms)` -> `Postgres INSERT (Failed timed out)`. You instantly know the DB is the issue, not the code logic.

### Example 2: High Latency Issue
1. **Metrics:** Prometheus dashboard shows the p99 latency for the checkout flow has jumped from 200ms to 4000ms.
2. **Tracing:** You query Jaeger for traces of `/checkout` taking > 3000ms.
3. **Trace Diagram:**
   ```text
   [Gateway /checkout] 4000ms
     ├── [OrderService /create] 3950ms
     │     ├── [InventoryService /reserve] 3900ms
     │     │     └── [Redis GET] 3800ms (!!!)
     │     └── [DB Insert] 10ms
   ```
4. **Result:** You immediately see that Redis is responding disastrously slowly, blocking the entire chain.

### Example 3: Kafka Event Debugging
- When `OrderService` produces a `OrderCreated` event to Kafka, OTel injects the trace context into the Kafka message headers.
- When `EmailService` consumes it, it extracts the context. 
- You can pull up the trace and see a continuous span graph covering the HTTP request, the time spent sitting in the Kafka topic, and the downstream processing by the async worker.

---

## 6. How to Use in Code

### Logging
**Do:** Pass objects for structured data, message as the final argument.
```typescript
// ✅ BEST PRACTICE
this.logger.info({ userId: user.id, orderId: order.id }, 'Order successfully validated');
```

**Don't:** Concatenate strings. It breaks structured logging analysis.
```typescript
// ❌ ANTI-PATTERN
this.logger.info(`Order successfully validated for user ${user.id} with order ${order.id}`);
```

### Metrics
When you need business-specific metrics (e.g., how many premium users vs free users check out):
```typescript
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

export class OrderService {
  constructor(@InjectMetric('orders_created_total') public counter: Counter<string>) {}

  createOrder(type: 'premium' | 'free') {
    this.counter.inc({ tier: type }); // Labels allow extremely rich slicing in Grafana
  }
}
```

### Tracing
Usually, you don't need manual code for tracing; the auto-instrumentation handles HTTP, DBs, and Redis. However, you can create a custom span for a heavy CPU task:
```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-custom-tracer');
tracer.startActiveSpan('process-heavy-calculation', (span) => {
  try {
    doHeavyMath();
  } catch (err) {
    span.recordException(err);
  } finally {
    span.end();
  }
});
```

---

## 7. Production Best Practices

- **Sampling Strategy:** Tracing *everything* is expensive. In production, use **Tail-based sampling** (keep 100% of traces that error or are slow, and only 5% of fast/successful ones) or Head-based probabilistic sampling (drop 90% of requests randomly at the gateway).
- **Log Volume Control:** Do not log full HTTP request/response bodies in production. It will explode costs and risk leaking PII/PCI data.
- **Metrics Cardinality:** **Never** use high-cardinality data like `userId` or `orderId` as a Prometheus Label. It will crash the Prometheus server. Labels should belong to a small, finite set (e.g., `status_code`, `payment_method`, `user_tier`).
- **Initialization Order:** `initTracing()` MUST be the first thing executed in `main.ts` before NestFactory or any other libraries are imported.

---

## 8. Common Pitfalls

- **Missing Context in Async Operations:** If you fire-and-forget an async function manually (`setTimeout` or loose promises outside the framework), you might lose Node's `async_hooks` context, causing your logs to lose their `traceId`.
- **Alert Fatigue:** Setting up alerts on *every* spike. Only alert on user-facing symptoms (high error rate, high latency) rather than causes (high CPU).
- **Over-Instrumenting:** Creating custom spans for operations that take < 1ms adds more overhead than value. Let the auto-instrumentation do 95% of the work.

---

## 9. Mental Model Summary

If you are woken up at 3 AM for a sev-1 incident:

1. **Metrics (Prometheus/Grafana)** tell you **HOW BAD** it is. ("Error rate is 40%").
2. **Tracing (Jaeger/APM)** tells you **WHERE** the fire is. ("It's timing out between API Gateway and Payment Service").
3. **Logs (Kibana/Datadog)** tell you **WHAT** exactly caused the fire. ("Payment payload missing `currency` field").

Use them together. They are multipliers.
