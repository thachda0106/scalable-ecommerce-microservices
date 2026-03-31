# Phase 13 — Disaster Recovery

---

## 1. Overview

Plan for failures: from a single service crash to a full region outage. Every failure scenario
has a documented recovery procedure with tested RTO/RPO targets.

## 2. Goals

- RPO < 5 min for databases, RTO < 30 min for full recovery
- Backup/restore tested and verified
- Failover procedures for all stateful components
- DR drill completed before launch (and quarterly after)

## 3. Architecture Design

See [Disaster Recovery](../global/disaster-recovery.md) for full RTO/RPO table and failure scenarios.

**Strategy:** Primary region (ap-southeast-1) with cold standby capability.

## 4. Technology Choices

| Component | DR Mechanism |
|-----------|-------------|
| RDS | Multi-AZ (auto-failover), point-in-time recovery, daily snapshots |
| Redis | Multi-AZ with auto-failover, daily snapshots |
| Kafka (MSK) | 3-broker replication (ISR), 7-30 day retention |
| OpenSearch | Rebuilt from Kafka events (no backup needed) |
| ECS | Stateless — auto-replaced on failure |
| S3 | 11 nines durability, versioning |
| Terraform state | S3 versioning + MFA delete |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-041 | Cold standby (not active-active) | Active-active is 10x complexity for < 0.01% of scenarios |
| ADR-042 | Rebuild OpenSearch from events | OpenSearch is a derived view — no need to backup |

## 6. Data Flow / Request Flow

**Recovery flow (region failure):**
```
1. Route53 health check detects failure
2. DNS failover to secondary region
3. Promote RDS read replica to primary
4. ECS services auto-start from ECR images
5. Kafka starts consuming from last committed offset
6. Full-text search reindexed from Product events
```

## 7. Components Involved

All stateful components: RDS, Redis, Kafka, OpenSearch, S3, Terraform state.

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Verify RDS backups, test point-in-time recovery, test Multi-AZ failover |
| Week 2 | Test Redis failover, Kafka broker failure, OpenSearch reindex, document all procedures |

## 9. Tasks Checklist

```
- [ ] Verify RDS automated backups (30-day retention)
- [ ] Test RDS point-in-time recovery (restore to 5 min ago)
- [ ] Test RDS Multi-AZ failover under load
- [ ] Verify Redis snapshot frequency
- [ ] Test Redis failover
- [ ] Test Kafka consumer offset reset (replay events)
- [ ] Test OpenSearch full reindex from Product Service
- [ ] Verify S3 versioning enabled
- [ ] Verify Terraform state S3 versioning
- [ ] Document DR procedures step-by-step
- [ ] Document RTO/RPO achieved (with timing results)
- [ ] DR drill in staging (end-to-end)
- [ ] Schedule quarterly DR drills
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| RDS backup/restore works | Recovered DB has correct data |
| RDS failover works | < 120s downtime |
| DR procedure documented | Step-by-step with commands |
| RTO/RPO verified | Timing results documented |
| DR drill completed | Staging drill successful |

## 11. Dependencies

- Phase 04 (Multi-AZ provisioned, backups configured)
- Phase 07 (Kafka retention allows replay)
- Phase 09 (Monitoring detects failures quickly)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Untested DR procedure | Test quarterly in staging |
| RTO exceeds target | Identify bottleneck and optimize |
| Data corruption (not just loss) | Point-in-time recovery to before corruption |

## 13. Common Mistakes

- Never testing backup restore (backups that can't restore are useless)
- Assuming Multi-AZ means zero downtime (there's still 60-120s)
- No DR drill before launch
- Not accounting for DNS propagation time in RTO

## 14. Best Practices

- Test backup recovery quarterly (not just "it says backup succeeded")
- Document recovery time for each scenario (measured, not estimated)
- Keep DR procedure in git (reviewed, versioned)
- Automate as much of recovery as possible (scripts, not manual steps)
