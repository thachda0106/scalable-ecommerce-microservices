# Phase 6 — CI/CD & Deployment

> **Why this phase exists:** Code that isn't deployed is code that doesn't exist. A robust CI/CD
> pipeline turns every git push into a tested, containerized, deployed artifact. Without it, your
> team spends 20% of their time on manual deployments, broken builds, and "it works on my machine."

---

## 6.1 Monorepo vs Polyrepo

### Our Choice: Monorepo (pnpm workspaces)

```
ecommerce-platform/                 ← Single git repo
├── apps/                           ← All microservices
│   ├── api-gateway/
│   ├── auth-service/
│   ├── user-service/
│   ├── product-service/
│   ├── search-service/
│   ├── cart-service/
│   ├── order-service/
│   ├── inventory-service/
│   ├── payment-service/
│   └── notification-service/
├── packages/                       ← Shared libraries
│   ├── core/
│   ├── events/
│   └── shared-types/
├── terraform/                      ← Infrastructure
├── docker/                         ← Docker compose for local dev
├── .github/workflows/              ← CI/CD pipelines
└── pnpm-workspace.yaml
```

### Comparison

| Factor | Monorepo | Polyrepo |
|--------|---------|----------|
| **Code Sharing** | ✅ Easy, same repo | ❌ npm packages, publish cycle |
| **Atomic Changes** | ✅ One PR changes core + services | ❌ Multiple PRs across repos |
| **CI Complexity** | ⚠️ Must detect changed services | ✅ Each repo has simple CI |
| **Build Time** | ⚠️ Can be long without caching | ✅ Only builds one service |
| **Team Autonomy** | ⚠️ Shared CODEOWNERS needed | ✅ Full ownership per repo |
| **Our Decision** | ✅ **Chosen** — better for < 20 engineers | Better for > 50 engineers |

---

## 6.2 Docker Build Strategy

### Multi-Stage Dockerfile (Per Service)

```dockerfile
# Dockerfile (shared template, service-specific via build args)
# ─────────────────────────────────────────────────────────────

# Stage 1: Install dependencies
FROM node:24-alpine AS deps
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/events/package.json ./packages/events/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/${SERVICE_NAME}/package.json ./apps/${SERVICE_NAME}/

RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:24-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/events/node_modules ./packages/events/node_modules
COPY . .

# Build shared packages first
RUN pnpm --filter @ecommerce/shared-types build
RUN pnpm --filter @ecommerce/events build
RUN pnpm --filter @ecommerce/core build
# Build the target service
RUN pnpm --filter @ecommerce/${SERVICE_NAME} build

# Stage 3: Production image
FROM node:24-alpine AS runner
WORKDIR /app

RUN addgroup --system appgroup && adduser --system appuser --ingroup appgroup

COPY --from=builder /app/apps/${SERVICE_NAME}/dist ./dist
COPY --from=builder /app/apps/${SERVICE_NAME}/node_modules ./node_modules
COPY --from=builder /app/packages/core/dist ./node_modules/@ecommerce/core/dist
COPY --from=builder /app/packages/events/dist ./node_modules/@ecommerce/events/dist

USER appuser

EXPOSE ${PORT}
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/main.js"]
```

### Build Optimization

| Technique | Impact |
|-----------|--------|
| **Multi-stage builds** | Final image ~150MB vs ~1.2GB |
| **Layer caching** | Only reinstall deps when package.json changes |
| **`.dockerignore`** | Exclude node_modules, .git, tests |
| **Alpine base** | 5MB base vs 350MB for full Node image |
| **Non-root user** | Security best practice |

---

## 6.3 CI Pipeline (GitHub Actions)

### Pipeline Architecture

```
  Push to main
      │
      ▼
  ┌──────────────┐
  │ Detect       │  ← Only build/deploy changed services
  │ Changes      │
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │ Lint + Test  │  ← ESLint, unit tests, type checking
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │ Build Image  │  ← Docker multi-stage build
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │ Push to ECR  │  ← Tag with git SHA
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │ Deploy to    │  ← ECS service update
  │ Staging      │
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │ Integration  │  ← Health check, smoke tests
  │ Tests        │
  └──────┬───────┘
         │
  ┌──────┴───────┐
  │ Deploy to    │  ← Manual approval gate
  │ Production   │
  └──────────────┘
```

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: ap-southeast-1
  ECR_REGISTRY: 123456789.dkr.ecr.ap-southeast-1.amazonaws.com

jobs:
  # ─── Step 1: Detect which services changed ───
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.changes.outputs.services }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - id: changes
        run: |
          CHANGED=$(git diff --name-only HEAD~1 HEAD | \
            grep -oP 'apps/\K[^/]+' | sort -u | jq -R -s -c 'split("\n")[:-1]')

          # If shared packages changed, rebuild ALL services
          if git diff --name-only HEAD~1 HEAD | grep -q '^packages/'; then
            CHANGED='["api-gateway","auth-service","user-service","product-service","search-service","cart-service","order-service","inventory-service","payment-service","notification-service"]'
          fi

          echo "services=$CHANGED" >> $GITHUB_OUTPUT

  # ─── Step 2: Lint, Test, Build ───
  build:
    needs: detect-changes
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm --filter @ecommerce/${{ matrix.service }} lint

      - name: Type check
        run: pnpm --filter @ecommerce/${{ matrix.service }} build

      - name: Unit tests
        run: pnpm --filter @ecommerce/${{ matrix.service }} test

      - name: Build Docker image
        run: |
          docker build \
            --build-arg SERVICE_NAME=${{ matrix.service }} \
            --build-arg PORT=$(grep ${{ matrix.service }} service-ports.json | jq .port) \
            -t $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }} \
            -t $ECR_REGISTRY/${{ matrix.service }}:latest \
            .

      - name: Push to ECR
        if: github.ref == 'refs/heads/main'
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker push $ECR_REGISTRY/${{ matrix.service }}:${{ github.sha }}
          docker push $ECR_REGISTRY/${{ matrix.service }}:latest

  # ─── Step 3: Deploy to Staging ───
  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    steps:
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster ecommerce-staging \
            --service ${{ matrix.service }}-staging \
            --force-new-deployment \
            --region $AWS_REGION

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster ecommerce-staging \
            --services ${{ matrix.service }}-staging \
            --region $AWS_REGION

  # ─── Step 4: Deploy to Production (manual approval) ───
  deploy-prod:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production    # ← Requires manual approval in GitHub
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect-changes.outputs.services) }}
    steps:
      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster ecommerce-prod \
            --service ${{ matrix.service }}-prod \
            --force-new-deployment \
            --region $AWS_REGION
