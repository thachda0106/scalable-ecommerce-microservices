# Phase 8 — Production Readiness: Implementation Roadmap

---

## GOALS

Transform a "working system" into a **production-grade platform** that handles real traffic,
real failures, real attacks, and real costs. This phase is the difference between a demo and a
business. Everything before this was building. This phase is hardening.

**Outcome:** A system that passes a go/no-go checklist, has been load-tested at 2x peak,
has runbooks for every critical alert, has a disaster recovery plan tested in a drill,
and has cost-optimized infrastructure.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **Load Testing** | k6 | JavaScript-based, CI-friendly, excellent reporting |
| **Chaos Testing** | AWS Fault Injection Simulator (FIS) | Native AWS integration, can kill tasks/AZs |
| **Security Scanning** | Snyk / npm audit + Trivy (container) | Dep vuln + container image scanning |
| **Penetration Testing** | OWASP ZAP (automated) + manual review | Automated baseline + manual for business logic |
| **Cost Analysis** | AWS Cost Explorer + custom CloudWatch dashboard | Per-service cost attribution |
| **Incident Management** | PagerDuty + OpsGenie | Tiered escalation, on-call rotation |
| **Documentation** | Markdown runbooks in Git | Version-controlled, code-reviewed |
| **Compliance** | AWS Config rules + custom checks | Automated drift detection |

---

## ARCHITECTURE DECISIONS

### ADR-024: Load Test at 2x Expected Peak Before Launch

```
Decision: System must sustain 2x estimated peak load for 30 minutes
  with p95 < 300ms and error rate < 0.1%
Rationale:
  - Peak estimates are often wrong (Black Friday, viral moment)
  - 2x headroom provides safety margin
  - Performance issues uncovered at scale (connection pools, locks, Kafka lag)
```

### ADR-025: On-Call Rotation with Runbooks

```
Decision: 24/7 on-call rotation with published runbooks for every P1/P2 alert
  Every alert links to a runbook. No runbook = no alert.
Rationale:
  - Alerts without runbooks cause panic: engineer sees alert but doesn't know what to do
  - Runbooks reduce Mean Time To Resolution (MTTR) from hours to minutes
  - On-call knowledge transfer via handoff documents
```

### ADR-026: Multi-Region DR Without Active-Active

```
Decision: Primary region (ap-southeast-1) with cold standby in secondary region
  Not active-active multi-region
Rationale:
  - Active-active requires cross-region data replication, conflict resolution
  - 10x the complexity and cost for < 0.01% of scenarios
  - Cold standby achieves < 30 min RTO at 10% of active-active cost
When to upgrade: When single-region RTO of 30 min is unacceptable for the business
```

---

## IMPLEMENTATION STEPS

```
Week 1: Security Hardening
──────────────────────────
  Step 1: Security audit (internal code review)                  [Day 1-2]
  Step 2: Dependency vulnerability scan (Snyk/npm audit)         [Day 2]
  Step 3: Container image scan (Trivy)                           [Day 2]
  Step 4: OWASP ZAP automated scan                               [Day 3]
  Step 5: Fix all critical + high vulnerabilities                [Day 3-4]
  Step 6: Verify WAF rules block SQLi/XSS attacks               [Day 4]
  Step 7: Verify PII redaction in logs                           [Day 5]

Week 2: Performance Validation
──────────────────────────────
  Step 8: Write k6 load test scenarios                           [Day 6]
  Step 9: Baseline test: 1x expected load (30 min)               [Day 7]
  Step 10: Identify bottlenecks, optimize                        [Day 7-8]
  Step 11: Peak test: 2x expected load (30 min)                  [Day 8-9]
  Step 12: Stress test: increase until failure                   [Day 9]
  Step 13: Document performance limits + scaling triggers        [Day 10]

Week 3: Disaster Recovery + Chaos
─────────────────────────────────
  Step 14: Verify database backup/restore (RDS)                  [Day 11]
  Step 15: Test RDS failover under load                          [Day 11]
  Step 16: Kill ECS tasks during load test                       [Day 12]
  Step 17: Simulate Kafka broker failure                         [Day 12]
  Step 18: Simulate Redis failure (cart service graceful degradation) [Day 13]
  Step 19: Document DR procedure and RTO/RPO results             [Day 13]

Week 4: Operations Readiness
─────────────────────────────
  Step 20: Write runbooks for all P1/P2 alerts                   [Day 14]
  Step 21: Set up on-call rotation                               [Day 14]
  Step 22: Cost optimization (right-sizing, reserved instances)  [Day 15]
  Step 23: Final go/no-go checklist review                       [Day 15-16]
  Step 24: Stakeholder sign-off                                  [Day 16]
  Step 25: Production deployment                                 [Day 17]
```

