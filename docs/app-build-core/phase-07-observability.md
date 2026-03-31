# Phase 7 — Observability

> **Why this phase exists:** In a monolith, you `console.log` and check one log file. In microservices,
> a single request touches 5 services, 3 databases, and a message broker. Without observability,
> debugging is impossible — you're flying blind at 30,000 feet. Observability answers: "What is
> happening, where, and why?"

---

## 7.1 The Three Pillars of Observability

```
                    ┌──────────────────────────────────┐
                    │         OBSERVABILITY             │
                    │                                    │
                    │  ┌──────────┐  ┌────────┐  ┌────────┐
                    │  │  LOGS    │  │METRICS │  │TRACES  │
                    │  │          │  │        │  │        │
                    │  │ What     │  │ How    │  │ Where  │
                    │  │ happened │  │ much   │  │ it     │
                    │  │          │  │        │  │ went   │
                    │  └──────────┘  └────────┘  └────────┘
                    │                                    │
                    │  ┌──────────────────────────┐      │
                    │  │    CORRELATION ID         │      │
                    │  │    (ties them together)   │      │
                    │  └──────────────────────────┘      │
                    └──────────────────────────────────┘
```

### How They Work Together

| Pillar | Purpose | Tool | Question Answered |
|--------|---------|------|-------------------|
| **Logs** | Detailed event records | CloudWatch / ELK | "What happened?" |
| **Metrics** | Aggregated measurements | Prometheus + Grafana | "How much? How fast?" |
| **Traces** | Request flow across services | Jaeger / X-Ray | "Where did it go? Where did it slow down?" |

---

## 7.2 Logging Strategy

### Structured JSON Logging Standard

Every log entry from every service follows this format:

```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "service": "order-service",
  "environment": "production",
  "version": "1.3.0",
  "traceId": "abc-123-def-456",
  "spanId": "span-789",
  "correlationId": "req-abc-123",
  "tenantId": "tenant-456",
  "userId": "user-789",
  "message": "Order created successfully",
  "context": {
    "orderId": "order-012",
    "total": 159.98,
    "itemCount": 3,
    "paymentMethod": "credit_card"
  },
  "duration": 145
}
```

### What to Log (and What NOT to)

| DO Log | DON'T Log |
|--------|-----------|
| Business events (order created, payment processed) | Passwords, tokens, credit card numbers |
| Error details with stack traces | PII in plain text (hash or redact) |
| Performance metrics (duration, size) | Health check successes (too much noise) |
| External API responses (status, latency) | Full request/response bodies (too large) |
| Kafka event processing results | Debug logs in production |

### Log Levels by Environment

| Level | Development | Staging | Production |
|-------|-------------|---------|------------|
| `debug` | ✅ | ✅ | ❌ |
| `info` | ✅ | ✅ | ✅ |
| `warn` | ✅ | ✅ | ✅ |
| `error` | ✅ | ✅ | ✅ |

---

## 7.3 Correlation ID (The Glue)

### How It Works

```
  Client
    │
    │ GET /api/orders/123
    │ (no correlation ID)
    │
    ▼
  API Gateway
    │ Generate: X-Correlation-Id: "req-abc-123"
    │ Log: { correlationId: "req-abc-123", message: "Routing to order-service" }
    │
    ▼
  Order Service
    │ Received: X-Correlation-Id: "req-abc-123"
    │ Log: { correlationId: "req-abc-123", message: "Fetching order" }
    │
    │ Calls Auth Service to validate token
    │ Forwards: X-Correlation-Id: "req-abc-123"
    │
    ▼
  Auth Service
    │ Received: X-Correlation-Id: "req-abc-123"
    │ Log: { correlationId: "req-abc-123", message: "Token validated" }
```

### Implementation

```typescript
// Middleware to extract/generate correlation ID
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = req.headers['x-correlation-id'] as string
      || req.headers['x-request-id'] as string
      || randomUUID();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    // Make available to logger
    this.logger.setContext({ correlationId });

    next();
  }
}
```

### Correlation ID Through Kafka

```typescript
// When publishing to Kafka, include correlation ID
await this.kafkaProducer.publish('order.events', {
  key: order.id,
  value: orderEvent,
  headers: {
    'correlation-id': request.correlationId,  // ← Carry through
    'event-type': 'order.created',
    'source-service': 'order-service',
  },
});

// When consuming from Kafka, extract correlation ID
async handleEvent(message: KafkaMessage): Promise<void> {
  const correlationId = message.headers['correlation-id']?.toString();
  this.logger.setContext({ correlationId });

  // Now all logs from this consumer include the same correlationId
  this.logger.log('Processing order event', {
    eventType: message.headers['event-type']?.toString(),
  });
}
```

---

