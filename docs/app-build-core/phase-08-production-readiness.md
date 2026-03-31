# Phase 8 — Production Readiness Checklist

> **Why this phase exists:** Building a system that works in development is 30% of the job.
> Making it survive production — with real users, attackers, hardware failures, and Black Friday
> traffic — is the other 70%. This checklist is the difference between "it runs" and "it runs
> reliably at scale under adversarial conditions."

---

## 8.1 Security Checklist

### Authentication & Authorization

- [ ] JWT tokens are signed with RS256 (asymmetric) for production
- [ ] Access tokens expire in ≤ 15 minutes
- [ ] Refresh tokens expire in ≤ 7 days
- [ ] Token blacklisting works for logout/revocation
- [ ] RBAC is enforced at the API Gateway and individual service levels
- [ ] All admin endpoints require `admin` or `super_admin` role
- [ ] Password hashing uses bcrypt with cost factor ≥ 12

### Data Protection

- [ ] All databases encrypted at rest (KMS)
- [ ] All inter-service communication over TLS
- [ ] PII (email, phone, address) is redacted in logs
- [ ] Credit card data NEVER enters our system (use Stripe tokens)
- [ ] S3 buckets are private (no public access)
- [ ] Secrets stored in AWS Secrets Manager (not env vars or code)

### Network Security

- [ ] WAF enabled with rate limiting + SQL injection + XSS rules
- [ ] Security groups follow least privilege (layered ALB → ECS → Data)
- [ ] No SSH access to production containers (use ECS Exec for debugging)
- [ ] VPC flow logs enabled
- [ ] CloudTrail enabled for API audit logging

### Application Security

- [ ] Input validation on all API endpoints (DTOs with class-validator)
- [ ] SQL injection prevention (parameterized queries via TypeORM)
- [ ] CORS configured to allow only known origins
- [ ] Rate limiting per user and per IP
- [ ] CSRF protection on state-changing operations
- [ ] Dependency vulnerability scanning (npm audit, Snyk)
- [ ] No debug endpoints exposed in production

---

## 8.2 Scaling Checklist

### Horizontal Scaling

- [ ] All services are stateless (no in-memory state)
- [ ] Session state stored in Redis, not in service memory
- [ ] Auto-scaling configured per service (min 2, max based on load profile)
- [ ] Scale-out triggers: CPU > 60%, request count, Kafka consumer lag
- [ ] Scale-in cooldown ≥ 5 minutes (prevent thrashing)

### Database Scaling

- [ ] RDS Multi-AZ enabled for all production databases
- [ ] Read replicas for read-heavy services (Product, User)
- [ ] Connection pooling configured (max connections per instance)
- [ ] Slow query logging enabled (threshold: 200ms)
- [ ] Index coverage for all frequent queries

### Kafka Scaling

- [ ] Topics have appropriate partition count (6-12 for high-throughput topics)
- [ ] Consumer groups can scale independently
- [ ] Consumer lag monitoring with alerts
- [ ] Dead Letter Queues configured for all consumers

### Cache Scaling

- [ ] Redis cluster mode enabled for production
- [ ] Cache key namespacing prevents collisions
- [ ] TTL set on all cache entries (no memory leaks)
- [ ] Cache hit ratio monitoring > 80%

---

## 8.3 Backup & Disaster Recovery

### RTO and RPO Targets

| Resource | RPO (Data Loss) | RTO (Recovery Time) |
|----------|-----------------|---------------------|
| PostgreSQL (RDS) | < 5 minutes | < 30 minutes |
| Redis (ElastiCache) | < 1 hour | < 15 minutes |
| OpenSearch | 0 (rebuilt from Kafka) | < 2 hours |
| Kafka (MSK) | < 1 minute | < 30 minutes |
| S3 | 0 (11 nines durability) | 0 (always available) |

### Backup Schedule

- [ ] RDS automated backups: every 24 hours, retained 30 days
- [ ] RDS point-in-time recovery: enabled (5-minute granularity)
- [ ] Redis snapshots: daily, retained 7 days
- [ ] S3 versioning: enabled on upload bucket
- [ ] Terraform state: versioned S3 bucket with MFA delete

### Disaster Recovery Plan

```
Scenario: Primary region (ap-southeast-1) goes down

Recovery Steps:
1. Route 53 failover to secondary region (ap-northeast-1)
2. Promote RDS read replica to primary (< 5 min)
3. ElastiCache failover to standby (automatic)
4. MSK — replay from cross-region replication (< 15 min)
5. ECS services auto-start in secondary region
6. Verify health checks pass
7. Monitor for 30 minutes before declaring recovered

Total RTO: ~30 minutes
```

