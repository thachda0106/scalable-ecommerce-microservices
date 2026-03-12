---
phase: 8
plan: 4
wave: 2
---

# Plan 8.4: Refresh Tokens & Rate Limiting

## Objective
Implement the Redis-backed refresh token rotation flow and secure the authentication endpoints against brute-force attacks via rate limiting.

## Context
- apps/auth-service/src/infrastructure/redis/redis.module.ts
- docs/auth-service-architecture.md

## Tasks

<task type="auto">
  <name>Implement Refresh Token Storage & Rotation</name>
  <files>
    - apps/auth-service/src/infrastructure/redis/token-store.service.ts
    - apps/auth-service/src/application/commands/refresh-token.command.ts
    - apps/auth-service/src/application/handlers/refresh-token.handler.ts
    - apps/auth-service/src/interfaces/controllers/auth.controller.ts
  </files>
  <action>
    - Create `TokenStoreService` using `ioredis` to set keys with pattern `refresh:{userId}:{tokenId}` and a 7-day TTL (`EX` argument).
    - Implement `RefreshTokenHandler` that accepts a refresh token, verifies it in Redis, deletes the *old* token key, generates a *new* pair, and saves the new refresh token (Rotation).
    - Add the `POST /auth/refresh` endpoint to `AuthController`.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>Refresh tokens are strictly tracked in Redis and rotate upon use.</done>
</task>

<task type="auto">
  <name>Implement Rate Limiting & Brute-force Protection</name>
  <files>
    - apps/auth-service/src/app.module.ts
    - apps/auth-service/src/interfaces/controllers/auth.controller.ts
  </files>
  <action>
    - Install `@nestjs/throttler` and `nestjs-throttler-storage-redis`.
    - Configure `ThrottlerModule` globally in `AppModule` using the Redis storage provider.
    - Apply stricter `ThrottlerGuard` overrides on `/auth/login` (e.g., max 5 attempts per minute) to prevent credential stuffing.
  </action>
  <verify>npm run build --prefix apps/auth-service</verify>
  <done>Rate limits are strictly enforced on authentication endpoints.</done>
</task>

## Success Criteria
- [ ] Valid refresh tokens issue new access tokens and invalidate themselves.
- [ ] Redis keys disappear automatically after exactly 7 days.
- [ ] Rapid login attempts result in HTTP 429 Too Many Requests.
