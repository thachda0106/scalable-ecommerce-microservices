# Phase 6 — CI/CD & Deployment: Implementation Roadmap

---

## GOALS

Automate every step from `git push` to production deployment. Engineers should never manually
build, push, or deploy anything. The pipeline detects what changed, runs tests, builds images,
and deploys — automatically for staging, with approval for production.

**Outcome:** A GitHub Actions pipeline that builds, tests, and deploys any changed service
to staging automatically and to production with one-click approval.

---

## TECHNOLOGY CHOICES

| Category | Choice | Why |
|----------|--------|-----|
| **CI Platform** | GitHub Actions | Native repo integration, generous free tier, matrix builds |
| **Container Registry** | AWS ECR | Native ECS integration, no auth complexity |
| **Image Build** | Docker multi-stage | Small images (~150MB), cached layers |
| **Deploy Tool** | AWS CLI (ecs update-service) | Direct, no extra tooling |
| **Blue/Green** | ECS deployment circuit breaker | Auto-rollback on health check failure |
| **DB Migration** | TypeORM CLI (run via ECS task) | Native integration, auto-generated |
| **Feature Flags** | AWS AppConfig / LaunchDarkly | Dynamic without redeploy |
| **Monorepo Detection** | git diff + grep | Simple, no external dependency |
| **Build Cache** | GitHub Actions cache + Docker layer cache | 3x faster builds |

---

## ARCHITECTURE DECISIONS

### ADR-018: Selective Builds Based on Changed Files

```
Decision: CI detects changed directories and only builds affected services
  If packages/ changes → rebuild ALL services (shared code changed)
  If apps/order-service/ changes → rebuild only order-service
Rationale: Building all 10 services on every push takes 30+ minutes.
  Selective builds reduce to 5 minutes.
```

### ADR-019: Shared Dockerfile with Build Args

```
Decision: Single Dockerfile at repo root, parameterized with SERVICE_NAME build arg
  Not per-service Dockerfiles
Rationale: All services have same structure → one Dockerfile, less maintenance
```

### ADR-020: Database Migrations as Pre-Deploy ECS Tasks

```
Decision: Run migrations as a one-off ECS task BEFORE deploying new code
  Not as part of service startup
Rationale:
  - Migration runs once, not once per instance
  - If migration fails, deployment is aborted
  - Service code can assume schema is up-to-date
```

---

## IMPLEMENTATION STEPS

```
Week 1: Pipeline Foundation
───────────────────────────
  Step 1: Create Dockerfile (multi-stage, parameterized)       [Day 1]
  Step 2: Create .dockerignore                                  [Day 1]
  Step 3: Local build test (all services)                       [Day 1]
  Step 4: Create ECR repositories (10 repos)                    [Day 2]
  Step 5: Create GitHub Actions: change detection               [Day 2]
  Step 6: Create GitHub Actions: build + push to ECR            [Day 3]
  Step 7: Create GitHub Actions: deploy to staging              [Day 3-4]

Week 2: Production + Migrations
────────────────────────────────
  Step 8: Create GitHub Actions: deploy to prod (approval gate) [Day 5]
  Step 9: Create migration runner ECS task definition           [Day 5]
  Step 10: Integrate migrations into pipeline                    [Day 6]
  Step 11: Implement rollback script                             [Day 6]
  Step 12: Test: full pipeline E2E (push → staging)             [Day 7]
  Step 13: Test: manual approval → prod deploy                  [Day 7]
  Step 14: Document deployment procedures                        [Day 8]
```

---

## TASK BREAKDOWN

