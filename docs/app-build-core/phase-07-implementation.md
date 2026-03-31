# Phase 7 — Observability: Implementation Roadmap

---

## GOALS

Instrument every service so that operators can **see** what the system is doing, **measure**
its health, and **trace** any request through the entire call chain. After this phase, any
production issue can be diagnosed without adding debugging code or asking "what happened?"

**Outcome:** Structured JSON logs with correlation IDs flowing to CloudWatch, Prometheus metrics
scraped from every service, distributed traces visualized in Jaeger/X-Ray, and dashboards +
alerts that prevent issues from reaching customers.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **Logging** | Structured JSON to stdout → CloudWatch | Native ECS integration, zero agent management |
| **Log Analysis** | CloudWatch Insights / OpenSearch | Query across all services by correlationId |
| **Metrics** | prom-client → Prometheus | Industry standard, histogram/counter support |
| **Metrics Visualization** | Grafana | Best-in-class dashboards, alerting rules |
| **Tracing** | OpenTelemetry → OTLP → Jaeger or X-Ray | Vendor-neutral, auto-instrumentation |
| **Error Tracking** | Sentry | Stack traces, grouping, alerting, Slack integration |
| **Alerting** | Grafana Alerting + PagerDuty | Graduated severity (Slack → PagerDuty page) |
| **Uptime Monitoring** | Route 53 Health Checks + Pingdom | External uptime verification |

---

## ARCHITECTURE DECISIONS

### ADR-021: Structured Logging to stdout (not file, not agent)

```
Decision: All services log JSON to stdout. ECS captures stdout → CloudWatch Logs.
  No logging agents (Fluentd, Filebeat) on containers.
Rationale:
  - ECS log driver handles log shipping natively
  - JSON format enables querying in CloudWatch Insights
  - No sidecar container overhead
  - Stdout is the 12-factor app standard
```

### ADR-022: Prometheus Pull Model (Not Push)

```
Decision: Each service exposes /metrics endpoint, scraped by Prometheus at 15s intervals
  Not pushing metrics to a collector
Rationale:
  - Prometheus pull is the industry standard
  - Service doesn't need to know WHERE metrics go
  - If Prometheus is down, service is unaffected
  - ECS Service Discovery provides automatic target registration
```

### ADR-023: OpenTelemetry Over AWS X-Ray SDK

```
Decision: Use OpenTelemetry SDK for tracing, export to Jaeger or X-Ray via OTLP
  Not the X-Ray SDK directly
Rationale:
  - Vendor-neutral: switch from X-Ray to Jaeger/Zipkin without code changes
  - Auto-instrumentation for HTTP, PostgreSQL, Redis, kafkajs
  - Single API for traces + metrics (future: logs)
  - Industry-standard context propagation (W3C Trace Context)
```

---

## IMPLEMENTATION STEPS

```
Week 1: Logging + Correlation
─────────────────────────────
  Step 1: StructuredLogger service                                [Day 1]
  Step 2: CorrelationIdMiddleware                                  [Day 1]
  Step 3: Inject correlationId into Kafka headers                 [Day 2]
  Step 4: Extract correlationId in Kafka consumers                [Day 2]
  Step 5: LoggingInterceptor (log every HTTP request/response)    [Day 3]
  Step 6: CloudWatch log groups per service                       [Day 3]
  Step 7: Verify: query by correlationId across services          [Day 4]

Week 2: Metrics
───────────────
  Step 8: MetricsService (counters, histograms, gauges)           [Day 5]
  Step 9: /metrics endpoint on every service                      [Day 5]
  Step 10: HTTP metrics (duration, count, errors)                 [Day 6]
  Step 11: Business metrics (orders, payments, search queries)    [Day 6]
  Step 12: Kafka metrics (published, consumed, lag)               [Day 7]
  Step 13: Infrastructure custom metrics (outbox, inbox, circuit breaker) [Day 7]
  Step 14: Prometheus scraping configuration                      [Day 8]

Week 3: Tracing + Dashboards
─────────────────────────────
  Step 15: OpenTelemetry SDK initialization                       [Day 9]
  Step 16: Auto-instrumentation (HTTP, PG, Redis)                [Day 9]
  Step 17: Custom spans for Kafka event processing               [Day 10]
  Step 18: OTLP exporter → Jaeger or X-Ray                      [Day 10]
  Step 19: Grafana dashboards (executive + per-service)          [Day 11-12]
  Step 20: CloudWatch Insights saved queries                      [Day 12]

Week 4: Alerts + Error Tracking
───────────────────────────────
  Step 21: Define alert rules (P1-P4)                             [Day 13]
  Step 22: Configure Grafana alerting → Slack + PagerDuty        [Day 13]
  Step 23: Sentry integration (error tracking)                    [Day 14]
  Step 24: SLO dashboard (error budget tracking)                  [Day 14]
  Step 25: Test: trigger alerts, verify notification              [Day 15]
```

