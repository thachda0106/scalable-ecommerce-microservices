# Deployment Flow

> **Purpose:** How code goes from a developer's machine to production, step by step.

---

## Overview

```
  Developer → git push → GitHub Actions → ECR → ECS (staging) → Approval → ECS (prod)
```

## Detailed Flow

### 1. Developer Workflow
```
1. Create feature branch from main
2. Make changes, commit
3. Push branch → triggers PR checks (lint, test, type check)
4. Code review + approval
5. Merge to main → triggers build + deploy pipeline
```

### 2. CI Pipeline (Automatic)
```
git push to main
  │
  ├── Detect changed services (git diff)
  │   If packages/* changed → rebuild ALL services
  │   If apps/{svc}/* changed → rebuild only that service
  │
  ├── Per changed service (matrix build):
  │   ├── pnpm install --frozen-lockfile
  │   ├── ESLint
  │   ├── TypeScript type check
  │   ├── Jest unit tests
  │   ├── Docker multi-stage build
  │   ├── Tag image: {ecr-url}/{service}:{git-sha}
  │   └── Push to ECR
  │
  ├── Run database migration (ECS one-off task)
  │   - Must be backward-compatible
  │   - Runs BEFORE new code deploys
  │
  └── Deploy to staging (automatic)
      ├── aws ecs update-service --force-new-deployment
      ├── aws ecs wait services-stable
      └── Smoke test: curl health endpoint
```

### 3. Production Deployment (Manual Approval)
```
All staging checks pass
  │
  ├── GitHub environment: "production" (requires approval)
  ├── Reviewer approves in GitHub UI
  │
  └── Deploy to production
      ├── aws ecs update-service --force-new-deployment
      ├── ECS circuit breaker enabled (auto-rollback on failure)
      ├── Monitor for 5 minutes
      └── Slack notification with deployment details
```

### 4. Rollback
```
Automatic: ECS circuit breaker detects health check failure → rollback

Manual:
  aws ecs update-service \
    --cluster ecommerce-prod \
    --service {service}-prod \
    --task-definition {service}:{previous-revision}
```

## Deployment Checklist

- [ ] All tests pass in CI
- [ ] Migration is backward-compatible
- [ ] Feature flag wraps risky changes
- [ ] Staging deployment successful
- [ ] Smoke tests pass on staging
- [ ] Reviewer approves production deploy
- [ ] Monitor dashboards for 5 min post-deploy
- [ ] Rollback path tested and documented
