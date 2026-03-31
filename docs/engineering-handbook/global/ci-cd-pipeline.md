# CI/CD Pipeline

> **Purpose:** GitHub Actions workflow architecture, configuration, and best practices.

---

## Pipeline Architecture

```
  PR to main:        Lint → Type Check → Unit Test → Build Check
  Push to main:      Detect Changes → Build → Push ECR → Deploy Staging → [Approval] → Deploy Prod
  Terraform PR:      fmt → validate → plan (comment on PR)
  Terraform merge:   apply to staging (auto) → apply to prod (manual)
  Scheduled:         Weekly dependency audit, weekly load test
```

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `pr-checks.yml` | PR opened/updated | Lint, type check, unit test |
| `deploy.yml` | Push to main | Build, push ECR, deploy staging/prod |
| `terraform.yml` | Changes in `terraform/` | Plan on PR, apply on merge |
| `security-scan.yml` | Weekly + push | npm audit, Trivy container scan |
| `load-test.yml` | Weekly (scheduled) | k6 load test against staging |

## Key Configuration

### Change Detection
```bash
# If shared packages changed, rebuild everything
if git diff --name-only HEAD~1 HEAD | grep -q '^packages/'; then
  SERVICES='["all-services"]'
else
  SERVICES=$(git diff --name-only HEAD~1 HEAD | grep -oP 'apps/\K[^/]+' | sort -u)
fi
```

### Build Caching
- **pnpm store:** Cached via `actions/cache` (saves ~2 min per build)
- **Docker layers:** BuildKit cache exported to GitHub Actions cache
- **Node modules:** Restored from lockfile hash

### Environments
| Environment | Auto-deploy? | Approval Required? |
|-------------|-------------|-------------------|
| `staging` | ✅ Yes (on main push) | No |
| `production` | No | ✅ Yes (GitHub Environment protection) |

### Secrets (GitHub → AWS)
- OIDC federation (no long-lived AWS keys)
- `AWS_DEPLOY_ROLE` → assumes IAM role for ECR push + ECS deploy
- Service-specific secrets in AWS Secrets Manager (not GitHub)
