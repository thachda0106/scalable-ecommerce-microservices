---
phase: 20
plan: 7
wave: 4
---

# Plan 20.7: Docker, CI/CD & Repository Hardening

## Objective
Create Dockerfiles for all services with proper multi-stage builds and non-root users. Create GitHub Actions CI/CD pipelines. Add shared packages (`shared-types`, `testing`). Enable `strict: true` in TypeScript. This completes the operational readiness of the platform.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 6-7 findings)
- apps/order-service/Dockerfile (reference — existing but needs optimization)
- apps/api-gateway/Dockerfile (reference)
- .github/workflows/ (empty)
- packages/core/package.json
- tsconfig.base.json

## Tasks

<task type="auto">
  <name>Create optimized Dockerfiles for all services</name>
  <files>
    apps/auth-service/Dockerfile (NEW)
    apps/user-service/Dockerfile (NEW)
    apps/notification-service/Dockerfile (NEW)
    apps/payment-service/Dockerfile (NEW)
    apps/search-service/Dockerfile (NEW)
    apps/inventory-service/Dockerfile (NEW)
    apps/order-service/Dockerfile (MODIFY)
    apps/api-gateway/Dockerfile (MODIFY)
    apps/cart-service/Dockerfile (MODIFY)
    apps/product-service/Dockerfile (MODIFY)
  </files>
  <action>
    Create/update all Dockerfiles using this optimized pattern:

    ```dockerfile
    # Stage 1: Install dependencies
    FROM node:24-alpine AS deps
    RUN corepack enable && corepack prepare pnpm@latest --activate
    WORKDIR /app
    COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
    COPY apps/<service>/package.json apps/<service>/
    COPY packages/core/package.json packages/core/
    COPY packages/events/package.json packages/events/
    RUN pnpm install --frozen-lockfile

    # Stage 2: Build
    FROM deps AS build
    COPY tsconfig.base.json ./
    COPY apps/<service>/ apps/<service>/
    COPY packages/ packages/
    RUN pnpm --filter @ecommerce/core build
    RUN pnpm --filter @ecommerce/events build
    RUN pnpm --filter <service> build

    # Stage 3: Production
    FROM node:24-alpine AS production
    RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
    WORKDIR /app
    COPY --from=build /app/apps/<service>/dist ./dist
    COPY --from=build /app/apps/<service>/package.json ./
    COPY --from=build /app/node_modules ./node_modules
    USER nestjs
    ENV NODE_ENV=production
    EXPOSE 3000
    CMD ["node", "dist/main.js"]
    ```

    Key improvements over existing:
    - Only copy relevant service + packages (not entire monorepo)
    - Non-root user (`nestjs`)
    - Proper layer caching (package.json copied before source)
    - 3-stage build (deps → build → production)
  </action>
  <verify>find apps/*/Dockerfile -type f | wc -l</verify>
  <done>10 Dockerfiles exist (one per service)</done>
</task>

<task type="auto">
  <name>Create GitHub Actions CI pipeline</name>
  <files>
    .github/workflows/ci.yml (NEW)
  </files>
  <action>
    Create `.github/workflows/ci.yml`:

    ```yaml
    name: CI
    on:
      pull_request:
        branches: [main, develop]
      push:
        branches: [main]

    jobs:
      build-and-test:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: pnpm/action-setup@v4
            with:
              version: 9
          - uses: actions/setup-node@v4
            with:
              node-version: 24
              cache: pnpm
          - run: pnpm install --frozen-lockfile
          - run: pnpm -r build
          - run: pnpm -r test --passWithNoTests
          - run: pnpm -r exec npx tsc --noEmit
    ```

    This covers build, test, and type-check across all services.

    Do NOT create CD pipelines yet — those require ECR repository setup and Terraform secrets.
  </action>
  <verify>test -f .github/workflows/ci.yml && echo "exists"</verify>
  <done>ci.yml created with build, test, and type-check jobs</done>
</task>

<task type="auto">
  <name>Enable strict TypeScript and add shared packages stubs</name>
  <files>
    tsconfig.base.json (MODIFY)
    packages/shared-types/package.json (NEW)
    packages/shared-types/src/index.ts (NEW)
    packages/shared-types/src/pagination.ts (NEW)
    packages/shared-types/src/api-response.ts (NEW)
    packages/shared-types/tsconfig.json (NEW)
  </files>
  <action>
    1. In `tsconfig.base.json`, replace individual strict flags with `"strict": true`:
       ```json
       {
         "compilerOptions": {
           "strict": true,
           // remove redundant individual flags that strict already enables
         }
       }
       ```

    2. Create `packages/shared-types/`:
       - `package.json` with `"name": "@ecommerce/shared-types"`
       - `src/pagination.ts` — export `PaginatedResponse<T>`, `PaginationParams`
       - `src/api-response.ts` — export `ApiSuccessResponse<T>`, `ApiErrorResponse`
       - `src/index.ts` — re-export all
       - `tsconfig.json` extending base

    3. Update `pnpm-workspace.yaml` to include `packages/shared-types` if not already covered by `packages/*` glob.

    Note: `strict: true` may cause TS errors in services. These should be fixed service-by-service in subsequent sessions, but the config change enables the check globally.
  </action>
  <verify>grep -n "strict" tsconfig.base.json | head -5</verify>
  <done>"strict": true set in tsconfig.base.json; shared-types package created</done>
</task>

## Success Criteria
- [ ] All 10 services have Dockerfiles with non-root user and 3-stage build
- [ ] `.github/workflows/ci.yml` exists with build + test + type-check
- [ ] `strict: true` enabled in `tsconfig.base.json`
- [ ] `packages/shared-types` exists with PaginatedResponse and ApiResponse types
- [ ] `pnpm -r build` passes (or documents known strict-mode errors for follow-up)
