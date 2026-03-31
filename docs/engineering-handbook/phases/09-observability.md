# Phase 09 — Observability

---

## 1. Overview

Instrument every service so operators can see, measure, and trace what the system is doing.
After this phase, any production issue can be diagnosed without adding debugging code.

## 2. Goals

- Structured JSON logs with correlation IDs across all services
- Prometheus metrics on every service
- Distributed traces across the checkout flow
- Dashboards for executive, per-service, Kafka, and Saga views
- Alerts with graduated severity (P1→PagerDuty, P2→Slack)

## 3. Architecture Design

See [Observability Strategy](../global/observability-strategy.md) for the full strategy.

## 4. Technology Choices

| Pillar | Tool | Why |
|--------|------|-----|
| Logs | JSON stdout → CloudWatch | ECS-native, zero agent |
| Metrics | prom-client → Prometheus → Grafana | Industry standard |
| Traces | OpenTelemetry → Jaeger/X-Ray | Vendor-neutral |
| Errors | Sentry | Best grouping, Slack alerts |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-029 | JSON stdout (not file, not agent) | 12-factor standard, ECS log driver handles shipping |
| ADR-030 | Prometheus pull model | Service doesn't need to know where metrics go |
| ADR-031 | OpenTelemetry over X-Ray SDK | Vendor-neutral, portable |

## 6. Data Flow / Request Flow

```
Service → stdout → ECS log driver → CloudWatch Logs → Insights queries
Service → /metrics → Prometheus scrape → Grafana dashboards → Alerts
Service → OTLP export → Jaeger → Trace viewer
Service → Sentry SDK → Sentry → Slack error alerts
```

## 7. Components Involved

- All 10 services (instrumented)
- CloudWatch Logs (log aggregation)
- Prometheus + Grafana (metrics + dashboards)
- Jaeger or X-Ray (distributed tracing)
- Sentry (error tracking)
- PagerDuty + Slack (alerting)

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Structured logger, correlation ID, HTTP logging, CloudWatch log groups |
| Week 2 | Metrics service, /metrics endpoint, HTTP/business/Kafka/infra metrics |
| Week 3 | OpenTelemetry SDK, auto-instrumentation, Grafana dashboards |
| Week 4 | Alert rules (P1-P4), Sentry integration, SLO dashboard |

## 9. Tasks Checklist

```
- [ ] Structured JSON logger (timestamp, level, service, correlationId, traceId)
- [ ] PII redaction (email, phone, card → masked)
- [ ] Correlation ID middleware (generate, propagate HTTP + Kafka)
- [ ] Logging interceptor (log request/response, skip /health + /metrics)
- [ ] /metrics endpoint per service (Prometheus format)
- [ ] HTTP metrics (duration, count, errors by method/path/status)
- [ ] Business metrics (orders, payments, search queries)
- [ ] Kafka metrics (published, consumed, lag, DLQ count)
- [ ] Infrastructure metrics (outbox pending, inbox failed, circuit breaker)
- [ ] OpenTelemetry auto-instrumentation (HTTP, PG, Redis)
- [ ] Custom spans (saga steps, outbox relay)
- [ ] Dashboards: executive, per-service, Kafka, saga, SLO
- [ ] P1 alerts → PagerDuty (service down, error rate > 5%)
- [ ] P2 alerts → Slack (latency > 500ms, consumer lag > 10K)
- [ ] Sentry integration (5xx errors only)
- [ ] SLO tracking (error budget, 30-day window)
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| JSON logging | CloudWatch shows valid JSON entries |
| Correlation ID traces | Query by ID returns logs from all services |
| /metrics endpoint | `curl :3001/metrics` returns Prometheus format |
| Traces | Checkout flow trace shows spans across 5 services |
| Dashboards | Grafana populated with live data |
| P1 alert fires | PagerDuty page received in < 5 min |
| SLO dashboard | Error budget tracks cumulative error minutes |

## 11. Dependencies

- Phase 05 (Logger, MetricsService, TracingModule in core)
- Phase 06 (services running, generating data)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| High-cardinality metrics → Prometheus OOM | Bounded labels only (method, status, not userId) |
| 100% trace sampling in prod | Sample 10% (100% in dev) |
| Alert fatigue | Only alert on actionable symptoms |

## 13. Common Mistakes

- Logging health check requests (8,640/day/service noise)
- Using userId as a metric label (millions of time series)
- 100% trace sampling in production (10x cost)
- Alerting on symptoms not causes ("CPU high" vs "error rate > 5%")
- No correlation between logs, metrics, and traces
- PII in logs (compliance violation)

## 14. Best Practices

- Alert on the Four Golden Signals: latency, traffic, errors, saturation
- Every alert links to a runbook
- SLO-based alerting (alert when error budget is burning too fast)
- Suppress noisy logs (/health, /metrics, 2xx responses)
