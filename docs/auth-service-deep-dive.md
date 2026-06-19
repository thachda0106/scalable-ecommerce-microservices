# Auth Service — Comprehensive Deep Dive

> **Stack**: NestJS 11 · TypeORM · PostgreSQL · Redis (ioredis) · Kafka · Passport · Argon2 · JWT  
> **Patterns**: DDD · CQRS · Ports & Adapters (Hexagonal) · Token Rotation · JTI Revocation

---

## 1. OVERVIEW TABLE

### Domain Layer (`src/domain/`)

| File | Role |
|------|------|
| `entities/user.entity.ts` | `User` aggregate root — identity, roles, email verification, deactivation |
| `value-objects/email.value-object.ts` | Self-validating email wrapper; normalizes to lowercase |
| `value-objects/password.value-object.ts` | Wraps an already-hashed password string |
| `value-objects/role.enum.ts` | RBAC enum: `CUSTOMER` \| `ADMIN` |
| `value-objects/oauth-identity.value-object.ts` | Typed (provider, providerId) pair for OAuth identity |
| `ports/user-repository.port.ts` | Interface for user persistence — no ORM types leak across |
| `ports/token-store.port.ts` | Interface for token storage — decouples handlers from Redis |
| `events/user-registered.event.ts` | Plain class: `userId`, `email`, `provider?` |
| `events/user-logged-in.event.ts` | Plain class: `userId`, `email`, `ip?`, `userAgent?` |
| `events/user-login-failed.event.ts` | Plain class: `email`, `reason`, `ip?` |
| `events/user-password-changed.event.ts` | Plain class: `userId` |
| `events/user-deactivated.event.ts` | Plain class: `userId` |

### Application Layer (`src/application/`)

| File | Role |
|------|------|
| `commands/register.command.ts` | Carries `RegisterDto` — plain message object |
| `commands/refresh-token.command.ts` | Carries `RefreshTokenDto` — plain message object |
| `commands/logout.command.ts` | Carries `refreshToken`, `userId`, `jti?` — inline fields |
| `commands/oauth-login.command.ts` | Carries `OAuthUserProfile` from Passport callback |
| `commands/oauth-register.command.ts` | Carries `OAuthRegisterDto` — OAuth provider data |
| `queries/login.query.ts` | Carries `LoginDto` — plain message object |
| `handlers/register.handler.ts` | Orchestrates: validate → hash → persist → emit event |
| `handlers/login.handler.ts` | Orchestrates: lockout check → fetch → verify → tokens → persist → emit |
| `handlers/refresh-token.handler.ts` | Orchestrates: validate → blocklist → revoke → generate → store |
| `handlers/logout.handler.ts` | Orchestrates: blocklist jti → revoke refresh token |
| `handlers/oauth-login.handler.ts` | Orchestrates: lookup by provider → fallback email → register or link → tokens |
| `handlers/oauth-register.handler.ts` | Orchestrates: build OAuth-only user → persist → emit event |
| `services/auth.service.ts` | Façade over `LoginAttemptStore` — business-language methods |

### Infrastructure Layer (`src/infrastructure/`)

| File | Role |
|------|------|
| `database/user.orm-entity.ts` | TypeORM `@Entity('users')` — DB schema definition |
| `database/user.repository.ts` | Implements `UserRepositoryPort` — bidirectional ORM ↔ Domain mapping |
| `database/database.module.ts` | Registers TypeORM + `USER_REPOSITORY` token |
| `jwt/jwt-adapter.service.ts` | Generates JWT access tokens + opaque refresh tokens + JTI |
| `jwt/jwt.module.ts` | `@Global()` — exports `JwtService`, `PassportModule`, `JwtAdapterService` |
| `redis/token-store.service.ts` | Implements `TokenStorePort` — refresh, session index, blocklist |
| `redis/login-attempt.store.ts` | Sliding-window brute-force counter with automatic lock |
| `redis/redis.module.ts` | `@Global()` — creates `REDIS_CLIENT`, exports Redis services |
| `kafka/kafka-producer.module.ts` | `@Global()` — `ClientKafka` producer |
| `oauth/google.strategy.ts` | Passport Google OAuth 2.0 strategy — verified email enforcement |
| `oauth/github.strategy.ts` | Passport GitHub OAuth 2.0 strategy — verified email enforcement |
| `oauth/oauth.module.ts` | Wraps `PassportModule` + both strategies |

### Interfaces Layer (`src/interfaces/`)

| File | Role |
|------|------|
| `controllers/auth.controller.ts` | REST endpoints: register, login, refresh, logout |
| `controllers/oauth.controller.ts` | OAuth initiation + callback handling with HttpOnly cookie |
| `controllers/health.controller.ts` | Terminus health check: PostgreSQL + Redis + memory |
| `dto/auth.dto.ts` | `RegisterDto`, `LoginDto` with `class-validator` decorators |
| `dto/refresh-token.dto.ts` | `RefreshTokenDto`: userId, refreshToken, currentJti |
| `dto/logout.dto.ts` | `LogoutDto`: refreshToken (required), jti?, userId? |
| `dto/oauth-register.dto.ts` | `OAuthRegisterDto`: email, provider, providerId, profile fields |

### Root (`src/`)

| File | Role |
|------|------|
| `main.ts` | Bootstrap: Swagger, CORS, ValidationPipe, global filters/interceptors |
| `app.module.ts` | Root module — wires all sub-modules, CQRS handlers, throttler |

---

## 2. DECLARATIVE KNOWLEDGE

### 2.1 The Core Problems

#### Problem A: Stateless JWT Needs Revocation
```
                            ┌──────────────────────┐
                            │   Access Token (JWT)  │
  "User logs out"  ──────▶  │   15-min lifetime     │──▶  Still valid on other services!
                            │   Self-validating     │     No central authority can reject it.
                            └──────────────────────┘
                            ┌──────────────────────┐
                            │   Refresh Token       │
  "Token stolen"    ──────▶ │   7-day lifetime      │──▶  Attacker can get new tokens for days.
                            │   No built-in revoke  │
                            └──────────────────────┘
```
**Solution**: JTI blocklist (access tokens) + opaque server-stored refresh tokens (revocable).

#### Problem B: Dual Auth System (Password + OAuth)
```
  ┌─────────────────────────┐      ┌──────────────────────────┐
  │  Email/Password Users    │      │  OAuth Users (Google/GH) │
  │  • passwordHash stored   │      │  • passwordHash = null   │
  │  • isEmailVerified=false │      │  • isEmailVerified=true  │
  │  • email uniqueness      │      │  • (provider,id) unique  │
  └─────────────┬───────────┘      └───────────┬──────────────┘
                │                              │
                └──────────┬───────────────────┘
                           ▼
              ┌────────────────────────┐
              │   Single `users` table  │
              │   Token logic identical │
              └────────────────────────┘
```
**Solution**: Single-table inheritance with nullable `passwordHash`, `provider`, `providerId` columns. Partial unique index on (provider, providerId) WHERE provider IS NOT NULL.

### 2.2 Core Variables Table

