# Part V — Scale, Security, Reliability & Cost

> **Sections**: 12. Scalability Strategy | 13. Security Architecture | 14. Failure Scenarios & Reliability | 15. Cost Optimization

---

# Section 12: Scalability Strategy

## 12.1 Horizontal Scaling Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SCALING DIMENSIONS                                │
│                                                                       │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   │
│  │  COMPUTE        │   │  DATA           │   │  MESSAGING      │   │
│  │                 │   │                 │   │                 │   │
│  │ ECS Tasks:      │   │ PostgreSQL:     │   │ Kafka:          │   │
│  │ 2-15 per svc    │   │ Read replicas   │   │ Partition count │   │
│  │ CPU auto-scale  │   │ Connection pool │   │ Consumer groups │   │
│  │                 │   │ Query optimize  │   │ Parallel consume│   │
│  │ Stateless:      │   │                 │   │                 │   │
│  │ No local state  │   │ OpenSearch:     │   │ Scale consumers │   │
│  │ Session in Redis│   │ Shard replicas  │   │ independently   │   │
│  │ Events in Kafka │   │ Index partitions│   │ of producers    │   │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘   │
│                                                                       │
│  ┌─────────────────┐   ┌─────────────────┐                         │
│  │  CACHE          │   │  CDN            │                         │
│  │                 │   │                 │                         │
│  │ ElastiCache     │   │ CloudFront      │                         │
│  │ Redis cluster   │   │ Edge caching    │                         │
│  │ Auto-failover   │   │ Static assets   │                         │
│  │ Read replicas   │   │ API response    │                         │
│  └─────────────────┘   └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 12.2 Stateless Service Design

All services are fully stateless — horizontal scaling is adding more ECS tasks:

| State Type | Where Stored | Why Not Local |
|------------|-------------|---------------|
| User sessions | Redis | Multiple instances serve same user |
| Rate limit counters | Redis | Consistent across all instances |
| Shopping cart | PostgreSQL/Redis | Survives instance replacement |
| Domain events | Kafka | Durable, replayable, consumer-group aware |
| File uploads | S3 | Shared across all instances |

## 12.3 Database Scaling Strategy

```
   Current (MVP):
   ┌──────────┐
   │ Primary  │ ← reads + writes
   │   (RDS)  │
   └──────────┘

   Scale Phase 1 (Read Replicas):
   ┌──────────┐     ┌──────────┐
   │ Primary  │ ←── │ Replica  │ ← read-heavy queries (product catalog)
   │ (writes) │     │ (reads)  │
   └──────────┘     └──────────┘

   Scale Phase 2 (Connection Pooling):
   ┌──────────┐     ┌──────────┐     ┌──────────┐
   │ Services │ ──→ │ PgBouncer│ ──→ │   RDS    │
   │ (N tasks)│     │ (pool)   │     │          │
   └──────────┘     └──────────┘     └──────────┘
   Reduces connection count from N×services to pool_size

   Scale Phase 3 (Table Partitioning):
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │orders_   │ │orders_   │ │orders_   │
   │2026_01   │ │2026_02   │ │2026_03   │  ← Range partitioning by month
   └──────────┘ └──────────┘ └──────────┘
```

## 12.4 CQRS Scaling Benefits

```
Write Path (Product Service → PostgreSQL):
  - Single writer, optimized for consistency
  - Scale: vertical (larger RDS instance) + write-ahead log replication

Read Path (Search Service → OpenSearch):
  - Multiple shards, optimized for query throughput
  - Scale: add data nodes, increase replica shards
  - Independent of write path scaling

This means:
  - Black Friday: scale OpenSearch read capacity 10x without touching PostgreSQL
  - Product import: scale PostgreSQL write capacity without affecting search latency
  - Different cost profiles: reads are cheap (OpenSearch), writes are more expensive (PG)
```

## 12.5 Read-Heavy vs Write-Heavy Optimization

| Pattern | Optimization | Applied To |
|---------|-------------|------------|
| **Read-heavy** | Redis cache (TTL), CDN, OpenSearch | Product catalog, search, stock |
| **Write-heavy** | Batch writes, async processing, outbox | Orders, payments, event publishing |
| **Burst** | Queue buffering, auto-scale ECS tasks | Checkout during flash sales |
| **Mixed** | CQRS separation | Product (write PG / read OpenSearch) |

