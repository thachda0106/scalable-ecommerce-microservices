---
phase: 19
plan: 2
wave: 1
depends_on: [1]
files_modified:
  - apps/user-service/src/application/commands/create-user.command.ts
  - apps/user-service/src/application/commands/update-user.command.ts
  - apps/user-service/src/application/commands/delete-user.command.ts
  - apps/user-service/src/application/commands/update-user-profile.command.ts
  - apps/user-service/src/application/commands/update-user-settings.command.ts
  - apps/user-service/src/application/commands/suspend-user.command.ts
  - apps/user-service/src/application/commands/reactivate-user.command.ts
  - apps/user-service/src/application/commands/index.ts
  - apps/user-service/src/application/queries/get-user-by-id.query.ts
  - apps/user-service/src/application/queries/get-user-by-email.query.ts
  - apps/user-service/src/application/queries/get-user-by-username.query.ts
  - apps/user-service/src/application/queries/get-users.query.ts
  - apps/user-service/src/application/queries/index.ts
  - apps/user-service/src/application/handlers/create-user.handler.ts
  - apps/user-service/src/application/handlers/update-user.handler.ts
  - apps/user-service/src/application/handlers/delete-user.handler.ts
  - apps/user-service/src/application/handlers/update-user-profile.handler.ts
  - apps/user-service/src/application/handlers/update-user-settings.handler.ts
  - apps/user-service/src/application/handlers/suspend-user.handler.ts
  - apps/user-service/src/application/handlers/reactivate-user.handler.ts
  - apps/user-service/src/application/handlers/get-user-by-id.handler.ts
  - apps/user-service/src/application/handlers/get-user-by-email.handler.ts
  - apps/user-service/src/application/handlers/get-user-by-username.handler.ts
  - apps/user-service/src/application/handlers/get-users.handler.ts
  - apps/user-service/src/application/handlers/index.ts
  - apps/user-service/src/application/ports/event-publisher.port.ts
  - apps/user-service/src/application/ports/index.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "Each command handler follows the pattern: create/load entity → mutate → repo.save → pullDomainEvents → eventPublisher.publishAll"
    - "Query handlers only read, never mutate"
    - "Event publisher port matches IEventPublisher interface"
  artifacts:
    - "apps/user-service/src/application/commands/ contains 7 command classes"
    - "apps/user-service/src/application/queries/ contains 4 query classes"
    - "apps/user-service/src/application/handlers/ contains 11 handler classes"
    - "apps/user-service/src/application/ports/ contains event publisher port"
---

# Plan 19.2: Application Layer — Commands, Queries, Handlers & Event Publisher Port

## Objective
Create the CQRS application layer with command/query handlers that orchestrate domain logic.
Handlers call domain entities, persist via repository port, and publish events via event publisher port.

Purpose: Implement all use cases for user account management.
Output: 7 commands, 4 queries, 11 handlers, 1 event publisher port.

## Context
- .gsd/phases/19/RESEARCH.md (established handler pattern)
- apps/user-service/src/domain/ (created in Plan 19.1)
- apps/order-service/src/application/ (reference handler pattern)

## Tasks

<task type="auto">
  <name>Create Commands, Queries, and Event Publisher Port</name>
  <files>
    apps/user-service/src/application/commands/create-user.command.ts
    apps/user-service/src/application/commands/update-user.command.ts
    apps/user-service/src/application/commands/delete-user.command.ts
    apps/user-service/src/application/commands/update-user-profile.command.ts
    apps/user-service/src/application/commands/update-user-settings.command.ts
    apps/user-service/src/application/commands/suspend-user.command.ts
    apps/user-service/src/application/commands/reactivate-user.command.ts
    apps/user-service/src/application/commands/index.ts
    apps/user-service/src/application/queries/get-user-by-id.query.ts
    apps/user-service/src/application/queries/get-user-by-email.query.ts
    apps/user-service/src/application/queries/get-user-by-username.query.ts
    apps/user-service/src/application/queries/get-users.query.ts
    apps/user-service/src/application/queries/index.ts
    apps/user-service/src/application/ports/event-publisher.port.ts
    apps/user-service/src/application/ports/index.ts
  </files>
  <action>
    **Commands** — simple data classes, no logic (follow CreateOrderCommand pattern):
    - CreateUserCommand(email: string, username: string)
    - UpdateUserCommand(userId: string, email?: string, username?: string)
    - DeleteUserCommand(userId: string)
    - UpdateUserProfileCommand(userId: string, displayName?: string, avatar?: string, bio?: string, phoneNumber?: string, dateOfBirth?: Date)
    - UpdateUserSettingsCommand(userId: string, emailNotifications?: boolean, pushNotifications?: boolean, smsNotifications?: boolean, language?: string, timezone?: string)
    - SuspendUserCommand(userId: string, reason: string)
    - ReactivateUserCommand(userId: string)

    **Queries** — simple data classes:
    - GetUserByIdQuery(userId: string)
    - GetUserByEmailQuery(email: string)
    - GetUserByUsernameQuery(username: string)
    - GetUsersQuery(page?: number, limit?: number, status?: string)

    **IEventPublisher** port (identical to order-service):
    - `export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER')`
    - Interface: `publish(event)`, `publishAll(events[])`

    Barrel exports from index.ts files.
    AVOID: Adding validation logic in commands — validation belongs in DTOs (interface layer) or VOs (domain).
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>7 commands, 4 queries, and 1 event publisher port created with barrel exports.</done>
</task>