### Recovery Testing

- [ ] Database restore tested monthly
- [ ] Full disaster recovery drill quarterly
- [ ] Automated backup verification (restore + integrity check) weekly

---

## 8.4 Rate Limiting

- [ ] API Gateway: global rate limit (50K RPS)
- [ ] Per-user rate limit: 100 requests/minute
- [ ] Per-IP rate limit: 1000 requests/minute
- [ ] Critical endpoints (checkout, payment): lower limits (10/min per user)
- [ ] WAF rate-based rules: 2000 requests per 5 minutes per IP
- [ ] Rate limit headers returned: `X-RateLimit-Remaining`, `Retry-After`
- [ ] Graceful degradation: return cached data instead of 429 when possible

---

## 8.5 Load Testing

### Tools

| Tool | Purpose |
|------|---------|
| **k6** | Scripted load tests, CI integration |
| **Artillery** | HTTP + WebSocket load testing |
| **Locust** | Python-based, distributed testing |

### Test Scenarios

```javascript
// k6 load test script
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },    // Ramp up to 100 users
    { duration: '5m', target: 100 },    // Hold at 100 users
    { duration: '2m', target: 500 },    // Ramp up to 500 users (peak)
    { duration: '5m', target: 500 },    // Hold at 500 users
    { duration: '2m', target: 1000 },   // Stress test: 1000 users
    { duration: '5m', target: 1000 },   // Hold at 1000 users
    { duration: '3m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Browse products
  const products = http.get('https://api.example.com/api/products');
  check(products, { 'products 200': (r) => r.status === 200 });

  sleep(1);

  // Search
  const search = http.get('https://api.example.com/api/search?q=headphones');
  check(search, { 'search 200': (r) => r.status === 200 });

  sleep(2);

  // Add to cart
  const cart = http.post('https://api.example.com/api/cart/items', JSON.stringify({
    productId: 'prod-123',
    quantity: 1,
  }), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });

  sleep(3);

  // Checkout (10% of users)
  if (Math.random() < 0.1) {
    http.post('https://api.example.com/api/orders', JSON.stringify({
      shippingAddressId: 'addr-456',
      paymentMethodId: 'pm-789',
    }), { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  }

  sleep(1);
}
```

### Load Test Results Template

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| RPS (avg) | 3,000 | — | — |
| Latency p50 | < 100ms | — | — |
| Latency p95 | < 300ms | — | — |
| Latency p99 | < 1s | — | — |
| Error rate | < 0.1% | — | — |
| CPU (peak) | < 80% | — | — |
| Memory (peak) | < 80% | — | — |
| Order success rate | > 99.5% | — | — |

---

## 8.6 Chaos Testing

### What to Test

| Experiment | Tool | Expected Result |
|-----------|------|-----------------|
| Kill a service instance | AWS Fault Injection Simulator | Auto-scaling replaces it, zero downtime |
| High CPU on order-service | Stress-ng | Auto-scaling adds instances |
| RDS failover | RDS failover trigger | < 60s downtime, auto-reconnect |
| Kafka broker failure | Kill MSK broker | Producers/consumers failover to healthy brokers |
| Redis failure | Kill ElastiCache node | Auto-failover, cart service degrades gracefully |
| Network partition | VPC NACL rule | Circuit breaker opens, returns cached data |
| DLQ accumulation | Inject invalid events | Alerts fire, events don't block consumers |

### Chaos Testing Schedule

- [ ] Monthly: Kill random service instances
- [ ] Monthly: Database failover drill
- [ ] Quarterly: Full region failure simulation
- [ ] Pre-release: Service degradation testing

### Steady State Hypothesis Example

```
Hypothesis: "When one order-service instance is killed,
  the system continues processing orders with:
  - 0% increase in error rate
  - < 10% increase in latency (during recovery)
  - Auto-scaling replaces the instance within 2 minutes"

Experiment:
  1. Start with 3 order-service instances
  2. Send constant load of 100 orders/minute
  3. Kill one instance
  4. Observe metrics for 5 minutes

Expected:
  - Error rate stays < 0.1%
  - p95 latency stays < 500ms
  - New instance starts within 2 minutes
  - Kafka consumer lag recovers within 3 minutes
```

---

## 8.7 Cost Optimization

### Cost Breakdown (Estimated Monthly)