| Variable | Type | Plain-English Meaning |
|----------|------|----------------------|
| `jti` | `string` (UUID) | Unique ID per issued access token — enables per-token revocation before natural expiry |
| `sub` | `string` (UUID) | The authenticated user's ID, carried inside JWT payload |
| `accessToken` | `string` (JWT) | Short-lived (15 min) signed token sent in `Authorization: Bearer` header |
| `refreshToken` | `string` (80 hex chars) | Long-lived (7 days) opaque string stored in Redis; used to get new access tokens |
| `passwordHash` | `string` (Argon2) | Argon2id hash output — `null` for OAuth-only users |
| `MAX_ATTEMPTS` | `number (5)` | Failed login attempts before account lock triggers |
| `LOCKOUT_WINDOW_SECONDS` | `number (900)` | Duration (15 min) of sliding-window lockout countdown |
| `ACCESS_TOKEN_TTL_SECONDS` | `number (900)` | Access token lifetime in seconds — also JTI blocklist TTL |
| `REFRESH_TOKEN_TTL` | `number (604800)` | Refresh token lifetime in seconds (7 days) |
| `isActive` | `boolean` | Soft-deactivate flag — false means all auth attempts rejected |
| `isEmailVerified` | `boolean` | False for password signups, true for OAuth (provider verified) |
| `provider` | `string` | OAuth provider name: `'google'` or `'github'` |
| `providerId` | `string` | Opaque ID assigned by the OAuth provider to this user |
| `role` | `Role` enum | `CUSTOMER` or `ADMIN` — RBAC authorization level |
| `currentJti` | `string` (UUID) | JTI of the expiring access token sent during refresh — gets blocklisted |
| `REFRESH_TOKEN_COOKIE_MAX_AGE` | `number (604800000)` | Cookie max-age in milliseconds (7 days) for HttpOnly refresh token |
| `whitelist` / `forbidNonWhitelisted` | `boolean` | Global ValidationPipe config — strips/ rejects unknown DTO fields |
| `ThrottlerStorageRedisService` | Redis-backed store | Rate limiter storage (10 req/60s per IP) sharing same Redis connection |

### 2.3 Key Concepts Table

| Term | Definition |
|------|------------|
| **JTI** (JWT ID) | A `crypto.randomUUID()` injected into every access token. Added to a Redis blocklist when the token is revoked. |
| **Opaque Refresh Token** | 80-character hex string from `crypto.randomBytes(40)`. Not a JWT — must be looked up in Redis to validate. |
| **Token Rotation** | On each refresh: old refresh token deleted, old access token's JTI blocklisted, new pair issued. Stolen refresh tokens become single-use. |
| **Session Index** | Redis `SET` at `sessions:{userId}` containing all active refresh token IDs for a user. Enables O(1) full-session revocation. |
| **Sliding-Window Lockout** | Each failed login refreshes a 15-minute TTL on the counter. Account locks only when count ≥ 5 within the window. |
| **Fire-and-Forget Kafka** | `kafkaClient.emit()` without `await` — if Kafka is down, errors are logged but user operations succeed. |
| **HttpOnly Cookie** | Browser cookie flagged `HttpOnly` — inaccessible to JavaScript. OAuth refresh tokens set this way to defeat XSS. |
| **Hexagonal Architecture** | Domain layer has zero framework dependencies. Infrastructure implements domain ports. Application uses only ports. |
| **CQRS (Command Query Responsibility Segregation)** | Writes are Commands (`RegisterHandler`, `LogoutHandler`). Reads are Queries (`LoginHandler` — returns data but has side effects, pragmatic compromise). |
| **Partial Unique Index** | `WHERE provider IS NOT NULL` on (provider, providerId) — prevents duplicate OAuth accounts without affecting password-only users. |
| **Fail-Fast Secret Check** | `jwt.module.ts:8-10`: throws at NestJS module load time if `JWT_SECRET` is not set — prevents runtime surprises. |
| **Anti-Corruption Layer** | `UserRepository.toDomain()` / `.toOrm()` — explicit bidirectional mapping isolates domain from ORM changes. |

---

## 3. DATA STRUCTURES

### 3.1 Token Payload (JWT Claims)

```typescript
// src/infrastructure/jwt/jwt-adapter.service.ts:6-13
interface TokenPayload {
  sub: string;           // User UUID — JWT standard "subject" claim
  email: string;         // User's email address
  role: Role;            // CUSTOMER or ADMIN
  jti: string;           // UUID — unique per access token for blocklist lookup
  tenantId?: string | null;  // Multi-tenancy group (future SaaS)
  orgId?: string | null;     // Org within a tenant (future SaaS)
}
```

Concrete payload example (before signing):
```json
{
  "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "alice@example.com",
  "role": "CUSTOMER",
  "jti": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "tenantId": null,
  "orgId": null,
  "iat": 1710500000,
  "exp": 1710500900
}
```

### 3.2 Auth Tokens (Return Value)

```typescript
// src/infrastructure/jwt/jwt-adapter.service.ts:15-22
interface AuthTokens {
  accessToken: string;    // Signed JWT, expiresIn: '15m'
  refreshToken: string;   // 80-char hex from crypto.randomBytes(40) — NOT a JWT
  jti: string;            // UUID for this access token — pass back on logout/refresh
}
```

### 3.3 User Domain Entity

```typescript
// src/domain/entities/user.entity.ts:5-24
interface UserProps {
  id: string;              // UUID generated by application (crypto.randomUUID())
  email: Email;            // Email value object — validated and normalized
  password: Password | null; // Password value object wrapping Argon2 hash — null = OAuth-only
  role: Role;              // CUSTOMER | ADMIN
  isEmailVerified: boolean; // false for password, true for OAuth
  isActive: boolean;       // Soft-deactivation — false = all auth rejected
  createdAt: Date;         // Set in handler before persistence
  updatedAt: Date;         // Updated on email verify, password change, deactivation
  provider?: string | null;     // 'google' | 'github' | null (password users)
  providerId?: string | null;   // Opaque ID from OAuth provider
  firstName?: string | null;    // From OAuth profile
  lastName?: string | null;     // From OAuth profile
  picture?: string | null;      // Avatar URL from OAuth profile
  tenantId?: string | null;     // Multi-tenancy group
  orgId?: string | null;        // Org within tenant
}
```

The `User` aggregate also exposes domain behaviors:
- `verifyEmail()` (`user.entity.ts:80-86`) — sets `isEmailVerified=true`, throws if already true
- `changePassword(newPassword)` (`user.entity.ts:88-91`) — replaces password value object
- `deactivate()` (`user.entity.ts:93-99`) — sets `isActive=false`, throws if already false

### 3.4 OAuth User Profile

```typescript
// src/application/commands/oauth-login.command.ts:1-9
interface OAuthUserProfile {
  email: string;      // Verified email from provider
  provider: string;   // 'google' | 'github'
  providerId: string; // Opaque ID from provider
  firstName?: string; // From provider profile
  lastName?: string;  // From provider profile
  picture?: string;   // Avatar URL from provider
}
```

### 3.5 Domain Event Payloads

