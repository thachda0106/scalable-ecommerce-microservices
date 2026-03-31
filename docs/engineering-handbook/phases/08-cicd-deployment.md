# Phase 08 — CI/CD & Deployment

---

## 1. Overview

Automate everything from `git push` to production. Engineers never manually build, push,
or deploy. The pipeline detects changes, tests, builds, and deploys.

## 2. Goals

- Change detection: only build affected services
- Automated staging deployment on merge to main
- Production deployment with manual approval gate
- Auto-rollback on failed health checks
- Database migrations as pre-deploy tasks

## 3. Architecture Design

See [CI/CD Pipeline](../global/ci-cd-pipeline.md) and [Deployment Flow](../global/deployment-flow.md).

## 4. Technology Choices

| Component | Choice | Why |
|-----------|--------|-----|
| CI | GitHub Actions | Native repo, matrix builds |
| Registry | ECR | Native ECS integration |
| Deploy | aws ecs update-service | Direct, no extra tools |
| Rollback | ECS deployment circuit breaker | Auto-rollback on failure |
| Migrations | TypeORM CLI via ECS task | Once, before deploy |
| Feature flags | AWS AppConfig | Dynamic without redeploy |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-026 | Selective builds (git diff) | 5 min build vs 30+ for all services |
| ADR-027 | Shared Dockerfile with build args | One Dockerfile, less maintenance |
| ADR-028 | Migrations as pre-deploy ECS tasks | Run once (not per instance), abort on failure |

## 6. Data Flow / Request Flow

See [Deployment Flow](../global/deployment-flow.md) for the complete deployment path.

## 7. Components Involved

GitHub, GitHub Actions, ECR, ECS (staging + prod), RDS (migration runner).

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Dockerfile, .dockerignore, ECR repos, change detection, build+push, deploy staging |
| Week 2 | Deploy prod (approval gate), migration runner, rollback script, Terraform CI |

## 9. Tasks Checklist

```
- [ ] Multi-stage Dockerfile (deps → build → runner, non-root, < 200MB)
- [ ] ECR lifecycle policy (keep 10 tagged, expire untagged > 7 days)
- [ ] Change detection (git diff → JSON array of changed services)
- [ ] CI: pnpm install → lint → type check → test → docker build → push ECR
- [ ] GitHub Actions cache (pnpm store + Docker layers)
- [ ] Migration runner (ECS one-off task before deploy)
- [ ] Staging: auto-deploy on push to main
- [ ] Production: GitHub Environment with required approval
- [ ] ECS circuit breaker (auto-rollback on health failure)
- [ ] Rollback script documented and tested
- [ ] Terraform CI: plan on PR, apply on merge
- [ ] Slack notifications on deploy success/failure
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| Docker builds all services | `docker build --build-arg SERVICE_NAME=x` works |
| Change detection | Push to one service → only that builds |
| Staging auto-deploy | Updated within 10 min of merge |
| Prod with approval | Blocked until reviewer approves |
| Auto-rollback | Broken deploy reverts automatically |
| Migration before deploy | New schema live before new code |

## 11. Dependencies

- Phase 04 (ECR repos, ECS clusters, IAM roles)
- Phase 06 (services must be buildable)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Breaking migration deployed to prod | Test in staging first, backward-compatible migrations only |
| CI flaky tests block deploy | Retry flaky, fix or quarantine |
| Docker build too slow | Multi-stage with layer caching |

## 13. Common Mistakes

- Building ALL services on every push (30+ min CI)
- No build cache (Docker + pnpm from scratch each time)
- Deploying to prod without validating in staging
- Running migrations at startup instead of as a separate task
- No rollback plan (can't undo a broken deploy)

## 14. Best Practices

- Every CI run produces a git-SHA-tagged image (reproducible)
- Feature flags wrap risky changes (deploy != release)
- Monitor dashboards for 5 min post-deploy
- Test rollback path before you need it in a 3am incident
