---
phase: 19
plan: 6
wave: 3
depends_on: [1, 2, 3, 4, 5]
files_modified:
  - apps/user-service/src/domain/entities/__tests__/user.spec.ts
  - apps/user-service/src/domain/entities/__tests__/user-profile.spec.ts
  - apps/user-service/src/domain/entities/__tests__/user-settings.spec.ts
  - apps/user-service/src/domain/value-objects/__tests__/user-status.vo.spec.ts
  - apps/user-service/src/domain/value-objects/__tests__/email.vo.spec.ts
  - apps/user-service/src/domain/value-objects/__tests__/username.vo.spec.ts
  - apps/user-service/src/application/handlers/__tests__/create-user.handler.spec.ts
  - apps/user-service/src/application/handlers/__tests__/suspend-user.handler.spec.ts
  - apps/user-service/src/application/handlers/__tests__/delete-user.handler.spec.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Domain entity tests verify status transitions and business rule enforcement"
    - "Value object tests verify validation (valid/invalid inputs) and immutability"
    - "Handler tests mock repository/publisher ports and verify the handler orchestration pattern"
    - "All tests pass with pnpm test"
  artifacts:
    - "apps/user-service/src/domain/entities/__tests__/ contains 3 spec files"
    - "apps/user-service/src/domain/value-objects/__tests__/ contains 3 spec files"
    - "apps/user-service/src/application/handlers/__tests__/ contains 3 spec files"
---

# Plan 19.6: Tests — Domain Unit Tests & Handler Tests

## Objective
Write unit tests for domain entities, value objects, and key command handlers.

Purpose: Verify domain invariants and handler orchestration with automated tests.
Output: 9 test files covering domain entities, value objects, and handlers.

## Context
- apps/user-service/src/domain/ (entities and VOs to test)
- apps/user-service/src/application/handlers/ (handlers to test)
- apps/order-service/src/domain/entities/__tests__/ (reference test patterns)
- apps/order-service/src/application/handlers/__tests__/ (reference handler test pattern)

## Tasks

<task type="auto">
  <name>Create Domain Entity and Value Object Tests</name>
  <files>
    apps/user-service/src/domain/entities/__tests__/user.spec.ts
    apps/user-service/src/domain/entities/__tests__/user-profile.spec.ts
    apps/user-service/src/domain/entities/__tests__/user-settings.spec.ts
    apps/user-service/src/domain/value-objects/__tests__/user-status.vo.spec.ts
    apps/user-service/src/domain/value-objects/__tests__/email.vo.spec.ts
    apps/user-service/src/domain/value-objects/__tests__/username.vo.spec.ts
  </files>
  <action>
    **user.spec.ts** — User aggregate root tests:
    - `User.create()` sets status to ACTIVE, generates ID, raises UserCreatedEvent
    - `user.suspend(reason)` transitions ACTIVE → SUSPENDED, raises UserSuspendedEvent
    - `user.reactivate()` transitions SUSPENDED → ACTIVE, raises UserReactivatedEvent
    - `user.delete()` transitions → DELETED, raises UserDeletedEvent
    - Cannot suspend an already SUSPENDED user (throws InvalidUserStatusTransitionError)
    - Cannot reactivate an ACTIVE user (throws)
    - Cannot do anything after DELETED (terminal state)
    - `pullDomainEvents()` returns events and clears internal list
    - `updateProfile()` raises UserUpdatedEvent
    - `updateSettings()` raises UserUpdatedEvent

    **user-profile.spec.ts**:
    - `UserProfile.create()` sets all fields to null/default
    - `update()` sets provided fields, preserves null for unset fields
    - `updatedAt` changes on update

    **user-settings.spec.ts**:
    - `UserSettings.create()` sets correct defaults (email=true, push=true, sms=false, lang='en', tz='UTC')
    - `update()` merges partial updates

    **user-status.vo.spec.ts** (follow order-status.vo.spec.ts pattern):
    - ACTIVE can transition to SUSPENDED, DELETED
    - SUSPENDED can transition to ACTIVE, DELETED
    - DELETED is terminal (no transitions)
    - Invalid transitions throw InvalidUserStatusTransitionError

    **email.vo.spec.ts**:
    - Valid email formats accepted
    - Invalid formats rejected (throws)
    - Case-insensitive equals comparison
    - Normalizes to lowercase

    **username.vo.spec.ts**:
    - Valid usernames accepted (alphanumeric + underscore, 3-30 chars)
    - Too short, too long, special chars → throws
    - Case-insensitive equals

    AVOID: Testing implementation details — test behavior only.
    AVOID: Fragile tests that break on internal refactoring.
  </action>
  <verify>cd apps/user-service && npx jest --testPathPattern="domain" --no-coverage 2>&1 | tail -20</verify>
  <done>6 domain test files covering entity behaviors, VO validation, and status transitions.</done>
</task>

<task type="auto">
  <name>Create Handler Tests</name>
  <files>
    apps/user-service/src/application/handlers/__tests__/create-user.handler.spec.ts
    apps/user-service/src/application/handlers/__tests__/suspend-user.handler.spec.ts
    apps/user-service/src/application/handlers/__tests__/delete-user.handler.spec.ts
  </files>
  <action>
    Follow create-order.handler.spec.ts pattern exactly:
    - Mock IUserRepository, IEventPublisher, UserMetricsService, AuditLogService using jest.Mocked<>
    - Instantiate handler with mocked dependencies

    **create-user.handler.spec.ts**:
    - Successful creation: saves user, publishes events, increments metrics, logs audit
    - Duplicate email: findByEmail returns existing → throws ConflictException
    - Duplicate username: findByUsername returns existing → throws ConflictException

    **suspend-user.handler.spec.ts**:
    - Successful suspension: loads user, calls suspend(), saves, publishes events
    - User not found: throws NotFoundException
    - Already suspended: domain throws InvalidUserStatusTransitionError

    **delete-user.handler.spec.ts**:
    - Successful deletion: loads user, calls delete(), saves, publishes events
    - User not found: throws NotFoundException
    - Already deleted: domain throws InvalidUserStatusTransitionError

    AVOID: Mocking too deeply — mock at the port boundary only.
    AVOID: Not verifying event publication — always assert publishAll was called.
  </action>
  <verify>cd apps/user-service && npx jest --testPathPattern="handlers" --no-coverage 2>&1 | tail -20</verify>
  <done>3 handler test files verifying orchestration pattern: mock ports, assert save/publish/metrics.</done>
</task>

## Success Criteria
- [ ] 6 domain test files (3 entities, 3 VOs) with comprehensive case coverage
- [ ] 3 handler test files covering happy path, not found, and invalid state
- [ ] All tests pass: `pnpm test` in user-service
- [ ] `npx tsc --noEmit` shows zero errors