| Event | Fields | Emitted When |
|-------|--------|-------------|
| `UserRegisteredEvent` | `userId`, `email`, `provider?` | After successful registration (password or OAuth) |
| `UserLoggedInEvent` | `userId`, `email`, `ip?`, `userAgent?` | After successful password or OAuth login |
| `UserLoginFailedEvent` | `email`, `reason`, `ip?` | Wrong password, non-existent user, inactive user |
| `UserPasswordChangedEvent` | `userId` | (Defined, not currently emitted) |
| `UserDeactivatedEvent` | `userId` | (Defined, not currently emitted) |

### 3.6 Redis Key Schema

| Key Pattern | Redis Type | Value | TTL | Purpose |
|-------------|-----------|-------|-----|---------|
| `refresh:{userId}:{tokenId}` | String | `userId` string | 604800s (7d) | Store valid refresh token — presence = valid |
| `sessions:{userId}` | Set | Token ID strings | 604800s (7d) | All active tokens for user — O(1) full revocation |
| `blocklist:jti:{jti}` | String | `"1"` | 900s (15m) | Revoked access token JTIs |
| `login:attempts:{email}` | String (int) | Failure count | 900s (sliding) | Brute-force attempt counter |
| `login:locked:{email}` | String | `"1"` | 900s | Account lock flag |

Concrete key examples:
- `refresh:f47ac10b:a1b2c3d4e5f6...` → `"f47ac10b"`
- `sessions:f47ac10b` → `{"a1b2c3d4e5f6...", "ff9988aa77bb..."}`
- `blocklist:jti:dead-beef-1234...` → `"1"`
- `login:attempts:alice@example.com` → `"3"`
- `login:locked:alice@example.com` → `"1"`

### 3.7 TypeORM Entity (DB Schema)

```typescript
// src/infrastructure/database/user.orm-entity.ts:16-72
@Entity('users')
@Index(['provider', 'providerId'], { unique: true, where: '"provider" IS NOT NULL' })
class UserOrmEntity {
  @PrimaryColumn('uuid')        id!: string;
  @Column({ unique: true })     email!: string;
  @Column({ nullable: true })   passwordHash!: string | null;  // null = OAuth-only
  @Column('varchar', 50)        role!: string;
  @Column({ default: false })   isEmailVerified!: boolean;
  @Column({ default: true })    isActive!: boolean;
  @Column({ nullable: true })   provider!: string | null;
  @Column({ nullable: true })   providerId!: string | null;
  @Column({ nullable: true })   firstName!: string | null;
  @Column({ nullable: true })   lastName!: string | null;
  @Column({ nullable: true })   picture!: string | null;
  @Column({ nullable: true })   tenantId!: string | null;
  @Column({ nullable: true })   orgId!: string | null;
  @CreateDateColumn()           createdAt!: Date;
  @UpdateDateColumn()           updatedAt!: Date;
  @VersionColumn()              version!: number;  // Optimistic concurrency
}
```

---

## 4. ALGORITHM DIAGRAMS

### 4.1 Registration (`RegisterHandler`)

```
INPUT: { email: "alice@example.com", password: "Secure123!" }

   ┌──────────────────────────┐
   │ ① Email.create(email)    │   value-objects/email.value-object.ts:4-15
   │   Validates format       │   Regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
   │   Normalizes lowercase   │
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────┐
   │ ② Find existing user     │   register.handler.ts:36-41
   │   findByEmail("alice@...")│   → If found: throw 409 ConflictException
   │   → null (no duplicate)  │
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────────────────┐
   │ ③ argon2.hash("Secure123!")          │
   │   Input:  "Secure123!"               │
   │   Output: "$argon2id$v=19$m=65536,   │
   │             t=3,p=4$...hashed..."     │
   │                                      │
   │ ④ Password.create(hash)              │
   │   → wraps hash in Password VO        │
   └──────────┬───────────────────────────┘
              ▼
   ┌──────────────────────────────────────────┐
   │ ⑤ User.create({                          │
   │     id: crypto.randomUUID(),              │  // "f47ac10b-..."
   │     email: emailVO,                       │
   │     password: passwordVO,                 │
   │     role: Role.CUSTOMER,                  │
   │     isEmailVerified: false,               │
   │     isActive: true,                       │
   │     createdAt: now,                       │
   │     updatedAt: now                        │
   │   })                                      │
   └──────────┬───────────────────────────────┘
              ▼
   ┌──────────────────────────────┐
   │ ⑥ userRepository.save(user)  │  user.repository.ts:36-40
   │   → toOrm(user) maps to      │  Bidirectional mapping:
   │     UserOrmEntity            │  user.email.getValue() → orm.email
   │   → INSERT INTO users ...    │  user.password.getValue() → orm.passwordHash
   │   → toDomain(saved) maps     │
   │     back to User entity      │
   └──────────┬───────────────────┘
              ▼
   ┌─────────────────────────────────────────────┐
   │ ⑦ kafkaClient.emit('user.registered', {     │  register.handler.ts:65-75
   │     userId: "f47ac10b-...",                  │  Fire-and-forget
   │     email: "alice@example.com",              │  Errors logged, not thrown
   │     timestamp: "2025-03-15T10:30:00.000Z"    │
   │   })                                         │
   └──────────┬──────────────────────────────────┘
              ▼
OUTPUT: { id: "f47ac10b-...", email: "alice@example.com" }  ← HTTP 201
```

### 4.2 Login (`LoginHandler`)

