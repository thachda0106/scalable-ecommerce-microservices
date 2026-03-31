# Production Checklist

> **Purpose:** Go/no-go gate. Every item must be checked before launching to production.

---

## SECURITY
- [ ] JWT signed with RS256 (asymmetric keys)
- [ ] Access tokens expire ≤ 15 minutes
- [ ] Token blacklisting works for logout
- [ ] RBAC enforced on all endpoints
- [ ] Passwords hashed with bcrypt (cost ≥ 12)
- [ ] All databases encrypted at rest (KMS)
- [ ] All communication over TLS
- [ ] PII redacted in logs
- [ ] Credit card data never enters our system
- [ ] S3 buckets block public access
- [ ] Secrets in Secrets Manager (not in code/env)
- [ ] WAF enabled (SQLi, XSS, rate limiting rules)
- [ ] Security groups: no 0.0.0.0/0 to data tier
- [ ] Input validation on all endpoints (class-validator)
- [ ] CORS whitelist configured (no wildcard)
- [ ] npm audit: zero critical/high vulnerabilities
- [ ] Container scan (Trivy): zero critical/high

## RELIABILITY
- [ ] Multi-AZ for all stateful services (RDS, Redis, Kafka)
- [ ] Auto-scaling configured and tested per service
- [ ] Circuit breakers on all external calls
- [ ] Retry with exponential backoff on transient errors
- [ ] Health checks on every service (/health + /health/ready)
- [ ] DLQ configured for all Kafka consumers
- [ ] Outbox relay publishing verified
- [ ] Inbox deduplication verified
- [ ] Saga compensation tested (payment fail → stock release)
- [ ] Saga timeout tested (stuck orders auto-compensate)

## PERFORMANCE
- [ ] Load test passed at 2x expected peak
- [ ] p95 latency < 300ms (API Gateway)
- [ ] Database indexes cover all frequent queries
- [ ] No slow queries > 200ms in logs
- [ ] Cache hit ratio > 80%
- [ ] Kafka consumer lag within tolerance (< 1000)

## OBSERVABILITY
- [ ] Structured JSON logging on all services
- [ ] Correlation IDs propagated across services and Kafka
- [ ] /metrics endpoint on every service
- [ ] Prometheus scraping all targets
- [ ] Distributed tracing working end-to-end
- [ ] Dashboards: executive, per-service, Kafka, saga
- [ ] P1 alerts tested → PagerDuty page received
- [ ] P2 alerts tested → Slack notification received
- [ ] Sentry capturing 5xx errors
- [ ] SLO dashboard tracking error budget

## OPERATIONS
- [ ] CI/CD pipeline tested end-to-end
- [ ] Rollback tested (< 5 minutes recovery)
- [ ] Database migrations tested in staging
- [ ] Feature flags operational
- [ ] Runbooks written for all P1/P2 alerts
- [ ] On-call rotation established
- [ ] Incident response process documented
- [ ] Post-mortem template ready

## DISASTER RECOVERY
- [ ] Database backup verified (restore test passed)
- [ ] RDS point-in-time recovery tested
- [ ] RTO < 30 min verified for primary failure scenarios
- [ ] RPO < 5 min verified for databases
- [ ] DR drill completed in staging

## SIGN-OFF
- [ ] Engineering Lead reviewed and approved
- [ ] Security review completed
- [ ] Load test results reviewed
- [ ] Cost estimate reviewed and approved
- [ ] Go-live date confirmed
