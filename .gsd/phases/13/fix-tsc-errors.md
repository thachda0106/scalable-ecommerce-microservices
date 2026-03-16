---
phase: 13
plan: fix-tsc-errors
wave: 1
gap_closure: true
---

# Fix Plan: Resolve TypeScript Compilation Errors

## Problem
`npx tsc --noEmit` fails in `apps/order-service` because `app.module.ts` and `main.ts` reference `nestjs-pino` and `@ecommerce/core` which are either missing from `package.json` dependencies or not correctly resolved in the monorepo configuration.

## Tasks

<task type="auto">
  <name>Fix imports in app.module.ts and main.ts</name>
  <files>
    apps/order-service/package.json
    apps/order-service/src/app.module.ts
    apps/order-service/src/main.ts
  </files>
  <action>
    Identify if `nestjs-pino` and `@ecommerce/core` exist in the monorepo.
    If they do not exist, modify `app.module.ts` and `main.ts` to use standard `@nestjs/common` `Logger` instead of `nestjs-pino` and `@ecommerce/core`.
    Otherwise, add them to `apps/order-service/package.json` dependencies.
  </action>
  <verify>cd apps/order-service && npx tsc --noEmit</verify>
  <done>TypeScript compilation finishes with exit code 0.</done>
</task>
