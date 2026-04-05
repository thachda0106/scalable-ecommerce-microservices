# Part IV — Jobs, Observability & Deployment

> **Sections**: 9. Job Flow | 10. Observability | 11. Deployment Flow

---

# Section 9: Job Flow (Background Workers)

## 9.1 Background Job Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    BACKGROUND JOB CATALOG                        │
│                                                                    │
│  ┌─────────────────────┐   ┌─────────────────────┐              │
│  │ OutboxProcessor     │   │ InboxProcessor      │              │
│  │ (per service)       │   │ (per service)       │              │
│  │                     │   │                     │              │
│  │ Schedule: every 5s  │   │ Schedule: every 30s │              │
│  │ Polls: outbox_events│   │ Polls: inbox_events │              │
│  │ WHERE processed=    │   │ WHERE status=FAILED │              │
│  │   false             │   │ AND nextRetryAt     │              │
│  │ Action: publish to  │   │   <= NOW()          │              │
│  │   Kafka → mark done │   │ Action: retry handler│             │
│  └─────────────────────┘   └─────────────────────┘              │
│                                                                    │
│  ┌─────────────────────┐   ┌─────────────────────┐              │
│  │ InboxCleanupService │   │ OutboxCleanupService│              │
│  │                     │   │                     │              │
│  │ Schedule: daily     │   │ Schedule: daily     │              │
│  │ Deletes: PROCESSED  │   │ Deletes: processed  │              │
│  │ events > 7 days old │   │ events > 7 days old │              │
│  │ Preserves:          │   │                     │              │
│  │ DEAD_LETTER events  │   │                     │              │
│  └─────────────────────┘   └─────────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

## 9.2 OutboxProcessor (Core Worker)

```
Schedule: @Cron('*/5 * * * * *')  — every 5 seconds
Batch Size: 50 events per poll

Algorithm:
  1. SELECT * FROM outbox_events WHERE processed = false
     ORDER BY created_at ASC LIMIT 50
  2. For each event:
     a. Wrap in Kafka message with headers (x-event-type, x-event-id)
     b. Publish to target Kafka topic via safeExecute(NON_BLOCKING)
     c. UPDATE SET processed = true
  3. Log: "Outbox processed: {published}/{total} events published"

Failure Handling:
  - If Kafka publish fails → event stays processed=false → retried next poll
  - safeExecute NON_BLOCKING: log error, continue to next event
  - No partial batches — each event is independently published/marked

Performance:
  - 5s poll interval → ~5s max event publishing latency
  - Production recommendation: 1s poll for lower latency (~2-3s end-to-end)
  - Batch size 50 prevents long-running transactions
```

## 9.3 InboxProcessor (Retry Worker)

```
Schedule: @Cron('*/30 * * * * *')  — every 30 seconds
Batch Size: 20 events per poll

Algorithm:
  1. SELECT * FROM inbox_events
     WHERE status = 'FAILED' AND next_retry_at <= NOW()
     ORDER BY created_at ASC LIMIT 20
  2. For each event:
     a. CAS: UPDATE SET status = 'PROCESSING' WHERE status = 'FAILED'
     b. Look up registered handler by eventType
     c. Execute handler within DB transaction
     d. If success → status = PROCESSED
     e. If error → handleFailure():
        - Increment retryCount
        - If retryCount < maxRetries → FAILED, nextRetryAt = now + backoff
        - If retryCount >= maxRetries → DEAD_LETTER → send to DLQ topic

Backoff Formula:
  nextRetryAt = NOW() + backoffMs × 2^retryCount
  Attempt 1: +200ms
  Attempt 2: +400ms
  Attempt 3: +800ms
  Attempt 4: +1,600ms
  Attempt 5: DEAD_LETTER (total wait: ~3.2s across all retries)
```

## 9.4 Cleanup Workers

