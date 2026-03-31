# Observability Strategy

> **Purpose:** How we see, measure, and trace what the system is doing in production.

---

## Three Pillars

| Pillar | Tool | What It Answers | Retention |
|--------|------|----------------|-----------|
| **Logs** | CloudWatch Logs (JSON stdout) | "What happened?" | 30 days (prod), 7 days (dev) |
| **Metrics** | Prometheus + Grafana | "How much? How fast? How broken?" | 15 days |
| **Traces** | OpenTelemetry → Jaeger/X-Ray | "Where did this request go?" | 7 days |
| **Errors** | Sentry | "What 5xx errors are new?" | 90 days |

## Correlation ID

Every request gets an `X-Correlation-Id` at the API Gateway. This ID flows through:
- HTTP headers (service-to-service)
- Kafka message headers (event publishing)
- All log entries (structured JSON)
- Trace spans (OpenTelemetry baggage)

**To debug any issue:** Search CloudWatch Insights by `correlationId` → see all logs across all services for that request.

## Metric Categories

| Category | Examples | Alert On |
|----------|---------|----------|
| **HTTP** | request duration, count, errors (by method/path/status) | p95 > 500ms, error rate > 5% |
| **Business** | orders/min, payments processed, cart checkouts | Orders = 0 for 5 min |
| **Kafka** | published/consumed count, consumer lag, DLQ count | Lag > 10K, DLQ > 0 |
| **Infrastructure** | outbox pending, inbox failed, circuit breaker state | Outbox > 100, CB open |
| **Runtime** | CPU, memory, GC pause, event loop lag | CPU > 80%, memory > 80% |

## Alert Severity

| Severity | Response Time | Channel | Example |
|----------|-------------|---------|---------|
| **P1 Critical** | 5 min | PagerDuty (page) | Service down, error rate > 5% |
| **P2 High** | 30 min | Slack #incidents | p95 > 500ms, consumer lag > 10K |
| **P3 Medium** | 4 hours | Slack #platform | DLQ accumulating, disk > 80% |
| **P4 Low** | Next day | Jira ticket | Deprecated API usage |

## Dashboards

1. **Executive** — Orders/min, revenue, error rate, latency
2. **Per-Service** (template) — RPS, latency percentiles, CPU/memory, DB connections
3. **Kafka** — Published/consumed rates, consumer lag, DLQ count
4. **Saga** — Active sagas, success/failure/timeout rates
5. **SLO** — Error budget remaining (30-day window)

## SLOs

| Service | SLI | SLO |
|---------|-----|-----|
| API Gateway | Availability | 99.95% (30-day) |
| API Gateway | Latency (p95) | < 300ms |
| Product Search | Latency (p95) | < 200ms |
| Order Creation | Success rate | 99.9% |
| Event Processing | End-to-end latency | < 30s |
