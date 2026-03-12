---
phase: 8
plan: 1
wave: 1
---

# Plan 8.1: DDD Scaffold & Domain Layer

## Objective
Set up the Domain-Driven Design (DDD) directory structure for the Auth Service and implement the core, isolated domain entities and value objects required for identity management.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md
- docs/auth-service-architecture.md

## Tasks

<task type="auto">
  <name>Setup DDD Scaffold</name>
  <files>
    - apps/auth-service/src/domain/entities/
    - apps/auth-service/src/domain/value-objects/
    - apps/auth-service/src/application/commands/
    - apps/auth-service/src/infrastructure/database/
    - apps/auth-service/src/interfaces/controllers/
  </files>
  <action>
    - Create the standard DDD directory structure inside `apps/auth-service/src` as specified in the architecture document.
    - Move existing `app.controller.ts` into `interfaces/controllers/` (and update imports).
    - Move `app.service.ts` into `application/services/` (and update imports).
    - Update `app.module.ts` to reflect the new paths.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>The directory structure matches the DDD spec and the auth-service builds successfully.</done>
</task>

<task type="auto">
  <name>Implement Domain Layer (Entities & Value Objects)</name>
  <files>
    - apps/auth-service/src/domain/entities/user.entity.ts
    - apps/auth-service/src/domain/value-objects/email.value-object.ts
    - apps/auth-service/src/domain/value-objects/password.value-object.ts
    - apps/auth-service/src/domain/value-objects/role.enum.ts
  </files>
  <action>
    - Define a `Role` enum (e.g., CUSTOMER, ADMIN).
    - Create an `Email` value object to encapsulate email validation logic.
    - Create a `Password` value object to represent the hashed password string.
    - Create a `User` entity containing id, email, password, role, isEmailVerified, isActive, createdAt, updatedAt.
    - Ensure domain objects have absolutely no dependencies on `@nestjs` or `typeorm`.
  </action>
  <verify>npm run lint --prefix apps/auth-service</verify>
  <done>Domain entities and value objects are implemented with strict boundary isolation.</done>
</task>

## Success Criteria
- [ ] DDD folders exist and boilerplate files are migrated.
- [ ] Domain models are completely unaware of framework/infrastructure code.
- [ ] `auth-service` TypeScript compilation passes successfully.