```
InboxCleanupService:
  Schedule: @Cron('0 0 3 * * *')  — daily at 3 AM
  Query: DELETE FROM inbox_events
         WHERE status = 'PROCESSED'
         AND processed_at < NOW() - INTERVAL '7 days'
  Note: DEAD_LETTER events are NEVER auto-cleaned (require manual resolution)

OutboxCleanupService:
  Schedule: @Cron('0 0 4 * * *')  — daily at 4 AM
  Query: DELETE FROM outbox_events
         WHERE processed = true
         AND created_at < NOW() - INTERVAL '7 days'
```

## 9.5 Job Monitoring

| Job | Health Metric | Alert Threshold |
|-----|--------------|-----------------|
| OutboxProcessor | `outbox_events_pending` | > 100 pending events for > 5min |
| InboxProcessor | `inbox_events_total{status=FAILED}` | > 0 for > 10min |
| InboxProcessor | `inbox_events_total{status=DEAD_LETTER}` | > 0 (immediate alert) |
| Cleanup | Row count of cleaned records | Log only (no alert) |

---

# Section 10: Observability (Logging, Tracing, Monitoring)

## 10.1 Observability Stack

```
┌───────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY ARCHITECTURE                  │
│                                                                 │
│  Services ──────→ Logs (stdout JSON) ──→ CloudWatch Logs      │
│           │                               │                    │
│           ├──→ Traces (OTLP) ──────────→ OpenTelemetry ──→ Jaeger/X-Ray  │
│           │                                                    │
│           └──→ Metrics (/metrics) ─────→ Prometheus ──→ Grafana│
│                                                         │      │
│                                                   Alerts → Slack/PagerDuty │
└───────────────────────────────────────────────────────────────┘
```

## 10.2 Structured Logging (Pino)

Every log line is structured JSON with mandatory context fields:

```json
{
  "level": 30,
  "time": 1711090800123,
  "pid": 1,
  "hostname": "order-service-abc123",
  "context": "CreateOrderHandler",
  "msg": "Order created successfully",
  "requestId": "req-550e8400",
  "traceId": "trace-abc123",
  "spanId": "span-002",
  "userId": "usr-123e4567",
  "orderId": "ord-789e0123",
  "service": "order-service",
  "env": "production"
}
```

| Level | Value | Usage |
|-------|-------|-------|
| `fatal` | 60 | Process about to crash |
| `error` | 50 | Failed operation, needs attention |
| `warn` | 40 | Degraded behavior (retries, circuit open) |
| `info` | 30 | Business events (order created, payment processed) |
| `debug` | 20 | Technical details (cache hits, inbox dedup) |
| `trace` | 10 | Verbose (SQL queries, Redis ops) |

**Production log level**: `info` (30). Debug/trace enabled per-service for troubleshooting.

## 10.3 Distributed Tracing (OpenTelemetry)

```
Trace propagation:
  HTTP (synchronous):
    API Gateway creates root span
    W3C traceparent header propagated to downstream services
    Each service creates child spans automatically

  Kafka (asynchronous):
    x-correlation-id header in Kafka message headers
    Consumer creates new trace linked by correlationId
    Jaeger can correlate async spans across services

Auto-instrumented:
  - HTTP (Express) → incoming/outgoing request spans
  - PostgreSQL (pg) → query spans with SQL context
  - Redis (ioredis) → operation spans
  - DNS → DNS lookup spans

Custom spans:
  - safeExecute → creates span: "safeExecute:{label}"
  - Records retry events, circuit breaker state changes
  - Duration, success/failure, error details
```

### Example Trace (Order Checkout — 4 services, 22 spans)

