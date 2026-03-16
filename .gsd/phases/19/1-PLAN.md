---
phase: 19
plan: 1
wave: 1
depends_on: []
files_modified:
  - apps/user-service/src/domain/value-objects/user-id.vo.ts
  - apps/user-service/src/domain/value-objects/email.vo.ts
  - apps/user-service/src/domain/value-objects/username.vo.ts
  - apps/user-service/src/domain/value-objects/user-status.vo.ts
  - apps/user-service/src/domain/value-objects/index.ts
  - apps/user-service/src/domain/entities/user.entity.ts
  - apps/user-service/src/domain/entities/user-profile.entity.ts
  - apps/user-service/src/domain/entities/user-settings.entity.ts
  - apps/user-service/src/domain/entities/index.ts
  - apps/user-service/src/domain/events/base-domain.event.ts
  - apps/user-service/src/domain/events/user-created.event.ts
  - apps/user-service/src/domain/events/user-updated.event.ts
  - apps/user-service/src/domain/events/user-suspended.event.ts
  - apps/user-service/src/domain/events/user-reactivated.event.ts
  - apps/user-service/src/domain/events/user-deleted.event.ts
  - apps/user-service/src/domain/events/index.ts
  - apps/user-service/src/domain/errors/domain-exception.ts
  - apps/user-service/src/domain/errors/invalid-user-status-transition.error.ts
  - apps/user-service/src/domain/errors/invalid-user-operation.error.ts
  - apps/user-service/src/domain/errors/index.ts
  - apps/user-service/src/domain/ports/user-repository.port.ts
  - apps/user-service/src/domain/ports/index.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "User aggregate enforces status transitions via UserStatus value object"
    - "UserProfile and UserSettings are separate entities owned by User"
    - "Domain events are raised on every state change (create, update, suspend, reactivate, delete)"
    - "No @nestjs imports exist in src/domain/"
  artifacts:
    - "apps/user-service/src/domain/value-objects/ contains 4 VOs"
    - "apps/user-service/src/domain/entities/ contains 3 entities"
    - "apps/user-service/src/domain/events/ contains 5 events + base"
    - "apps/user-service/src/domain/errors/ contains 3 error classes"
    - "apps/user-service/src/domain/ports/ contains repository port"
---

# Plan 19.1: Domain Layer — Aggregate Root, Entities, Value Objects, Events & Ports

## Objective
Create the complete domain layer for the user-service following DDD.
This is the foundation — all business rules, status transitions, and domain events originate here.
The domain layer MUST have zero `@nestjs` imports to guarantee framework independence.

Purpose: Establish the core domain model that all other layers depend on.
Output: Value objects, entities, domain events, domain errors, and repository port.

## Context
- .gsd/phases/19/RESEARCH.md (auth/user boundary, patterns)
- apps/order-service/src/domain/ (established DDD pattern to follow)
- apps/notification-service/src/domain/ (secondary reference)

## Tasks

<task type="auto">
  <name>Create Value Objects (UserId, Email, Username, UserStatus)</name>
  <files>
    apps/user-service/src/domain/value-objects/user-id.vo.ts
    apps/user-service/src/domain/value-objects/email.vo.ts
    apps/user-service/src/domain/value-objects/username.vo.ts
    apps/user-service/src/domain/value-objects/user-status.vo.ts
    apps/user-service/src/domain/value-objects/index.ts
  </files>
  <action>
    Create immutable value objects following exact same pattern as OrderId/OrderStatus:

    **UserId** — wraps UUID string. Private constructor, `static create(id: string)`, `static generate()` (crypto.randomUUID), `equals()`, `toString()`, getter `value`. Follow OrderId pattern exactly.

    **Email** — wraps validated email string. Private constructor, `static create(email: string)` validates format with regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, throws DomainException on invalid. `equals()` (case-insensitive comparison), `toString()`, getter `value`. Normalizes to lowercase.

    **Username** — wraps validated username string. Private constructor, `static create(username: string)` validates: 3-30 chars, alphanumeric + underscores only (regex `/^[a-zA-Z0-9_]{3,30}$/`), throws DomainException on invalid. `equals()` (case-insensitive), `toString()`, getter `value`. Normalizes to lowercase.

    **UserStatus** — enum VO following OrderStatus pattern exactly:
      - UserStatusEnum: ACTIVE, SUSPENDED, DELETED
      - VALID_TRANSITIONS Map:
        ACTIVE → [SUSPENDED, DELETED]
        SUSPENDED → [ACTIVE, DELETED]
        DELETED → [] (terminal)
      - Private constructor, `static create(value)`, `static active()` (factory for new users)
      - `canTransitionTo()`, `transitionTo()` (throws InvalidUserStatusTransitionError)
      - `isTerminal()`, `equals()`, `toString()`, getter `value`

    Barrel export from index.ts.
    AVOID: Using `class-validator` decorators in VOs — validation is manual in the VO itself.
    AVOID: Importing anything from @nestjs — domain is framework-agnostic.
  </action>
  <verify>grep -r "@nestjs" apps/user-service/src/domain/ | wc -l → 0</verify>
  <done>4 value objects created with validation, immutability, and equality semantics. UserStatus has transition rules: ACTIVE ↔ SUSPENDED → DELETED.</done>
</task>