---

## TASK BREAKDOWN

```
Phase 8 — Production Readiness
│
├── [ ] 8.1 — Security Hardening
│   ├── [ ] Code review: auth flows (register, login, refresh, logout)
│   ├── [ ] Code review: authorization (RBAC enforcement on all endpoints)
│   ├── [ ] Code review: input validation (DTOs with class-validator)
│   ├── [ ] Code review: SQL injection prevention (parameterized queries)
│   ├── [ ] npm audit → fix all critical/high
│   ├── [ ] Trivy scan on all Docker images → fix critical/high
│   ├── [ ] OWASP ZAP scan on API Gateway → fix findings
│   ├── [ ] Verify CORS whitelist (no wildcard *)
│   ├── [ ] Verify HTTPS everywhere (no HTTP endpoints)
│   ├── [ ] Verify secrets not in code or env (all in Secrets Manager)
│   ├── [ ] Verify PII redaction in all log outputs
│   ├── [ ] Verify S3 buckets block public access
│   ├── [ ] Verify VPC security groups (no 0.0.0.0/0 to data tier)
│   ├── [ ] Enable AWS CloudTrail for API audit logging
│   └── [ ] Document security posture for compliance review
│
├── [ ] 8.2 — Load Testing
│   ├── [ ] Write k6 scenarios:
│   │   ├── [ ] Browse products (GET /products, paginated)
│   │   ├── [ ] Search products (GET /search?q=)
│   │   ├── [ ] View product detail (GET /products/:id)
│   │   ├── [ ] Add to cart (POST /cart/items)
│   │   ├── [ ] Checkout (POST /orders)
│   │   └── [ ] User login (POST /auth/login)
│   ├── [ ] Traffic distribution: 60% browse, 20% search, 10% cart, 10% checkout
│   ├── [ ] Baseline test: 500 concurrent users, 30 min
│   ├── [ ] Record: RPS, p50/p95/p99 latency, error rate, CPU, memory
│   ├── [ ] Peak test: 1000 concurrent users, 30 min
│   ├── [ ] Stress test: ramp to 2000+ until failure
│   ├── [ ] Identify bottlenecks:
│   │   ├── [ ] DB connection pool exhaustion
│   │   ├── [ ] Redis connection limits
│   │   ├── [ ] Kafka consumer lag buildup
│   │   ├── [ ] CPU throttling
│   │   └── [ ] Memory pressure
│   ├── [ ] Fix bottlenecks, retest
│   ├── [ ] Document performance results + scaling recommendations
│   └── [ ] Add load test to CI (weekly scheduled run)
│
├── [ ] 8.3 — Database Optimization
│   ├── [ ] Review slow query logs (queries > 200ms)
│   ├── [ ] Add missing indexes based on EXPLAIN ANALYZE
│   ├── [ ] Verify connection pool sizes per service
│   ├── [ ] Test with production-like data volumes
│   ├── [ ] Verify vacuum and analyze schedules (RDS automatic)
│   └── [ ] Document database sizing recommendations
│
├── [ ] 8.4 — Backup & Disaster Recovery
│   ├── [ ] Verify RDS automated backups (30-day retention)
│   ├── [ ] Test RDS point-in-time recovery:
│   │   ├── [ ] Restore to 5 minutes ago
│   │   ├── [ ] Verify data integrity
│   │   └── [ ] Measure recovery time
│   ├── [ ] Verify Redis snapshots
│   ├── [ ] Test Kafka topic replay (reset consumer offset)
│   ├── [ ] Test OpenSearch full reindex from Product Service
│   ├── [ ] Document DR procedure step-by-step
│   ├── [ ] Document RTO/RPO achieved (test results)
│   └── [ ] Schedule quarterly DR drill
│
├── [ ] 8.5 — Chaos Testing
│   ├── [ ] Experiment 1: Kill one ECS task (order-service)
│   │   ├── Expected: auto-scaling replaces, zero errors
│   │   └── [ ] Record: error rate, recovery time
│   ├── [ ] Experiment 2: RDS failover (order DB)
│   │   ├── Expected: < 60s downtime, auto-reconnect
│   │   └── [ ] Record: downtime duration
│   ├── [ ] Experiment 3: Redis failure
│   │   ├── Expected: caching degrades, service continues
│   │   └── [ ] Record: latency impact
│   ├── [ ] Experiment 4: Kafka broker failure (1 of 3)
│   │   ├── Expected: producers/consumers failover
│   │   └── [ ] Record: event delivery delay
│   ├── [ ] Experiment 5: High CPU on order-service
│   │   ├── Expected: auto-scaling adds instances
│   │   └── [ ] Record: scaling time
│   ├── [ ] Document results and improve resilience where needed
│   └── [ ] Schedule monthly chaos experiments
│
├── [ ] 8.6 — Runbooks
│   ├── [ ] Runbook: Service Down (P1)
│   ├── [ ] Runbook: High Error Rate (P1)
│   ├── [ ] Runbook: High Latency (P2)
│   ├── [ ] Runbook: Kafka Consumer Lag (P2)
│   ├── [ ] Runbook: Database Connection Saturation (P2)
│   ├── [ ] Runbook: Circuit Breaker Open (P2)
│   ├── [ ] Runbook: DLQ Messages Accumulating (P3)
│   ├── [ ] Runbook: Saga Timeout (P2)
│   ├── [ ] Runbook: Deployment Rollback
│   ├── [ ] Runbook: Database Restore
│   ├── [ ] Each runbook includes:
│   │   ├── [ ] Alert condition
│   │   ├── [ ] Impact assessment
│   │   ├── [ ] Diagnosis steps
│   │   ├── [ ] Resolution steps (multiple scenarios)
│   │   ├── [ ] Escalation path
│   │   └── [ ] Post-incident actions
│   └── [ ] Link every alert to its runbook
│
├── [ ] 8.7 — On-Call Setup
│   ├── [ ] Define on-call rotation schedule (weekly)
│   ├── [ ] Configure PagerDuty/OpsGenie
│   ├── [ ] Create on-call handoff template
│   ├── [ ] Grant on-call engineers prod access (ECS Exec, CloudWatch)
│   ├── [ ] Create incident response process:
│   │   ├── [ ] Detection → Assessment → Communication → Resolution → Post-mortem
│   │   ├── [ ] Slack #incidents channel for coordination
│   │   └── [ ] Status page updates for external communication
│   ├── [ ] Create post-mortem template (blameless)
│   └── [ ] First on-call dry run (simulate P1 incident)
│
├── [ ] 8.8 — Cost Optimization
│   ├── [ ] Review current monthly costs per service
│   ├── [ ] Right-size ECS tasks (CPU/memory based on utilization)
│   ├── [ ] Implement Fargate Spot for non-critical services
│   ├── [ ] Purchase Reserved Instances for RDS (1-year)
│   ├── [ ] Add VPC endpoints for S3 and ECR (reduce NAT costs)
│   ├── [ ] S3 lifecycle policies (IA after 30 days, Glacier after 90)
│   ├── [ ] Auto-shutdown dev environment nights/weekends
│   ├── [ ] Set up billing alarm (per-service cost tracking)
│   └── [ ] Document monthly cost baseline and optimization targets
│
├── [ ] 8.9 — Documentation
│   ├── [ ] Architecture overview for new engineers
│   ├── [ ] Local development setup guide (README.md)
│   ├── [ ] Deployment procedure (how to deploy, rollback)
│   ├── [ ] API documentation (Swagger for each service)
│   ├── [ ] Event catalog (all events, schemas, flows)
│   ├── [ ] ADR index (all architecture decisions)
│   ├── [ ] Runbook index (all operational runbooks)
│   ├── [ ] On-call guide (rotation, escalation, handoff)
│   └── [ ] Incident response playbook
│
└── [ ] 8.10 — Go/No-Go Checklist
    ├── [ ] SECURITY
    │   ├── [ ] All critical/high vulnerabilities fixed
    │   ├── [ ] WAF blocking known attacks
    │   ├── [ ] Secrets in Secrets Manager
    │   ├── [ ] PII redacted in logs
    │   └── [ ] HTTPS everywhere
    │
    ├── [ ] RELIABILITY
    │   ├── [ ] Multi-AZ for all stateful services
    │   ├── [ ] Auto-scaling configured and tested
    │   ├── [ ] Circuit breakers + retries operational
    │   ├── [ ] Health checks on all services
    │   ├── [ ] DLQ + Outbox/Inbox operational
    │   └── [ ] Saga timeout compensation works
    │
    ├── [ ] PERFORMANCE
    │   ├── [ ] Load test passed at 2x peak
    │   ├── [ ] p95 latency within SLO
    │   ├── [ ] Database indexes optimized
    │   ├── [ ] Cache hit ratio > 80%
    │   └── [ ] Kafka consumer lag within tolerance
    │
    ├── [ ] OBSERVABILITY
    │   ├── [ ] Structured logging on all services
    │   ├── [ ] Correlation IDs propagated
    │   ├── [ ] Dashboards populated
    │   ├── [ ] Alerts tested (P1, P2)
    │   └── [ ] Tracing working E2E
    │
    ├── [ ] OPERATIONS
    │   ├── [ ] CI/CD pipeline tested
    │   ├── [ ] Rollback tested (< 5 min)
    │   ├── [ ] Runbooks written and linked
    │   ├── [ ] On-call rotation established
    │   └── [ ] DR drill completed
    │
    └── [ ] SIGN-OFF
        ├── [ ] Engineering Lead approval
        ├── [ ] Security review sign-off
        ├── [ ] Load test results reviewed
        └── [ ] Go-live date confirmed
```

