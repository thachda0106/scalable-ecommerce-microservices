# Auth Service — Production-Level Deep Analysis

> **Scope**: [auth-service](file:///c:/source/apps/auth-service/src) — NestJS CQRS service with DDD architecture  
> **Stack**: TypeScript · NestJS 11 · PostgreSQL (TypeORM) · Redis (ioredis) · Kafka (KafkaJS) · Argon2 · Passport (JWT / Google / GitHub)

---

## 1. BUSINESS RESPONSIBILITY

### What it owns

The auth-service is the **single source of truth for identity and credential management** in the platform. Concretely, it owns:

| Capability | Implementation |
|---|---|
| User credential storage | Argon2 password hashes in `users` table |
| OAuth identity linking | Google + GitHub via Passport strategies |
| JWT access token issuance | 15-minute tokens with `jti`, `sub`, `email`, `role`, `tenantId`, `orgId` |
| Refresh token lifecycle | Opaque 80-hex-char tokens stored in Redis with 7-day TTL |
| Token rotation & revocation | Per-token revocation + bulk `revokeAllUserTokens` via session index |
| Access token blocklist | JTI-based pre-expiry revocation in Redis |
| Brute-force protection | Per-email failed-attempt counter with 5-attempt / 15-minute lockout |
| Account status gating | `isActive` flag checked on every login/refresh |

### What it should NEVER own

| Concern | Why it belongs elsewhere |
|---|---|
| User profile data (addresses, preferences) | Belongs to `user-service` — auth owns the *credential slice*, not the *profile slice* |
| Authorization / RBAC policy evaluation | Auth issues tokens with a `role` claim; **policy enforcement** (e.g., "can this ADMIN delete products?") belongs in the API gateway or a dedicated `authorization-service` |
| Email sending (verification, password reset) | Auth emits `user.registered`; a `notification-service` should consume and send |
| Session management (shopping cart, UI state) | Stateless JWT model — no server-side session state |
| Payment-related PII (card numbers) | Belongs to `payment-service` under PCI scope |

### Real-world analogy

Auth-service is **airport security checkpoint + passport office**. It verifies who you are (login), issues you a boarding pass (JWT), stamps your passport (OAuth linking), and can revoke your boarding pass mid-flight (JTI blocklist). It does NOT decide which gate you go to (authorization) or what's in your luggage (business data).

---

## 2. API SURFACE (SYNC LAYER)

All endpoints live on port `3001`, behind `ThrottlerGuard` (10 req/60s global, Redis-backed).

### `POST /auth/register`

| Aspect | Detail |
|---|---|
| **Purpose** | Create a new local (email + password) user account |
| **Request** | `{ email: string, password: string }` |
| **Response** | `201 { id: string, email: string }` |
| **Validation** | `@IsEmail()`, `@IsNotEmpty()`, `@MinLength(8)`, `whitelist: true` strips unknown fields |
| **Idempotency** | *Not idempotent.* Second call with same email → `409 Conflict`. No idempotency key header. |
| **Rate limiting** | ThrottlerGuard (10/60s per IP). No per-email rate limit on registration. |
| **Handler** | [RegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts) |

### `POST /auth/login`

| Aspect | Detail |
|---|---|
| **Purpose** | Authenticate via email+password, return JWT + refresh token |
| **Request** | `{ email: string, password: string }` |
| **Response** | `200 { accessToken, refreshToken, jti }` |
| **Validation** | `@IsEmail()`, `@IsNotEmpty()` on both fields |
| **Idempotency** | Safe to retry — generates new token pair each time (no side effects beyond Redis write) |
| **Rate limiting** | ThrottlerGuard + **brute-force protection**: 5 failed attempts → 15-min email lockout |
| **Handler** | [LoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts) |

### `POST /auth/refresh`

| Aspect | Detail |
|---|---|
| **Purpose** | Rotate refresh token, blocklist old access token's JTI, issue new pair |
| **Request** | `{ userId, refreshToken, currentJti }` |
| **Response** | `200 { accessToken, refreshToken, jti }` |
| **Validation** | All three fields: `@IsString()`, `@IsNotEmpty()` |
| **Idempotency** | **NOT idempotent.** Old refresh token is immediately revoked. Replaying = `401`. This is deliberate for rotation security. |
| **Rate limiting** | ThrottlerGuard only |
| **Handler** | [RefreshTokenHandler](file:///c:/source/apps/auth-service/src/application/handlers/refresh-token.handler.ts) |

### `POST /auth/logout`

| Aspect | Detail |
|---|---|
| **Purpose** | Revoke refresh token + blocklist access token JTI |
| **Request** | `{ refreshToken, jti?, userId? }` |
| **Response** | `200 { message: "Logged out successfully" }` |
| **Validation** | `refreshToken` required, `jti` and `userId` optional (fallback from `req.user`) |
| **Idempotency** | Effectively idempotent — revoking an already-revoked token is a no-op in Redis |
| **Handler** | [LogoutHandler](file:///c:/source/apps/auth-service/src/application/handlers/logout.handler.ts) |

### `GET /auth/google` → `GET /auth/google/callback`

| Aspect | Detail |
|---|---|
| **Purpose** | Initiate Google OAuth flow; callback handles token issuance |
| **Response** | Sets `refresh_token` HttpOnly cookie + JSON `{ accessToken, jti }` |
| **Handler** | [OAuthController](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts) → [OAuthLoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts) |

### `GET /auth/github` → `GET /auth/github/callback`

Same pattern as Google. Both strategies reject users without verified emails.

### `GET /health`

| Aspect | Detail |
|---|---|
| **Purpose** | Liveness/readiness check for orchestrator (K8s) |
| **Checks** | PostgreSQL ping, Redis ping, heap memory < 512 MB |
| **Handler** | [HealthController](file:///c:/source/apps/auth-service/src/interfaces/controllers/health.controller.ts) |

---

## 3. DATA MODEL (SOURCE OF TRUTH)

### `users` table (PostgreSQL)

```
┌──────────────────────┬──────────────────────────────────────────────────┐
│ Column               │ Type / Constraints                               │
├──────────────────────┼──────────────────────────────────────────────────┤
│ id                   │ UUID PRIMARY KEY (app-generated, crypto.randomUUID) │
│ email                │ VARCHAR UNIQUE NOT NULL                          │
│ passwordHash         │ VARCHAR NULLABLE (null for OAuth-only)            │
│ role                 │ VARCHAR(50) NOT NULL ('CUSTOMER' | 'ADMIN')      │
│ isEmailVerified      │ BOOLEAN DEFAULT false                            │
│ isActive             │ BOOLEAN DEFAULT true                             │
│ provider             │ VARCHAR NULLABLE ('google' | 'github')           │
│ providerId           │ VARCHAR NULLABLE                                 │
│ firstName            │ VARCHAR NULLABLE                                 │
│ lastName             │ VARCHAR NULLABLE                                 │
│ picture              │ VARCHAR NULLABLE                                 │
│ tenantId             │ VARCHAR NULLABLE                                 │
│ orgId                │ VARCHAR NULLABLE                                 │
│ createdAt            │ TIMESTAMP DEFAULT now()                          │
│ updatedAt            │ TIMESTAMP auto-updated                           │
│ version              │ INTEGER @VersionColumn (optimistic locking)      │
└──────────────────────┴──────────────────────────────────────────────────┘
```

**Indexes:**
- `UNIQUE INDEX ON email` — enforced by TypeORM `{ unique: true }` decorator
- `UNIQUE INDEX ON (provider, providerId) WHERE provider IS NOT NULL` — partial unique index prevents duplicate OAuth identities

### Why this data belongs here

The `users` table stores **credentials and identity metadata**, not business data. The `user-service` owns profile enrichment (addresses, preferences, order history). The auth-service needs `email`, `passwordHash`, `provider/providerId`, and `role` to perform its core function. Multi-tenancy fields (`tenantId`, `orgId`) are embedded here so they are baked into the JWT at sign-time — avoiding a cross-service call on every token issuance.

### Read/write patterns

| Operation | Pattern | Frequency |
|---|---|---|
| `findByEmail` | Read | Every login, every registration (duplicate check) |
| `findByProvider` | Read | Every OAuth callback |
| `findById` | Read | Every refresh-token (re-verify active status) |
| `save` | Write | Registration only (infrequent vs. reads) |

**Read-heavy ratio**: ~50:1 in production (logins + refreshes ≫ registrations).

### Indexing strategy

- `email` unique index covers the hottest read path (login)
- `(provider, providerId)` partial unique index covers OAuth lookups
- `id` is PK (B-tree by default)
- **Missing**: No index on `isActive` — not needed since it's always combined with `email` or `id` lookups that already hit an index

### Potential bottlenecks

1. **No connection pooling config** — `TypeOrmModule.forRootAsync` uses TypeORM defaults (10 connections). Under 1000 concurrent logins, the pool becomes a bottleneck.
2. **`save()` uses full entity upsert** — TypeORM's `save()` emits `SELECT` + `INSERT/UPDATE` (2 round trips). For registration, a single `INSERT` would be more efficient.
3. **No read replica routing** — All reads hit the primary. Login reads (`findByEmail`) could be routed to a replica at the cost of slight replication lag on brand-new registrations.

---

## 4. CACHE STRATEGY (REDIS)

Auth-service uses Redis for **three distinct concerns**, none of which cache traditional DB query results:

### 4.1 Refresh Token Store

| Key | Value | TTL |
|---|---|---|
| `refresh:{userId}:{tokenId}` | `userId` (string) | 7 days (604,800s) |
| `sessions:{userId}` | SET of `tokenId` strings | 7 days |

**Why cached**: Refresh tokens are validated on every `/auth/refresh` call. Storing them in Redis avoids a DB round-trip and gives O(1) existence + expiry checks.

**Invalidation**: Explicit revocation via `revokeRefreshToken` (single) or `revokeAllUserTokens` (bulk via session index set). TTL acts as auto-cleanup.

### 4.2 JTI Blocklist

| Key | Value | TTL |
|---|---|---|
| `blocklist:jti:{jti}` | `"1"` | 900s (matches 15m access token lifetime) |

**Why cached**: Checking if an access token has been pre-expiry-revoked must be sub-millisecond and checked by every service validating JWTs. Redis is the right store because the data is ephemeral (auto-expires with the token) and read on every request.

**Invalidation**: TTL-based only. Once the access token would have expired anyway, the blocklist entry self-destructs.

### 4.3 Brute-Force Protection

| Key | Value | TTL |
|---|---|---|
| `login:attempts:{email}` | Counter (integer) | 15 min (900s) |
| `login:locked:{email}` | `"1"` | 15 min |

**Invalidation**: `clearAttempts` on successful login DELs both keys. TTL provides auto-unlock after 15 minutes.

### Cache key design

All keys use **namespaced prefixes** (`refresh:`, `sessions:`, `blocklist:jti:`, `login:attempts:`, `login:locked:`) — prevents key collisions across concerns and enables `SCAN` for operational debugging.

### Failure scenario: stale cache

| Scenario | Impact | Mitigation |
|---|---|---|
| Redis down during login | Token storage fails → user gets tokens but refresh will fail later | Need fallback or circuit breaker |
| Redis down during logout | JTI not blocklisted → revoked access token remains valid for up to 15m | Accept as degraded mode; alert on it |
| Redis returns stale `isLocked` | False-positive lockout for already-unlocked account (unlikely, TTL handles it) | Non-issue in practice |

---

## 5. ASYNC COMMUNICATION (EVENTS / KAFKA)

### Events Produced

| Topic | Payload | Trigger | Handler |
|---|---|---|---|
| `user.registered` | `{ userId, email, timestamp, provider?, providerId? }` | After `save()` in RegisterHandler / OAuthRegisterHandler | Register, OAuthRegister |
| `user.logged_in` | `{ userId, email, timestamp, provider? }` | After successful credential/OAuth verification + token issuance | Login, OAuthLogin |
| `user.login_failed` | `{ email, reason, timestamp }` | On invalid credentials / inactive account | Login (best-effort) |
| `user.oauth_linked` | `{ userId, provider, providerId, timestamp }` | When existing email account gets OAuth identity linked | OAuthLogin |

### Events Consumed

**None.** The auth-service is a **pure event producer**. It does not subscribe to any Kafka topics.

### Delivery Guarantees

- **At-most-once currently**: `kafkaClient.emit()` is fire-and-forget inside a `try/catch`. If Kafka is down or the producer buffer is full, the event is silently lost (logged as error).
- **No outbox pattern**: The DB write and Kafka emit are NOT in the same transaction. A crash between `userRepository.save()` and `kafkaClient.emit()` means the user is persisted but `user.registered` is never emitted → downstream services (user-service, notification-service) never learn about the new user.

### Idempotency handling for consumers

Not applicable — auth-service does not consume events.

### Ordering concerns

- Events use KafkaJS `LegacyPartitioner` — messages go to a partition based on the message key. Currently **no explicit key is set** in `emit()` calls, which means Kafka will use round-robin partitioning → **no ordering guarantee** even for events about the same user.
- For correct ordering, the `userId` should be used as the message key so all events for a user go to the same partition.

---

## 6. REQUEST FLOW (END-TO-END)

### Flow: User Login (email + password)

```
Client                API Gateway         auth-service             Redis              PostgreSQL       Kafka
  │                       │                    │                     │                    │              │
  │── POST /auth/login ──▶│                    │                     │                    │              │
  │                       │── Forward ────────▶│                     │                    │              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ isLocked(email) ──▶│                    │              │
  │                       │                    │◀── false ───────────│                    │              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ findByEmail ──────────────────────────▶│              │
  │                       │                    │◀── User entity ────────────────────────│              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ argon2.verify ────▶│ (CPU-bound)        │              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ clearAttempts ────▶│                    │              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ jwt.sign ─────────▶│ (CPU-bound)        │              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ storeRefreshToken▶│                    │              │
  │                       │                    │◀── OK ──────────────│                    │              │
  │                       │                    │                     │                    │              │
  │                       │                    │─ emit(user.logged_in) ─────────────────────────────────▶│
  │                       │                    │                     │                    │              │
  │                       │◀── 200 tokens ─────│                     │                    │              │
  │◀── 200 ───────────────│                    │                     │                    │              │
```

### Where latency happens

| Step | Typical Latency | Why |
|---|---|---|
| `isLocked` Redis check | < 1ms | PING + GET |
| `findByEmail` PostgreSQL | 1–5ms | Indexed lookup, connection pool |
| `argon2.verify` | **50–200ms** | CPU-bound hash verification — **dominates total latency** |
| `storeRefreshToken` Redis SET + SADD | < 1ms | Two Redis writes |
| `kafkaClient.emit` | 1–10ms | Async buffer flush (fire-and-forget) |
| **Total** | **~60–220ms** | Argon2 is the bottleneck |

### Where failures can happen

1. **Redis down at `isLocked` check** → Unhandled exception → `500`. Should fail-open (allow login) with alert.
2. **PostgreSQL down at `findByEmail`** → `500`. Non-recoverable for this request.
3. **Argon2 contention** → Event loop stalls under high concurrency. Argon2 uses memory-hard hashing (64 MB default). 100 concurrent logins = 6.4 GB memory pressure.
4. **Redis down at `storeRefreshToken`** → Tokens generated but refresh won't work later. Should reject login with `503`.
5. **Kafka down** → Event silently dropped (caught in try/catch). Non-blocking.

---

## 7. CONSISTENCY & TRANSACTIONS

### Local transactions

**No explicit database transaction wrapping exists in any handler.** Each handler calls `userRepository.save()` as a standalone operation. The CQRS command/query handlers do not use `@Transaction()` or `DataSource.transaction()`.

### Registration consistency gap

```
RegisterHandler.execute():
  1. findByEmail()      ← read
  2. userRepository.save()  ← write
  3. kafkaClient.emit()    ← fire-and-forget
```

- Steps 1–2 have a **TOCTOU race**: Two concurrent registrations with the same email can both pass the `findByEmail` check. The `UNIQUE` constraint on `email` will cause one to fail with a database exception — but it'll be an unhandled TypeORM `QueryFailedError`, not a clean `409`.
- Steps 2–3 are **not atomic**: DB write succeeds but Kafka emit can fail → user exists in DB but `user.registered` event never fires.

### Refresh token rotation consistency

```
RefreshTokenHandler.execute():
  1. getUserIdByRefreshToken()  ← Redis read
  2. findById()                ← DB read  
  3. blocklistJti()            ← Redis write
  4. revokeRefreshToken()      ← Redis write
  5. generateTokens()          ← CPU
  6. storeRefreshToken()       ← Redis write
```

Steps 3–6 are **not atomic in Redis**. If the process crashes between step 4 (revoke old) and step 6 (store new), the user has no valid refresh token. A Redis `MULTI/EXEC` pipeline would fix this.

### Compensation logic

**None exists.** There are no Saga patterns, no compensating commands, no outbox table. Every handler follows the pattern: "do DB thing, try Kafka, move on."

### Edge cases (partial success)

| Scenario | Result | User Impact |
|---|---|---|
| Register: DB save succeeds, Kafka fails | User can login but downstream services never see `user.registered` | Profile not created in user-service |
| Refresh: Old token revoked, crash before new token stored | User must re-login | Session lost |
| OAuth register + immediately OAuth login | Race on `findByProvider` → possible duplicate user creation | Should handle with `ON CONFLICT` |

---

## 8. FAILURE MODES (CRITICAL)

### 8.1 PostgreSQL Down

| What happens now | Impact | How to improve |
|---|---|---|
| All login/register/refresh calls fail with `500` | **Total auth outage** | Add circuit breaker (`@nestjs/terminus` already checks DB). Return `503` with `Retry-After` header. For login, consider a short-lived cache of recently authenticated users in Redis. |

### 8.2 Redis Down

| What happens now | Impact | How to improve |
|---|---|---|
| `isLocked` → unhandled exception → `500` | Login broken even though DB is fine | Fail-open pattern: catch Redis errors in `LoginAttemptService`, allow login, set degraded-mode metric. |
| `storeRefreshToken` → unhandled exception → `500` | Tokens generated but never stored | Wrap in try/catch, return tokens anyway, retry store asynchronously. Or reject with `503`. |
| JTI blocklist unavailable → revoked tokens remain valid | Security degradation for ≤15m | Accept as known degraded mode. Alert on Redis health. |

### 8.3 Kafka Down

| What happens now | Impact | How to improve |
|---|---|---|
| Events silently dropped (caught in try/catch with log) | Downstream data inconsistency (user-service doesn't know about new users) | Implement **outbox pattern**: write event to `outbox` table inside the same DB transaction as the user write. A separate relay process polls `outbox` and publishes to Kafka. |

### 8.4 Duplicate Events

| What happens now | Impact | How to improve |
|---|---|---|
| Kafka can deliver events more than once if producer retries | Downstream consumers may process `user.registered` twice → duplicate user profiles | Consumers should deduplicate by `userId` + `timestamp`. Auth-service should include an `eventId` (UUID) in every event payload. |

### 8.5 Race Conditions (concurrent registration)

| What happens now | Impact | How to improve |
|---|---|---|
| Two `POST /auth/register` with same email → both pass `findByEmail`, one `save()` fails with raw TypeORM error | Ugly `500` instead of clean `409` | Catch `QueryFailedError` with code `23505` (unique violation) and map to `ConflictException`. |

### 8.6 Network Timeout (client to auth-service)

| What happens now | Impact | How to improve |
|---|---|---|
| Client times out during login → retries → gets different tokens | No issue (login is idempotent modulo new token generation) | Non-issue |
| Client times out during refresh → retries with old refresh token that was already revoked | `401` → user must re-login | Implement a short grace period: don't immediately delete old refresh token, mark it as "rotating" for 30s. |

---

## 9. CONCURRENCY & DATA RACE

### 9.1 Registration race (same email)

**Where**: [RegisterHandler L36-41](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts#L36-L41) — `findByEmail` → `save` without a lock.

**Current mitigation**: DB `UNIQUE` constraint on `email` throws at `save()` time.  
**Problem**: The error is unhandled as a domain exception — it surfaces as `500` instead of `409`.  
**Fix**: Catch `QueryFailedError` with unique violation code.

### 9.2 Concurrent refresh with same token

**Where**: Two `/auth/refresh` requests arrive simultaneously with the same `refreshToken`.

- Both pass the `getUserIdByRefreshToken` check (the token exists)
- Both revoke the old token (second `DEL` is a no-op)
- Both store a new token → user ends up with TWO valid refresh tokens from a single old one

**Fix**: Use Redis `GETDEL` (atomic get-and-delete) instead of separate `GET` + `DEL`. Or use a Lua script for atomic check-and-revoke.

### 9.3 Optimistic locking gap

The ORM entity has `@VersionColumn()`, but `UserRepository.save()` does NOT pass the `version` field from the domain entity to the ORM entity — the version column is managed by TypeORM automatically. This means:

- If two handlers (e.g., OAuthLogin + password-based Login) simultaneously save the same user, TypeORM will throw `OptimisticLockVersionMismatchError`
- This error is **not caught** anywhere → `500`

**Fix**: Catch `OptimisticLockVersionMismatchError` and retry.

### 9.4 Locking strategy

| Mechanism | Where | Type |
|---|---|---|
| DB `UNIQUE` constraint | `email`, `(provider, providerId)` | Pessimistic (DB-level) |
| `@VersionColumn` | User updates | Optimistic (application-level) |
| Redis TTL | Token expiry | Time-based |
| No distributed locks | — | Gap |

**Missing**: No Redis-based distributed lock for critical sections (e.g., OAuth account linking could benefit from a `LOCK:user:{email}` key).

### 9.5 Idempotency keys

**Not implemented.** None of the endpoints accept an `Idempotency-Key` header. For registration, this means a network retry could create duplicate users (mitigated only by the email unique constraint).

---

## 10. SECURITY

### 10.1 Authentication & Authorization

| Layer | Implementation |
|---|---|
| Password hashing | **Argon2** (memory-hard, timing-safe, argon2id default) |
| JWT signing | HMAC-SHA256 via `@nestjs/jwt` with `JWT_SECRET` env var |
| OAuth | Passport strategies (Google, GitHub) with verified-email-only policy |
| Refresh token format | **Opaque** high-entropy ( `crypto.randomBytes(40).toString('hex')` = 80 hex chars = 320 bits entropy) |
| Access token revocation | JTI blocklist in Redis |

### 10.2 Sensitive data handling

| Data | Protection |
|---|---|
| Password | Argon2 hash — raw password never stored or logged |
| JWT Secret | Loaded from `JWT_SECRET` env var, fail-fast at module load |
| OAuth secrets | Loaded from env vars, fail-fast in strategy constructor |
| Refresh tokens | Stored in Redis (not in DB), HttpOnly + Secure + SameSite=Strict cookie for OAuth flow |

> [!WARNING]
> **JWT Secret is symmetric (HMAC)**. Every service that validates JWTs needs the same `JWT_SECRET`. If any service is compromised, all tokens can be forged. Migration to **RSA/ECDSA asymmetric signing** (private key in auth-service, public key distributed) is strongly recommended.

### 10.3 Abuse scenarios

| Attack | Current Protection | Gap |
|---|---|---|
| **Credential stuffing** | 5-attempt lockout per email + ThrottlerGuard (10/60s per IP) | No CAPTCHA, no device fingerprinting. IP-based throttling defeated by rotating proxies. |
| **Replay attack** | JTI blocklist + refresh token rotation (single-use) | If attacker steals refresh token and uses it before legitimate user, the legitimate user's refresh fails (but attacker has new tokens). **No token-family-based reuse detection.** |
| **JWT forgery** | HMAC-SHA256 signing | Symmetric key → shared secret risk |
| **OAuth CSRF** | Passport's default `state` parameter handling | No explicit `state` validation in the controller — relying on Passport internals |
| **Account enumeration** | Same "Invalid credentials" message for non-existent user and wrong password | `user.login_failed` Kafka event contains `reason: "User not found or inactive"` — if event consumers log this, it leaks account existence |
| **Token theft (XSS)** | OAuth uses HttpOnly cookie for refresh token | Local login returns refresh token in JSON body — vulnerable to XSS-based exfiltration |

---

## 11. SCALABILITY

### Horizontal scaling

| Component | Scaling model | Notes |
|---|---|---|
| auth-service (NestJS) | **Stateless** — horizontally scalable behind a load balancer | JWT signing is CPU-bound, not memory-bound. Argon2 IS memory-bound (~64 MB/hash). |
| PostgreSQL | Single primary (writes) + read replicas (reads) | Login reads can be routed to replicas. Registration writes must hit primary. |
| Redis | Single node or Redis Cluster with hash-tag partitioning | All keys are user-scoped → `{userId}` hash tag enables cluster-safe operations |
| Kafka | Scale by adding partitions to `user.*` topics | Need message key = `userId` for ordered delivery |

### Stateless vs stateful

- **Stateless**: Service instances, JWT validation
- **Stateful**: Redis (token store), PostgreSQL (user credentials)

### Bottlenecks under high load

| Bottleneck | Threshold | Mitigation |
|---|---|---|
| **Argon2 CPU/memory** | ~50 concurrent logins per node × 64 MB = 3.2 GB | Tune Argon2 memory/parallelism parameters. Consider dedicated login worker pool. |
| **Redis connections** | ioredis default pool (1 connection per module) | Use connection pooling or Redis Cluster |
| **PostgreSQL pool** | TypeORM default 10 connections | Configure `extra: { max: 50 }` in TypeORM options |
| **Kafka producer** | Back-pressure if broker is slow | Enable producer batching (`linger.ms`, `batch.size`) |
| **JWT signing** | CPU-bound HMAC on every login | Negligible compared to Argon2 |

---

## 12. OBSERVABILITY

### Logging strategy

| In place | Detail |
|---|---|
| Structured logger | `@ecommerce/core` `Logger` used throughout handlers |
| Error logging | Kafka emit failures logged with `logger.error` |
| **Missing** | No request-level logging middleware (request ID, duration, path). No correlation ID propagation. |

### Metrics (what should be monitored)

| Metric | Type | Why |
|---|---|---|
| `auth.login.total` | Counter (label: `result=success\|failure\|locked`) | Track login success rate, detect credential stuffing |
| `auth.register.total` | Counter | Anomaly detection (spike = bot registration) |
| `auth.refresh.total` | Counter (label: `result=success\|revoked\|expired`) | Track token rotation health |
| `auth.argon2.duration_ms` | Histogram | Detect CPU contention |
| `auth.redis.errors` | Counter | Redis connectivity health |
| `auth.kafka.emit.errors` | Counter | Kafka reliability |
| `auth.lockout.triggered` | Counter | Brute-force attack detection |

> [!NOTE]
> **Currently, none of these metrics are implemented.** The service has no Prometheus/StatsD integration. The `@ecommerce/core` package provides tracing (`initTracing('auth-service')`) but no metrics exporter.

### Tracing

- OpenTelemetry tracing initialized via `initTracing('auth-service')` in [main.ts](file:///c:/source/apps/auth-service/src/main.ts#L7)
- Spans should propagate from API gateway → auth-service → Redis/PostgreSQL/Kafka
- **Missing**: No custom spans around Argon2 operations or Redis calls

### What to monitor in production

| Alert | Condition | Severity |
|---|---|---|
| Login failure rate > 20% | 5-min rolling window | P2 — possible credential stuffing |
| Lockout rate > 50/min | — | P1 — active brute-force attack |
| Redis latency p99 > 10ms | — | P2 — degraded token operations |
| Kafka emit failure rate > 1% | — | P2 — event reliability degraded |
| Health check failure | `/health` returns non-2xx | P1 — service unhealthy |
| Memory RSS > 400 MB | Per pod | P2 — approaching OOM (512 MB check in health) |

---

## 13. IMPROVEMENTS (VERY IMPORTANT)

### P0 — Must fix before production

| Improvement | What | Trade-off |
|---|---|---|
| **Outbox pattern for Kafka events** | Write event to `outbox` table inside the same DB transaction as the user write. Relay process polls and publishes. | Adds complexity (outbox table, relay/Debezium), but eliminates the "user exists, event lost" failure mode. |
| **Handle unique constraint violations** | Catch TypeORM `QueryFailedError` (code `23505`) in RegisterHandler and map to `409 Conflict`. | Trivial to implement. No trade-off. |
| **Atomic refresh token rotation** | Use Redis `GETDEL` or Lua script to atomically validate + revoke old token. | Prevents double-spend of refresh tokens. Minor complexity increase. |
| **Asymmetric JWT signing** | Switch from HMAC-SHA256 to RS256/ES256. Auth-service holds private key; all other services use public key. | Key distribution complexity, slightly slower signing (~2ms vs ~0.1ms). Massive security improvement. |
| **Refresh token in HttpOnly cookie (all flows)** | Login endpoint should also set refresh token in HttpOnly cookie, not return in JSON body. | Requires frontend changes. Eliminates XSS-based token theft. |

### P1 — Should fix for production readiness

| Improvement | What | Trade-off |
|---|---|---|
| **Redis circuit breaker** | Wrap Redis calls with circuit breaker (e.g., `opossum`). Login should fail-open if Redis is down for lockout checks. | Additional dependency. Slightly more complex error handling. |
| **Refresh token family / reuse detection** | Track token lineage. If a revoked token is used, revoke ALL tokens in the family (indicates theft). | More Redis keys, more complex rotation logic. Best-in-class security. |
| **Idempotency key on registration** | Accept `Idempotency-Key` header. Store result in Redis with 24h TTL. Return cached response on replay. | Redis memory cost. Prevents duplicate registrations on network retry. |
| **Prometheus metrics exporter** | Add `@willsoto/nestjs-prometheus` or manual `prom-client` histogram/counter for all operations. | Minor setup, major observability gain. |
| **Request ID / correlation ID middleware** | Generate or propagate `X-Request-Id` through all logs and Kafka events. | Essential for distributed tracing. Trivial to implement. |
| **DB connection pool tuning** | Set `extra: { max: 50, connectionTimeoutMillis: 5000 }` in TypeORM config. | Increases DB resource usage. Prevents pool exhaustion under load. |

### P2 — Nice to have

| Improvement | What | Trade-off |
|---|---|---|
| **Password strength validation** | Beyond `MinLength(8)`: require uppercase, number, special char via regex in DTO. | Slightly worse UX. Better security. |
| **Email verification flow** | After registration, emit `verification.requested` event. Block login until `isEmailVerified = true`. | Requires notification-service integration. Prevents spam accounts. |
| **Rate limit per email (not just IP)** | Email-scoped rate limit on `/auth/register` to prevent mass bot registration. | Additional Redis counter. |
| **Kafka message key** | Set `key: userId` on all `emit()` calls for partition-level ordering. | Trivial change. Ensures event ordering per user. |

---

## 14. TL;DR FOR SENIOR ENGINEER

### What matters most

1. **Auth-service is a pure identity & credential service** — issues JWT tokens, manages refresh lifecycle, handles OAuth linking. It is stateless (JWT) with Redis as the hot-path store for tokens and lockouts.
2. **CQRS with command/query separation** is well-structured. DDD boundaries (value objects, domain ports, ORM mapping) are clean and properly encapsulated.
3. **Brute-force protection** is in place (5 attempts / 15-min lockout), **token rotation** with JTI blocklist is solid, and **OAuth strategies reject unverified emails**.

### What is risky

1. **No outbox pattern** → Kafka events can be silently lost after DB commit. If `user.registered` is ever dropped, downstream services will have an inconsistent view of the system. This is the **#1 production risk**.
2. **Symmetric JWT secret** → Every service that validates tokens holds the signing key. One compromised service = all tokens forgeable.
3. **Concurrent refresh token race** → Two simultaneous refresh requests can "double-spend" a token, creating two valid sessions from one.
4. **Registration unique constraint errors** → Surface as raw `500` errors instead of `409`.

### What to watch in production

- **Argon2 memory pressure** under concurrent logins (64 MB × N concurrent = potential OOM)
- **Redis availability** — if Redis goes down, the entire auth flow breaks (no circuit breaker / fail-open)
- **Kafka emit failures** — silently logged, no retry, no outbox → data drift
- **Login failure spike** → brute-force indicator (currently no metric to alert on)
- **Refresh token usage patterns** → anomalous reuse = potential token theft