## 7.4 Metrics

### The Four Golden Signals

```
┌─────────────────────────────────────────────────────────────┐
│                    GOLDEN SIGNALS                           │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌────────┐  ┌────────┐ │
│  │  LATENCY    │  │  TRAFFIC    │  │ ERRORS │  │ SATUR. │ │
│  │             │  │             │  │        │  │        │ │
│  │ p50: 45ms   │  │ 2,300 RPS   │  │ 0.1%   │  │ CPU:   │ │
│  │ p95: 150ms  │  │             │  │ error  │  │ 60%    │ │
│  │ p99: 450ms  │  │ ▲ trending  │  │ rate   │  │        │ │
│  │             │  │   up 10%    │  │        │  │ Mem:   │ │
│  │ ⚠️ p99 >   │  │             │  │ ✅ OK  │  │ 75%    │ │
│  │   SLO 500ms │  │ ✅ Normal   │  │        │  │        │ │
│  └─────────────┘  └─────────────┘  └────────┘  └────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Metric Categories

#### Infrastructure Metrics (Collected Automatically)

```
# Container / ECS
container_cpu_utilization{service="order-service", task_id="abc123"}
container_memory_utilization{service="order-service", task_id="abc123"}
container_network_rx_bytes_total
container_network_tx_bytes_total

# Database
rds_cpu_utilization{db="ecommerce-order-prod"}
rds_connections_active{db="ecommerce-order-prod"}
rds_read_iops
rds_write_iops
rds_free_storage_bytes

# Redis
elasticache_cpu_utilization
elasticache_memory_utilization
elasticache_cache_hits
elasticache_cache_misses

# Kafka
kafka_consumer_lag{topic="product.events", group="search-indexer"}
kafka_messages_per_second{topic="order.events"}
kafka_broker_disk_utilization
```

#### Application Metrics (Custom)

```
# HTTP
http_request_duration_seconds{method="POST", path="/orders", status="201"}
http_requests_total{method="GET", path="/products", status="200"}
http_errors_total{method="POST", path="/payments", status="500"}

# Business
orders_created_total{tenant="acme"}
orders_confirmed_total
orders_failed_total{reason="payment_failed"}
payments_processed_total{provider="stripe", status="success"}
cart_checkout_total
cart_abandoned_total
search_queries_total
search_latency_seconds{type="full_text"}

# Kafka
kafka_events_published_total{topic="product.events", event_type="product.created"}
kafka_events_consumed_total{topic="order.events", event_type="order.confirmed"}
kafka_events_failed_total{topic="order.events", event_type="reserve_stock"}
outbox_events_pending_count{service="product-service"}
inbox_events_failed_count{service="search-service"}

# Circuit Breaker
circuit_breaker_state{target="payment-gateway", state="closed|open|half_open"}
circuit_breaker_failures_total{target="payment-gateway"}

# Cache
cache_hit_ratio{service="product-service", cache="product_details"}
cache_eviction_total{service="cart-service"}
```

### Prometheus Metrics Endpoint

```typescript
// Each service exposes /metrics
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}
```

---

## 7.5 Distributed Tracing

### Trace Visualization

```
  Request: POST /api/orders (Create Order + Checkout Saga)

  Trace ID: trace-xyz-789
  Total Duration: 850ms

  ├── API Gateway ──────── [0ms ─────────────────────────── 850ms]
  │   ├── Auth Validate ── [5ms ── 20ms] (15ms)
  │   └── Route to Order ─ [21ms ────────────────────────── 845ms]
  │       ├── Order.create ── [25ms ────── 100ms]
  │       │   ├── DB.insert ──── [30ms ── 50ms] (20ms)
  │       │   └── Outbox.save ── [51ms ── 60ms] (9ms)
  │       │
  │       ├── Kafka: ReserveStock ── [105ms ──────── 400ms]
  │       │   └── Inventory.reserve ── [110ms ──── 380ms]
  │       │       ├── DB.select ──── [115ms ── 125ms] (10ms)
  │       │       ├── OCC.update ──── [126ms ── 150ms] (24ms)
  │       │       └── Outbox.save ── [151ms ── 160ms] (9ms)
  │       │
  │       ├── Kafka: ProcessPayment ── [405ms ──────── 750ms]
  │       │   └── Payment.process ── [410ms ──── 740ms]
  │       │       ├── Stripe.charge ──── [415ms ────── 700ms] (285ms) ⚠️ SLOW
  │       │       └── DB.save ──── [701ms ── 720ms] (19ms)
  │       │
  │       └── Order.confirm ── [755ms ── 840ms]
  │           ├── DB.update ──── [760ms ── 775ms] (15ms)
  │           └── Outbox.save ── [776ms ── 785ms] (9ms)

  Insight: Stripe API call takes 285ms (34% of total).
  Action: Consider async payment confirmation for non-critical paths.
