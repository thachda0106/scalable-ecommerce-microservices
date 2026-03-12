---
phase: 8
plan: 3
wave: 2
---

# Plan 8.3: Identity Use Cases & JWT

## Objective
Implement the core identity use cases (Register, Login) with Argon2 password hashing and generate the appropriate JWT access tokens.

## Context
- apps/auth-service/src/domain/entities/user.entity.ts
- docs/auth-service-architecture.md

## Tasks

<task type="auto">
  <name>Implement Identity Use Cases (Register, Login)</name>
  <files>
    - apps/auth-service/src/application/commands/register.command.ts
    - apps/auth-service/src/application/handlers/register.handler.ts
    - apps/auth-service/src/application/queries/login.query.ts
    - apps/auth-service/src/application/handlers/login.handler.ts
    - apps/auth-service/src/interfaces/dto/auth.dto.ts
    - apps/auth-service/src/interfaces/controllers/auth.controller.ts
  </files>
  <action>
    - Install `argon2`.
    - Create `RegisterCommand` and the corresponding handler which hashes the password using `argon2` and saves the user.
    - Create `LoginQuery` and its handler which validates credentials using `argon2.verify()`.
    - Create `AuthController` handling `POST /auth/register` and `POST /auth/login`.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>User registration and login endpoints exist and can hash/verify passwords.</done>
</task>

<task type="auto">
  <name>Implement JWT Token Generation</name>
  <files>
    - apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts
    - apps/auth-service/src/infrastructure/jwt/jwt.module.ts
    - apps/auth-service/src/application/handlers/login.handler.ts
  </files>
  <action>
    - Install `@nestjs/jwt` and `@nestjs/passport` in the auth service.
    - Implement a `JwtAdapterService` that signs stateless access tokens (15m expiry) and opaque refresh tokens (7d expiry) based on the user domain payload.
    - Update `LoginHandler` to dispatch token generation upon successful credential verification.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>Successful logins return both an access token and a refresh token.</done>
</task>

## Success Criteria
- [ ] Users can be registered and their passwords are mathematically hashed with argon2.
- [ ] Login returns a JWT containing the correct sub and role claims.