| Resource | Dev | Staging | Prod | Optimization |
|----------|-----|---------|------|-------------|
| **ECS Fargate** | $50 | $300 | $2,000 | Use Fargate Spot (70% savings) |
| **RDS** | $20 | $200 | $1,500 | Reserved instances (40% savings) |
| **ElastiCache** | $15 | $100 | $500 | Reserved nodes |
| **MSK** | $30 | $300 | $1,200 | Right-size brokers |
| **OpenSearch** | $20 | $150 | $600 | Reserved instances |
| **NAT Gateway** | $30 | $30 | $90 | Use VPC endpoints for S3/ECR |
| **CloudFront** | $5 | $20 | $500 | — |
| **S3** | $1 | $5 | $50 | Lifecycle policies |
| **Other** | $20 | $50 | $200 | — |
| **Total** | **~$191** | **~$1,155** | **~$6,640** | — |

### Key Optimizations

- [ ] Use Fargate Spot for 70% of non-critical tasks
- [ ] Reserved Instances for RDS, ElastiCache (1-year commitment)
- [ ] VPC Endpoints for S3 and ECR (reduce NAT Gateway traffic)
- [ ] S3 Lifecycle Policies: move old uploads to S3 Infrequent Access after 30 days
- [ ] Right-size instances monthly based on CloudWatch utilization
- [ ] Auto-scaling scales DOWN during off-peak hours
- [ ] Dev environment auto-shutdown on nights/weekends

---

## 8.8 Monitoring & Alerting Readiness

- [ ] Dashboards created for all services (see Phase 7)
- [ ] P1 alerts → PagerDuty → Phone call
- [ ] P2 alerts → Slack #incidents channel
- [ ] P3 alerts → Slack #platform-alerts
- [ ] P4 alerts → Jira ticket auto-creation
- [ ] Kafka consumer lag dashboard
- [ ] DLQ monitoring dashboard
- [ ] Error budget dashboard (SLO tracking)
- [ ] Infrastructure cost dashboard (daily)

---

## 8.9 Runbooks

### What Needs a Runbook

Every P1 and P2 alert MUST have a corresponding runbook.

### Runbook Template

```markdown
# Runbook: [Alert Name]

## Alert
- **Severity:** P1
- **Condition:** Order service error rate > 5% for 2 minutes
- **Dashboard:** [link to dashboard]

## Impact
- Customers cannot place orders
- Estimated revenue impact: $X/minute

## Diagnosis Steps
1. Check order-service logs: [CloudWatch link]
2. Check service health: `curl -s http://order-service:3006/health`
3. Check database connectivity: [RDS console link]
4. Check Kafka consumer lag: [MSK dashboard link]
5. Check recent deployments: [GitHub Actions link]

## Resolution Steps

### If: Database connection failure
1. Check RDS instance status
2. Check security group rules haven't changed
3. Restart ECS tasks: `aws ecs update-service --force-new-deployment`

### If: Kafka consumer stalled
1. Check consumer group: `kafka-consumer-groups.sh --describe --group order-saga`
2. If lag > 50K, restart consumers
3. Check DLQ for poison messages

### If: Recent deployment caused it
1. Rollback: `aws ecs update-service --task-definition order-service:PREVIOUS`
2. Monitor for 5 minutes
3. Investigate and fix in a new PR

## Escalation
- After 15 minutes without resolution → page Team Lead
- After 30 minutes → page Engineering Manager
- After 60 minutes → incident commander takes over

## Post-Incident
- Write incident report within 24 hours
- Schedule blameless post-mortem within 48 hours
```

---

## 8.10 On-Call

### On-Call Rotation

```
Week 1: Engineer A (primary), Engineer B (backup)
Week 2: Engineer B (primary), Engineer C (backup)
Week 3: Engineer C (primary), Engineer A (backup)
...

Rules:
- Primary responds to P1/P2 within 15 minutes
- Backup responds if primary doesn't within 15 minutes
- On-call engineer has production access (ECS Exec, CloudWatch, RDS)
- On-call handoff document updated at end of each shift
```

### On-Call Handoff Template

```markdown
## On-Call Handoff: Week of Jan 15
### Outgoing: Engineer A → Incoming: Engineer B

### Ongoing Issues
- Product search occasionally returns stale data (P3, team investigating)
- Kafka partition rebalance causing brief consumer lag spikes (monitoring)

### Recent Changes
- Deployed order-service v1.4.2 on Jan 14 (new Saga timeout handling)
- RDS maintenance window scheduled for Jan 17 03:00-04:00