<task type="auto">
  <name>Create Command Handlers (7 handlers)</name>
  <files>
    apps/user-service/src/application/handlers/create-user.handler.ts
    apps/user-service/src/application/handlers/update-user.handler.ts
    apps/user-service/src/application/handlers/delete-user.handler.ts
    apps/user-service/src/application/handlers/update-user-profile.handler.ts
    apps/user-service/src/application/handlers/update-user-settings.handler.ts
    apps/user-service/src/application/handlers/suspend-user.handler.ts
    apps/user-service/src/application/handlers/reactivate-user.handler.ts
  </files>
  <action>
    Follow CreateOrderHandler pattern exactly: `@Injectable()` class with `@Inject(SYMBOL)` constructor params.

    **CreateUserHandler**:
    - Inject: IUserRepository (USER_REPOSITORY), IEventPublisher (EVENT_PUBLISHER), UserMetricsService
    - Logic: Create User via `User.create()` → `repo.save()` → `pullDomainEvents()` → `eventPublisher.publishAll()` → metrics → log → return userId
    - Check uniqueness: `repo.findByEmail()` and `repo.findByUsername()` — throw ConflictException if exists

    **UpdateUserHandler**:
    - Load user by ID → update email/username if provided → save → publishAll → return

    **DeleteUserHandler**:
    - Load user by ID → `user.delete()` (soft-delete via status) → save → publishAll

    **UpdateUserProfileHandler**:
    - Load user by ID → `user.updateProfile(props)` → save → publishAll

    **UpdateUserSettingsHandler**:
    - Load user by ID → `user.updateSettings(props)` → save → publishAll

    **SuspendUserHandler**:
    - Load user by ID → `user.suspend(reason)` → save → publishAll → metrics

    **ReactivateUserHandler**:
    - Load user by ID → `user.reactivate()` → save → publishAll → metrics

    All handlers: use `Logger` from @nestjs/common, start/stop metrics timer.
    AVOID: Not checking if user exists before operating — throw NotFoundException.
    AVOID: Putting business logic in handlers — delegate to domain entity methods.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>7 command handlers created following the repository → domain → events pattern.</done>
</task>

<task type="auto">
  <name>Create Query Handlers (4 handlers)</name>
  <files>
    apps/user-service/src/application/handlers/get-user-by-id.handler.ts
    apps/user-service/src/application/handlers/get-user-by-email.handler.ts
    apps/user-service/src/application/handlers/get-user-by-username.handler.ts
    apps/user-service/src/application/handlers/get-users.handler.ts
    apps/user-service/src/application/handlers/index.ts
  </files>
  <action>
    **GetUserByIdHandler**: Inject IUserRepository → `repo.findById(UserId.create(query.userId))` → return user.toJSON() or throw NotFoundException
    **GetUserByEmailHandler**: Inject IUserRepository → `repo.findByEmail(Email.create(query.email))` → return or throw
    **GetUserByUsernameHandler**: Inject IUserRepository → `repo.findByUsername(Username.create(query.username))` → return or throw
    **GetUsersHandler**: Inject IUserRepository → `repo.findAll({ page, limit, status })` → return { users: users.map(u => u.toJSON()), total, page, limit }

    All query handlers: @Injectable() with @Inject(USER_REPOSITORY), readonly logger.
    Create barrel export index.ts for all 11 handlers (7 command + 4 query).

    AVOID: Mutating state in query handlers — read-only operations only.
    AVOID: Returning raw domain entities — always use toJSON() for serialization.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 query handlers created. Handler index.ts barrel-exports all 11 handlers.</done>
</task>

## Success Criteria
- [ ] 7 command classes (simple data objects)
- [ ] 4 query classes (simple data objects)
- [ ] 7 command handlers following create/load → mutate → save → publish pattern
- [ ] 4 query handlers with read-only operations
- [ ] IEventPublisher port with Symbol token
- [ ] CreateUser checks email/username uniqueness
- [ ] All handlers throw NotFoundException when user not found
- [ ] `npx tsc --noEmit` passes
