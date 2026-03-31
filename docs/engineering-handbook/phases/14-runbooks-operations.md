# Phase 14 — Runbooks & Operations

---

## 1. Overview

Define operational procedures for running the system in production. Every alert has a runbook.
Every on-call engineer has a playbook. Incidents are handled with process, not panic.

## 2. Goals

- Runbooks for every P1/P2 alert
- On-call rotation with handoff process
- Incident response procedure (detect → triage → resolve → post-mortem)
- Operational dashboards for daily health checks

## 3. Architecture Design

See [Runbooks](../global/runbooks.md) for complete runbook index.

## 4. Technology Choices

| Component | Choice | Why |
|-----------|--------|-----|
| Incident management | PagerDuty | Tiered escalation, rotations |
| Communication | Slack #incidents | Real-time coordination |
| Documentation | Markdown in git | Versioned, code-reviewed |
| Status page | Statuspage.io | External communication |
| Post-mortem | Custom template (blameless) | Learning > blaming |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-043 | Alert → Runbook mandatory | Alerts without runbooks → engineer panic → slow MTTR |
| ADR-044 | Blameless post-mortems | Blame → people hide mistakes → system doesn't improve |

## 6. Data Flow / Request Flow

**Incident lifecycle:**
```
Alert fires → PagerDuty pages on-call →
  On-call opens incident channel (#incident-{date}-{title}) →
    Follow runbook → Resolve → Update status page →
      Post-mortem within 24 hours → Create action items →
        Track action items to completion
```

## 7. Components Involved

PagerDuty, Slack, Grafana (dashboards), CloudWatch Logs, Statuspage.

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Write runbooks for all P1/P2 alerts, set up PagerDuty rotation |
| Week 2 | Incident response process, post-mortem template, dry run |

## 9. Tasks Checklist

```
Runbooks:
- [ ] Service Down (P1) — diagnosis + resolution
- [ ] High Error Rate (P1) — diagnosis + resolution
- [ ] High Latency (P2) — diagnosis + resolution
- [ ] Kafka Consumer Lag (P2) — diagnosis + resolution
- [ ] Database Connection Saturation (P2) — diagnosis + resolution
- [ ] Circuit Breaker Open (P2) — diagnosis + resolution
- [ ] DLQ Messages Accumulating (P3) — diagnosis + resolution
- [ ] Saga Timeout (P2) — diagnosis + resolution
- [ ] Deployment Rollback — step-by-step
- [ ] Database Restore — step-by-step

Operations:
- [ ] On-call rotation schedule configured
- [ ] PagerDuty escalation policy (engineer → lead → manager)
- [ ] On-call handoff template created
- [ ] On-call access granted (ECS Exec, CloudWatch, Grafana)
- [ ] Incident response process documented
- [ ] Post-mortem template created (blameless)
- [ ] Incident channel naming convention (#incident-YYYY-MM-DD-title)
- [ ] First on-call dry run (simulate P1)
- [ ] Daily health check procedure defined
- [ ] Weekly operational review meeting scheduled
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| Runbooks for all P1/P2 | Every alert links to a runbook |
| On-call rotation | PagerDuty schedule active |
| Incident response process | Team walkthrough completed |
| Post-mortem template | Template reviewed and approved |
| Dry run completed | Simulated P1 handled in < 30 min |

## 11. Dependencies

- Phase 09 (alerts defined and firing)
- Phase 10 (security access controls for on-call)
- Phase 11 (production environment operational)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| On-call burnout | Rotate weekly, compensate, minimize noise alerts |
| Knowledge silos | Share runbooks, pair on incidents, rotate ownership |
| Post-mortem → blame | Enforce blameless culture from leadership |

## 13. Common Mistakes

- Alerts without runbooks (noise → on-call learns to ignore)
- Single person knows everything (bus factor = 1)
- Post-mortems → blame → people stop reporting issues
- No on-call handoff → incoming on-call has no context
- Manual processes instead of automated scripts

## 14. Best Practices

- Runbook review: test each runbook quarterly (can you follow it cold?)
- On-call handoff document: what's happening, what to watch, what changed
- Action items from post-mortems tracked to completion (not forgotten)
- Automate repetitive operational tasks (runbook step → script)
- Celebrate near-misses caught by monitoring (culture of proactive detection)