### Things to Watch
- Payment gateway (Stripe) had intermittent 504s last week
- OpenSearch indexing lag after product bulk import

### Useful Links
- [Dashboard](link)
- [Runbooks](link)
- [Recent Incidents](link)
```

---

## 8.11 Documentation

- [ ] **Architecture Decision Records (ADRs)** for all major decisions
- [ ] **API documentation** (OpenAPI/Swagger) for all services
- [ ] **Event catalog** documenting all Kafka events and schemas
- [ ] **Database schema documentation** per service
- [ ] **Runbooks** for all P1/P2 alerts
- [ ] **On-call guide** with escalation paths
- [ ] **Deployment guide** (how to deploy, rollback)
- [ ] **Local development setup** guide (README.md)
- [ ] **Incident response** process documentation
- [ ] **Post-mortem template** standardized

---

## 8.12 The Final Checklist

### ✅ Pre-Production Gate

```
CATEGORY: SECURITY
 □ TLS everywhere
 □ Secrets in Secrets Manager
 □ WAF enabled
 □ RBAC enforced
 □ Input validation on all endpoints
 □ No debug endpoints exposed
 □ Dependency vulnerability scan clean

CATEGORY: RELIABILITY
 □ Multi-AZ for all stateful services
 □ Auto-scaling configured
 □ Circuit breakers on all external calls
 □ Retry with backoff on transient errors
 □ Health checks on all services
 □ DLQ configured for all Kafka consumers
 □ Outbox/Inbox patterns for event reliability

CATEGORY: OBSERVABILITY
 □ Structured JSON logging
 □ Correlation IDs propagated
 □ Metrics endpoint on every service
 □ Dashboards for every service
 □ Alerts for P1/P2 conditions
 □ Distributed tracing enabled
 □ Error tracking (Sentry) configured

CATEGORY: OPERATIONS
 □ CI/CD pipeline tested end-to-end
 □ Blue/Green or Rolling deployment works
 □ Rollback tested and works in < 5 minutes
 □ Database migration process tested
 □ Feature flags operational
 □ Runbooks written for all critical alerts
 □ On-call rotation established

CATEGORY: PERFORMANCE
 □ Load test at 2x expected peak
 □ p95 latency within SLO
 □ Database indexes optimized
 □ Cache hit ratio > 80%
 □ Kafka consumer lag within tolerance

CATEGORY: DISASTER RECOVERY
 □ Database backups verified (monthly restore test)
 □ Cross-region backup strategy
 □ DR drill completed in last quarter
 □ RTO and RPO documented and achievable
```

---

## 8.13 Post-Launch: First 30 Days

### Week 1: Stabilization
- Monitor all dashboards continuously
- Keep the engineering team on high alert
- Fix any P1/P2 issues immediately
- Document any unexpected behaviors

### Week 2: Optimization
- Analyze real traffic patterns vs estimates
- Right-size infrastructure based on actual load
- Tune auto-scaling parameters
- Optimize slow queries found in production

### Week 3: Resilience Validation
- Run first chaos experiment in production
- Test database failover under real load
- Validate backup restore process
- Simulate Kafka broker failure

### Week 4: Review & Iterate
- Conduct architecture review with team
- Document lessons learned
- Update runbooks based on real incidents
- Plan next iteration of improvements

---

## Summary

This 8-phase guide takes you from a blank slate to a production-ready, scalable e-commerce
microservices platform. The phases are designed to be executed in order:

```
Phase 1: Requirements & System Design     ← What are we building?
Phase 2: Infrastructure (IaC)             ← Where does it run?
Phase 3: Platform / Core Modules          ← What do all services share?
Phase 4: Microservices Design             ← What does each service do?
Phase 5: Event-Driven Architecture        ← How do services communicate?
Phase 6: CI/CD & Deployment               ← How do we ship it?
Phase 7: Observability                    ← How do we know it's working?
Phase 8: Production Readiness             ← Is it ready for real users?
```

> [!IMPORTANT]
> **The order matters.** You can't build reliable services (Phase 4) without shared modules
> (Phase 3). You can't deploy safely (Phase 6) without observability (Phase 7). And you
> definitely can't go to production (Phase 8) without all of the above.
>
> This is how real companies — Amazon, Shopify, Stripe, Netflix — build their platforms.
> Not all at once, but in disciplined, incremental phases.

---

> **← Back to** [Overview](./00-overview.md)
