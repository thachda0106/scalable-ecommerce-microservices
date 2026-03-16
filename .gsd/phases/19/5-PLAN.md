---
phase: 19
plan: 5
wave: 2
depends_on: [1, 2]
files_modified:
  - apps/user-service/src/infrastructure/observability/user-metrics.service.ts
  - apps/user-service/src/infrastructure/observability/metrics.controller.ts
  - apps/user-service/src/infrastructure/observability/audit-log.service.ts
  - apps/user-service/src/infrastructure/observability/index.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Prometheus metrics cover user CRUD operations and status transitions"
    - "Audit log captures security-critical operations with structured JSON"
    - "Metrics endpoint exposes at /metrics"
  artifacts:
    - "apps/user-service/src/infrastructure/observability/ contains metrics service, metrics controller, audit log service"
---

# Plan 19.5: Observability — Metrics, Audit Logging & Metrics Controller

## Objective
Add Prometheus metrics and audit logging for security-critical user operations.

Purpose: Provide production-grade observability for the user-service.
Output: UserMetricsService, MetricsController, AuditLogService.

## Context
- .gsd/phases/19/RESEARCH.md (observability patterns, audit logging strategy)
- apps/order-service/src/infrastructure/observability/ (reference metrics pattern)

## Tasks

<task type="auto">
  <name>Create UserMetricsService and MetricsController</name>
  <files>
    apps/user-service/src/infrastructure/observability/user-metrics.service.ts
    apps/user-service/src/infrastructure/observability/metrics.controller.ts
    apps/user-service/src/infrastructure/observability/index.ts
  </files>
  <action>
    **UserMetricsService** (follow OrderMetricsService pattern exactly):
    - Private Registry instance
    - Counters:
      - `users_created_total` — Total users created
      - `users_updated_total` — Total users updated (labelled by field: email, username, profile, settings)
      - `users_deleted_total` — Total users soft-deleted
      - `users_suspended_total` — Total users suspended
      - `users_reactivated_total` — Total users reactivated
      - `user_status_changes_total` — Status transitions (labels: from_status, to_status)
    - Histogram:
      - `user_operation_duration_seconds` — Operation duration (label: operation, buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5])
    - Gauge:
      - `active_users` — Number of active users
    - Methods: `incrementUsersCreated()`, `incrementUsersUpdated(field)`, `incrementUsersDeleted()`, `incrementUsersSuspended()`, `incrementUsersReactivated()`, `recordStatusChange(from, to)`, `startTimer(operation)`, `setActiveUsers(count)`, `getMetrics(): Promise<string>`

    **MetricsController**:
    - @Controller('metrics')
    - GET '/' → returns metrics.getMetrics(), content type 'text/plain'

    Barrel export from index.ts.
    AVOID: Creating a new Registry for each metric — share one registry.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>UserMetricsService with 6 counters, 1 histogram, 1 gauge. MetricsController exposes /metrics endpoint.</done>
</task>

<task type="auto">
  <name>Create AuditLogService</name>
  <files>
    apps/user-service/src/infrastructure/observability/audit-log.service.ts
  </files>
  <action>
    **AuditLogService** — structured JSON audit logging:
    - @Injectable() with Logger from @nestjs/common
    - Interface AuditEntry: { timestamp, userId, action, targetId, details?, previousValue?, newValue? }
    - Method: `log(entry: AuditEntry): void` — logs structured JSON via NestJS Logger
    - Supported actions enum: USER_CREATED, USER_UPDATED, USER_DELETED, USER_SUSPENDED, USER_REACTIVATED, EMAIL_CHANGED, USERNAME_CHANGED, PROFILE_UPDATED, SETTINGS_UPDATED
    - Uses the NestJS Logger with a dedicated context 'AuditLog' for easy filtering

    For Phase 19, audit logs go to structured logger (JSON output). A dedicated audit-trail table or external service (e.g., CloudWatch, Splunk) is a future enhancement.

    Update index.ts barrel export to include AuditLogService.

    AVOID: Writing to a database — keep it simple with structured logging for now.
    AVOID: Making audit logging async/fire-and-forget — it should be synchronous to guarantee capture.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>AuditLogService created with structured JSON logging for 9 security-critical actions.</done>
</task>

## Success Criteria
- [ ] UserMetricsService has 6 counters, 1 histogram, 1 gauge
- [ ] MetricsController exposes /metrics endpoint
- [ ] AuditLogService logs structured JSON for security-critical operations
- [ ] All exported via barrel index.ts
- [ ] `npx tsc --noEmit` passes
