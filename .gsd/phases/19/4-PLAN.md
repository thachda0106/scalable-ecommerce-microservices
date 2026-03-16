---
phase: 19
plan: 4
wave: 2
depends_on: [1, 2]
files_modified:
  - apps/user-service/src/interfaces/dto/create-user.dto.ts
  - apps/user-service/src/interfaces/dto/update-user.dto.ts
  - apps/user-service/src/interfaces/dto/update-user-profile.dto.ts
  - apps/user-service/src/interfaces/dto/update-user-settings.dto.ts
  - apps/user-service/src/interfaces/dto/suspend-user.dto.ts
  - apps/user-service/src/interfaces/dto/get-users-query.dto.ts
  - apps/user-service/src/interfaces/dto/index.ts
  - apps/user-service/src/interfaces/controllers/user.controller.ts
  - apps/user-service/src/interfaces/controllers/health.controller.ts
  - apps/user-service/src/interfaces/user.module.ts
  - apps/user-service/src/app.module.ts
  - apps/user-service/src/main.ts
  - apps/user-service/package.json
autonomous: true
user_setup: []

must_haves:
  truths:
    - "UserController is thin — delegates entirely to handlers"
    - "DTOs use class-validator decorators for input validation"
    - "Module wiring uses Symbol tokens to bind ports to implementations"
    - "App bootstraps with TypeORM, ThrottlerModule, and ScheduleModule"
  artifacts:
    - "apps/user-service/src/interfaces/dto/ contains 6 DTO classes"
    - "apps/user-service/src/interfaces/controllers/ contains UserController and HealthController"
    - "apps/user-service/src/interfaces/user.module.ts wires all ports"
---

# Plan 19.4: Interface Layer — DTOs, Controller, Module Wiring & Dependencies

## Objective
Create the interface layer with validated DTOs, thin controller, module wiring, and install all dependencies.

Purpose: Complete the NestJS integration layer and make the service runnable.
Output: 6 DTOs, UserController, HealthController, UserModule, updated AppModule/main.ts, installed dependencies.

## Context
- .gsd/phases/19/RESEARCH.md (dependencies list, rate limiting)
- apps/user-service/src/domain/ (Plan 19.1)
- apps/user-service/src/application/ (Plan 19.2)
- apps/order-service/src/interfaces/ (reference controller + module pattern)

## Tasks

<task type="auto">
  <name>Install Dependencies and Create DTOs</name>
  <files>
    apps/user-service/package.json
    apps/user-service/src/interfaces/dto/create-user.dto.ts
    apps/user-service/src/interfaces/dto/update-user.dto.ts
    apps/user-service/src/interfaces/dto/update-user-profile.dto.ts
    apps/user-service/src/interfaces/dto/update-user-settings.dto.ts
    apps/user-service/src/interfaces/dto/suspend-user.dto.ts
    apps/user-service/src/interfaces/dto/get-users-query.dto.ts
    apps/user-service/src/interfaces/dto/index.ts
  </files>
  <action>
    **Install dependencies** via pnpm (in apps/user-service/):
    ```
    pnpm add typeorm @nestjs/typeorm pg prom-client class-validator class-transformer @nestjs/throttler @nestjs/config @nestjs/schedule uuid kafkajs
    pnpm add -D @types/uuid
    ```

    **DTOs** with class-validator decorators:

    **CreateUserDto**: @IsEmail() email, @IsString() @Length(3, 30) @Matches(/^[a-zA-Z0-9_]+$/) username
    **UpdateUserDto**: @IsOptional() @IsEmail() email, @IsOptional() @IsString() @Length(3, 30) username
    **UpdateUserProfileDto**: all optional — displayName, avatar (@IsUrl), bio (@MaxLength(500)), phoneNumber, dateOfBirth (@IsDateString)
    **UpdateUserSettingsDto**: all optional booleans — emailNotifications, pushNotifications, smsNotifications; optional strings — language (@Length(2,5)), timezone
    **SuspendUserDto**: @IsString() @IsNotEmpty() reason
    **GetUsersQueryDto**: @IsOptional() @Type(() => Number) @IsInt() @Min(1) page, @IsInt() @Min(1) @Max(100) limit, @IsOptional() @IsEnum(UserStatusEnum) status

    Barrel export from index.ts.
    AVOID: Using @Transform for simple types — use @Type from class-transformer instead.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>All dependencies installed. 6 DTO classes created with class-validator decorators.</done>
