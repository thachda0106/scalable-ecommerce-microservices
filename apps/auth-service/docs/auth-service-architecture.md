# Auth Service — Deep Architectural Analysis

> **Stack**: NestJS 11 · TypeORM · PostgreSQL · Redis (ioredis) · Kafka · Passport · Argon2 · JWT  
> **Patterns**: DDD · CQRS · Ports & Adapters (Hexagonal) · Repository · Command/Query Segregation

---

## STEP 1 — Folder Structure Overview

```
apps/auth-service/src/
├── main.ts                        # Bootstrap (Swagger, CORS, ValidationPipe, shutdown)
├── app.module.ts                  # Root NestJS module — wires all sub-modules
├── domain/                        # ① Core domain — pure TypeScript, zero framework deps
│   ├── entities/                  # Aggregate roots / domain objects
│   ├── value-objects/             # Immutable typed wrappers (Email, Password, Role)
│   ├── events/                    # Domain event payloads (plain classes)
│   └── ports/                     # Interfaces the domain exposes to the outside world
├── application/                   # ② Orchestration layer — use-case logic
│   ├── commands/                  # Write-side messages (RegisterCommand, LogoutCommand…)
│   ├── queries/                   # Read-side messages (LoginQuery)
│   ├── handlers/                  # CQRS handlers — one per command/query
│   └── services/                  # Cross-cutting application services (brute-force guard)
├── infrastructure/                # ③ Adapters to external world
│   ├── database/                  # TypeORM ORM entity + UserRepository (port impl.)
│   ├── jwt/                       # JwtAdapterService + AuthJwtModule
│   ├── redis/                     # TokenStoreService + LoginAttemptStore + RedisModule
│   ├── kafka/                     # KafkaProducerModule (ClientKafka producer)
│   └── oauth/                     # Passport strategies (Google, GitHub) + OAuthModule
└── interfaces/                    # ④ Delivery layer — HTTP controllers & input DTOs
    ├── controllers/               # AuthController, OAuthController, HealthController
    └── dto/                       # class-validator DTOs (input shape + validation)
```

### Layer Dependency Rule (enforced by design)
```
interfaces → application → domain ← infrastructure
```
- **Domain** knows nothing about NestJS, TypeORM, or Redis.  
- **Application** imports only domain ports (interfaces), never concrete implementations.  
- **Infrastructure** implements domain ports and depends on external SDKs.  
- **Interfaces** delegates all business logic to the application layer via CQRS buses.

---

## STEP 2 — File-by-File Explanation

### [main.ts](file:///c:/source/apps/auth-service/src/main.ts)
**Purpose**: NestJS bootstrap entrypoint.  
**Key decisions**:
- `bufferLogs: true` ensures log lines appear even before the logger provider binds.
- `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` — strips unknown fields globally, preventing mass-assignment attacks.
- CORS origin is configurable via `CORS_ORIGIN` env var (comma-separated), defaulting to `*` (development only).
- `enableShutdownHooks()` enables graceful termination (SIGTERM → Redis disconnect, DB pool drain).
- Swagger UI available at `/api`.

---

### [app.module.ts](file:///c:/source/apps/auth-service/src/app.module.ts)
**Purpose**: Root module that composes the entire dependency graph.

