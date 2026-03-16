---
phase: 12
plan: fix-tsc-errors
wave: 1
gap_closure: true
---

# Fix Plan: TypeScript Compilation Errors

## Problem
`npx tsc --noEmit` fails with "Cannot find module '@ecommerce/core'" when run from the `notification-service` space. The workspace dependency resolution for the core library is either not configured properly in `tsconfig.json` or `package.json`, or the module is not built.

## Tasks

<task type="auto">
  <name>Fix tsc errors</name>
  <files>apps/notification-service/tsconfig.json, apps/notification-service/package.json</files>
  <action>Ensure that path aliases or workspace symlinks are properly setup for `@ecommerce/core` so that `tsc --noEmit` succeeds cleanly without missing module errors.</action>
  <verify>Run `npx tsc --noEmit` in `apps/notification-service` and verify exit code 0.</verify>
  <done>Zero compilation errors</done>
</task>