```
INPUT: { email: "alice@example.com", password: "Secure123!" }

   ┌──────────────────────────────────────┐
   │ ① loginAttemptService.isLocked(      │  login.handler.ts:41-47
   │     "alice@example.com")             │
   │   → Redis EXISTS                     │
   │     "login:locked:alice@example.com" │
   │   → 0 (not locked) → continue        │
   └──────────┬───────────────────────────┘
              ▼
   ┌──────────────────────────────────────┐
   │ ② userRepository.findByEmail(        │  login.handler.ts:50
   │     "alice@example.com")             │
   │   → TypeORM: SELECT * FROM users     │
   │     WHERE email = 'alice@...'        │
   │   → User entity found, isActive=true │
   │   → user.password != null ✓          │
   └──────────┬───────────────────────────┘
              ▼
   ┌────────────────────────────────────────────┐
   │ ③ argon2.verify(                            │  login.handler.ts:64-67
   │     "$argon2id$v=19$...",  // stored hash   │  Timing-safe comparison
   │     "Secure123!")           // candidate     │
   │   → true ✓                                  │
   └──────────┬─────────────────────────────────┘
              ▼
   ┌──────────────────────────────────────┐
   │ ④ loginAttemptService.clearAttempts( │  login.handler.ts:75
   │     "alice@example.com")             │
   │   → Redis DEL                        │
   │     "login:attempts:alice@..."       │
   │     "login:locked:alice@..."         │
   └──────────┬───────────────────────────┘
              ▼
   ┌─────────────────────────────────────────┐
   │ ⑤ jwtAdapterService.generateTokens({    │  jwt-adapter.service.ts:27-54
   │     id: "f47ac10b-...",                 │
   │     email: "alice@example.com",         │
   │     role: Role.CUSTOMER,                │
   │     tenantId: null,                     │
   │     orgId: null                         │
   │   })                                    │
   │                                         │
   │   → jti = crypto.randomUUID()           │
   │     = "a1b2c3d4-e5f6-..."              │
   │                                         │
   │   → accessToken = jwtService.sign(      │
   │       {sub,email,role,jti,...},         │
   │       {expiresIn:'15m'})                │
   │     = "eyJhbGciOiJIUzI1NiIs..."         │
   │                                         │
   │   → refreshToken = crypto               │
   │       .randomBytes(40).toString('hex')  │
   │     = "3fa85f64e83c4a1f9b..."(80 hex)  │
   │                                         │
   │   → Returns {                           │
   │       accessToken:"eyJ...",             │
   │       refreshToken:"3fa8...",           │
   │       jti:"a1b2c3d4-..."                │
   │     }                                   │
   └──────────┬──────────────────────────────┘
              ▼
   ┌──────────────────────────────────────────┐
   │ ⑥ tokenStoreService.storeRefreshToken(   │  login.handler.ts:87-90
   │     "f47ac10b-...",  // userId            │
   │     "3fa85f64...")    // refreshToken     │
   │                                          │
   │   → Redis SET                            │
   │     refresh:f47ac10b-...:3fa85f64...      │
   │     "f47ac10b-..."                        │
   │     EX 604800                             │
   │                                          │
   │   → Redis SADD                           │
   │     sessions:f47ac10b-...                  │
   │     "3fa85f64..."                         │
   │                                          │
   │   → Redis EXPIRE                         │
   │     sessions:f47ac10b-...                  │
   │     604800                                │
   └──────────┬───────────────────────────────┘
              ▼
   ┌────────────────────────────────────────────┐
   │ ⑦ kafkaClient.emit('user.logged_in', {     │  login.handler.ts:94-104
   │     userId: "f47ac10b-...",                 │
   │     email: "alice@example.com",             │
   │     timestamp: "2025-03-15T10:30:00.000Z"   │
   │   })                                        │
   └──────────┬─────────────────────────────────┘
              ▼
OUTPUT: {
  accessToken: "eyJhbGciOiJIUzI1NiIs...",
  refreshToken: "3fa85f64e83c4a1f9b...",
  jti: "a1b2c3d4-e5f6-..."
}  ← HTTP 200
```

**Side-by-side: Valid vs Locked Account**

```
    VALID PATH                              LOCKED PATH
    ──────────                              ───────────
    isLocked() → false                      isLocked() → true
      │                                       │
      ▼                                       ▼
    findByEmail() → User found           HttpException(429)
    argon2.verify() → true                "Account temporarily locked"
    clearAttempts()                        ← NO DB ACCESS
    generateTokens()                        ← NO PASSWORD CHECK
    storeRefreshToken()                     ← NO TOKEN GENERATION
    emit('user.logged_in')
    → 200 AuthTokens                       → 429 Too Many Requests
```

### 4.3 Token Refresh (`RefreshTokenHandler`)

```
INPUT: {
  userId: "f47ac10b-...",
  refreshToken: "3fa85f64e83c...",    // old refresh token
  currentJti: "a1b2c3d4-e5f6-..."     // old access token's JTI
}

   ┌──────────────────────────────────────────┐
   │ ① tokenStore.getUserIdByRefreshToken(    │  refresh-token.handler.ts:31-34
   │     "f47ac10b-...",                       │
   │     "3fa85f64e83c...")                    │
   │                                          │
   │   → Redis GET                            │
   │     refresh:f47ac10b-...:3fa85f64e83c... │
   │   → "f47ac10b-..." ≠ null ✓              │
   │   (if null → 401 "expired/invalid")      │
   └──────────┬───────────────────────────────┘
              ▼
   ┌──────────────────────────────────┐
   │ ② userRepository.findById(       │  refresh-token.handler.ts:40-43
   │     "f47ac10b-...")              │
   │   → User found, isActive=true ✓  │
   │   (if !active → 401)             │
   └──────────┬───────────────────────┘
              ▼
   ┌──────────────────────────────────────────┐
   │ ③ tokenStore.blocklistJti(               │  refresh-token.handler.ts:46-51
   │     "a1b2c3d4-e5f6-...",  // old jti     │  Only if currentJti provided
   │     900)                   // 15 min      │
   │                                          │
   │   → Redis SET                            │
   │     blocklist:jti:a1b2c3d4-e5f6-...      │
   │     "1"                                  │
   │     EX 900                               │
   └──────────┬───────────────────────────────┘
              ▼
   ┌──────────────────────────────────────────┐
   │ ④ tokenStore.revokeRefreshToken(         │  refresh-token.handler.ts:54
   │     "f47ac10b-...",  // userId            │
   │     "3fa85f64e83c...") // old refresh    │
   │                                          │
   │   → Redis DEL                            │
   │     refresh:f47ac10b-...:3fa85f64e83c... │
   │   → Redis SREM                           │
   │     sessions:f47ac10b-...                 │
   │     "3fa85f64e83c..."                     │
   └──────────┬───────────────────────────────┘
              ▼
   ┌─────────────────────────────────┐
   │ ⑤ Generate new tokens           │  Same as Login step ⑤
   │   newJti = crypto.randomUUID()  │
   │   newAccessToken = jwt sign     │
   │   newRefreshToken = 80-char hex │
   └──────────┬──────────────────────┘
              ▼
   ┌──────────────────────────────────┐
   │ ⑥ tokenStore.storeRefreshToken( │  refresh-token.handler.ts:66-69
   │     "f47ac10b-...",              │
   │     newRefreshToken)             │
   │   → Redis SET + SADD + EXPIRE    │
   └──────────┬───────────────────────┘
              ▼
OUTPUT: {
  accessToken: "eyJhbGciOiJI...(new)",
  refreshToken: "ff9922aa77...(new)",
  jti: "dead-beef-1234...(new)"
}  ← HTTP 200
```

**Token lifecycle during rotation:**
```
  Before Refresh:                      After Refresh:
  ┌─────────────┐                     ┌─────────────┐
  │ old refresh │ ← DELETED          │ new refresh │ ← STORED
  │ old access  │                    │ new access  │
  ├─────────────┤                    ├─────────────┤
  │ old jti     │ ← BLOCKLISTED     │ new jti     │
  └─────────────┘   (TTL 900s)      └─────────────┘
```

### 4.4 Logout (`LogoutHandler`)

```
INPUT: {
  refreshToken: "3fa85f64e83c...",
  userId: "f47ac10b-...",
  jti?: "a1b2c3d4-e5f6-..."       // From req.user.jti or DTO
}

   ┌──────────────────────────────────────┐
   │ if (jti is present) {                │  logout.handler.ts:16-18
   │   tokenStore.blocklistJti(           │  Only runs if jti was extracted
   │     "a1b2c3d4-e5f6-...",             │  from authenticated request
   │     900)                              │
   │                                      │
   │   → Redis SET                        │
   │     blocklist:jti:a1b2c3d4-e5f6-...  │
   │     "1" EX 900                       │
   │ }                                    │
   └──────────┬───────────────────────────┘
              ▼
   ┌──────────────────────────────────────┐
   │ tokenStore.revokeRefreshToken(       │  logout.handler.ts:21
   │   "f47ac10b-...",                     │  ALWAYS runs
   │   "3fa85f64e83c...")                  │
   │                                      │
   │ → Redis DEL                          │
   │   refresh:f47ac10b-...:3fa85f64...   │
   │ → Redis SREM                         │
   │   sessions:f47ac10b-...               │
   │   "3fa85f64e83c..."                   │
   └──────────┬───────────────────────────┘
              ▼
OUTPUT: { message: "Logged out successfully" }  ← HTTP 200
```