```
Trace: trace-abc123 (22 spans, 4 services, 850ms total)
├── [api-gateway] POST /orders (850ms)
│   ├── [api-gateway] ThrottlerGuard.check (2ms)
│   ├── [api-gateway] JwtAuthGuard.validate (3ms)
│   └── [api-gateway] BaseHttpClient.forward (840ms)
│       └── [order-service] POST /orders (830ms)
│           ├── [order-service] CreateOrderHandler.execute (820ms)
│           │   ├── [postgres] INSERT INTO orders (8ms)
│           │   ├── [postgres] INSERT INTO order_items ×2 (12ms)
│           │   ├── [postgres] INSERT INTO outbox_events (3ms)
│           │   └── [kafka] safeExecute:publish (2ms) NON_BLOCKING
│           └── Response serialization (10ms)
│
│ ── Async (via Kafka) ──
├── [inventory-service] ConfirmStockHandler (120ms)
│   ├── [postgres] SELECT stock FOR UPDATE (15ms)
│   └── [postgres] UPDATE + INSERT (21ms)
│
├── [payment-service] ProcessPaymentHandler (520ms)
│   ├── [http] POST stripe.com/v1/charges (450ms) ← external API
│   └── [postgres] INSERT payments (8ms)
│
└── [order-service] ConfirmPaymentHandler (15ms)
    └── [postgres] UPDATE orders SET status (3ms)
```

## 10.4 Prometheus Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `http_requests_total` | Counter | method, route, status | Request rate & error rate |
| `http_request_duration_seconds` | Histogram | method, route | Latency percentiles |
| `resilience_exec_total` | Counter | strategy, status, label | safeExecute success/failure |
| `resilience_exec_duration_seconds` | Histogram | strategy, label | External call latency |
| `resilience_retry_total` | Counter | label | Retry frequency |
| `kafka_messages_consumed_total` | Counter | topic, group | Consumer throughput |
| `inbox_events_total` | Counter | status, eventType | Event processing |
| `outbox_events_pending` | Gauge | service | Outbox backlog |
| `circuit_breaker_state` | Gauge | key, state | Circuit breaker status |

### Key Grafana Dashboard Queries

```promql
# Request rate per second
rate(http_requests_total{service="order-service"}[5m])

# P99 latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="api-gateway"}[5m]))

# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# Circuit breaker open (immediate alert)
circuit_breaker_state{state="OPEN"} > 0

# Outbox backlog (events stuck)
outbox_events_pending > 100

# DLQ events (needs attention)
inbox_events_total{status="DEAD_LETTER"} > 0
```

## 10.5 Health Checks

```
Every service exposes three endpoints via @nestjs/terminus:

GET /health          → aggregate health { database, redis, kafka }
GET /health/liveness → is the process alive? (Kubernetes/ECS probe)
GET /health/readiness→ can it serve traffic? (dependency checks)

ALB Target Group:
  Health check path: /health/liveness
  Interval: 30s  |  Timeout: 5s
  Healthy threshold: 2  |  Unhealthy threshold: 3
```

## 10.6 Alerting & Incident Response

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| High error rate | 5xx > 5% for 5min | P1 | On-call investigates, potential rollback |
| Circuit breaker open | Any CB in OPEN state | P2 | Check downstream dependency health |
| DLQ message | Any DLQ topic count > 0 | P2 | Investigate x-dlq-reason, fix + replay |
| Outbox backlog | Pending > 100 for 5min | P2 | Check Kafka connectivity, OutboxProcessor |
| High latency | P99 > 2s for 5min | P3 | Check DB queries, cache hit rate |
| Health check failure | 3 consecutive failures | P1 | ECS auto-replaces task |
| Saga stuck | Order in PENDING_PAYMENT > 30min | P2 | Manual investigation, potential compensation |
| Compensation failure | CRITICAL log from saga | P1 | Immediate manual intervention |

---

# Section 11: Deployment Flow (CI/CD & Infrastructure)

## 11.1 Git Workflow

```
main ← protected, requires PR review + CI pass
  └── feature/* ← developer branches
  └── hotfix/*  ← urgent production fixes

Merge strategy: Squash merge to main
Branch protection: 1 approval required, all CI checks must pass
```

## 11.2 CI Pipeline (GitHub Actions)