## 12.6 Multi-Region Strategy (Future)

```
Current: Single region (primary AWS region, multi-AZ)
Planned:
  Active-Passive:
    Primary region: full read/write
    DR region: read replicas, standby ECS tasks
    Failover: Route53 health check → switch DNS to DR
    RTO: ~5 minutes  |  RPO: ~1 minute (async replication lag)

  Active-Active (future):
    Both regions serve read traffic
    Writes route to primary → replicate to secondary
    Conflict resolution: last-write-wins with vector clocks
    Kafka MirrorMaker for cross-region event replication
```

---

# Section 13: Security Architecture

## 13.1 Security Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEFENSE IN DEPTH                                  │
│                                                                       │
│  Layer 1: Edge (CloudFront + WAF)                                    │
│  ├── DDoS protection (AWS Shield Standard)                          │
│  ├── WAF rules: rate limiting, IP blocklist, SQL injection, XSS    │
│  ├── Geo-blocking (if needed)                                        │
│  └── TLS 1.3 termination at CloudFront                              │
│                                                                       │
│  Layer 2: Network (VPC)                                              │
│  ├── Private subnets for all services                               │
│  ├── Public subnets only for ALB                                     │
│  ├── Security groups: service-specific ingress rules                │
│  ├── NAT Gateway for outbound (no direct internet access)           │
│  └── VPC Flow Logs for network audit                                │
│                                                                       │
│  Layer 3: Application (API Gateway)                                  │
│  ├── Helmet (security headers: CSP, HSTS, X-Frame-Options)         │
│  ├── JWT authentication (Argon2id + RS256/HS256)                    │
│  ├── Rate limiting (Redis-backed ThrottlerGuard)                    │
│  ├── Input validation (class-validator DTOs, Zod events)            │
│  └── CORS configuration (trusted origins only)                      │
│                                                                       │
│  Layer 4: Service (Individual Microservices)                         │
│  ├── ServiceAuthGuard (internal secret verification)                │
│  ├── RBAC (role-based access control)                               │
│  ├── Ownership guards (UserIdGuard prevents horizontal escalation)  │
│  ├── Domain validation (value objects enforce invariants)            │
│  └── SQL parameterization (TypeORM prevents injection)              │
│                                                                       │
│  Layer 5: Data                                                       │
│  ├── Encryption at rest (RDS, S3, ElastiCache — AES-256)           │
│  ├── Encryption in transit (TLS everywhere)                         │
│  ├── Password hashing (Argon2id, memory-hard)                      │
│  └── Secrets in AWS Secrets Manager (not in code/env files)        │
└─────────────────────────────────────────────────────────────────────┘
```

## 13.2 TLS Configuration

```
External traffic:
  Client → CloudFront: TLS 1.3 (enforced)
  CloudFront → ALB: TLS 1.2+ (AWS internal)
  ALB → ECS tasks: TLS terminated at ALB (internal VPC traffic is HTTP)

Database connections:
  ECS → RDS: SSL enforced via rds.force_ssl parameter
  ECS → ElastiCache: TLS in-transit encryption enabled
  ECS → OpenSearch: HTTPS enforced

Kafka:
  ECS → MSK: TLS + SASL authentication (production)
  Local dev: plaintext (Docker Compose)
