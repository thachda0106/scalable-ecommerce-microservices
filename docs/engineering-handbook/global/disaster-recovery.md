# Disaster Recovery

> **Purpose:** How we recover from failures — from a single service crash to a full region outage.

---

## RTO / RPO Targets

| Resource | RPO (Max Data Loss) | RTO (Max Recovery Time) |
|----------|-------------------|------------------------|
| PostgreSQL (RDS) | < 5 minutes | < 30 minutes |
| Redis (ElastiCache) | < 1 hour | < 15 minutes |
| OpenSearch | 0 (rebuilt from events) | < 2 hours |
| Kafka (MSK) | < 1 minute | < 30 minutes |
| S3 | 0 (11 nines durability) | 0 (always available) |
| ECS Services | 0 (stateless) | < 5 minutes (auto-restart) |

## Backup Schedule

| Resource | Method | Frequency | Retention |
|----------|--------|-----------|-----------|
| RDS | Automated snapshots | Daily | 30 days (prod) |
| RDS | Point-in-time recovery | Continuous (5-min) | 30 days |
| Redis | AOF + snapshots | Daily | 7 days |
| S3 | Versioning | On every write | 90 days |
| Terraform state | S3 versioning + MFA delete | On every apply | Indefinite |

## Failure Scenarios

### Scenario 1: Single ECS Task Dies
**Impact:** Brief request errors for one service
**Recovery:** ECS auto-replaces task (< 2 min), ALB routes to healthy tasks
**Action required:** None (automatic)

### Scenario 2: RDS Instance Failure
**Impact:** Service using that DB returns errors
**Recovery:** Multi-AZ failover (automatic, 60-120 seconds)
**Action required:** Monitor, update DNS if needed

### Scenario 3: Redis Failure
**Impact:** Cart Service degrades, cache misses increase latency
**Recovery:** ElastiCache automatic failover (< 60 seconds)
**Action required:** Monitor cache hit ratio recovery

### Scenario 4: Kafka Broker Failure
**Impact:** Brief pause in event processing (< 30 seconds)
**Recovery:** ISR replicas take over (automatic)
**Action required:** Monitor consumer lag recovery

### Scenario 5: Full Region Outage
**Impact:** Complete system outage
**Recovery:** Failover to secondary region (RTO < 30 min)
**Procedure:**
1. Route53 failover to secondary region
2. Promote RDS read replica to primary
3. ECS services auto-start in secondary
4. Verify health checks
5. Monitor for 30 minutes

## DR Testing Schedule

- **Monthly:** Kill random ECS tasks under load
- **Monthly:** Trigger RDS failover in staging
- **Quarterly:** Full region failover drill in staging
- **Annually:** Full production DR drill (planned maintenance window)