---

## DEPENDENCIES

```
Phase 8 depends on ALL previous phases:
  └── Phase 1 (NFRs and SLOs define what "production-ready" means)
  └── Phase 2 (infrastructure must be provisioned in prod)
  └── Phase 3 (core modules must be stable and tested)
  └── Phase 4 (all services must be functional)
  └── Phase 5 (event backbone must be reliable)
  └── Phase 6 (CI/CD must deploy to prod)
  └── Phase 7 (observability must be operational)

Internal dependencies:
  8.1 Security → can start immediately (code review)
  8.2 Load testing → needs staging environment with realistic data
  8.3 DB optimization → informs 8.2 (fix bottlenecks, retest)
  8.4 DR → needs 8.2 (test recovery under load)
  8.5 Chaos → needs 8.2 + 8.4 (chaos under load with DR)
  8.6 Runbooks → needs 8.1-8.5 (learnings from testing)
  8.7 On-call → needs 8.6 (runbooks must exist)
  8.8 Cost → can run in parallel with 8.1-8.5
  8.9 Documentation → final pass after everything else
  8.10 Go/No-Go → last step, references all deliverables
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | Security audit report (all critical fixed) | Zero critical/high vulnerabilities |
| D2 | Load test results at 2x peak | p95 < 300ms, error rate < 0.1% |
| D3 | Database optimization report | No queries > 200ms in slow query log |
| D4 | DR test results (RTO/RPO achieved) | Document with timings: restore < 30 min |
| D5 | Chaos test results (5 experiments) | All experiments passed with defined thresholds |
| D6 | Runbooks for all P1/P2 alerts | Every alert links to a runbook page |
| D7 | On-call rotation active | PagerDuty shows schedule, test page received |
| D8 | Cost baseline documented | Monthly cost report per service |
| D9 | Complete documentation set | New engineer can onboard in < 1 week |
| D10 | Go/No-Go checklist — all items checked | Engineering lead signed off |

---

## EXAMPLE CONFIGS

### k6 Load Test Script

```javascript
// load-tests/checkout-flow.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const checkoutDuration = new Trend('checkout_duration');