| Registration | Reason |
|---|---|
| `ConfigModule.forRoot({ isGlobal: true })` | Makes `process.env.*` available service-wide via `ConfigService` |
| `CqrsModule` | Registers `CommandBus`, `QueryBus`, `EventBus` |
| `TerminusModule` | Health check infrastructure |
| [DatabaseModule](file:///c:/source/apps/auth-service/src/infrastructure/database/database.module.ts#7-34) | PostgreSQL + TypeORM |
| [RedisModule](file:///c:/source/apps/auth-service/src/infrastructure/redis/redis.module.ts#6-30) | ioredis `REDIS_CLIENT` + services |
| [KafkaProducerModule](file:///c:/source/apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts#7-33) | `ClientKafka` producer |
| [AuthJwtModule](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt.module.ts#12-23) | `JwtService` + `PassportModule` + [JwtAdapterService](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts#23-56) |
| [OAuthModule](file:///c:/source/apps/auth-service/src/infrastructure/oauth/oauth.module.ts#6-12) | Google + GitHub Passport strategies |
| `ThrottlerModule.forRootAsync` | Redis-backed rate limiter (10 req/60s per IP/route) |

**Important**: `ThrottlerStorageRedisService` is instantiated using the already-created `REDIS_CLIENT` token — no second Redis connection is opened.

CommandHandlers and QueryHandlers arrays are declared locally and spread into `providers`.

---

### Domain Layer

#### [domain/entities/user.entity.ts](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts)
**Purpose**: The [User](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#25-71) aggregate root — the central domain object.

```typescript
class User {
  private constructor(private readonly props: UserProps) {}
  static create(props: UserProps): User  // Factory — enforces construction contract
  verifyEmail(): void                    // Domain behaviour with guard
  changePassword(newPassword: Password): void
  deactivate(): void                     // Guard: throws if already inactive
}
```

**Design patterns**:
- **Private constructor + static factory**: Prevents invalid [User](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#25-71) instances from ever existing.
- **Value Object composition**: `email: Email`, `password: Password | null` — raw strings never stored.
- `password: null` models OAuth-only accounts where no local credential exists.
- Multi-tenancy hooks ([tenantId](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#45-46), [orgId](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#46-47)) are present as nullable fields for future SaaS use.

**Improvements**: Should raise domain events via `AggregateRoot` from `@nestjs/cqrs` instead of emitting Kafka events directly in handlers. This would decouple event publishing from persistence.

---

#### [domain/value-objects/email.value-object.ts](file:///c:/source/apps/auth-service/src/domain/value-objects/email.value-object.ts)
**Purpose**: Wraps a string email with self-validating construction.

- `Email.create()` validates format with regex and normalises to lowercase.
- Prevents raw strings from leaking into the domain layer (type safety and invariant enforcement).
- **Gap**: Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` is minimally permissive — could use `validator.js` [isEmail()](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#36-37) for RFC-compliant validation.

#### [domain/value-objects/password.value-object.ts](file:///c:/source/apps/auth-service/src/domain/value-objects/password.value-object.ts)
**Purpose**: Wraps an **already-hashed** password string.

- The value object itself does not hash; hashing happens in [RegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts#17-83) (via `argon2.hash()`).
- `Password.create()` only wraps non-empty strings — provides a typed container to avoid passing raw strings.
- **Design note**: This is a thin wrapper. A stronger design would make hashing the value object's responsibility.

#### [domain/value-objects/oauth-identity.value-object.ts](file:///c:/source/apps/auth-service/src/domain/value-objects/oauth-identity.value-object.ts)
**Purpose**: Typed container for [(provider, providerId)](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#32-33) pair used during OAuth linking.

- Normalises provider to lowercase ([google](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts#29-32), [github](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts#46-49)).
- Currently only used conceptually — the entity stores these as flat strings. The VO is available but not yet injected into [UserProps](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#5-24) as a first-class object.

#### [domain/value-objects/role.enum.ts](file:///c:/source/apps/auth-service/src/domain/value-objects/role.enum.ts)
**Purpose**: Defines the RBAC role set — `CUSTOMER | ADMIN`.  
Stored as `varchar(50)` in PostgreSQL; cast back to `Role` in `UserRepository.toDomain()`.

---

#### Domain Ports

##### [domain/ports/user-repository.port.ts](file:///c:/source/apps/auth-service/src/domain/ports/user-repository.port.ts)
```typescript
interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByProvider(provider: string, providerId: string): Promise<User | null>;
  save(user: User): Promise<User>;
}
export const USER_REPOSITORY = 'USER_REPOSITORY'; // injection token
```
The `USER_REPOSITORY` string token is used with NestJS `@Inject()`. The [UserRepository](file:///c:/source/apps/auth-service/src/infrastructure/database/user.repository.ts#11-80) class in infrastructure binds to this token. **No ORM types cross this boundary.**

##### [domain/ports/token-store.port.ts](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts)
```typescript
interface TokenStorePort {
  storeRefreshToken(userId, tokenId, ttlSeconds?): Promise<void>;
  getUserIdByRefreshToken(userId, tokenId): Promise<string | null>;
  revokeRefreshToken(userId, tokenId): Promise<void>;
  revokeAllUserTokens(userId): Promise<void>;
  blocklistJti(jti, ttlSeconds): Promise<void>;
  isJtiBlocked(jti): Promise<boolean>;
}
export const TOKEN_STORE = 'TOKEN_STORE';
```
Decouples application handlers from Redis specifics. `TOKEN_STORE` token is declared but not wired via DI — handlers inject [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97) directly (a minor leakage, discussed in §14).

---

#### Domain Events

All events are plain `class` objects with `public readonly occurredAt = new Date().toISOString()`.

| Event | Payload |
|---|---|
| [UserRegisteredEvent](file:///c:/source/apps/auth-service/src/domain/events/user-registered.event.ts#1-10) | `userId, email, provider?` |
| [UserLoggedInEvent](file:///c:/source/apps/auth-service/src/domain/events/user-logged-in.event.ts#1-11) | `userId, email, ip?, userAgent?` |
| [UserLoginFailedEvent](file:///c:/source/apps/auth-service/src/domain/events/user-login-failed.event.ts#1-10) | `email, reason, ip?` |
| [UserPasswordChangedEvent](file:///c:/source/apps/auth-service/src/domain/events/user-password-changed.event.ts#1-6) | `userId` |
| [UserDeactivatedEvent](file:///c:/source/apps/auth-service/src/domain/events/user-deactivated.event.ts#1-6) | `userId` |

**Important**: These are domain event *definitions* only. They are **not** published via `EventBus`. Kafka messages are instead emitted directly in application handlers using the Kafka client. This is an architectural gap — the events exist as data shapes but not as integrated domain events.

---

### Application Layer

#### Commands & Queries (Message Objects)

| File | Type | Carries |
|---|---|---|
| [register.command.ts](file:///c:/source/apps/auth-service/src/application/commands/register.command.ts) | Command | [RegisterDto](file:///c:/source/apps/auth-service/src/interfaces/dto/auth.dto.ts#4-22) |
| [refresh-token.command.ts](file:///c:/source/apps/auth-service/src/application/commands/refresh-token.command.ts) | Command | [RefreshTokenDto](file:///c:/source/apps/auth-service/src/interfaces/dto/refresh-token.dto.ts#4-23) |
| [logout.command.ts](file:///c:/source/apps/auth-service/src/application/commands/logout.command.ts) | Command | `refreshToken, userId, jti?` |
| [oauth-login.command.ts](file:///c:/source/apps/auth-service/src/application/commands/oauth-login.command.ts) | Command | [OAuthUserProfile](file:///c:/source/apps/auth-service/src/application/commands/oauth-login.command.ts#1-9) |
| [oauth-register.command.ts](file:///c:/source/apps/auth-service/src/application/commands/oauth-register.command.ts) | Command | [OAuthRegisterDto](file:///c:/source/apps/auth-service/src/interfaces/dto/oauth-register.dto.ts#3-28) |
| [login.query.ts](file:///c:/source/apps/auth-service/src/application/queries/login.query.ts) | Query | [LoginDto](file:///c:/source/apps/auth-service/src/interfaces/dto/auth.dto.ts#23-33) |

Commands carry data needed to mutate state; the single query ([LoginQuery](file:///c:/source/apps/auth-service/src/application/queries/login.query.ts#3-6)) reads user + validates credentials. This is a pragmatic CQRS — login is treated as a query because it returns data (tokens) without persisting a new aggregate, though it does have side-effects (storing refresh token in Redis, emitting Kafka event).

---

#### [application/handlers/register.handler.ts](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts)
**CQRS Role**: `@CommandHandler(RegisterCommand)`  
**Flow**:
1. Create [Email](file:///c:/source/apps/auth-service/src/domain/value-objects/email.value-object.ts#1-21) value object → validate format.
2. Check uniqueness via `UserRepositoryPort.findByEmail()` → throw `409 ConflictException` if duplicate.
3. Hash password: `argon2.hash(password)` → wrap in [Password](file:///c:/source/apps/auth-service/src/domain/value-objects/password.value-object.ts#1-16) value object.
4. Assemble `User.create(...)` with `crypto.randomUUID()` id.
5. Persist: `userRepository.save(user)`.
6. Emit `user.registered` Kafka event (fire-and-forget; errors logged but not thrown).
7. Return `{ id, email }`.

**Pattern**: Application-level orchestration — domain entity handles invariants, handler orchestrates workflow.

---

#### [application/handlers/login.handler.ts](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts)
**CQRS Role**: `@QueryHandler(LoginQuery)`  
**Flow**:
1. **Lockout check first** (`LoginAttemptService.isLocked(email)`) — before any DB access.
2. Fetch user via `UserRepositoryPort.findByEmail()`.
3. Guard: check `user.isActive` and `user.password !== null` (OAuth-only account guard).
4. `argon2.verify(storedHash, candidatePassword)` — timing-safe comparison.
5. On failure: `loginAttemptService.recordFailedAttempt(email)` + emit `user.login_failed`.
6. On success: clear attempts, `jwtAdapterService.generateTokens(...)`, `tokenStoreService.storeRefreshToken(...)`.
7. Emit `user.logged_in`.
8. Return `AuthTokens { accessToken, refreshToken, jti }`.

**Security note**: The lockout check precedes DB lookup. This avoids timing oracle attacks where an attacker can distinguish "account doesn't exist" from "wrong password" via response time.

---

#### [application/handlers/refresh-token.handler.ts](file:///c:/source/apps/auth-service/src/application/handlers/refresh-token.handler.ts)
**CQRS Role**: `@CommandHandler(RefreshTokenCommand)`  
**Flow** (implements **token rotation**):
1. Validate refresh token exists in Redis: `tokenStoreService.getUserIdByRefreshToken(userId, refreshToken)`.
2. Verify user is still active via `userRepository.findById(userId)`.
3. **Blocklist old JTI**: `tokenStoreService.blocklistJti(currentJti, 900)` — 15 min TTL matching access token lifetime.
4. **Revoke old refresh token**: `tokenStoreService.revokeRefreshToken(userId, refreshToken)`.
5. Generate new token pair.
6. Store new refresh token.
7. Return new [AuthTokens](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts#15-22).

**Security**: Steps 3+4 implement single-use refresh token rotation. An attacker who steals a refresh token cannot reuse it after the legitimate user rotates.

---

#### [application/handlers/logout.handler.ts](file:///c:/source/apps/auth-service/src/application/handlers/logout.handler.ts)
**CQRS Role**: `@CommandHandler(LogoutCommand)`  
**Flow**:
1. [blocklistJti(jti, 900)](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#82-89) — puts access token's JTI in Redis blocklist for 15 minutes.
2. [revokeRefreshToken(userId, refreshToken)](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#57-64) — removes refresh token from Redis.

Simple but complete logout: both the short-lived access token and long-lived refresh token are invalidated.

---

#### [application/handlers/oauth-login.handler.ts](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts)
**CQRS Role**: `@CommandHandler(OAuthLoginCommand)`  
**Flow** (most complex handler):
1. Lookup by [(provider, providerId)](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#32-33) — the primary and most secure check.
2. If not found → fallback lookup by email (for existing password users).
   - If email match found: link OAuth identity (emit `user.oauth_linked` event) — **noted as needing explicit confirmation flow**.
   - If no match: dispatch [OAuthRegisterCommand](file:///c:/source/apps/auth-service/src/application/commands/oauth-register.command.ts#3-6) via `CommandBus`, then re-fetch.
3. Guard: `user.isActive`.
4. Generate tokens, store refresh token, emit `user.logged_in`.

**Security**: (provider, providerId) lookup first prevents email collision attacks where an attacker could register a Google account with someone else's email to hijack their account.

---

#### [application/handlers/oauth-register.handler.ts](file:///c:/source/apps/auth-service/src/application/handlers/oauth-register.handler.ts)
**CQRS Role**: `@CommandHandler(OAuthRegisterCommand)`  
**Flow**:
1. Build [User](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#25-71) with `password: null` (OAuth-only) and `isEmailVerified: true` (provider verified).
2. Persist via `userRepository.save()`.
3. Emit `user.registered` with provider/providerId fields.

---

#### [application/services/auth.service.ts](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts)
**Class**: [LoginAttemptService](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#8-24) — named confusingly ([auth.service.ts](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts) but exports [LoginAttemptService](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#8-24)).  
A thin **façade** over [LoginAttemptStore](file:///c:/source/apps/auth-service/src/infrastructure/redis/login-attempt.store.ts#11-57), adding business language ([isLocked](file:///c:/source/apps/auth-service/src/infrastructure/redis/login-attempt.store.ts#43-49), [recordFailedAttempt](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#12-15), [clearAttempts](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#20-23)) on top of the Redis infrastructure. This is correct application service behaviour — the handler delegates here rather than calling Redis directly.

---

### Infrastructure Layer

#### [infrastructure/database/user.orm-entity.ts](file:///c:/source/apps/auth-service/src/infrastructure/database/user.orm-entity.ts)
TypeORM `@Entity('users')` mapping. Notable:
- `@PrimaryColumn('uuid')` — UUID is generated in the domain layer, not by the DB (`GENERATED`). This is correct DDD practice: the domain controls identity.
- `passwordHash: string | null` — nullable for OAuth users.
- Composite unique index on [(provider, providerId)](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#32-33) with partial condition `WHERE provider IS NOT NULL` — prevents duplicate OAuth accounts without affecting password users.
- `@CreateDateColumn()` / `@UpdateDateColumn()` — TypeORM automatic timestamp management.

#### [infrastructure/database/user.repository.ts](file:///c:/source/apps/auth-service/src/infrastructure/database/user.repository.ts)
**Purpose**: Port adapter — implements [UserRepositoryPort](file:///c:/source/apps/auth-service/src/domain/ports/user-repository.port.ts#8-14) using TypeORM.  
**Key method**: [toDomain(orm)](file:///c:/source/apps/auth-service/src/infrastructure/database/user.repository.ts#41-61) and [toOrm(user)](file:///c:/source/apps/auth-service/src/infrastructure/database/user.repository.ts#62-79) — explicit bidirectional mapping.

```typescript
// ORM → Domain: reconstructs value objects from raw DB strings
email: Email.create(orm.email)
password: orm.passwordHash ? Password.create(orm.passwordHash) : null

// Domain → ORM: extracts raw values from value objects
orm.email = user.email.getValue()
orm.passwordHash = user.password ? user.password.getValue() : null
```

This mapping pattern is the Anti-Corruption Layer — no ORM type ever escapes into the domain or application layer.

#### [infrastructure/database/database.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/database/database.module.ts)
- `TypeOrmModule.forRootAsync` with `synchronize: process.env.NODE_ENV !== 'production'` — auto-sync is disabled in production (correct; use migrations instead).
- Registers `USER_REPOSITORY` injection token pointing to [UserRepository](file:///c:/source/apps/auth-service/src/infrastructure/database/user.repository.ts#11-80).

---

#### [infrastructure/jwt/jwt-adapter.service.ts](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts)

```typescript
interface TokenPayload { sub, email, role, jti, tenantId?, orgId? }
interface AuthTokens  { accessToken, refreshToken, jti }
```

**Access token**: Signed JWT, `expiresIn: '15m'`, payload includes [jti](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#24-27) (UUID).  
**Refresh token**: `crypto.randomBytes(40).toString('hex')` — 80-character opaque hex string. **Not a JWT**. This is the correct design: if the refresh token were a JWT, it would be self-validating and couldn't be revoked.  
**JTI** ([jti](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#24-27)): `crypto.randomUUID()` — unique per issued access token, enables pre-expiry revocation via Redis blocklist.

#### [infrastructure/jwt/jwt.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt.module.ts)
- `@Global()` — exports [JwtAdapterService](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts#23-56), [JwtModule](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt.module.ts#12-23), `PassportModule` globally.
- Fail-fast: throws at module load time if `JWT_SECRET` is undefined — no silent misconfiguration.
- `expiresIn` is **not** set here; it is controlled per-call in `JwtAdapterService.generateTokens()` — allows per-token TTL in the future.

---

#### [infrastructure/redis/token-store.service.ts](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts)
**Purpose**: Redis implementation of [TokenStorePort](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#5-38). Manages three namespaces:

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `refresh:{userId}:{tokenId}` | String | 7 days (604800s) | Stores userId; presence = valid token |
| `sessions:{userId}` | Set | 7 days | Index of tokenIds for O(1) full revocation |
| `blocklist:jti:{jti}` | String | 15 min (900s) | Revoked access token JTIs |

[revokeAllUserTokens](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#22-26): reads the `sessions:{userId}` set → deletes all `refresh:*` keys in one pipeline → deletes the set. This is an O(n tokens) operation in pipelines but logically O(1) lookup.

#### [infrastructure/redis/login-attempt.store.ts](file:///c:/source/apps/auth-service/src/infrastructure/redis/login-attempt.store.ts)
**Purpose**: Brute-force protection via Redis counters.

| Key Pattern | Value | TTL |
|---|---|---|
| `login:attempts:{email}` | Integer counter | 15 min (sliding window) |
| `login:locked:{email}` | `'1'` | 15 min |

- `INCR` is atomic — no race condition between concurrent login attempts.
- TTL is refreshed on every failed attempt (sliding window — resets the 15-min countdown on each failure, which is more aggressive than a fixed window).
- After 5 failures: sets the locked key.

#### [infrastructure/redis/redis.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/redis/redis.module.ts)
- `@Global()` — `REDIS_CLIENT`, [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97), [LoginAttemptStore](file:///c:/source/apps/auth-service/src/infrastructure/redis/login-attempt.store.ts#11-57) available everywhere.
- `OnModuleDestroy` hook: calls `redis.quit()` for graceful shutdown.
- No authentication configured (`AUTH` password, TLS) — suitable for local dev, requires hardening for production.

---

#### [infrastructure/kafka/kafka-producer.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts)
- `@Global()` — `KAFKA_SERVICE` (`ClientKafka`) available everywhere.
- `clientId: 'auth-service'` for broker-side identification.
- `KAFKA_BROKERS` env var supports comma-separated list for cluster mode.
- `LegacyPartitioner` explicitly chosen to avoid breaking changes between KafkaJS versions.

---

#### [infrastructure/oauth/google.strategy.ts](file:///c:/source/apps/auth-service/src/infrastructure/oauth/google.strategy.ts)
`PassportStrategy(Strategy, 'google')` — named `'google'` matching `AuthGuard('google')`.

**validate()** callback:
- Finds first email where `verified !== false` (Google may return multiple emails).
- OAuth `accessToken`/`refreshToken` from Google are **discarded** — auth-service issues its own tokens.
- Returns normalised [OAuthUserProfile](file:///c:/source/apps/auth-service/src/application/commands/oauth-login.command.ts#1-9) object attached to `req.user`.

#### [infrastructure/oauth/github.strategy.ts](file:///c:/source/apps/auth-service/src/infrastructure/oauth/github.strategy.ts) 
`PassportStrategy(Strategy, 'github')` — named `'github'`.

**validate()** callback:
- Prefers `primary === true && verified === true` email, falls back to any verified email.
- **Refuses** to synthesise `{username}@github.com` — would tag the account to a non-verifiable address.
- GitHub profiles with no public verified email are rejected with a clear message.

#### [infrastructure/oauth/oauth.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/oauth/oauth.module.ts)
Simple module wrapping `PassportModule` and both strategies. Exported so [AppModule](file:///c:/source/apps/auth-service/src/app.module.ts#35-59) can import it.

---

### Interfaces Layer

#### [interfaces/controllers/auth.controller.ts](file:///c:/source/apps/auth-service/src/interfaces/controllers/auth.controller.ts)
- `@UseGuards(ThrottlerGuard)` at class level — all endpoints rate-limited (10 req/60s via Redis).
- Delegates 100% of logic to CQRS buses — zero business logic in controller.
- `POST /auth/register` → `CommandBus.execute(RegisterCommand)`
- `POST /auth/login` → `QueryBus.execute(LoginQuery)`
- `POST /auth/refresh` → `CommandBus.execute(RefreshTokenCommand)`
- `POST /auth/logout` → `CommandBus.execute(LogoutCommand)` — extracts `userId`/[jti](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#24-27) from `req.user` when present (supports both bearer-authenticated and unauthenticated logout).

#### [interfaces/controllers/oauth.controller.ts](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts)
- `GET /auth/google` → Passport redirects to Google consent screen (empty handler — Passport takes over).
- `GET /auth/google/callback` → Passport validates Google token, populates `req.user`, controller calls [handleOAuthCallback()](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts#60-89).
- Same pattern for GitHub.
- [handleOAuthCallback()](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts#60-89): dispatches [OAuthLoginCommand](file:///c:/source/apps/auth-service/src/application/commands/oauth-login.command.ts#10-13), then sets refresh token in **HttpOnly cookie** (`secure: true` in production, `sameSite: 'strict'`), returns access token + jti in JSON body.

**Security**: HttpOnly cookie prevents XSS-based refresh token theft.

#### [interfaces/controllers/health.controller.ts](file:///c:/source/apps/auth-service/src/interfaces/controllers/health.controller.ts)
`GET /health` — NestJS Terminus health check aggregating:
- **PostgreSQL**: `TypeOrmHealthIndicator.pingCheck('database')`
- **Redis**: explicit `redis.ping()` call
- **Memory**: heap usage check, limit 512MB RSS

#### DTOs (`interfaces/dto/`)

| File | Class | Validators |
|---|---|---|
| [auth.dto.ts](file:///c:/source/apps/auth-service/src/interfaces/dto/auth.dto.ts) | [RegisterDto](file:///c:/source/apps/auth-service/src/interfaces/dto/auth.dto.ts#4-22), [LoginDto](file:///c:/source/apps/auth-service/src/interfaces/dto/auth.dto.ts#23-33) | `@IsEmail`, `@MinLength(8)`, `@IsNotEmpty` |
| [refresh-token.dto.ts](file:///c:/source/apps/auth-service/src/interfaces/dto/refresh-token.dto.ts) | [RefreshTokenDto](file:///c:/source/apps/auth-service/src/interfaces/dto/refresh-token.dto.ts#4-23) | `userId`, `refreshToken`, `currentJti` all required |
| [logout.dto.ts](file:///c:/source/apps/auth-service/src/interfaces/dto/logout.dto.ts) | [LogoutDto](file:///c:/source/apps/auth-service/src/interfaces/dto/logout.dto.ts#4-23) | `refreshToken` required; [jti](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#24-27), `userId` optional |
| [oauth-register.dto.ts](file:///c:/source/apps/auth-service/src/interfaces/dto/oauth-register.dto.ts) | [OAuthRegisterDto](file:///c:/source/apps/auth-service/src/interfaces/dto/oauth-register.dto.ts#3-28) | [email](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#33-34), [provider](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#40-41), [providerId](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#41-42) required; profile fields optional |

---

## STEP 3 — Authentication Flow (Complete Login)

```
Client
  │  POST /auth/login { email, password }
  ▼
AuthController.login()
  │  QueryBus.execute(new LoginQuery(dto))
  ▼
LoginHandler.execute()
  ├─① LoginAttemptService.isLocked(email)           → Redis GET login:locked:{email}
  │    └─ if locked → HTTP 429 "Account temporarily locked"
  │
  ├─② UserRepositoryPort.findByEmail(email)          → PostgreSQL SELECT WHERE email=?
  │    └─ if null || !isActive → record attempt, emit login_failed, HTTP 401
  │
  ├─③ user.password === null?                        → OAuth-only account
  │    └─ HTTP 401 "Invalid credentials"
  │
  ├─④ argon2.verify(storedHash, candidatePassword)  → timing-safe bcmp
  │    └─ if false → record attempt, emit login_failed, HTTP 401
  │
  ├─⑤ LoginAttemptService.clearAttempts(email)      → Redis DEL attempts + lock keys
  │
  ├─⑥ JwtAdapterService.generateTokens({ id, email, role, tenantId, orgId })
  │    ├─ jti = crypto.randomUUID()
  │    ├─ accessToken = jwtService.sign(payload, { expiresIn: '15m' })
  │    └─ refreshToken = crypto.randomBytes(40).hex()
  │
  ├─⑦ TokenStoreService.storeRefreshToken(userId, refreshToken)
  │    └─ Redis SET refresh:{userId}:{token} userId EX 604800
  │    └─ Redis SADD sessions:{userId} {token}
  │
  ├─⑧ kafkaClient.emit('user.logged_in', { userId, email, timestamp })
  │
  └─⑨ return { accessToken, refreshToken, jti }     → Client
```

---

## STEP 4 — Token Architecture

### Access Token (JWT)
```json
{
  "sub": "uuid-of-user",
  "email": "user@example.com",
  "role": "CUSTOMER",
  "jti": "crypto.randomUUID()",
  "tenantId": null,
  "orgId": null,
  "iat": 1710000000,
  "exp": 1710000900
}
```
- **Lifetime**: 15 minutes.
- **Secret**: `JWT_SECRET` env var (symmetric HMAC-SHA256 by default from `@nestjs/jwt`).
- **JTI**: UUID per token — enables revocation before expiry via Redis blocklist.

### Refresh Token (Opaque)
- `crypto.randomBytes(40).toString('hex')` = 80 hex chars = 320 bits of entropy.
- **Not a JWT** — cannot be self-validated, must hit Redis.
- **Stored in Redis**: `refresh:{userId}:{token}` = `userId` string, TTL 7 days.
- When rotated, old token is deleted and new token is stored.

### Token Rotation
```
Client sends: { userId, refreshToken, currentJti }
  ├─ Redis: validate refresh token exists
  ├─ Redis: blocklist currentJti (TTL 900s)
  ├─ Redis: delete old refresh token
  ├─ Generate new { accessToken, refreshToken, jti }
  └─ Redis: store new refresh token
```

### Revocation Model
- **Refresh tokens**: explicitly deleted from Redis on logout/rotation.
- **Access tokens**: added to `blocklist:jti:{jti}` for their remaining TTL (15 min max). Any middleware/guard calling [isJtiBlocked(jti)](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#90-96) will reject the token. *(Note: the API Gateway must implement this check — auth-service only manages the store.)*

---

## STEP 5 — Redis Storage架构

Redis is used for **three distinct purposes**:

### 1. Refresh Token Store
```
Key:   refresh:{userId}:{opaqueToken}
Value: userId (string)
TTL:   604800s (7 days)
```
```
Key:   sessions:{userId}
Value: Redis Set of tokenIds
TTL:   604800s (7 days)
```
The session index enables [revokeAllUserTokens](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#22-26) — an O(1) key lookup followed by O(n) pipeline DEL.

### 2. Access Token Blocklist
```
Key:   blocklist:jti:{jti}
Value: '1'
TTL:   up to 900s (15 min)
```
JTIs auto-expire when the access token itself expires — no cleanup needed.

### 3. Brute-Force Protection
```
Key:   login:attempts:{email}   Value: integer   TTL: 900s (sliding)
Key:   login:locked:{email}     Value: '1'       TTL: 900s
```

### Session Revocation
- **Single device**: [revokeRefreshToken(userId, tokenId)](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#57-64) — DEL token key + SREM from session index.
- **All devices**: [revokeAllUserTokens(userId)](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#22-26) — SMEMBERS session index → pipeline DEL all tokens → DEL index.

---

## STEP 6 — OAuth Integration

### Flow Diagram
```
Browser
  │  GET /auth/google
  ▼
OAuthController (AuthGuard('google'))
  │  Passport → redirects to Google consent
  ▼
Google consent → callback to /auth/google/callback
  │  AuthGuard('google') → GoogleStrategy.validate()
  │      validates verified email, builds OAuthUserProfile
  ▼
OAuthController.googleAuthRedirect()
  │  CommandBus.execute(OAuthLoginCommand)
  ▼
OAuthLoginHandler
  ├─ findByProvider(google, googleId)    → lookup by stable ID first
  ├─ [if not found] findByEmail()        → link existing account
  ├─ [if no email] OAuthRegisterCommand  → create new user
  ├─ generateTokens()
  └─ storeRefreshToken()
  ▼
OAuthController: set HttpOnly cookie (refreshToken) + JSON { accessToken, jti }
```

### Google Strategy Security Decisions
- Only accepts `verified` emails — prevents using an unverified Google email.
- Discards Google's `accessToken`/`refreshToken` — auth-service never acts on behalf of the user within Google's APIs.

### GitHub Strategy Security Decisions  
- Prefers `primary AND verified` email, falls back to any `verified` email.
- Explicitly **refuses** to synthesise `@github.com` emails — blocked to prevent identity confusion.
- Users without a public verified GitHub email cannot log in.

### Account Linking Risk
The current [OAuthLoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts#19-113) auto-links an OAuth identity to an existing email-based account silently. This is flagged as a TODO in the code: "A full implementation would require an explicit linking confirmation flow." The risk: if Google's email ownership verification is compromised, an attacker could link their OAuth identity to a victim's account.

---

## STEP 7 — Event Architecture (Kafka)

### Producer Setup
- `ClientKafka` producer via `@nestjs/microservices`.
- `clientId: 'auth-service'`, connects to `KAFKA_BROKERS`.
- [emit()](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts#106-117) is fire-and-forget — no `await`, errors are caught and logged but never rethrown.

### Published Events

| Topic | Published From | Payload fields |
|---|---|---|
| `user.registered` | [RegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts#17-83), [OAuthRegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-register.handler.ts#15-73) | `userId, email, provider?, providerId?, timestamp` |
| `user.logged_in` | [LoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts#24-118), [OAuthLoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts#19-113) | `userId, email, provider?, timestamp` |
| `user.login_failed` | [LoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts#24-118) | `email, reason, timestamp` |
| `user.oauth_linked` | [OAuthLoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts#19-113) | `userId, provider, providerId, timestamp` |

### Consumer Services
Other services (e.g., `user-service`, `notification-service`) consume these topics. The `@ecommerce/events` shared package (in the monorepo) defines event contracts.

### Critical Gap
Domain event classes ([UserRegisteredEvent](file:///c:/source/apps/auth-service/src/domain/events/user-registered.event.ts#1-10), etc.) are **defined in the domain layer** but the **Kafka emits use inline objects**, not those event classes. This means the event schema is duplicated (the class definition vs. the literal object in `kafkaClient.emit()`), which is a maintenance risk.

---

## STEP 8 — Security Model

### Password Security
- **Argon2id** (via `argon2` package) — the current OWASP-recommended algorithm, resistant to GPU attacks, with default memory cost.
- `argon2.verify()` is timing-safe — prevents timing oracle attacks.
- Hashing occurs in [RegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts#17-83), not in the domain — a minor concern (hashing should ideally be a domain service responsibility).

### JWT Security
- Symmetric HMAC-SHA256 (`HS256` default from `@nestjs/jwt`).
- **Gap**: No RS256 (asymmetric). In a microservice architecture, RS256 allows other services to verify tokens without the signing secret. With HS256, any service that validates tokens needs the secret, creating distribution risk.
- `JWT_SECRET` fail-fast at module load — prevents silent misconfiguration.

### Brute-Force Protection
- 5 attempts → 15-minute lockout per email (sliding window).
- Rate-limiting: `ThrottlerGuard` (10 req/60s per IP via Redis). Two-layer protection.

### Token Security
- Opaque refresh tokens (high entropy, stored server-side) — can always be revoked.
- JTI blocklist for access tokens — supports pre-expiry revocation.
- OAuth refresh tokens stored in HttpOnly, SameSite=Strict, Secure cookies — XSS-resistant.

### Input Validation
- `ValidationPipe({ whitelist, forbidNonWhitelisted })` — unknown fields are stripped and rejected globally.
- DTO validators: `@IsEmail`, `@MinLength(8)`, `@IsNotEmpty`, `@IsString`.

### Known Vulnerabilities & Gaps
1. **No RS256**: shared `JWT_SECRET` across services violates least privilege.
2. **Auto account linking** without confirmation flow (OAuth → existing email account).
3. **No TLS on Redis**: [redis.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/redis/redis.module.ts) does not configure `tls: {}`.
4. **No Redis AUTH**: no password on Redis connection.
5. **synchronize: true** in non-prod environments — could destroy schema during dev.
6. **Lockout by email**, not by IP — an attacker can lock out legitimate users by spamming their email.
7. **CORS defaults to `*`** when `CORS_ORIGIN` is unset — development-only risk.

---

## STEP 9 — Infrastructure Integration

```
                    ┌─────────────────────┐
                    │   API Gateway        │
                    │  (Port 3000)         │
                    └────────┬────────────┘
                             │ HTTP (proxies /auth/*)
                    ┌────────▼────────────┐
                    │   Auth Service       │
                    │  (Port 3001)         │
                    └──┬──┬──┬──┬─────────┘
                       │  │  │  │
          ┌────────────┘  │  │  └──────────────┐
          ▼               │  ▼                  ▼
   PostgreSQL          Redis              Kafka Broker
   (auth DB)       (ioredis 6379)       (broker:9092)
   TypeORM         TokenStore           user.registered
   User table      BruteForce           user.logged_in
                   Throttler            user.login_failed
```

- **API Gateway**: Reverse proxies `/auth/*` to `localhost:3001`. The gateway holds rate-limiting at the network edge; auth-service adds application-level throttling.
- **PostgreSQL**: Single `users` table, managed by TypeORM, isolated database `eccommerce_auth`.
- **Redis**: Single `ioredis` connection shared across token store, login throttle, and NestJS throttler.
- **Kafka**: Auth produces to 4 topics; downstream services consume. Auth-service has no Kafka consumers.

---

## STEP 10 — Configuration System

All configuration is read from `process.env` via `ConfigModule.forRoot({ isGlobal: true })`.

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `3001` | [main.ts](file:///c:/source/apps/auth-service/src/main.ts) |
| `JWT_SECRET` | *(required)* | [jwt.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt.module.ts) |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | `localhost/5432/postgres/postgres/eccommerce_auth` | [database.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/database/database.module.ts) |
| `REDIS_HOST/PORT` | `localhost/6379` | [redis.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/redis/redis.module.ts) |
| `KAFKA_BROKERS` | `localhost:9092` | [kafka-producer.module.ts](file:///c:/source/apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts) |
| `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` | *(required for OAuth)* | [google.strategy.ts](file:///c:/source/apps/auth-service/src/infrastructure/oauth/google.strategy.ts) |
| `GITHUB_CLIENT_ID/SECRET/CALLBACK_URL` | *(required for OAuth)* | [github.strategy.ts](file:///c:/source/apps/auth-service/src/infrastructure/oauth/github.strategy.ts) |
| `CORS_ORIGIN` | `*` | [main.ts](file:///c:/source/apps/auth-service/src/main.ts) |
| `NODE_ENV` | — | Cookie `secure` flag, TypeORM `synchronize` |

**No validation schema (Joi/Zod)** exists for the env vars as a group — only `JWT_SECRET` has a fail-fast check. Other missing vars silently fall back to insecure defaults.

---

## STEP 11 — Request Lifecycle

### Example: `POST /auth/login`

```
1. HTTP Request arrives at NestJS HTTP adapter (Express)
2. Global ValidationPipe validates + transforms LoginDto
   └─ Strips unknown fields (whitelist: true)
   └─ Throws HTTP 400 if validation fails
3. ThrottlerGuard checks Redis (10 req/60s per IP)
   └─ Throws HTTP 429 if exceeded
4. AuthController.login(@Body() loginDto)
   └─ QueryBus.execute(new LoginQuery(loginDto))
5. QueryBus routes to LoginHandler (registered via @QueryHandler)
6. LoginHandler.execute():
   a. LoginAttemptService.isLocked() → Redis
   b. UserRepositoryPort.findByEmail() → TypeORM → PostgreSQL
   c. argon2.verify()
   d. JwtAdapterService.generateTokens()
   e. TokenStoreService.storeRefreshToken() → Redis
   f. kafkaClient.emit() → Kafka
7. Returns { accessToken, refreshToken, jti }
8. Controller returns JSON response
```

---

## STEP 12 — Dependency Injection

NestJS IoC container wires every dependency. The key patterns used:

### Module-Level DI
```typescript
// database.module.ts — binding port token to implementation
{
  provide: USER_REPOSITORY,     // string token from domain port
  useClass: UserRepository,     // infrastructure implementation
}
```

### Constructor Injection with Token
```typescript
@CommandHandler(RegisterCommand)
export class RegisterHandler {
  constructor(
    @Inject(USER_REPOSITORY)         // domain port token
    private readonly userRepository: UserRepositoryPort,  // typed as interface
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,   // class token (no @Inject needed)
  ) {}
}
```

### Global Modules
`@Global()` is applied to [RedisModule](file:///c:/source/apps/auth-service/src/infrastructure/redis/redis.module.ts#6-30), [AuthJwtModule](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt.module.ts#12-23), [KafkaProducerModule](file:///c:/source/apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts#7-33) — their providers are visible to every module without re-import. This is appropriate for truly cross-cutting infrastructure (logging, cache, event bus).

### CQRS Handler Registration
Handlers are registered in `AppModule.providers` array. `CqrsModule` discovers them via `@CommandHandler` / `@QueryHandler` decorators and registers routes in the `CommandBus` / `QueryBus`.

---

## STEP 13 — Feature Coverage

| Feature | Files Involved |
|---|---|
| **User Registration** | [RegisterCommand](file:///c:/source/apps/auth-service/src/application/commands/register.command.ts#3-6), [RegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/register.handler.ts#17-83), [UserRepositoryPort](file:///c:/source/apps/auth-service/src/domain/ports/user-repository.port.ts#8-14), [UserRepository](file:///c:/source/apps/auth-service/src/infrastructure/database/user.repository.ts#11-80), [Email](file:///c:/source/apps/auth-service/src/domain/value-objects/email.value-object.ts#1-21), [Password](file:///c:/source/apps/auth-service/src/domain/value-objects/password.value-object.ts#1-16), [User](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#25-71) |
| **Email/Password Login** | [LoginQuery](file:///c:/source/apps/auth-service/src/application/queries/login.query.ts#3-6), [LoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts#24-118), [LoginAttemptService](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#8-24), [JwtAdapterService](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts#23-56), [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97) |
| **Token Refresh (rotation)** | [RefreshTokenCommand](file:///c:/source/apps/auth-service/src/application/commands/refresh-token.command.ts#3-6), [RefreshTokenHandler](file:///c:/source/apps/auth-service/src/application/handlers/refresh-token.handler.ts#18-76), [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97), [JwtAdapterService](file:///c:/source/apps/auth-service/src/infrastructure/jwt/jwt-adapter.service.ts#23-56) |
| **Logout** | [LogoutCommand](file:///c:/source/apps/auth-service/src/application/commands/logout.command.ts#1-8), [LogoutHandler](file:///c:/source/apps/auth-service/src/application/handlers/logout.handler.ts#8-26), [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97) |
| **Google OAuth Login** | [GoogleStrategy](file:///c:/source/apps/auth-service/src/infrastructure/oauth/google.strategy.ts#12-65), [OAuthController](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts#21-90), [OAuthLoginCommand](file:///c:/source/apps/auth-service/src/application/commands/oauth-login.command.ts#10-13), [OAuthLoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts#19-113) |
| **GitHub OAuth Login** | [GithubStrategy](file:///c:/source/apps/auth-service/src/infrastructure/oauth/github.strategy.ts#13-72), [OAuthController](file:///c:/source/apps/auth-service/src/interfaces/controllers/oauth.controller.ts#21-90), [OAuthLoginCommand](file:///c:/source/apps/auth-service/src/application/commands/oauth-login.command.ts#10-13), [OAuthLoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-login.handler.ts#19-113) |
| **OAuth Registration** | [OAuthRegisterCommand](file:///c:/source/apps/auth-service/src/application/commands/oauth-register.command.ts#3-6), [OAuthRegisterHandler](file:///c:/source/apps/auth-service/src/application/handlers/oauth-register.handler.ts#15-73), [OAuthRegisterDto](file:///c:/source/apps/auth-service/src/interfaces/dto/oauth-register.dto.ts#3-28) |
| **Brute-Force Protection** | [LoginAttemptStore](file:///c:/source/apps/auth-service/src/infrastructure/redis/login-attempt.store.ts#11-57), [LoginAttemptService](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#8-24), [LoginHandler](file:///c:/source/apps/auth-service/src/application/handlers/login.handler.ts#24-118) |
| **Rate Limiting (API)** | `ThrottlerModule`, `ThrottlerGuard`, `ThrottlerStorageRedisService` |
| **Health Checks** | [HealthController](file:///c:/source/apps/auth-service/src/interfaces/controllers/health.controller.ts#12-44), TypeORM + Redis + Memory indicators |
| **Event Publishing** | [KafkaProducerModule](file:///c:/source/apps/auth-service/src/infrastructure/kafka/kafka-producer.module.ts#7-33), `ClientKafka`, all handlers |
| **API Documentation** | `SwaggerModule`, `@ApiTags`, `@ApiOperation`, `@ApiResponse` decorators |

### Not Yet Implemented
- Password reset / forgot password flow
- Email verification (token exists on entity, [verifyEmail()](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#50-57) domain method exists, but no endpoint)
- Account deactivation endpoint
- Multi-factor authentication
- [revokeAllUserTokens](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#22-26) (method exists in [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97) but no endpoint exposes it)

---

## STEP 14 — Architecture Evaluation

### Strengths ✅
1. **Clean DDD layering** — domain layer has zero framework/ORM imports.
2. **Ports & Adapters** — [UserRepositoryPort](file:///c:/source/apps/auth-service/src/domain/ports/user-repository.port.ts#8-14) and [TokenStorePort](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#5-38) enforce clean boundaries.
3. **CQRS** — handlers are single-responsibility; easy to test in isolation.
4. **Argon2** password hashing — state-of-the-art security.
5. **Opaque refresh tokens** — explicitly non-JWT; truly revocable.
6. **Token rotation** — single-use refresh tokens; old tokens are invalidated on every rotation.
7. **Session index** pattern — O(1)-ish full revocation without Redis SCAN.
8. **Fail-fast config** — JWT_SECRET and OAuth credentials validated at boot.
9. **HttpOnly cookie for OAuth refresh** — XSS-resistant delivery.
10. **Partial index on [(provider, providerId)](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#32-33)** — correct conditional uniqueness.

### Weaknesses ⚠️
1. **Domain events not integrated into EventBus** — [UserRegisteredEvent](file:///c:/source/apps/auth-service/src/domain/events/user-registered.event.ts#1-10) classes exist but Kafka emits use inline objects; event definitions and emitted payloads are decoupled.
2. **`TOKEN_STORE` port token unused** — handlers inject [TokenStoreService](file:///c:/source/apps/auth-service/src/infrastructure/redis/token-store.service.ts#10-97) directly, not via the [TokenStorePort](file:///c:/source/apps/auth-service/src/domain/ports/token-store.port.ts#5-38) interface. This partially defeats the port abstraction.
3. **[LoginAttemptService](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#8-24) file naming** — file is [auth.service.ts](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts) but class is [LoginAttemptService](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts#8-24); misleading.
4. **No env validation schema** — only `JWT_SECRET` fails fast; other vars fall back silently.
5. **HS256 JWT** — in a microservice context, RS256 is strongly preferred; other services need the secret.
6. **Auto-linking OAuth to existing email accounts** — silent linking without confirmation is a latent security risk.
7. **No Redis authentication or TLS** — bare Redis connection, suitable only for trusted networks.
8. **userRepository is exported from DatabaseModule** — leaks concrete class alongside port token; consumers could inject the concrete type.
9. **`synchronize: true` in non-production** — could cause dev-to-staging schema drops.
10. **No distributed tracing correlation** — no OpenTelemetry trace propagation into handlers.

---

## STEP 15 — Suggested Improvements

### Architecture
1. **Wire `TOKEN_STORE` port correctly**:
   ```typescript
   { provide: TOKEN_STORE, useClass: TokenStoreService }
   // handlers inject: @Inject(TOKEN_STORE) private readonly tokenStore: TokenStorePort
   ```
2. **Publish domain events via EventBus**: Make [User](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#25-71) extend `AggregateRoot`, call `this.apply(new UserRegisteredEvent(...))`, and register an event handler that emits to Kafka. This decouples persistence from event publishing.
3. **Introduce an [AuthModule](file:///c:/source/apps/auth-service/src/infrastructure/oauth/oauth.module.ts#6-12) feature module** inside `src/` to group registration, login, refresh, and logout — avoid registering all handlers flat in [AppModule](file:///c:/source/apps/auth-service/src/app.module.ts#35-59).

### Security
4. **Switch to RS256 JWT**: Generate an RSA key pair; auth-service signs with private key, other services verify with public key. Remove secret distribution.
5. **Add env validation** with `Joi` or `zod`:
   ```typescript
   ConfigModule.forRoot({ validationSchema: Joi.object({ JWT_SECRET: Joi.string().required(), ... }) })
   ```
6. **Require confirmation for OAuth account linking** — emit an event that triggers an email confirmation before linking identities.
7. **Lockout by IP + email** — current lockout is email-only; a targeted DoS can lock out any user.
8. **Add Redis AUTH and TLS**:
   ```typescript
   new Redis({ host, port, password: process.env.REDIS_PASSWORD, tls: {} })
   ```

### Performance
9. **Redis pipeline for storeRefreshToken** — current implementation makes two sequential Redis calls (`SET` + `SADD`). Use `multi()` pipeline for atomicity and performance.
10. **Index on [email](file:///c:/source/apps/auth-service/src/domain/entities/user.entity.ts#33-34) in PostgreSQL** — TypeORM `unique: true` creates an index implicitly, but an explicit `@Index()` clarifies intent.
11. **Connection pool tuning** — TypeORM and ioredis both have pool/retry configs that should be adjusted for production load.

### Maintainability
12. **Extract Kafka event schema to `@ecommerce/events`** — use shared event classes as the Kafka payload, not inline objects.
13. **Rename [auth.service.ts](file:///c:/source/apps/auth-service/src/application/services/auth.service.ts) → `login-attempt.service.ts`** — align filename with exported class name.
14. **Add structured logging to OAuth strategies** — currently no log on successful strategy validation.
15. **E2E tests for OAuth callbacks** — current test suite covers unit-level handlers but not the full Passport strategy → controller → handler flow.
