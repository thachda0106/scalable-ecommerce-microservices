---
phase: 9
plan: 3
wave: 2
depends_on: [2]
files_modified:
  - apps/api-gateway/src/guards/jwt.guard.ts
  - apps/api-gateway/src/middleware/rate-limit.middleware.ts
  - apps/api-gateway/src/app.module.ts
autonomous: true
must_haves:
  truths:
    - "JWT access tokens issued by auth-service are verified at the gateway level"
    - "Unauthenticated requests are rejected before hitting downstream microservices (except auth endpoints)"
    - "Rate limiting restricts IPs to 100 requests per minute"
  artifacts:
    - "apps/api-gateway/src/guards/jwt.guard.ts exists"
---

# Plan 9.3: Security & Rate Limiting

<objective>
Implement JWT token verification to protect downstream services and add Redis-backed rate limiting.
Purpose: Secure the boundary, extract user identity to pass context downward, and prevent abuse (DDoS).
Output: JWT Global Guard and Throttler setup.
</objective>

<context>
Load for context:
- .gsd/ROADMAP.md
- apps/api-gateway/src/app.module.ts
</context>

<tasks>

<task type="auto">
  <name>Implement JWT Verification</name>
  <files>
    - apps/api-gateway/src/guards/jwt.guard.ts
    - apps/api-gateway/src/common/http-client.ts
    - apps/api-gateway/src/app.module.ts
  </files>
  <action>
    Create `jwt.guard.ts` using `@nestjs/jwt` or `jsonwebtoken` to verify bearer tokens.
    Extract the user payload (`id`, `role`) and inject it into the `req.user` context.
    Update `common/http-client.ts` to attach `x-user-id` and `x-user-role` headers to outgoing downstream requests if `req.user` is present.
    Apply the guard globally in `AppModule` but ensure `/auth/*` proxy endpoints are ignored (unauthenticated).
  </action>
  <verify>npm run lint --prefix apps/api-gateway</verify>
  <done>JWT Guard extracts identity and passes headers; Auth Service endpoints bypass it automatically</done>
</task>

<task type="auto">
  <name>Add Redis Rate Limiting</name>
  <files>
    - apps/api-gateway/package.json
    - apps/api-gateway/src/app.module.ts
  </files>
  <action>
    Install `@nestjs/throttler` and `nestjs-throttler-storage-redis` in `apps/api-gateway`.
    Configure `ThrottlerModule` in `AppModule` to establish a base policy: limit `100` requests within `60000` TTL (1 minute) per IP Address.
    Bind `ThrottlerGuard` globally to protect all routed traffic.
  </action>
  <verify>npm run build --prefix apps/api-gateway</verify>
  <done>Gateway application connects to Redis and rate limits excess requests</done>
</task>

</tasks>

<verification>
After all tasks, verify:
- [ ] `@nestjs/throttler` installed in `apps/api-gateway`
- [ ] `jwt.guard.ts` correctly ignores `/auth` routes
</verification>

<success_criteria>
- [ ] All tasks verified
- [ ] Must-haves confirmed
</success_criteria>
