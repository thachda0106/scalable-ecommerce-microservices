---
phase: 3
plan: 3
wave: 3
---

# Plan 3.3: Foundation Services Scaffolding

## Objective
Implement the initial boilerplate for the API Gateway, Auth Service, and User Service using NestJS. Wire up the previously built `core` and `events` libraries into their modules.

## Context
- .gsd/ARCHITECTURE.md
- c:\source\packages\core\src\index.ts
- c:\source\packages\events\src\index.ts

## Tasks

<task type="auto">
  <name>Scaffold API Gateway & Integration Services</name>
  <files>c:\source\apps\api-gateway, c:\source\apps\auth-service, c:\source\apps\user-service</files>
  <action>
    - Initialize standard NestJS boilerplates for `api-gateway`, `auth-service`, and `user-service` under `apps/` (run `npx @nestjs/cli new api-gateway --skip-git --skip-install --package-manager pnpm` from `c:\source\apps`, etc., but you can also just stub the `package.json` and `src/main.ts` files manually to keep it perfectly aligned with monorepo setups).
    - Modify the `main.ts` for all three to import CloudWatch JSON logging from `packages/core`.
    - Setup minimal Controllers for `/health` checks.
    - Wire `packages/core`, `packages/events` as structural dependencies in their `package.json` via workspace descriptors (e.g. `"@ecommerce/core": "workspace:*"`).
  </action>
  <verify>Test-Path c:\source\apps\api-gateway\src\main.ts</verify>
  <done>Base microservice projects are established and depend on the shared core packages</done>
</task>

## Success Criteria
- [ ] API Gateway NestJS project exists with health endpoints and integrated tracing/logging.
- [ ] Auth Service exists.
- [ ] User Service exists.