```
Phase 6 — CI/CD & Deployment
│
├── [ ] 6.1 — Dockerization
│   ├── [ ] Create Dockerfile (multi-stage: deps → build → runner)
│   ├── [ ] Create .dockerignore (node_modules, .git, test, docs)
│   ├── [ ] Test build for each service locally
│   ├── [ ] Verify image size < 200MB per service
│   ├── [ ] Verify HEALTHCHECK works in container
│   ├── [ ] Verify non-root user (appuser)
│   └── [ ] Document build args (SERVICE_NAME, PORT)
│
├── [ ] 6.2 — ECR Repositories
│   ├── [ ] Create ECR repo per service (Terraform module)
│   ├── [ ] Lifecycle policy: keep last 10 tagged images, expire untagged > 7 days
│   ├── [ ] Image scanning enabled (on push)
│   └── [ ] Output repo URLs for CI
│
├── [ ] 6.3 — Change Detection
│   ├── [ ] GitHub Actions job: detect-changes
│   ├── [ ] git diff to identify changed directories
│   ├── [ ] If packages/* changed → mark ALL services as changed
│   ├── [ ] If apps/{service}/* changed → mark ONLY that service
│   ├── [ ] If terraform/* changed → trigger infra pipeline
│   ├── [ ] Output: JSON array of changed service names
│   └── [ ] Test: push to one service, verify only that builds
│
├── [ ] 6.4 — CI Pipeline (Build + Test)
│   ├── [ ] Matrix build: one job per changed service
│   ├── [ ] pnpm install --frozen-lockfile
│   ├── [ ] Lint (eslint)
│   ├── [ ] Type check (tsc --noEmit)
│   ├── [ ] Unit tests (jest)
│   ├── [ ] Build Docker image
│   ├── [ ] Tag image with git SHA + latest
│   ├── [ ] Push to ECR
│   ├── [ ] GitHub Actions cache (pnpm store + Docker layers)
│   └── [ ] Build status badge in README
│
├── [ ] 6.5 — Database Migration Pipeline
│   ├── [ ] ECS task definition for migration runner
│   ├── [ ] Script: run migration for specific service
│   ├── [ ] CI step: run migration BEFORE deploy
│   ├── [ ] Verify migration is backward-compatible
│   ├── [ ] Rollback instruction in migration failure
│   └── [ ] Test: run migration in staging → verify schema
│
├── [ ] 6.6 — Staging Deployment
│   ├── [ ] Deploy step: aws ecs update-service --force-new-deployment
│   ├── [ ] Wait for stability: aws ecs wait services-stable
│   ├── [ ] Post-deploy smoke test (curl health endpoint)
│   ├── [ ] Automatic on push to main branch
│   └── [ ] Slack notification on success/failure
│
├── [ ] 6.7 — Production Deployment
│   ├── [ ] GitHub environment: production (requires approval)
│   ├── [ ] Approve step: manual review in GitHub UI
│   ├── [ ] Deploy: same as staging but to prod cluster
│   ├── [ ] ECS deployment circuit breaker (auto-rollback)
│   ├── [ ] Post-deploy monitoring window (5 min)
│   └── [ ] Slack notification with deployment details
│
├── [ ] 6.8 — Rollback Procedure
│   ├── [ ] Script: rollback to previous task definition revision
│   ├── [ ] Document: how to rollback manually
│   ├── [ ] Test: deploy broken version → verify auto-rollback
│   ├── [ ] Rollback button in CI (re-deploy previous stable)
│   └── [ ] Incident template: when to rollback vs hot-fix
│
├── [ ] 6.9 — Feature Flags
│   ├── [ ] Feature flag service integration (AppConfig or custom)
│   ├── [ ] Flag check middleware/utility
│   ├── [ ] Progressive rollout support (% based)
│   ├── [ ] Kill switch (disable feature without deploy)
│   └── [ ] Document: how to create/manage flags
│
└── [ ] 6.10 — Terraform CI Pipeline
    ├── [ ] On PR: terraform fmt + terraform validate + terraform plan
    ├── [ ] Plan output as PR comment
    ├── [ ] On merge to main: terraform apply (staging auto, prod manual)
    ├── [ ] State lock verification
    └── [ ] Prevent apply without plan review
```

---

## EXAMPLE CONFIGS

### Complete GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: ap-southeast-1
  ECR_REGISTRY: ${{ vars.ECR_REGISTRY }}

jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.changes.outputs.services }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      - id: changes
        run: |
          if git diff --name-only HEAD~1 HEAD | grep -q '^packages/'; then
            SERVICES='["api-gateway","auth-service","user-service","product-service","search-service","cart-service","order-service","inventory-service","payment-service","notification-service"]'
          else
            SERVICES=$(git diff --name-only HEAD~1 HEAD | grep -oP 'apps/\K[^/]+' | sort -u | jq -R -s -c 'split("\n") | map(select(length > 0))')
          fi
          echo "services=${SERVICES:-[]}" >> $GITHUB_OUTPUT

  build-and-test:
    needs: detect-changes
    if: needs.detect-changes.outputs.services != '[]'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @ecommerce/shared-types build
      - run: pnpm --filter @ecommerce/events build
      - run: pnpm --filter @ecommerce/core build
      - run: pnpm --filter @ecommerce/${{ matrix.service }} lint
      - run: pnpm --filter @ecommerce/${{ matrix.service }} build
      - run: pnpm --filter @ecommerce/${{ matrix.service }} test --passWithNoTests
      - uses: aws-actions/configure-aws-credentials@v4
        if: github.ref == 'refs/heads/main'
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE }}
          aws-region: ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2
        if: github.ref == 'refs/heads/main'
        id: ecr
      - name: Build and push Docker image
        if: github.ref == 'refs/heads/main'
        run: |
          docker build --build-arg SERVICE_NAME=${{ matrix.service }} \
            -t $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }} \
            -t $ECR_REGISTRY/${{ matrix.service }}:latest .
          docker push $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }}
          docker push $ECR_REGISTRY/${{ matrix.service }}:latest

  deploy-staging:
    needs: [detect-changes, build-and-test]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE }}
          aws-region: ${{ env.AWS_REGION }}
      - run: |
          aws ecs update-service --cluster ecommerce-staging \
            --service ${{ matrix.service }}-staging \
            --force-new-deployment --region ${{ env.AWS_REGION }}
      - run: |
          aws ecs wait services-stable --cluster ecommerce-staging \
            --services ${{ matrix.service }}-staging \
            --region ${{ env.AWS_REGION }}

  deploy-prod:
    needs: [detect-changes, deploy-staging]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE }}
          aws-region: ${{ env.AWS_REGION }}
      - run: |
          aws ecs update-service --cluster ecommerce-prod \
            --service ${{ matrix.service }}-prod \
            --force-new-deployment --region ${{ env.AWS_REGION }}
```

---

## DEPENDENCIES

```
Phase 6 depends on:
  └── Phase 2 (ECR repos, ECS clusters, IAM roles for deployment)
  └── Phase 4 (services exist and can be built)

Internal dependencies:
  6.1 Dockerization  → required by 6.4 (build image step)
  6.2 ECR repos      → required by 6.4 (push destination)
  6.3 Change detect  → required by 6.4 (determines WHAT to build)
  6.4 Build pipeline → required by 6.6, 6.7 (images must exist)
  6.5 Migrations     → required by 6.6 (run before deploy)
  6.6 Staging deploy → required by 6.7 (validate before prod)
```

---

## DELIVERABLES

| # | Deliverable | Verification |
|---|-------------|-------------|
| D1 | Dockerfile builds all services | `docker build --build-arg SERVICE_NAME=x` works |
| D2 | Change detection skips unchanged services | Push to one service → only one build |
| D3 | CI pipeline: lint + test + build + push | GitHub Actions green on PR |
| D4 | Staging auto-deploy on merge to main | Service updated within 10 min of merge |
| D5 | Production deploy with approval gate | Deploy blocked until reviewer approves |
| D6 | Migration runs before deploy | New schema live before new code |
| D7 | Auto-rollback on failed health check | Broken deploy → reverts to previous |
| D8 | Terraform plan on PR, apply on merge | Infra changes reviewed before apply |

---

## COMMON MISTAKES

> [!CAUTION]
> **1. Building ALL services on every push.** Without change detection, CI takes 30+ minutes.
> Use `git diff` to build only affected services.
>
> **2. No build cache.** Docker builds from scratch every time = slow. Cache pnpm store +
> Docker layers in GitHub Actions cache.
>
> **3. Deploying to prod without staging.** Every change must pass staging first. Use GitHub
> environments with required approvals.
>
> **4. Running migrations at service startup.** If you have 5 instances, the migration runs
> 5 times concurrently = race condition. Run once as a dedicated ECS task.
>
> **5. No rollback plan.** The pipeline that deploys must also be able to rollback.
> Test the rollback path before you need it in a 3am incident.

---

> **Next →** [Phase 7 — Observability Implementation](./phase-07-implementation.md)