```
┌─────────────────────────────────────────────────────────────┐
│                    CI/CD PIPELINE                            │
│                                                               │
│  Push to PR:                                                  │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │
│  │  Lint   │→ │  Build   │→ │   Test    │→ │  Docker    │  │
│  │ eslint  │  │ tsc      │  │ jest unit │  │  build     │  │
│  │ prettier│  │ packages │  │ jest int  │  │  (multi-   │  │
│  └─────────┘  │ + apps   │  │           │  │   stage)   │  │
│               └──────────┘  └───────────┘  └────────────┘  │
│                                                               │
│  Merge to main:                                               │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │  Build +   │→ │  Push to   │→ │  Deploy to ECS      │   │
│  │  Tag image │  │  ECR       │  │  (rolling update)    │   │
│  └────────────┘  └────────────┘  └──────────────────────┘   │
│                                                               │
│  Change Detection:                                            │
│  Only rebuild/redeploy services whose source files changed    │
│  + services depending on changed shared packages              │
└─────────────────────────────────────────────────────────────┘
```

## 11.3 Docker Build Strategy

```dockerfile
# Multi-stage build (per service)
FROM node:24-alpine AS base
  → pnpm install (workspace dependencies)
FROM base AS build
  → pnpm build (compile TypeScript)
FROM node:24-alpine AS production
  → Copy only dist/ + node_modules
  → Non-root user
  → HEALTHCHECK --interval=30s CMD curl -f http://localhost:${PORT}/health/liveness
```

**Image size optimization**: Multi-stage build produces ~150MB images (vs ~1GB with full devDependencies). Alpine base reduces OS layer.

## 11.4 Deployment Strategy

```
Strategy: Rolling update (ECS)
  - Minimum healthy: 100%
  - Maximum: 200%
  - New task starts → passes health check → old task drains → deregistered
  - Zero-downtime deployment

Rollback:
  - Automated: if new task fails health check 3 times → ECS stops deployment
  - Manual: revert to previous task definition revision
  - Database: TypeORM migrations are forward-only; backward migration scripts maintained separately
```

## 11.5 Infrastructure as Code (Terraform)

```
terraform/
├── modules/
│   ├── vpc/          → VPC, subnets (public/private), NAT Gateway, security groups
│   ├── ecs/          → ECS cluster, task definitions, services, auto-scaling
│   ├── rds/          → PostgreSQL instances (per service), parameter groups
│   ├── elasticache/  → Redis cluster, subnet groups
│   ├── msk/          → Kafka cluster, topics, configurations
│   ├── opensearch/   → OpenSearch domain, access policies
│   ├── s3/           → Asset buckets, lifecycle policies
│   ├── alb/          → Load balancer, target groups, listener rules
│   ├── cloudfront/   → CDN distribution, origins, cache behaviors
│   └── waf/          → WAF rules, IP sets, rate limiting
├── environments/
│   ├── dev/          → dev.tfvars (small instances, single AZ)
│   ├── staging/      → staging.tfvars (production-like, multi-AZ)
│   └── production/   → production.tfvars (full scale, multi-AZ)
└── bootstrap/        → State bucket, DynamoDB lock table
```

## 11.6 Secrets Management

```
AWS Secrets Manager:
  - JWT secrets (per environment)
  - Database credentials (per service per environment)
  - INTERNAL_AUTH_SECRET (shared across services)
  - External API keys (Stripe, SendGrid)

ECS task definition:
  - Secrets injected as environment variables at container start
  - Secrets referenced by ARN, not stored in code or Docker images
  - Rotation: manual (planned: automated via Lambda rotation)
```

## 11.7 Auto-Scaling

```
ECS Service Auto-Scaling:
  Scale out: Average CPU > 70% for 3 continuous minutes
  Scale in:  Average CPU < 30% for 10 continuous minutes
  Min tasks: 2 (high availability)
  Max tasks: 10 (cost ceiling)

Per-Service Tuning:
  API Gateway:    min=3, max=15 (handles all traffic)
  Order Service:  min=2, max=10 (saga processing)
  Payment Service: min=2, max=5 (external API bottleneck)
  Search Service: min=2, max=8 (OpenSearch query load)
  Others:         min=2, max=5
```