```

## 13.3 OWASP Top 10 Mitigations

| OWASP Risk | Mitigation |
|------------|------------|
| **A01 Broken Access Control** | RBAC, UserIdGuard, ownership checks, @Public decorator for explicit opt-in |
| **A02 Cryptographic Failures** | Argon2id for passwords, AES-256 at rest, TLS in transit, no sensitive data in JWT |
| **A03 Injection** | TypeORM parameterized queries, Zod/class-validator input validation, WAF SQL rules |
| **A04 Insecure Design** | DDD value objects enforce domain invariants, state machine prevents invalid transitions |
| **A05 Security Misconfiguration** | Helmet headers, Terraform IaC ensures consistent config, no default credentials |
| **A06 Vulnerable Components** | `pnpm audit`, Dependabot PRs, Node.js LTS updates |
| **A07 Auth Failures** | Argon2id timing-safe verification, login attempt lockout, JWT rotation with theft detection |
| **A08 Data Integrity** | Event schema validation (Zod), idempotency keys, transactional outbox |
| **A09 Logging Failures** | Structured JSON logs, requestId/correlationId in every log, CloudWatch retention |
| **A10 SSRF** | No user-controlled URLs in server-side requests, WAF rules |

## 13.4 Key Rotation Strategy

```
JWT Secret:
  Current: manually rotated via Secrets Manager
  Planned: dual-key support — old key validates for grace period while new key signs

Database Credentials:
  Stored in AWS Secrets Manager
  Planned: automated rotation via Lambda (RDS supports native rotation)

INTERNAL_AUTH_SECRET:
  Shared across services via Secrets Manager
  Rotation requires coordinated redeployment of all services

External API Keys (Stripe):
  Stored in Secrets Manager
  Rotated per provider's recommendation cycle
```

---

# Section 14: Failure Scenarios & Reliability

## 14.1 Failure Impact Matrix

```
┌──────────────────┬────────────────────┬─────────────────────────────────┐
│ Component Down   │ Impact             │ Mitigation                       │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ PostgreSQL       │ Service cannot     │ Multi-AZ RDS failover (~60s),  │
│                  │ read/write         │ circuit breaker FAIL_CLOSE,     │
│                  │                    │ health check → ECS replaces    │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ Redis            │ No rate limiting,  │ safeExecute FAIL_OPEN,         │
│                  │ no session check,  │ ElastiCache auto-failover,     │
│                  │ no cache           │ app degrades gracefully         │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ Kafka            │ Events not         │ Outbox events persist in DB,   │
│                  │ published/consumed │ OutboxProcessor retries on      │
│                  │                    │ next poll, MSK multi-AZ        │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ OpenSearch       │ Search unavailable │ Circuit breaker → fallback     │
│                  │                    │ to PostgreSQL LIKE query       │
│                  │                    │ (degraded search quality)       │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ Stripe API       │ Payments fail      │ Circuit breaker, retry with    │
│                  │                    │ backoff, saga compensation     │
│                  │                    │ (cancel order → release stock) │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ Single service   │ That feature       │ Other services unaffected,     │
│ (e.g., Cart)     │ unavailable        │ ALB health check removes task, │
│                  │                    │ ECS auto-replaces              │
├──────────────────┼────────────────────┼─────────────────────────────────┤
│ API Gateway      │ All traffic stops  │ Multi-instance (min 3 tasks),  │
│                  │                    │ ALB distributes to healthy     │
│                  │                    │ instances                       │
└──────────────────┴────────────────────┴─────────────────────────────────┘
```

## 14.2 Resilience Patterns

### Circuit Breaker (Opossum)

```
State Machine:
  CLOSED → (5 failures) → OPEN → (30s cooldown) → HALF_OPEN → (1 probe success) → CLOSED
                                                             → (1 probe failure) → OPEN

Per-key circuit breakers:
  'redis'       → Circuit for Redis connections
  'db-primary'  → Circuit for PostgreSQL
  'stripe'      → Circuit for Stripe API
  'opensearch'  → Circuit for OpenSearch

Metrics emitted:
  circuit_breaker_state{key="redis", state="OPEN"} → Alert
  resilience_exec_total{status="circuit_open"} → Dashboard
```

### safeExecute Resilience Wrapper

```
Three strategies for different failure criticality:

FAIL_CLOSE (database queries):
  Retry 3 times → throw on final failure
  → Service returns 500 to client

FAIL_OPEN (Redis cache):
  Retry 0 times → return fallback value
  → Service continues without cache (degraded performance)

NON_BLOCKING (Kafka publish, audit logs):
  Retry 0 times → log error → return undefined
  → Service continues, event will be retried by OutboxProcessor
```

### Exponential Backoff with Jitter

```
delay = backoffMs × 2^attempt + random(0, backoffMs × 2^(attempt-1) / 2)