<task type="auto">
  <name>Create User Aggregate Root, UserProfile Entity, UserSettings Entity</name>
  <files>
    apps/user-service/src/domain/entities/user.entity.ts
    apps/user-service/src/domain/entities/user-profile.entity.ts
    apps/user-service/src/domain/entities/user-settings.entity.ts
    apps/user-service/src/domain/entities/index.ts
  </files>
  <action>
    **UserProfile** entity:
    - Properties: userId (UserId), displayName (string | null), avatar (string | null), bio (string | null), phoneNumber (string | null), dateOfBirth (Date | null), updatedAt (Date)
    - Static factory: `UserProfile.create(userId: UserId)` — creates with all null values
    - Static factory: `UserProfile.reconstitute(props)` — for DB hydration
    - `update(props: Partial)` method — updates non-null fields, sets updatedAt

    **UserSettings** entity:
    - Properties: userId (UserId), emailNotifications (boolean, default true), pushNotifications (boolean, default true), smsNotifications (boolean, default false), language (string, default 'en'), timezone (string, default 'UTC'), updatedAt (Date)
    - Static factory: `UserSettings.create(userId: UserId)` — creates with defaults
    - Static factory: `UserSettings.reconstitute(props)` — for DB hydration
    - `update(props: Partial)` method — updates fields, sets updatedAt

    **User** aggregate root (follow Order entity pattern exactly):
    - Private fields: _id (UserId), _email (Email), _username (Username), _status (UserStatus), _profile (UserProfile), _settings (UserSettings), _version (number), _createdAt (Date), _updatedAt (Date), _domainEvents (BaseDomainEvent[])
    - Private constructor
    - `static create(props: CreateUserProps)` — creates new user with ACTIVE status, default profile/settings, raises UserCreatedEvent
    - `static reconstitute(props: ReconstituteUserProps)` — hydrates from DB, no events
    - Domain behaviors:
      - `updateProfile(props)` → updates profile, raises UserUpdatedEvent
      - `updateSettings(props)` → updates settings, raises UserUpdatedEvent
      - `updateEmail(newEmail: Email)` → changes email, raises UserUpdatedEvent
      - `updateUsername(newUsername: Username)` → changes username, raises UserUpdatedEvent
      - `suspend(reason: string)` → transitions ACTIVE → SUSPENDED via UserStatus, raises UserSuspendedEvent
      - `reactivate()` → transitions SUSPENDED → ACTIVE, raises UserReactivatedEvent
      - `delete()` → transitions → DELETED, raises UserDeletedEvent
    - `pullDomainEvents(): BaseDomainEvent[]` — returns and clears events
    - Read-only getters for all fields
    - `toJSON()` method for serialization

    Barrel export from index.ts.
    AVOID: Business logic in getters — all mutation through methods only.
    AVOID: Direct status field mutation — always use transitionStatus() helper like Order does.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>User aggregate with 7 domain behaviors, UserProfile with update(), UserSettings with defaults. All status changes go through UserStatus.transitionTo().</done>
</task>

<task type="auto">
  <name>Create Domain Events, Errors, and Repository Port</name>
  <files>
    apps/user-service/src/domain/events/base-domain.event.ts
    apps/user-service/src/domain/events/user-created.event.ts
    apps/user-service/src/domain/events/user-updated.event.ts
    apps/user-service/src/domain/events/user-suspended.event.ts
    apps/user-service/src/domain/events/user-reactivated.event.ts
    apps/user-service/src/domain/events/user-deleted.event.ts
    apps/user-service/src/domain/events/index.ts
    apps/user-service/src/domain/errors/domain-exception.ts
    apps/user-service/src/domain/errors/invalid-user-status-transition.error.ts
    apps/user-service/src/domain/errors/invalid-user-operation.error.ts
    apps/user-service/src/domain/errors/index.ts
    apps/user-service/src/domain/ports/user-repository.port.ts
    apps/user-service/src/domain/ports/index.ts
  </files>
  <action>
    **BaseDomainEvent** (identical to order-service):
    - `occurredOn: Date = new Date()`
    - `abstract eventType: string`

    **Domain events** — each extends BaseDomainEvent:
    - UserCreatedEvent → eventType 'user.created', payload: userId, email, username
    - UserUpdatedEvent → eventType 'user.updated', payload: userId, changedFields (string[])
    - UserSuspendedEvent → eventType 'user.suspended', payload: userId, reason
    - UserReactivatedEvent → eventType 'user.reactivated', payload: userId
    - UserDeletedEvent → eventType 'user.deleted', payload: userId

    **Domain errors:**
    - DomainException (base) — extends Error with `code` property
    - InvalidUserStatusTransitionError — includes from/to status (follow InvalidOrderStatusTransitionError pattern)
    - InvalidUserOperationError — includes operation name and message (follow InvalidOrderOperationError pattern)

    **Repository port** (follow order-repository.port.ts pattern exactly):
    - `export const USER_REPOSITORY = Symbol('USER_REPOSITORY')`
    - Interface `IUserRepository`:
      - `save(user: User): Promise<void>`
      - `findById(id: UserId): Promise<User | null>`
      - `findByEmail(email: Email): Promise<User | null>`
      - `findByUsername(username: Username): Promise<User | null>`
      - `findAll(options?: { page?: number; limit?: number; status?: UserStatusEnum }): Promise<{ users: User[]; total: number }>`
      - `delete(id: UserId): Promise<void>`

    Barrel exports from index.ts files.
    AVOID: Returning ORM types from repository port — only domain types.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>5 domain events, 3 error classes, and user repository port created. All have barrel exports. Zero @nestjs imports in domain/.</done>
</task>

## Success Criteria
- [ ] 4 value objects with validation and immutability (UserId, Email, Username, UserStatus)
- [ ] User aggregate with 7 domain behaviors and status transitions
- [ ] UserProfile entity with update method
- [ ] UserSettings entity with sensible defaults
- [ ] 5 domain events raised by aggregate behaviors
- [ ] 3 domain error types
- [ ] Repository port interface with Symbol token
- [ ] Zero `@nestjs` imports in src/domain/
- [ ] `npx tsc --noEmit` passes
