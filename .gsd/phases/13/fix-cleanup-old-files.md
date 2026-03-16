---
phase: 13
plan: fix-cleanup-old-files
wave: 1
gap_closure: true
---

# Fix Plan: Cleanup Legacy Phase 13 Files

## Problem
The old generic implementations of `order-service` files were never removed when the layered architecture was scaffolded in Plan 13.7.

## Tasks

<task type="auto">
  <name>Delete old flat-structure files and directories</name>
  <files>
    apps/order-service/src/orders/
    apps/order-service/src/outbox/
    apps/order-service/src/sagas/
    apps/order-service/src/app.controller.ts
    apps/order-service/src/app.service.ts
  </files>
  <action>
    Remove the outdated directories and files that conflict with the new hexagonal/layered structure.
  </action>
  <verify>ls apps/order-service/src/orders/</verify>
  <done>Old code is deleted to prevent execution or confusion with the new codebase.</done>
</task>