Attempt 1: 200ms + jitter(0-50ms)
Attempt 2: 400ms + jitter(0-100ms)
Attempt 3: 800ms + jitter(0-200ms)
Attempt 4: 1,600ms + jitter(0-400ms)

Jitter prevents thundering herd when all retries happen simultaneously.
```

## 14.3 Saga Failure Recovery

| Failure Scenario | State Before | Recovery | State After |
|---|---|---|---|
| Inventory consumer crashes | CREATED | Kafka redelivers, inbox dedup | Resumes |
| Insufficient stock | CREATED | Cancel order (no compensation needed) | CANCELLED |
| Saga orchestrator crashes | PENDING_PAYMENT | Kafka redelivers to inbox | Resumes |
| Payment network error | PENDING_PAYMENT | Cancel order → release inventory | CANCELLED |
| Card declined | PENDING_PAYMENT | Cancel order → release inventory | CANCELLED |
| Payment consumer crashes | Payment SUCCESS in DB | Kafka redelivers, inbox dedup | PAYMENT_CONFIRMED |
| **Compensation fails** | PENDING_PAYMENT | **CRITICAL: manual intervention** | Stuck (ops team) |

### Critical Safety Net

```
If compensation itself fails:
  1. Logger.error("CRITICAL — Compensation failed for order ${orderId}")
  2. CloudWatch alarm fires → PagerDuty notification
  3. Order stuck in PENDING_PAYMENT
  4. Manual intervention required:
     a. Ops team manually cancels order in DB
     b. Manually releases inventory via admin API
     c. Manually refunds payment if already charged
  5. Post-mortem investigation

Prevention:
  - CancelOrderHandler uses safeExecute with retries
  - Outbox pattern ensures events are eventually published
  - Inbox pattern ensures events are eventually processed
  - Monitoring catches stuck orders (PENDING_PAYMENT > 30min)
```

## 14.4 Graceful Degradation

| Scenario | Degraded Behavior | User Experience |
|----------|-------------------|-----------------|
| Redis down | No caching, no rate limiting, no JTI blocklist | Slower responses, less security (fail-open) |
| OpenSearch down | Search falls back to PostgreSQL LIKE query | Slower search, no fuzzy matching |
| Kafka down | Events queue in outbox (DB), processed when Kafka recovers | Async operations delayed, orders complete slower |
| Stripe down | Circuit breaker opens, orders fail at payment step | User sees "payment temporarily unavailable" |
| Notification Service down | Events accumulate in Kafka, processed when service recovers | Users don't get emails immediately |

## 14.5 Disaster Recovery

```
RTO (Recovery Time Objective): < 15 minutes
RPO (Recovery Point Objective): < 1 minute

Components:
  RDS: Multi-AZ automatic failover (~60s), automated backups (35d retention)
  ElastiCache: Multi-AZ with auto-failover
  MSK: Multi-AZ Kafka brokers, replication factor 3
  OpenSearch: Multi-AZ deployment, automated snapshots
  S3: Cross-region replication for critical assets
  ECS: Auto-replaces unhealthy tasks, multi-AZ placement

Full Region Failure:
  1. Route53 health check detects failure
  2. DNS failover to DR region
  3. DR region ECS tasks start from latest container images
  4. RDS read replica promoted to primary in DR region
  5. Kafka MirrorMaker replays events from last checkpoint
  6. OpenSearch rebuilt from product events (RPO: last snapshot)