export const options = {
  stages: [
    { duration: '2m', target: 100 },    // Ramp to 100 VUs
    { duration: '10m', target: 500 },   // Ramp to 500 VUs (1x peak)
    { duration: '10m', target: 1000 },  // Ramp to 1000 VUs (2x peak)
    { duration: '5m', target: 1000 },   // Hold at 2x
    { duration: '3m', target: 0 },      // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<1000'],
    http_req_failed: ['rate<0.001'],
    errors: ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'https://api-staging.example.com';

export default function () {
  const token = login();

  group('Browse Products', () => {
    const res = http.get(`${BASE}/api/products?page=1&limit=20`);
    check(res, { 'products OK': (r) => r.status === 200 });
    sleep(1);
  });

  group('Search', () => {
    const res = http.get(`${BASE}/api/search?q=headphones`);
    check(res, { 'search OK': (r) => r.status === 200 });
    sleep(0.5);
  });

  group('Add to Cart', () => {
    const res = http.post(`${BASE}/api/cart/items`,
      JSON.stringify({ productId: 'prod-load-test-1', quantity: 1 }),
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
    );
    check(res, { 'cart OK': (r) => r.status === 200 || r.status === 201 });
    sleep(1);
  });

  // 10% of users checkout
  if (Math.random() < 0.1) {
    group('Checkout', () => {
      const start = Date.now();
      const res = http.post(`${BASE}/api/orders`,
        JSON.stringify({
          shippingAddressId: 'addr-test-1',
          paymentMethodId: 'pm-test-1',
        }),
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
      );
      check(res, { 'checkout OK': (r) => r.status === 201 }) || errorRate.add(1);
      checkoutDuration.add(Date.now() - start);
      sleep(2);
    });
  }

  sleep(1);
}
```

### Chaos Experiment Definition (FIS)

```json
{
  "description": "Kill one order-service ECS task during load",
  "targets": {
    "ecsTaskTarget": {
      "resourceType": "aws:ecs:task",
      "selectionMode": "COUNT(1)",
      "resourceTags": {
        "service": "order-service",
        "environment": "staging"
      }
    }
  },
  "actions": {
    "stopTask": {
      "actionId": "aws:ecs:stop-task",
      "parameters": {},
      "targets": { "Tasks": "ecsTaskTarget" }
    }
  },
  "stopConditions": [
    {
      "source": "aws:cloudwatch:alarm",
      "value": "arn:aws:cloudwatch:...:alarm:OrderServiceErrorRate"
    }
  ],
  "roleArn": "arn:aws:iam::...:role/fis-experiment-role"
}
```

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Skipping load testing because "it works in staging."** Staging has 1/10th the data and
> 1/100th the traffic. Problems only appear at scale: connection pool exhaustion, Kafka lag,
> database lock contention, memory leaks.
>
> **2. Writing runbooks AFTER the first incident.** By then it's 3am, the system is down,
> and you're frantically Googling while customers lose trust. Write runbooks BEFORE go-live.
>
> **3. No chaos testing before launch.** If you've never killed a service in staging, you don't
> know if auto-scaling, circuit breakers, and failover actually work.
>
> **4. Ignoring cost until the first $10K bill.** Review costs BEFORE launch. NAT Gateways,
> unoptimized instances, and forgotten resources in dev add up fast.
>
> **5. Go/No-Go without a written checklist.** "I think we're ready" is not a process.
> A checklist ensures nothing is forgotten. Use it.
>
> **6. No on-call handoff documentation.** When the next on-call starts, they need to know:
> what's happening, what changed, and what to watch. Without handoff → knowledge gap → slow MTTR.

---

## Summary: Complete Phase Order

```
Phase 1: Requirements & System Design     [Weeks 1-2]
Phase 2: Infrastructure (IaC)             [Weeks 3-6]
Phase 3: Platform / Core Shared Modules   [Weeks 5-8]   ← overlaps with Phase 2
Phase 4: Microservices Design             [Weeks 7-14]  ← overlaps with Phase 3 tail
Phase 5: Event-Driven Architecture        [Weeks 11-14] ← overlaps with Phase 4 tail
Phase 6: CI/CD & Deployment               [Weeks 9-10]  ← can start mid-Phase 4
Phase 7: Observability                    [Weeks 13-16] ← overlaps with Phase 5 tail
Phase 8: Production Readiness             [Weeks 15-18]

Total estimated timeline: 16-20 weeks (4-5 months) with 3-5 engineers
```

---

> **← Back to** [Overview](./00-overview.md)
