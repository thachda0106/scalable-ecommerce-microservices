# Phase 11 — Production Readiness

---

## 1. Overview

Transform a "working system" into a production-grade platform. This phase validates that the
system handles real traffic, real failures, and real attacks at scale.

## 2. Goals

- Load test at 2x expected peak (pass p95 < 300ms, error rate < 0.1%)
- Chaos testing: service kill, DB failover, broker failure
- Go/no-go checklist: every item passes before launch
- Stakeholder sign-off

## 3. Architecture Design

No new architecture — this phase validates existing architecture under stress.

## 4. Technology Choices

| Tool | Purpose |
|------|---------|
| k6 | Load testing (JavaScript, CI-friendly) |
| AWS FIS | Chaos testing (kill tasks, failover DB) |
| Snyk + Trivy | Security scanning |
| OWASP ZAP | Penetration testing |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-036 | Load test at 2x peak | Peak estimates are often wrong — 2x headroom |
| ADR-037 | Runbooks before launch | Alerts without runbooks = engineer panic at 3am |

## 6. Data Flow / Request Flow

Load test simulates the complete user journey:
60% browse → 20% search → 10% cart → 10% checkout

## 7. Components Involved

All components — this phase tests the entire system.

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Security hardening (code review, dep scan, container scan, OWASP, WAF) |
| Week 2 | Load testing (k6: baseline 1x, peak 2x, stress until failure) |
| Week 3 | DR testing (backup/restore, RDS failover, chaos experiments) |
| Week 4 | Runbooks, on-call setup, cost optimization, go/no-go, launch |

## 9. Tasks Checklist

```
- [ ] Security audit (all critical/high vulnerabilities fixed)
- [ ] k6 load test scenarios (browse, search, cart, checkout, login)
- [ ] Baseline test: 500 concurrent users, 30 min
- [ ] Peak test: 1000 concurrent users, 30 min
- [ ] Stress test: ramp to 2000+ until failure point
- [ ] Identify and fix bottlenecks (DB pool, Redis, Kafka lag, CPU)
- [ ] Database optimization (slow queries, missing indexes)
- [ ] RDS backup/restore test
- [ ] Chaos: kill ECS task → auto-recovery
- [ ] Chaos: RDS failover → < 60s reconnect
- [ ] Chaos: Redis failure → graceful degradation
- [ ] Chaos: Kafka broker failure → consumer failover
- [ ] Runbooks for all P1/P2 alerts
- [ ] On-call rotation established
- [ ] Cost baseline documented
- [ ] Go/no-go checklist — all items checked
- [ ] Stakeholder sign-off
```

See [Production Checklist](../global/production-checklist.md) for the full go/no-go gate.

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| Security audit report | Zero critical/high |
| Load test results (2x peak) | p95 < 300ms, error rate < 0.1% |
| Chaos test results (5 experiments) | All within thresholds |
| Runbooks | Every P1/P2 alert linked to a runbook |
| On-call rotation | PagerDuty schedule active |
| Go/no-go sign-off | Engineering Lead approved |

## 11. Dependencies

All previous phases (01-10).

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Load test reveals critical bottleneck | Budget 1 extra week for optimization |
| Chaos test reveals resilience gap | Fix before launch (circuit breaker, retry, etc.) |
| Cost higher than projected | Right-size before launch, use Spot for non-critical |

## 13. Common Mistakes

- Skipping load testing because "it works in staging"
- Writing runbooks after the first incident (too late)
- No chaos testing → no confidence in failover
- Ignoring cost until the first $10K bill
- Go/no-go without a written checklist

## 14. Best Practices

- Run load tests weekly (not just pre-launch) — catch regressions
- Chaos testing monthly after launch
- Blameless post-mortems for every P1 incident
- Review load test results with the team (not just ops)