```

---

# Section 15: Cost Optimization

## 15.1 Compute Optimization

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| **ECS Fargate Spot** | Use Fargate Spot for non-critical services (notification, search) | ~70% compute cost |
| **Right-sizing** | Start with 0.25 vCPU / 512MB, scale up based on metrics | Avoid over-provisioning |
| **Auto-scaling** | Scale in when CPU < 30% for 10min | Reduce idle costs |
| **Min tasks** | 2 per service (HA) instead of 3+ | Balance cost vs. availability |

## 15.2 Database Optimization

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| **Right-sized RDS** | db.t3.medium for dev, db.r6g.large for prod | Match workload |
| **Reserved instances** | 1-year reserved for production databases | ~30-40% vs on-demand |
| **Connection pooling** | PgBouncer reduces connection overhead | Allows smaller instance |
| **Query optimization** | Indexes on hot paths, EXPLAIN ANALYZE | Reduce CPU/IO |
| **Partitioning** | Archive old outbox/inbox partitions | Reduce storage costs |

## 15.3 Cache & Storage Optimization

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| **ElastiCache sizing** | cache.t3.medium for dev, cache.r6g.large for prod | Match memory needs |
| **TTL tuning** | Short TTLs on volatile data, long on stable data | Optimal memory usage |
| **S3 lifecycle** | Move old assets to S3 Infrequent Access after 90d, Glacier after 1yr | ~80% storage cost |
| **S3 intelligent tiering** | Automatic tier transitions for unpredictable access | Hands-off optimization |

## 15.4 Network & CDN Optimization

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| **CloudFront caching** | Cache GET responses (product listings, images) | Reduce origin requests |
| **VPC endpoints** | S3, ECR, Secrets Manager VPC endpoints | Eliminate NAT Gateway data charges |
| **NAT Gateway** | Shared across subnets, monitor data processing | NAT Gateway is expensive (~$0.045/GB) |
| **Compression** | gzip/brotli for API responses | Reduce bandwidth costs |

## 15.5 Observability Cost Control

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| **Log retention** | 30d CloudWatch for prod, 7d for dev/staging | Reduce log storage |
| **Log level** | `info` in prod (no debug/trace) | Reduce log volume |
| **Metric resolution** | 60s Prometheus scrape (not 10s) | Reduce metric storage |
| **Trace sampling** | 10% sampling in prod (100% in staging) | Reduce trace storage |
| **CloudWatch export** | Export old logs to S3 for cold storage | ~90% cheaper than CW |

## 15.6 Kafka Cost Optimization

| Strategy | Implementation | Savings |
|----------|---------------|---------|
| **Topic retention** | 7d default (not unlimited) | Reduce disk storage |
| **Partition count** | Start with 3 partitions per topic, scale as needed | Avoid over-partitioning |
| **Compression** | LZ4 compression on producers | Reduce network + storage |
| **MSK sizing** | kafka.t3.small for dev, kafka.m5.large for prod | Match throughput |

## 15.7 Cost Monitoring

```
AWS Cost Explorer:
  - Daily cost breakdown by service tag
  - Alert if daily spend exceeds budget threshold (+20%)
  - Monthly cost trend analysis

Tags applied to all resources:
  Project: ecommerce-platform
  Environment: dev | staging | production
  Service: api-gateway | auth-service | etc.
  Team: platform-engineering

Budget alerts:
  - 80% of monthly budget → email notification
  - 100% of monthly budget → Slack alert to team lead
  - 120% of monthly budget → PagerDuty to engineering manager
```

---

# Appendix: Architecture Decision Trade-offs Summary

| Decision | Benefit | Trade-off | When to Reconsider |
|----------|---------|-----------|-------------------|
| Database-per-service | Full autonomy | No cross-service joins | Never (core principle) |
| Transactional outbox | Guaranteed delivery | 5s publishing latency | Reduce poll interval to 1s |
| Orchestrated saga | Debuggable, centralized | Single point of orchestration | If saga complexity > 5 steps |
| CQRS (PG→OpenSearch) | Independent scaling | 5-6s eventual consistency | If real-time search needed |
| Redis cache-aside | Simple, effective | Manual invalidation | If write-through consistency needed |
| ECS Fargate (not EKS) | No cluster management | Limited k8s ecosystem | If need advanced scheduling |
| Monorepo | Shared types, atomic refactors | Larger repo, complex CI | If >20 services or >50 engineers |
| REST (not gRPC) | Simpler tooling | Less efficient for high-throughput | If inter-service RPC > 10k/s |
| Argon2id (not bcrypt) | Memory-hard, timing-safe | Higher CPU cost per hash | Never (superior algorithm) |
| AWS-native (not multi-cloud) | Deep integration | Vendor lock-in | If multi-cloud mandate required |