```

---

## 6.4 Database Migrations

### Strategy: Run Before Deploy

```
  Migration Flow:
  ┌──────────────────┐
  │ ECS Task (temp)  │  ← Run migration as one-off task
  │ npm run migrate  │
  └────────┬─────────┘
           │ success
           ▼
  ┌──────────────────┐
  │ Deploy new code  │  ← Code expects new schema
  └──────────────────┘
```

### Migration Rules

| Rule | Why |
|------|-----|
| **Backward compatible only** | Old code must work with new schema during rolling deploy |
| **Additive changes** | Add columns (nullable), don't remove or rename |
| **Two-phase removal** | Phase 1: Stop using column. Phase 2: Remove column |
| **Small migrations** | One migration per change, not giant batch |
| **Test in staging first** | Always run migration on staging data before prod |

### Example: Adding a Column (Safe)

```typescript
// Phase 1: Add column (nullable)
export class AddPhoneToUsers1705000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('users', new TableColumn({
      name: 'phone',
      type: 'varchar(20)',
      isNullable: true,     // ← Safe: old code ignores this column
    }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'phone');
  }
}
```

---

## 6.5 Blue/Green Deployment

```
                    ALB
                     │
         ┌───────────┼───────────┐
         │                       │
   ┌─────┴─────┐          ┌─────┴─────┐
   │   BLUE    │          │   GREEN   │
   │ (current) │          │  (new)    │
   │ v1.2.3    │          │ v1.3.0    │
   │           │          │           │
   │ 100%      │          │ 0%        │
   │ traffic   │          │ traffic   │
   └───────────┘          └───────────┘

   Step 1: Deploy v1.3.0 to Green
   Step 2: Health check Green
   Step 3: Switch traffic: Blue 0% → Green 100%
   Step 4: Monitor for 5 minutes
   Step 5: If OK → terminate Blue
           If NOT → rollback: Green 0% → Blue 100%
```

---

## 6.6 Canary Deployment

```
   Step 1: Deploy canary (1 instance of new version)

                    ALB
                     │
         ┌───────────┼───────────┐
         │                       │
   ┌─────┴─────┐          ┌─────┴─────┐
   │ Stable    │          │  Canary   │
   │ v1.2.3   │          │  v1.3.0   │
   │ 4 tasks  │          │  1 task   │
   │ 95%      │          │  5%       │
   └───────────┘          └───────────┘

   Step 2: Monitor error rate, latency, CPU for 10 min
   Step 3: If metrics OK → increase canary to 50%
   Step 4: If metrics OK → full deploy (100%)
   Step 5: If metrics BAD → rollback canary to 0%
```

---

## 6.7 Rollback Strategy

### Automatic Rollback (ECS)

```hcl
# Terraform: ECS deployment circuit breaker
deployment_circuit_breaker {
  enable   = true
  rollback = true    # ← Auto-rollback on health check failures
}
```

### Manual Rollback

```bash
# Rollback to previous task definition
aws ecs update-service \
  --cluster ecommerce-prod \
  --service order-service-prod \
  --task-definition order-service:42  # Previous version

# Or redeploy the previous Docker image
aws ecs update-service \
  --cluster ecommerce-prod \
  --service order-service-prod \
  --force-new-deployment
  # (if "latest" tag was updated to point to previous image)
```

---

## 6.8 Feature Flags in Deployment

### Progressive Rollout

```
  Day 1: Deploy with feature flag OFF (0%)
    → Code is in production but inactive
    → No risk

  Day 2: Enable for internal team (1%)
    → Test with real traffic

  Day 3: Enable for 10% of users
    → Monitor metrics

  Day 5: Enable for 50%
    → A/B test performance

  Day 7: Enable for 100%
    → Full rollout

  Day 14: Remove feature flag
    → Clean up old code path
```

---

## Common Mistakes

> [!CAUTION]
> - **No change detection.** Building and deploying ALL services on every push wastes 30+ minutes.
>   Only build what changed.
> - **Running migrations during deploy.** If the migration is not backward compatible, old instances
>   crash during rolling update.
> - **No staging environment.** Deploying directly to production is testing in production.
> - **No rollback plan.** If you can't rollback in < 5 minutes, your deployment process is broken.
> - **Fat Docker images.** A 1.5GB image takes 3 minutes to pull. Use multi-stage builds and Alpine.
> - **Hardcoded secrets in CI.** Use GitHub Secrets or AWS Secrets Manager, never commit secrets.

---

> **Next →** [Phase 7 — Observability](./phase-07-observability.md)