---

## TASK BREAKDOWN

```
Phase 7 — Observability
│
├── [ ] 7.1 — Structured Logging
│   ├── [ ] StructuredLogger.log/warn/error/debug methods
│   ├── [ ] JSON format: timestamp, level, service, traceId, correlationId, message, context
│   ├── [ ] PII redaction (email → e***@domain.com, card → ****1234)
│   ├── [ ] Log level configurable via env (LOG_LEVEL=info)
│   ├── [ ] Suppress noisy logs (health check, /metrics)
│   ├── [ ] Apply as NestJS global logger (replaces default)
│   └── [ ] Test: log output is valid JSON with correct fields
│
├── [ ] 7.2 — Correlation ID Propagation
│   ├── [ ] CorrelationIdMiddleware (generate on first entry)
│   ├── [ ] Propagate via X-Correlation-Id header (service-to-service)
│   ├── [ ] Inject into Kafka message headers (producer)
│   ├── [ ] Extract from Kafka message headers (consumer)
│   ├── [ ] Return in HTTP response header
│   ├── [ ] AsyncLocalStorage for request-scoped context
│   └── [ ] Test: trace a request across 3 services by correlationId
│
├── [ ] 7.3 — HTTP Logging
│   ├── [ ] LoggingInterceptor: log request start + completion
│   ├── [ ] Fields: method, path, status, duration, correlationId
│   ├── [ ] Skip: /health, /metrics (noise reduction)
│   ├── [ ] Log request body for POST/PUT (redacted PII)
│   ├── [ ] Log slow requests separately (> 500ms → warn)
│   └── [ ] Apply globally via APP_INTERCEPTOR
│
├── [ ] 7.4 — Metrics Infrastructure
│   ├── [ ] MetricsService with prom-client Registry
│   ├── [ ] /metrics endpoint (Prometheus text format)
│   ├── [ ] Default metrics (Node.js runtime: heap, GC, event loop)
│   ├── [ ] HTTP metrics:
│   │   ├── [ ] http_request_duration_seconds (histogram, labels: method, path, status)
│   │   ├── [ ] http_requests_total (counter)
│   │   └── [ ] http_errors_total (counter, labels: method, path, status)
│   ├── [ ] Business metrics:
│   │   ├── [ ] orders_created_total, orders_confirmed_total, orders_failed_total
│   │   ├── [ ] payments_processed_total{provider, status}
│   │   ├── [ ] search_queries_total, search_latency_seconds
│   │   └── [ ] cart_checkout_total, cart_abandoned_total
│   ├── [ ] Kafka metrics:
│   │   ├── [ ] kafka_events_published_total{topic, event_type}
│   │   ├── [ ] kafka_events_consumed_total{topic, event_type, status}
│   │   ├── [ ] kafka_consumer_lag{topic, consumer_group}
│   │   └── [ ] kafka_event_processing_duration_seconds
│   ├── [ ] Infrastructure metrics:
│   │   ├── [ ] outbox_pending_count{service}
│   │   ├── [ ] inbox_failed_count{service}
│   │   ├── [ ] circuit_breaker_state{target}
│   │   └── [ ] cache_hit_ratio{service, cache_name}
│   └── [ ] Test: /metrics returns valid Prometheus format
│
├── [ ] 7.5 — Distributed Tracing
│   ├── [ ] OpenTelemetry NodeSDK initialization (tracing.ts)
│   ├── [ ] Auto-instrumentation:
│   │   ├── [ ] HTTP (incoming + outgoing)
│   │   ├── [ ] PostgreSQL (TypeORM queries)
│   │   ├── [ ] Redis (ioredis commands)
│   │   └── [ ] kafkajs (optional, may need custom spans)
│   ├── [ ] Custom spans for business operations:
│   │   ├── [ ] Saga step execution
│   │   ├── [ ] Outbox relay batch
│   │   └── [ ] OpenSearch indexing
│   ├── [ ] OTLP exporter configuration (Jaeger or X-Ray)
│   ├── [ ] Service name and version in resource attributes
│   ├── [ ] Sampling strategy (100% dev, 10% prod for cost control)
│   └── [ ] Test: trace visible across 3+ services for checkout flow
│
├── [ ] 7.6 — Dashboards
│   ├── [ ] Executive dashboard:
│   │   ├── [ ] Orders/minute, Revenue, System error rate
│   │   └── [ ] Overall latency (p50/p95/p99)
│   ├── [ ] Per-service dashboard (template, one per service):
│   │   ├── [ ] RPS, latency percentiles, error rate
│   │   ├── [ ] CPU, memory, instance count
│   │   ├── [ ] DB connections, query latency
│   │   └── [ ] Kafka consumer lag
│   ├── [ ] Saga dashboard:
│   │   ├── [ ] Active sagas count
│   │   ├── [ ] Success/failure/timeout rates
│   │   └── [ ] Step duration breakdown
│   ├── [ ] Kafka dashboard:
│   │   ├── [ ] Published/consumed rates per topic
│   │   ├── [ ] Consumer lag per group
│   │   └── [ ] DLQ message count
│   └── [ ] CloudWatch Insights saved queries:
│       ├── [ ] Find all logs by correlationId
│       ├── [ ] Error rate by service (last hour)
│       ├── [ ] Slow requests (> 500ms)
│       └── [ ] Failed saga steps
│
├── [ ] 7.7 — Alerting
│   ├── [ ] P1 alerts (page via PagerDuty):
│   │   ├── [ ] Service down (up == 0 for 1 min)
│   │   ├── [ ] Error rate > 5% for 2 min
│   │   └── [ ] Saga timeout rate > 1%
│   ├── [ ] P2 alerts (Slack #incidents):
│   │   ├── [ ] Latency p95 > 500ms for 5 min
│   │   ├── [ ] Kafka consumer lag > 10K for 5 min
│   │   ├── [ ] Circuit breaker open
│   │   └── [ ] Database connection saturation > 80%
│   ├── [ ] P3 alerts (Slack #platform):
│   │   ├── [ ] DLQ messages accumulating > 15 min
│   │   ├── [ ] Disk usage > 80%
│   │   ├── [ ] Certificate expiring < 7 days
│   │   └── [ ] Memory usage > 80% sustained
│   ├── [ ] Alert routing configuration
│   ├── [ ] Test: manually trigger each P1 alert
│   └── [ ] Document alert → runbook mapping
│
├── [ ] 7.8 — Error Tracking
│   ├── [ ] Sentry SDK integration in GlobalExceptionFilter
│   ├── [ ] Only report 5xx errors (not 4xx)
│   ├── [ ] Tag with service, environment, userId, correlationId
│   ├── [ ] Source maps upload for stack traces
│   └── [ ] Slack notification on new error types
│
└── [ ] 7.9 — SLO Tracking
    ├── [ ] SLO definitions per service (availability, latency)
    ├── [ ] Error budget calculation (30-day rolling window)
    ├── [ ] SLO dashboard in Grafana
    ├── [ ] Alert when error budget < 20%
    └── [ ] Document: SLO review process (monthly)
```