### 4.5 OAuth Login (`OAuthLoginHandler`) — The 3-Branch Algorithm

```
INPUT (from Passport callback): {
  email: "bob@gmail.com",
  provider: "google",
  providerId: "google-user-id-789012",
  firstName: "Bob",
  lastName: "Smith",
  picture: "https://lh3.googleusercontent.com/..."
}

   ┌──────────────────────────────────────────┐
   │ ① userRepository.findByProvider(         │  oauth-login.handler.ts:37
   │     "google",                             │  PRIMARY LOOKUP
   │     "google-user-id-789012")              │  Prevents email collision attacks
   └──────────┬───────────────────────────────┘
              ▼
              Is user found?
         ┌────┼────┐
        YES   │   NO
         │    │    │
         │    │    ▼
         │    │  ┌─────────────────────────────────────┐
         │    │  │ ② userRepository.findByEmail(        │  oauth-login.handler.ts:41
         │    │  │     "bob@gmail.com")                 │  FALLBACK LOOKUP
         │    │  └────────────┬────────────────────────┘
         │    │               ▼
         │    │           Email found?
         │    │      ┌────┼────┐
         │    │     YES   │   NO
         │    │      │    │    │
         │    │      │    │    ▼
         │    │      │    │  ┌─────────────────────────────────────┐
         │    │      │    │  │ ③ commandBus.execute(               │  oauth-login.handler.ts:63-72
         │    │      │    │  │     OAuthRegisterCommand({          │  BRANCH C: New user
         │    │      │    │  │       email: "bob@gmail.com",       │
         │    │      │    │  │       provider: "google",           │
         │    │      │    │  │       providerId: "google-789012",  │
         │    │      │    │  │       firstName: "Bob",             │
         │    │      │    │  │       lastName: "Smith",            │
         │    │      │    │  │       picture: "https://..."        │
         │    │      │    │  │   }))                               │
         │    │      │    │  │                                     │
         │    │      │    │  │ → Creates User(password=null,       │
         │    │      │    │  │   isEmailVerified=true)             │
         │    │      │    │  │ → Persists to DB                    │
         │    │      │    │  │ → Emits user.registered             │
         │    │      │    │  │                                     │
         │    │      │    │  │ Then re-fetch by provider           │
         │    │      │    │  └────────────┬────────────────────────┘
         │    │      │    │               │
         │    │      │    │               ▼
         │    │      │    │              user = findByProvider(...)
         │    │      │    │
         │    │      │    ▼
         │    │      │  ┌─────────────────────────────────────┐
         │    │      │  │ BRANCH B: Auto-link                  │
         │    │      │  │ user = existingByEmail (password acct)│
         │    │      │  │                                     │
         │    │      │  │ kafkaClient.emit(                    │  oauth-login.handler.ts:49-60
         │    │      │  │   'user.oauth_linked', {             │
         │    │      │  │     userId: existingByEmail.id,      │
         │    │      │  │     provider: "google",              │
         │    │      │  │     providerId: "google-789012",     │
         │    │      │  │     timestamp: "..."                 │
         │    │      │  │   })                                 │
         │    │      │  └────────────┬────────────────────────┘
         │    │      │               │
         │    └──────┴───────────────┘
         │              │
         ▼              ▼                ← All 3 branches converge here
   ┌──────────────────────────────────────┐
   │ ④ Guard: user && user.isActive?      │  oauth-login.handler.ts:77-81
   │   → If false: 401 Unauthorized       │
   └──────────┬───────────────────────────┘
              ▼
   ┌──────────────────────────────────┐
   │ ⑤ jwtAdapterService              │  Same as Login/Refresh
   │   .generateTokens({...})         │  oauth-login.handler.ts:84-90
   └──────────┬───────────────────────┘
              ▼
   ┌──────────────────────────────────┐
   │ ⑥ tokenStoreService              │
   │   .storeRefreshToken(userId, rt) │  oauth-login.handler.ts:93-96
   └──────────┬───────────────────────┘
              ▼
   ┌──────────────────────────────────┐
   │ ⑦ kafkaClient.emit(             │  oauth-login.handler.ts:99-111
   │   'user.logged_in', {...})       │
   └──────────┬───────────────────────┘
              ▼
OUTPUT: { accessToken, refreshToken, jti }
  Then in OAuthController (oauth.controller.ts:76-82):
  → Set-Cookie: refresh_token={rt}; HttpOnly; Secure; SameSite=Strict; Max-Age=604800000
  → JSON body: { accessToken, jti }
```

---

## 5. EVENT LIFECYCLE — Complete Login Trace

**Scenario**: Alice logs in with `alice@example.com` / `Secure123!`. She has a valid account with UUID `f47ac10b-58cc-4372-a567-0e02b2c3d479`.