```

### OpenTelemetry Setup

```typescript
// tracing.ts — Initialize before NestJS app
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.SERVICE_NAME,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-pg': { enabled: true },
      '@opentelemetry/instrumentation-redis': { enabled: true },
    }),
  ],
});

sdk.start();
```

---

## 7.6 Log Aggregation Architecture

```
  Service 1 ──┐
  Service 2 ──┤  stdout/stderr  ┌──────────────┐    ┌────────────┐
  Service 3 ──┼────────────────►│ CloudWatch   │───►│ OpenSearch  │
  Service 4 ──┤  (JSON logs)   │ Logs         │    │ (Kibana)   │
  Service 5 ──┘                 │              │    └────────────┘
                                │ Subscription │
                                │ Filters      │───► Lambda → S3
                                └──────────────┘    (archive)
```

### CloudWatch Log Groups

```
/ecs/ecommerce/api-gateway
/ecs/ecommerce/auth-service
/ecs/ecommerce/user-service
/ecs/ecommerce/product-service
/ecs/ecommerce/search-service
/ecs/ecommerce/cart-service
/ecs/ecommerce/order-service
/ecs/ecommerce/inventory-service
/ecs/ecommerce/payment-service
/ecs/ecommerce/notification-service
```

### Useful Log Queries (CloudWatch Insights)

```sql
-- Find all logs for a specific request
fields @timestamp, service, level, message
| filter correlationId = "req-abc-123"
| sort @timestamp asc

-- Error rate by service in last hour
fields service
| filter level = "error"
| stats count() as errorCount by service
| sort errorCount desc

-- Slow requests (> 500ms)
fields @timestamp, service, path, duration
| filter duration > 500
| sort duration desc
| limit 20

-- Kafka consumer lag alerts
fields service, topic, consumerLag
| filter consumerLag > 1000
| sort consumerLag desc

-- Failed saga steps
fields @timestamp, orderId, sagaStep, failureReason
| filter message like /saga.*failed/
| sort @timestamp desc
```

---

## 7.7 Dashboards

### Dashboard Hierarchy

```
  Level 1: Executive Dashboard
  ├── Orders per minute (business health)
  ├── Revenue (real-time)
  ├── Error rate (system health)
  └── Overall latency (customer experience)

  Level 2: Service Dashboard (one per service)
  ├── RPS, latency (p50/p95/p99), error rate
  ├── CPU, memory, instance count
  ├── Database connections, query latency
  └── Kafka consumer lag

  Level 3: Debug Dashboard (troubleshooting)
  ├── Individual request traces
  ├── Error logs with stack traces
  ├── Kafka partition distribution
  └── Circuit breaker states
```

### Example: Order Service Dashboard

```
┌────────────────────────────────────────────────────────────┐
│                  ORDER SERVICE DASHBOARD                    │
├────────────────────────────┬───────────────────────────────┤
│  📈 Orders/min: 342       │  ⏱️ Latency (p95): 245ms     │
│  ✅ Success Rate: 99.7%   │  ❌ Error Rate: 0.3%          │
├────────────────────────────┼───────────────────────────────┤
│  🖥️ CPU: 45%  Mem: 62%   │  📊 Instances: 5             │
│  🔄 Active Sagas: 23      │  ⚠️ Failed Sagas: 2          │
├────────────────────────────┼───────────────────────────────┤
│  Saga Step Distribution:  │  Recent Errors:               │
│  ├── Created: 12          │  ├── PaymentTimeout (2)       │
│  ├── StockReserved: 7     │  └── InsufficientStock (1)    │
│  ├── PaymentDone: 3       │                               │
│  └── Confirmed: 1         │                               │
├────────────────────────────┴───────────────────────────────┤
│  Kafka Consumer Lag: order-saga-group                      │
│  ┌─────────────────────────────────────────────────┐      │
│  │  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁  (lag over time)             │      │
│  │  Current: 45 messages                            │      │
│  └─────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────┘
```

---

## 7.8 Alerts

### Alert Hierarchy

| Severity | SLA | Who | Example |
|----------|-----|-----|---------|
| **P1 — Critical** | Respond in 5 min | On-call engineer (page) | Service down, error rate > 5% |
| **P2 — High** | Respond in 30 min | On-call engineer (Slack) | Latency p95 > 500ms, consumer lag > 10K |
| **P3 — Medium** | Respond in 4 hours | Team channel | Disk > 80%, cert expiring in 7 days |
| **P4 — Low** | Next business day | Jira ticket | Deprecated API usage, dependency update |

### Alert Rules

```yaml
# P1: Service Down
- alert: ServiceDown
  expr: up{job="ecs-services"} == 0
  for: 1m
  severity: critical
  annotation: "{{ $labels.service }} is DOWN"