---

## FOLDER STRUCTURE (Observability Configuration)

```
infrastructure/
├── monitoring/
│   ├── prometheus/
│   │   ├── prometheus.yml            # Scrape config
│   │   ├── alert-rules.yml           # Alert rules
│   │   └── recording-rules.yml       # Pre-computed aggregations
│   ├── grafana/
│   │   ├── provisioning/
│   │   │   ├── datasources/
│   │   │   │   └── prometheus.yml
│   │   │   └── dashboards/
│   │   │       └── dashboard-provider.yml
│   │   └── dashboards/
│   │       ├── executive.json
│   │       ├── service-template.json
│   │       ├── kafka.json
│   │       ├── saga.json
│   │       └── slo.json
│   └── alertmanager/
│       └── alertmanager.yml          # Routing: P1→PagerDuty, P2→Slack
│
└── docker-compose.monitoring.yml     # Prometheus + Grafana + Jaeger for local dev
```

---

## DEPENDENCIES

```
Phase 7 depends on:
  └── Phase 3 (Logger, MetricsService, TracingModule exist in core)
  └── Phase 4 (services running, generating logs and events)
  └── Phase 2 (CloudWatch, ALB access logs, RDS monitoring)

Internal dependencies:
  7.1 Logging            → foundation for everything
  7.2 Correlation IDs    → required by 7.3 HTTP logging, 7.5 tracing
  7.3 HTTP logging       → depends on 7.1 + 7.2
  7.4 Metrics            → independent but uses 7.1 for logging setup
  7.5 Tracing            → depends on 7.2 (correlation propagation)
  7.6 Dashboards         → depends on 7.4 (metrics data) + 7.1 (log data)
  7.7 Alerting           → depends on 7.4 (metric-based alerts) + 7.6 (dashboard links)
  7.8 Error tracking     → depends on 7.1 (logger integration)
  7.9 SLO tracking       → depends on 7.4 (metrics) + 7.7 (alert on budget burn)
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | Structured JSON logging on all services | CloudWatch shows valid JSON entries |
| D2 | Correlation ID traces request across services | Query by ID returns logs from all touched services |
| D3 | /metrics endpoint on all services | `curl :3001/metrics` returns Prometheus format |
| D4 | Prometheus scraping all services | Prometheus targets page shows all healthy |
| D5 | Distributed traces visible | Checkout flow trace shows spans across 5 services |
| D6 | Executive + per-service dashboards | Grafana dashboards populated with live data |
| D7 | P1 alerts fire and reach PagerDuty | Simulate outage → page received in < 5 min |
| D8 | P2 alerts reach Slack | Simulate high latency → Slack notification |
| D9 | Sentry captures 5xx errors | Throw test error → appears in Sentry |
| D10 | SLO dashboard shows error budget | Budget tracks cumulative error minutes |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Logging health check requests.** `/health` is called every 10 seconds by ALB. That's
> 8,640 log entries per day per service. Suppress them.
>
> **2. High-cardinality metric labels.** Using `userId` as a metric label creates millions of
> time series → Prometheus OOM. Labels should be bounded (method, status, service, route).
>
> **3. 100% sampling in production.** Tracing 100% of requests costs 10x more and floods
> the collector. Sample 10% in production (or tail-based sampling for errors).
>
> **4. Alerting on symptoms, not causes.** "CPU is high" is a symptom. "Error rate > 5%"
> is actionable. Alert on the Four Golden Signals: latency, traffic, errors, saturation.
>
> **5. No correlation between logs, metrics, and traces.** If your logs don't contain
> `traceId` and `correlationId`, you can't jump from a log entry to its trace. Wire them all.
>
> **6. PII in logs.** Logging `"user": { "email": "john@example.com", "creditCard": "4111..." }`
> is a compliance violation. Redact or hash PII before logging.

---

> **Next →** [Phase 8 — Production Readiness Implementation](./phase-08-implementation.md)