```
Step 1 — HTTP Request Arrives
  POST /auth/login
  Body: { "email": "alice@example.com", "password": "Secure123!" }

Step 2 — GlobalValidationPipe (main.ts:27-33)
  Validates LoginDto: @IsEmail on email ✓, @IsNotEmpty on password ✓
  Strips unknown fields (whitelist:true)
  Extra field like "admin":true → rejected (forbidNonWhitelisted:true)

Step 3 — ThrottlerGuard (auth.controller.ts:35)
  Redis: GET throttler:{tenant-id}:auth/login:{client-ip}
  → Count < 10 → allowed
  → INCR key with TTL 60000ms

Step 4 — AuthController.login() (auth.controller.ts:62-64)
  queryBus.execute(new LoginQuery(loginDto))

Step 5 — QueryBus routes to LoginHandler (@QueryHandler(LoginQuery))

Step 6 — LoginHandler.execute() expands into 9 sub-steps:

  6a. Lockout Check (login.handler.ts:41-47)
      Redis (login-attempt.store.ts:46-48):
        EXISTS login:locked:alice@example.com
      → 0 (not locked) → continue

  6b. User Lookup (login.handler.ts:50)
      TypeORM query (user.repository.ts:18-21):
        SELECT * FROM users WHERE email = 'alice@example.com'
      → Row returned: id=f47ac10b-..., email=alice@example.com,
        passwordHash=$argon2id$v=19$m=65536,t=3,p=4$...,
        role=CUSTOMER, isActive=true, isEmailVerified=false, ...
      → UserRepository.toDomain() (user.repository.ts:44-63):
        - Email.create("alice@example.com") → value object
        - Password.create("$argon2id$v=19$...") → value object
        - Returns User entity with all props

  6c. Activity Guard (login.handler.ts:51-53)
      user.isActive → true ✓
      user.password → not null ✓ (not OAuth-only)

  6d. Password Verification (login.handler.ts:64-67)
      argon2.verify("$argon2id$v=19$...", "Secure123!")
      → true ✓ (argon2 extracts salt & params from hash, re-computes)

  6e. Clear Lockout (login.handler.ts:75)
      Redis (login-attempt.store.ts:53-55):
        DEL login:attempts:alice@example.com
        DEL login:locked:alice@example.com

  6f. Generate Tokens (jwt-adapter.service.ts:27-54)
      jti = crypto.randomUUID() → "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
      TokenPayload = {
        sub: "f47ac10b-...",
        email: "alice@example.com",
        role: "CUSTOMER",
        jti: "a1b2c3d4-...",
        tenantId: null,
        orgId: null
      }
      accessToken = jwtService.sign(payload, {expiresIn:'15m'})
        = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmNDdhYz..."
      refreshToken = crypto.randomBytes(40).toString('hex')
        = "3fa85f64e83c4a1f9b2c0d7e5a8936b7c128d3e4f5a60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9"

  6g. Store Refresh Token (login.handler.ts:87-90)
      Redis (token-store.service.ts:34-45):
        SET refresh:f47ac10b-...:3fa85f64e83c... "f47ac10b-..." EX 604800
        SADD sessions:f47ac10b-... "3fa85f64e83c..."
        EXPIRE sessions:f47ac10b-... 604800

  6h. Emit Event (login.handler.ts:94-103)
      kafkaClient.emit('user.logged_in', {
        userId: "f47ac10b-...",
        email: "alice@example.com",
        timestamp: "2025-03-15T10:30:00.000Z"
      })
      → Kafka message published to topic 'user.logged_in'

  6i. Return Tokens
      return { accessToken, refreshToken, jti }

Step 7 — Controller returns JSON
  HTTP 200
  Body: {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "3fa85f64e83c4a1f...",
    "jti": "a1b2c3d4-e5f6-..."
  }
```

**Total infrastructure calls**: 3 Redis reads, 2 Redis writes, 1 PostgreSQL read, 1 Kafka publish.  
**Total time (typical)**: ~5-15ms Redis + ~2-5ms PostgreSQL + ~2ms Kafka = 10-22ms.

---

## 6. FULL-STACK FLOW — Horizontal Swimlane

```
  User        API Gateway      AuthController    LoginHandler      PostgreSQL        Redis            Kafka
  │           │                │                 │                 │                 │                 │
  ├─POST──────▶│                │                 │                 │                 │                 │
  │ /api/auth/ │                │                 │                 │                 │                 │
  │ login      ├─proxy─────────▶│                 │                 │                 │                 │
  │            │ /auth/login    ├─ValidationPipe──▶│                 │                 │                 │
  │            │                │ queryBus.execute │                 │                 │                 │
  │            │                │ (LoginQuery) ────▶│                 │                 │                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 ├─isLocked────────┼────────────────▶│                 │
  │            │                │                 │                 │  EXISTS          │                 │
  │            │                │                 │◀────────────────┼─────────────────│                 │
  │            │                │                 │  false (ok)     │                 │                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 ├─findByEmail─────▶│                 │                 │
  │            │                │                 │                 │  SELECT email..  │                 │
  │            │                │                 │◀────────────────│                 │                 │
  │            │                │                 │  User entity    │                 │                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 │ argon2.verify() │                 │                 │
  │            │                │                 │ → true          │                 │                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 ├─clearAttempts───┼────────────────▶│                 │
  │            │                │                 │                 │  DEL attempts    │                 │
  │            │                │                 │                 │  DEL locked      │                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 │ generateTokens()│                 │                 │
  │            │                │                 │ jti=UUID        │                 │                 │
  │            │                │                 │ accessToken=JWT │                 │                 │
  │            │                │                 │ refreshToken=hex│                 │                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 ├─storeRefresh────┼────────────────▶│                 │
  │            │                │                 │                 │  SET refresh:..  │                 │
  │            │                │                 │                 │  SADD sessions:..│                 │
  │            │                │                 │◀────────────────┼─────────────────│                 │
  │            │                │                 │                 │                 │                 │
  │            │                │                 │ kafkaClient ────┼───────────────────────────────▶│
  │            │                │                 │ .emit('user     │                                │ user.logged_in
  │            │                │                 │  .logged_in')   │                                │
  │            │                │                 │                 │                 │                 │
  │            │                │◀──AuthTokens────│                 │                 │                 │
  │            │                │                 │                 │                 │                 │
  │            │◀─HTTP 200──────│                 │                 │                 │                 │
  │◀─200───────│                │                 │                 │                 │                 │
  │ {at,rt,    │                │                 │                 │                 │                 │
  │  jti}      │                │                 │                 │                 │                 │
```

---

## 7. DESIGN DECISIONS

### 7.1 Why opaque refresh token instead of signed JWT?

A self-signed JWT refresh token could be validated without hitting the server. This means no way to revoke it. **Without this**: a stolen refresh token grants unlimited access until it expires (7 days). With an opaque string stored in Redis, revocation is instant — delete the key.

### 7.2 Why JTI blocklist instead of relying on JWT expiry alone?

JWT access tokens are stateless and self-validating — even after logout, they remain valid until their natural 15-minute expiry. **Without this**: a user who logs out could have their access token used for up to 15 more minutes. JTI blocklisting provides pre-expiry revocation.

### 7.3 Why Redis Set (`sessions:userId`) instead of Redis SCAN?

Without the session index, revoking all user tokens requires `SCAN refresh:{userId}:*` which is O(N) across the entire keyspace. **Without this**: global logout on a user with 50 sessions would scan millions of keys. The Set makes lookup O(1).

### 7.4 Why brute-force lockout check before DB lookup?

If the DB is hit first, an attacker can flood it with login attempts and exhaust connection pools. **Without this**: a brute-force attack on a single email address causes DB saturation for all legitimate users. Redis absorbs the load at near-zero latency.

### 7.5 Why `(provider, providerId)` lookup before email lookup in OAuth?

An attacker could create a Google account with `victim@company.com` and use OAuth to hijack the victim's existing password account. **Without this**: anyone who controls an email address on a provider can take over the corresponding password account. The (provider, providerId) lookup ensures OAuth identity matches first.

### 7.6 Why `password: null` instead of a dummy hash for OAuth-only users?

Using a dummy hash (e.g., `@no_password`) would require special-case logic across every password check to skip it. `null` is semantically correct and impossible to pass `argon2.verify()`. **Without this**: a code path that forgets the special case could authenticate with a known dummy value.

### 7.7 Why `crypto.randomUUID()` instead of DB `GENERATED` UUID?

DDD principle: the domain layer owns identity, not the database. The ID is created in the handler before persistence. **Without this**: the domain entity would be incomplete until after DB insertion, requiring nullable ID fields or two-step construction.

### 7.8 Why Argon2 instead of bcrypt?

Argon2id is memory-hard (configurable memory cost via `m=65536`), making it resistant to GPU/ASIC parallel attacks. bcrypt is CPU-hard only. **Without this**: an attacker with GPU hardware could attempt billions of password guesses per second against a leaked hash database.