# P1: High Error Rate
- alert: HighErrorRate
  expr: rate(http_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05
  for: 2m
  severity: critical
  annotation: "{{ $labels.service }} error rate > 5%"

# P2: High Latency
- alert: HighLatency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
  for: 5m
  severity: high
  annotation: "{{ $labels.service }} p95 latency > 500ms"

# P2: Kafka Consumer Lag
- alert: HighConsumerLag
  expr: kafka_consumer_lag > 10000
  for: 5m
  severity: high
  annotation: "Consumer {{ $labels.group }} on {{ $labels.topic }} lag > 10K"

# P3: Database Connection Saturation
- alert: DatabaseConnectionSaturation
  expr: rds_connections_active / rds_max_connections > 0.8
  for: 10m
  severity: medium
  annotation: "{{ $labels.db }} using > 80% connections"

# P2: Circuit Breaker Open
- alert: CircuitBreakerOpen
  expr: circuit_breaker_state{state="open"} == 1
  for: 1m
  severity: high
  annotation: "Circuit breaker OPEN for {{ $labels.target }}"

# P3: DLQ Messages
- alert: DLQMessagesAccumulating
  expr: kafka_consumer_lag{topic=~".*\\.dlq"} > 0
  for: 15m
  severity: medium
  annotation: "DLQ messages accumulating on {{ $labels.topic }}"
```

---

## 7.9 SLO / SLA

### Service Level Definitions

| Term | Definition | Example |
|------|-----------|---------|
| **SLI** (Indicator) | The measurement | Request latency, error rate |
| **SLO** (Objective) | The target | 99.9% of requests < 300ms |
| **SLA** (Agreement) | The contract | 99.95% uptime or credits issued |

### Our SLOs

| Service | SLI | SLO | Measurement Window |
|---------|-----|-----|-------------------|
| **API Gateway** | Availability | 99.95% | 30 days |
| **API Gateway** | Latency (p95) | < 300ms | 30 days |
| **Product Search** | Latency (p95) | < 200ms | 30 days |
| **Order Creation** | Success rate | 99.9% | 30 days |
| **Payment Processing** | Success rate | 99.99% | 30 days |
| **Event Processing** | End-to-end latency | < 30s | 30 days |

### Error Budget

```
SLO: 99.9% availability over 30 days

Total minutes in 30 days: 43,200
Allowed downtime: 43,200 × 0.1% = 43.2 minutes

Error budget remaining:
  ├── Used: 12 minutes (deployment issue on Jan 5)
  ├── Used: 8 minutes (Kafka rebalance on Jan 12)
  ├── Remaining: 23.2 minutes
  └── Status: ✅ Healthy (54% budget remaining)

When error budget < 20%:
  → Freeze feature deployments
  → Focus on reliability improvements
```

---

## 7.10 Error Tracking

### Error Classification

```
  Error Received
       │
       ├── Known + Expected → Log as INFO, increment metric
       │   Examples: Insufficient stock, invalid coupon
       │
       ├── Known + Unexpected → Log as WARN, alert if frequent
       │   Examples: Third-party timeout, rate limit hit
       │
       └── Unknown → Log as ERROR, create incident, alert on-call
           Examples: Null pointer, data corruption, OOM
```

### Integration with Error Tracking Service (Sentry/Datadog)

```typescript
// Global error handler integration
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only report unexpected errors to Sentry
    if (status >= 500) {
      Sentry.captureException(exception, {
        tags: {
          service: process.env.SERVICE_NAME,
          environment: process.env.NODE_ENV,
        },
        extra: {
          correlationId: request.correlationId,
          userId: request.user?.id,
          path: request.url,
        },
      });
    }
  }
}
```

---

## Common Mistakes

> [!CAUTION]
> - **Logging without correlation IDs.** Without correlation IDs, you can't trace a request
>   across services. Every log entry needs one.
> - **Too many alerts.** Alert fatigue is real. If you have 50 alerts firing daily, nobody
>   reads them. Only alert on actionable, impactful conditions.
> - **No SLOs.** Without SLOs, you don't know if your system is "healthy" or "broken."
>   You're just guessing.
> - **Metrics without dashboards.** Collecting metrics nobody looks at is wasted effort.
>   Every metric should appear on at least one dashboard.
> - **Ignoring Kafka consumer lag.** A growing consumer lag means your consumers can't keep up.
>   Left unchecked, this leads to data inconsistency and eventually out-of-retention data loss.

---

> **Next →** [Phase 8 — Production Readiness Checklist](./phase-08-production-readiness.md)