</task>

<task type="auto">
  <name>Create Controllers, Module Wiring, and Update AppModule/Main</name>
  <files>
    apps/user-service/src/interfaces/controllers/user.controller.ts
    apps/user-service/src/interfaces/controllers/health.controller.ts
    apps/user-service/src/interfaces/user.module.ts
    apps/user-service/src/app.module.ts
    apps/user-service/src/main.ts
  </files>
  <action>
    **UserController** — thin REST controller delegating to handlers:
    - @Controller('users')
    - POST '/' → CreateUserHandler.execute(new CreateUserCommand(...dto))
    - GET '/' → GetUsersHandler.execute(new GetUsersQuery(...query))
    - GET '/:id' → GetUserByIdHandler.execute(new GetUserByIdQuery(id))
    - PATCH '/:id' → UpdateUserHandler.execute(new UpdateUserCommand(id, ...dto))
    - DELETE '/:id' → DeleteUserHandler.execute(new DeleteUserCommand(id))
    - PATCH '/:id/profile' → UpdateUserProfileHandler.execute(...)
    - PATCH '/:id/settings' → UpdateUserSettingsHandler.execute(...)
    - POST '/:id/suspend' → SuspendUserHandler.execute(...)
    - POST '/:id/reactivate' → ReactivateUserHandler.execute(...)
    - Uses @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
    - Returns appropriate HTTP status codes (201 for create, 200 for reads/updates, 204 for delete)

    **HealthController** — simple health endpoint:
    - @Controller('health')
    - GET '/' → { status: 'ok', service: 'user-service', timestamp }

    **UserModule** (follow OrderModule pattern exactly):
    - imports: TypeOrmModule.forFeature([UserOrmEntity, UserProfileOrmEntity, UserSettingsOrmEntity, OutboxEventOrmEntity]), ScheduleModule.forRoot()
    - controllers: UserController, HealthController, MetricsController
    - providers: port bindings (USER_REPOSITORY → TypeOrmUserRepository, EVENT_PUBLISHER → KafkaEventPublisher), all handlers, KafkaClientFactory, OutboxRelayService, UserMetricsService

    **AppModule** — replace scaffold:
    - imports: ConfigModule.forRoot(), TypeOrmModule.forRoot(dbConfig), ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 100 }] }), getLoggerModule(), UserModule
    - Delete old app.controller.ts, app.service.ts, app.controller.spec.ts

    **main.ts** — update:
    - Enable ValidationPipe globally
    - Set global prefix 'api'
    - Listen on PORT env or 3003

    AVOID: Business logic in controller methods — only construct commands/queries and delegate.
    AVOID: Not using ValidationPipe — all input must be validated.
  </action>
  <verify>npx tsc --noEmit --project apps/user-service/tsconfig.json 2>&1 | head -20</verify>
  <done>UserController with 9 endpoints, HealthController, UserModule with full port wiring, updated AppModule and main.ts. Old scaffold files removed.</done>
</task>

## Success Criteria
- [ ] 6 DTO classes with class-validator decorators
- [ ] UserController with 9 REST endpoints (thin delegation)
- [ ] HealthController with health check
- [ ] UserModule wires all ports via Symbol tokens (matches OrderModule pattern)
- [ ] AppModule configures TypeORM, Throttler, Config, Logger
- [ ] main.ts enables ValidationPipe globally
- [ ] Old scaffold files (app.controller, app.service) removed
- [ ] All new dependencies installed
- [ ] `npx tsc --noEmit` passes