### 7.9 Why `kafkaClient.emit()` without `await`?

Kafka publishing is non-critical for auth operations. A Kafka outage should not prevent users from logging in or registering. **Without this**: a Kafka broker failure would cause login/registration failures across the entire application.

### 7.10 Why HttpOnly cookie for OAuth refresh tokens?

OAuth callback returns a refresh token in a redirect response. If placed in the JSON body, it's accessible to JavaScript and vulnerable to XSS. HttpOnly cookies are invisible to scripts. **Without this**: any XSS vulnerability in the frontend could exfiltrate 7-day refresh tokens.

---

## 8. EDGE CASES TABLE

| Scenario | How Handled | Source Lines |
|----------|-------------|-------------|
| Empty email on registration | `Email.create()` throws `"Email cannot be empty"` before DB access | `email.value-object.ts:5-7` |
| Malformed email ("not-an-email") | Regex validation fails, throws `"Invalid email format"` | `email.value-object.ts:9-11` |
| Duplicate email registration | `findByEmail()` returns existing → `throw new ConflictException` | `register.handler.ts:36-41` |
| Empty password hash passed to value object | `Password.create()` throws `"Password hash cannot be empty"` | `password.value-object.ts:5-7` |
| OAuth-only account tries password login | `user.password === null` guard → `UnauthorizedException` | `login.handler.ts:58-62` |
| Account locked (5+ failed attempts) | `isLocked()` returns true → `HttpException(429)` before any DB call | `login.handler.ts:41-47` |
| Expired/ non-existent refresh token | `getUserIdByRefreshToken()` returns null → `UnauthorizedException` | `refresh-token.handler.ts:35-37` |
| Inactive user tries refresh | `findById()` returns user with `isActive=false` → `UnauthorizedException` | `refresh-token.handler.ts:41-43` |
| User not found when refreshing | `findById()` returns null → `UnauthorizedException` | `refresh-token.handler.ts:41-43` |
| Kafka broker unreachable during emit | `.emit()` throws → caught, `logger.error()`, operation succeeds | `register.handler.ts:70-75` |
| JWT_SECRET not set at startup | Module-level check throws `"JWT_SECRET environment variable is required"` | `jwt.module.ts:8-10` |
| OAuth provider missing client ID/secret | Strategy constructor throws before any request handled | `google.strategy.ts:18-21` |
| Google account without verified email | `emails.find(e => e.verified !== false)` fails → `done(err)` | `google.strategy.ts:43-49` |
| GitHub account without verified email | No verified email found → `done(err)` with clear message | `github.strategy.ts:48-55` |
| Unknown JSON fields in request body | `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` strips + rejects | `main.ts:28-32` |
| Rate limit exceeded (10 req/60s) | `ThrottlerGuard` returns HTTP 429 via Redis counter | `auth.controller.ts:35` |
| Missing jti on refresh | Guard: `if (currentJti)` — blocklisting skipped, rotation proceeds normally | `refresh-token.handler.ts:46-51` |
| Multiple concurrent logins from same user | New `SADD` to `sessions:{userId}` — each device gets own refresh token | `token-store.service.ts:43` |
| Logout without jti (no access token to blocklist) | Guard: `if (jti)` — blocklist call skipped, only refresh token revoked | `logout.handler.ts:16-18` |
| Unknown provider string passed | `OAuthIdentity.create()` normalizes to lowercase but accepts any string | `oauth-identity.value-object.ts:10` |
| User already inactive on deactivate() | `deactivate()` throws `"User is already inactive"` — idempotent guard | `user.entity.ts:94-96` |
| Email already verified on verifyEmail() | `verifyEmail()` throws `"Email is already verified"` — idempotent guard | `user.entity.ts:81-83` |
| Redis connection failure during health check | `redis.ping()` throws → caught → returns `{ redis: { status: 'down' } }` | `health.controller.ts:30-36` |
| Memory usage exceeds 512MB | `checkHeap('memory_heap', 512*1024*1024)` returns degraded status | `health.controller.ts:40` |

---

## 9. INTEGRATION POINT — LoginHandler with Inline Annotations

```typescript
// src/application/handlers/login.handler.ts:37-119
async execute(query: LoginQuery): Promise<AuthTokens> {
  // query.dto = { email: "alice@example.com", password: "Secure123!" }
  // ——————— DTO is already validated by ValidationPipe at this point
  const { email, password } = query.dto;

  // ── GUARD 1: Brute-force lockout (Redis, no DB) ──────────────────────────
  // Why BEFORE DB? Attacker spraying wrong passwords shouldn't reach PostgreSQL
  const locked = await this.loginAttemptService.isLocked(email);
  if (locked) {
    // isLocked → Redis EXISTS login:locked:alice@example.com
    // After 5 failures: exists → returns true → 429 without touching DB
    throw new HttpException(
      'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  // ── STEP 2: User lookup via domain port ──────────────────────────────────
  // findByEmail → UserRepository.toDomain(ORM) → User entity
  // Domain port means: no TypeORM type leaks into LoginHandler
  const user = await this.userRepository.findByEmail(email);
  if (!user || !user.isActive) {
    // Record failed attempt (increments Redis counter, triggers lock at 5)
    await this.loginAttemptService.recordFailedAttempt(email);
    // Fire-and-forget Kafka event for SIEM/audit
    this.emitLoginFailed(email, 'User not found or inactive');
    throw new UnauthorizedException('Invalid credentials');
  }

  // ── GUARD 2: OAuth-only account blocking password login ──────────────────
  if (!user.password) {
    // user.password is null for accounts created via Google/GitHub OAuth
    // They MUST use OAuth to login, not email/password
    this.emitLoginFailed(email, 'OAuth-only account');
    throw new UnauthorizedException('Invalid credentials');
  }

  // ── STEP 3: Timing-safe password verification ────────────────────────────
  // argon2.verify extracts salt/params from hash, re-computes, compares
  // Timing-safe: comparison time independent of how many bytes match
  const isValidPassword = await argon2.verify(
    user.password.getValue(),  // Stored Argon2 hash: "$argon2id$v=19$..."
    password,                  // Plaintext from request: "Secure123!"
  );
  if (!isValidPassword) {
    await this.loginAttemptService.recordFailedAttempt(email);
    this.emitLoginFailed(email, 'Wrong password');
    throw new UnauthorizedException('Invalid credentials');
  }

  // ── STEP 4: Clear brute-force state on success ───────────────────────────
  // Deletes both: login:attempts:{email} AND login:locked:{email}
  await this.loginAttemptService.clearAttempts(email);

  // ── STEP 5: Generate token pair ──────────────────────────────────────────
  // Input:  { id:"f47a...", email:"alice@example.com", role:CUSTOMER }
  // Output: { accessToken:JWT(15min), refreshToken:80hex, jti:UUID }
  const tokens = this.jwtAdapterService.generateTokens({
    id: user.id,
    email: user.email.getValue(),
    role: user.role,
    tenantId: user.tenantId,    // null for now (future SaaS)
    orgId: user.orgId,          // null for now
  });

  // ── STEP 6: Persist refresh token to Redis ───────────────────────────────
  // Key pattern: refresh:{user.id}:{tokens.refreshToken}
  // TTL: 604800 seconds = 7 days
  // Also adds to sessions:{user.id} Set for O(1) full-session revocation
  await this.tokenStoreService.storeRefreshToken(
    user.id,              // "f47ac10b-..."
    tokens.refreshToken,  // "3fa85f64e83c..."
  );

  // ── STEP 7: Emit domain event to Kafka ───────────────────────────────────
  // Fire-and-forget: if Kafka is down, login still succeeds
  // Topic: 'user.logged_in' → consumed by analytics, notification services
  try {
    this.kafkaClient.emit('user.logged_in', {
      userId: user.id,
      email: user.email.getValue(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    this.logger.error(
      'Failed to emit user.logged_in event',
      err instanceof Error ? err.message : String(err),
    );
  }

  return tokens;  // → AuthController → 200 JSON response
}
```

