---
phase: 20
plan: 4
wave: 2
---

# Plan 20.4: Security Hardening — JWT, Service Auth & Input Validation

## Objective
Remove hardcoded JWT secret fallback, add HMAC-signed service-to-service authentication, validate internal identity headers in downstream services, and enforce CORS configuration. This prevents authentication bypass and header forgery attacks.

## Context
- .gsd/phases/20/RESEARCH.md (Wave 3 findings)
- apps/api-gateway/src/config/gateway.config.ts
- apps/api-gateway/src/common/http-client.ts

## Tasks

<task type="auto">
  <name>Remove JWT fallback & enforce startup validation</name>
  <files>
    apps/api-gateway/src/config/gateway.config.ts (MODIFY)
    apps/api-gateway/src/main.ts (MODIFY)
  </files>
  <action>
    1. In `gateway.config.ts`, replace:
       ```typescript
       secret: process.env.JWT_SECRET || 'super-secret-key-change-in-prod'
       ```
       With:
       ```typescript
       secret: process.env.JWT_SECRET
       ```
    2. Add startup validation in `main.ts` (before `NestFactory.create`):
       ```typescript
       const requiredEnvVars = ['JWT_SECRET'];
       for (const envVar of requiredEnvVars) {
         if (!process.env[envVar]) {
           throw new Error(`Missing required environment variable: ${envVar}`);
         }
       }
       ```
    3. In production mode, also require `CORS_ORIGIN`:
       ```typescript
       if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
         throw new Error('CORS_ORIGIN required in production');
       }
       ```
    4. Update `.env.example` files with required variables.
  </action>
  <verify>grep -n "super-secret" apps/api-gateway/src/config/gateway.config.ts | wc -l</verify>
  <done>Zero hardcoded secrets; startup fails if JWT_SECRET missing</done>
</task>

<task type="auto">
  <name>Add HMAC-signed internal headers for service-to-service auth</name>
  <files>
    packages/core/src/security/internal-auth.ts (NEW)
    packages/core/src/security/internal-auth.guard.ts (NEW)
    packages/core/src/index.ts (MODIFY)
    apps/api-gateway/src/common/http-client.ts (MODIFY)
  </files>
  <action>
    1. Create `packages/core/src/security/internal-auth.ts`:
       - Export `signInternalHeaders(userId: string, roles: string[], secret: string): Record<string, string>`
         - Creates HMAC-SHA256 signature of `userId + timestamp`
         - Returns headers: `x-user-id`, `x-user-roles`, `x-internal-timestamp`, `x-internal-signature`
       - Export `verifyInternalHeaders(headers: Record<string, string>, secret: string): boolean`
         - Verifies signature and checks timestamp is within 5 minutes (replay protection)
    2. Create `packages/core/src/security/internal-auth.guard.ts`:
       - NestJS Guard that extracts and verifies internal headers
       - Throws 401 if signature invalid or timestamp expired
       - Skips verification if route is marked as `@Public()`
    3. In `api-gateway/http-client.ts`:
       - After setting `x-user-id` and `x-user-roles`, call `signInternalHeaders()` to add signature
    4. Export from `packages/core/src/index.ts`

    **Secret management:** Use `INTERNAL_AUTH_SECRET` env var, shared across all services.
  </action>
  <verify>grep -n "signInternalHeaders\|InternalAuthGuard" packages/core/src/index.ts</verify>
  <done>Both signInternalHeaders and InternalAuthGuard exported from @ecommerce/core</done>
</task>

## Success Criteria
- [ ] Zero hardcoded secrets in any config file
- [ ] API gateway signs all forwarded requests with HMAC
- [ ] `InternalAuthGuard` available in `@ecommerce/core` for downstream services
- [ ] `pnpm -r build` passes