---

## 10. FILE MAP

```
apps/auth-service/
├── src/
│   ├── main.ts                                    # Bootstrap: Swagger, CORS, ValidationPipe
│   ├── app.module.ts                              # Root module — wires all sub-modules
│   │
│   ├── domain/                                    # ① Pure TypeScript — zero framework deps
│   │   ├── entities/
│   │   │   └── user.entity.ts                     # User aggregate root + Props + behaviors
│   │   ├── value-objects/
│   │   │   ├── email.value-object.ts              # Validated + normalized email wrapper
│   │   │   ├── password.value-object.ts           # Hashed-password wrapper
│   │   │   ├── role.enum.ts                       # CUSTOMER | ADMIN
│   │   │   ├── oauth-identity.value-object.ts     # (provider, providerId) typed pair
│   │   │   └── __tests__/
│   │   │       ├── email.value-object.spec.ts     # Email validation unit tests
│   │   │       └── password.value-object.spec.ts  # Password wrapper unit tests
│   │   ├── ports/
│   │   │   ├── user-repository.port.ts            # Interface: findByEmail, findById, save
│   │   │   └── token-store.port.ts                # Interface: store/revoke/blocklist tokens
│   │   └── events/
│   │       ├── user-registered.event.ts           # userId, email, provider?
│   │       ├── user-logged-in.event.ts            # userId, email, ip?, userAgent?
│   │       ├── user-login-failed.event.ts         # email, reason, ip?
│   │       ├── user-password-changed.event.ts     # userId (defined, not emitted)
│   │       └── user-deactivated.event.ts          # userId (defined, not emitted)
│   │
│   ├── application/                               # ② Orchestration — use-case logic
│   │   ├── commands/
│   │   │   ├── register.command.ts                # Carries RegisterDto
│   │   │   ├── refresh-token.command.ts           # Carries RefreshTokenDto
│   │   │   ├── logout.command.ts                  # Carries refreshToken, userId, jti?
│   │   │   ├── oauth-login.command.ts             # Carries OAuthUserProfile
│   │   │   └── oauth-register.command.ts          # Carries OAuthRegisterDto
│   │   ├── queries/
│   │   │   └── login.query.ts                     # Carries LoginDto
│   │   ├── handlers/
│   │   │   ├── register.handler.ts                # Validate → hash → persist → emit
│   │   │   ├── login.handler.ts                   # Lockout → verify → tokens → emit
│   │   │   ├── refresh-token.handler.ts           # Validate → blocklist → rotate → store
│   │   │   ├── logout.handler.ts                  # Blocklist jti → revoke refresh
│   │   │   ├── oauth-login.handler.ts             # 3-branch lookup → register/link → tokens
│   │   │   ├── oauth-register.handler.ts          # Create OAuth-only user → emit
│   │   │   └── __tests__/
│   │   │       ├── register.handler.spec.ts       # 5 tests: success, duplicate, emit, error, hash
│   │   │       ├── login.handler.spec.ts          # 6 tests: valid, locked, wrong pw, inactive, emit
│   │   │       ├── refresh-token.handler.spec.ts  # 4 tests: rotate, invalid, inactive, not found
│   │   │       └── logout.handler.spec.ts         # 4 tests: revoke, blocklist, no-jti, error
│   │   └── services/
│   │       └── auth.service.ts                    # LoginAttemptService — façade over store
│   │
│   ├── infrastructure/                            # ③ Adapters to external world
│   │   ├── database/
│   │   │   ├── user.orm-entity.ts                 # TypeORM @Entity('users') — DB schema
│   │   │   ├── user.repository.ts                 # Port impl — ORM ↔ Domain mapping
│   │   │   └── database.module.ts                 # TypeORM config + USER_REPOSITORY token
│   │   ├── jwt/
│   │   │   ├── jwt-adapter.service.ts             # JWT sign + opaque refresh gen + JTI
│   │   │   └── jwt.module.ts                      # @Global() — JwtService, Passport, Adapter
│   │   ├── redis/
│   │   │   ├── token-store.service.ts             # Refresh store, session index, jti blocklist
│   │   │   ├── login-attempt.store.ts             # Sliding-window brute-force counter
│   │   │   ├── redis.module.ts                    # @Global() — REDIS_CLIENT + services
│   │   │   └── __tests__/
│   │   │       └── token-store.service.spec.ts    # Token store unit tests
│   │   ├── kafka/
│   │   │   └── kafka-producer.module.ts           # @Global() — ClientKafka producer
│   │   └── oauth/
│   │       ├── google.strategy.ts                 # Passport Google OAuth — verified email only
│   │       ├── github.strategy.ts                 # Passport GitHub OAuth — verified email only
│   │       └── oauth.module.ts                    # Passport + both strategies
│   │
│   └── interfaces/                                # ④ HTTP delivery — controllers + DTOs
│       ├── controllers/
│       │   ├── auth.controller.ts                 # /auth/register|login|refresh|logout
│       │   ├── oauth.controller.ts                # /auth/google|github + callbacks
│       │   └── health.controller.ts               # GET /health — DB + Redis + Memory
│       └── dto/
│           ├── auth.dto.ts                        # RegisterDto, LoginDto
│           ├── refresh-token.dto.ts               # RefreshTokenDto
│           ├── logout.dto.ts                      # LogoutDto
│           └── oauth-register.dto.ts              # OAuthRegisterDto
│
├── test/
│   └── app.e2e-spec.ts                            # E2E tests (minimal)
├── typeorm.config.ts                              # TypeORM CLI config for migrations
├── nest-cli.json                                  # NestJS CLI project config
├── tsconfig.json / tsconfig.build.json            # TypeScript config
├── eslint.config.mjs                              # ESLint config (flat config)
├── package.json                                   # Dependencies + scripts
├── Dockerfile                                     # Container build
├── .env / .env.example                            # Environment variables
├── .prettierrc                                    # Prettier config
├── README.md                                      # Project README
├── auth-service-architecture.md                   # Existing architecture doc
├── auth-service-endpoints-flow.md                 # Existing endpoints doc
└── auth-service-data-architecture.md              # Existing data architecture doc
```
