---
phase: 19
level: 2
researched_at: 2026-03-16
---

# Phase 19 Research — Production-Grade User & Identity Service

## Questions Investigated

1. **What is the boundary between auth-service and user-service?** Auth-service already has a `User` entity — how do we avoid duplication?
2. **What established codebase patterns must the user-service follow?** (DDD, event publishing, persistence, observability)
3. **What password hashing strategy should we use?** (bcrypt vs argon2)
4. **What user status transitions are valid?** (state machine design)
5. **What new dependencies are needed?** (the user-service is currently a bare scaffold)
6. **How should audit logging be implemented?** (security-critical operations)

## Findings

### 1. Auth-Service vs User-Service Boundary

The auth-service already owns a `User` entity at `auth-service/src/domain/entities/user.entity.ts` with:
- `id`, `email`, `password` (nullable for OAuth), `role`, `isEmailVerified`, `isActive`
- OAuth fields: `provider`, `providerId`, `firstName`, `lastName`, `picture`
- Multi-tenancy: `tenantId`, `orgId`
- Behaviors: `verifyEmail()`, `changePassword()`, `deactivate()`

**Clear boundary**:

| Concern | Auth-Service | User-Service |
|---------|-------------|-------------|
| Authentication | ✅ JWT, OAuth, sessions | ❌ |
| Password hashing/validation | ✅ owns Password VO | ❌ delegates to auth |
| Roles/RBAC | ✅ Role enum | ❌ |
| Token management | ✅ Redis token store | ❌ |
| User account lifecycle | ❌ | ✅ create, update, suspend, delete |
| User profile (display name, avatar, bio) | ❌ | ✅ |
| User settings (preferences, notifications) | ❌ | ✅ |
| User events (user.created/updated/deleted) | ❌ | ✅ Kafka publisher |
| Username management | ❌ | ✅ uniqueness, validation |

**Decision**: The user-service User entity is a separate bounded context representing the **account/profile** aggregate. It does NOT duplicate auth concerns (password, OAuth, roles). Auth-service publishes `user.registered`, and user-service consumes it to auto-create a user account record. The user-service then owns the `user.created`, `user.updated`, `user.deleted` lifecycle events for downstream consumers (notification-service, order-service, etc.).

**Password hashing in user-service context**: Since auth-service already owns password hashing via its `Password` value object, the user-service should NOT re-implement password hashing. If `ChangePassword` is needed, it should be a command that delegates to auth-service via HTTP/Kafka. For Phase 19, we will **omit** direct password hashing from user-service and keep it in auth-service where it belongs.

---

### 2. Established Codebase Patterns

All production-grade services follow these exact patterns:

**Domain Layer** (zero framework dependencies):
- Private constructor + `static create()` factory + `static reconstitute()` for DB hydration
- `_domainEvents: BaseDomainEvent[]` array with `pullDomainEvents()` method
- Value objects: wrap primitives, private constructor, `static create()`, `equals()`, `toString()`
- Status VOs: `VALID_TRANSITIONS` map + `canTransitionTo()` + `transitionTo()`
- Ports: interfaces with `Symbol` tokens (e.g., `export const USER_REPOSITORY = Symbol('USER_REPOSITORY')`)
- Domain errors: custom error classes extending `Error`

**Application Layer**:
- Commands: simple data classes (no logic)
- Handlers: `@Injectable()` with `@Inject(SYMBOL)` for repository/publisher ports
- Handler pattern: `create entity → repo.save() → pullDomainEvents() → eventPublisher.publishAll()`
- Event publisher port: `IEventPublisher { publish(), publishAll() }` with Symbol token

**Infrastructure Layer**:
- Kafka: **Transactional Outbox** pattern (events → outbox table → relay → Kafka), NOT direct Kafka publishing
- Persistence: TypeORM ORM entities + static `Mapper.toDomain()` / `Mapper.toPersistence()`
- Metrics: `prom-client` with `Counter`, `Histogram`, `Gauge`, dedicated `*MetricsService` class
- Metrics controller: `/metrics` endpoint returning `registry.metrics()`

**Interface Layer**:
- DTOs with `class-validator` decorators
- Thin controller delegating to handlers
- Module wiring with `useClass` for port bindings

---

### 3. User Status State Machine

```
ACTIVE ←→ SUSPENDED → DELETED
  ↓                      ↑
  └──────────────────────┘
```

| From | Allowed Targets |
|------|----------------|
| ACTIVE | SUSPENDED, DELETED |
| SUSPENDED | ACTIVE, DELETED |
| DELETED | *(terminal — no transitions)* |

**Rationale**: ACTIVE users can be suspended (temporary ban) or deleted. SUSPENDED users can be reactivated or permanently deleted. DELETED is a terminal state (soft-delete with anonymization).

---

### 4. Domain Model Design

**User (Aggregate Root)**:
- `id: UserId` — UUID value object
- `email: Email` — validated email VO (shared pattern with auth-service)
- `username: Username` — validated, unique, 3-30 chars, alphanumeric + underscores
- `status: UserStatus` — VO with state machine (ACTIVE, SUSPENDED, DELETED)
- `version: number` — optimistic concurrency control
- `createdAt: Date`
- `updatedAt: Date`
- Domain events: UserCreated, UserUpdated, UserDeleted, UserSuspended, UserReactivated

**UserProfile (Entity, owned by User)**:
- `userId: UserId` — FK to User
- `displayName: string | null`
- `avatar: string | null` — URL
- `bio: string | null`
- `phoneNumber: string | null`
- `dateOfBirth: Date | null`
- `updatedAt: Date`

**UserSettings (Entity, owned by User)**:
- `userId: UserId` — FK to User
- `emailNotifications: boolean` — default true
- `pushNotifications: boolean` — default true
- `smsNotifications: boolean` — default false
- `language: string` — default 'en'
- `timezone: string` — default 'UTC'
- `updatedAt: Date`

---

### 5. Event Design

**Published events** (to `user.events` Kafka topic):

| Event | Trigger | Payload |
|-------|---------|---------|
| `user.created` | User account created | userId, email, username |
| `user.updated` | Profile or settings updated | userId, changedFields |
| `user.suspended` | User suspended | userId, reason |
| `user.reactivated` | User reactivated from suspension | userId |
| `user.deleted` | User soft-deleted | userId |

**Consumed events** (from `auth.events` topic):

| Event | Action |
|-------|--------|
| `user.registered` | Auto-create user account with default profile/settings |

---

### 6. Audit Logging Strategy

Security-critical operations requiring audit logs:

- Account creation
- Profile updates (email, phone changes)
- Status transitions (suspend, reactivate, delete)
- Settings changes

**Implementation**: Dedicated `AuditLogService` writing structured JSON audit entries with:
- `timestamp`, `userId`, `action`, `targetId`, `ipAddress` (if available), `previousValue`, `newValue`

For Phase 19, audit logs will be written to structured logger (JSON format). A dedicated audit table or external audit service can be added later.

---

### 7. Rate Limiting

**Strategy**: Use NestJS `@nestjs/throttler` module for HTTP-level rate limiting. Configure per-endpoint limits:
- Account creation: 5 req/min/IP  
- Profile updates: 30 req/min/user
- General reads: 100 req/min/user

**Note**: The API Gateway (Phase 9) already implements global rate limiting (100 req/min/IP). User-service rate limiting is defense-in-depth for direct access.

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth/User boundary | Separate bounded contexts | Auth owns identity/credentials; User owns account/profile/settings |
| Password hashing | **Not in user-service** | Auth-service already owns this via Password VO; no duplication |
| Event publishing | Transactional Outbox pattern | Consistent with order-service, notification-service patterns |
| User DB | PostgreSQL (database-per-service) | Matches architecture (User DB already in ARCHITECTURE.md diagram) |
| Status state machine | Value Object with transition map | Matches OrderStatus VO pattern |
| Audit logging | Structured logger (JSON) | Pragmatic for Phase 19; dedicated audit table is a future enhancement |
| Rate limiting | `@nestjs/throttler` | Standard NestJS approach; defense-in-depth behind API Gateway |
| User ID | UUID via value object | Consistent with OrderId, UserId patterns |
| Soft delete | Status = DELETED (not hard delete) | Preserves foreign key integrity across services |

## Patterns to Follow

- Private constructor + `static create()` / `static reconstitute()` factory methods
- `BaseDomainEvent` base class with `occurredOn` and `eventType`
- `pullDomainEvents()` on aggregate root
- Repository port as interface + Symbol token injection
- `IEventPublisher` port with Transactional Outbox implementation
- TypeORM ORM entity + static Mapper class (`toDomain` / `toPersistence`)
- `prom-client` Counter/Histogram/Gauge for Prometheus metrics
- Handler pattern: create → save → pullEvents → publishAll
- Index barrel files (`index.ts`) for clean imports

## Anti-Patterns to Avoid

- **No password hashing in user-service**: auth-service already owns this concern
- **No `@nestjs` imports in domain layer**: domain must be framework-agnostic
- **No direct Kafka publishing**: must use Transactional Outbox for consistency
- **No REST calls from domain/application layers**: infrastructure adapters only
- **No ORM entities in domain**: strict mapper separation is required
- **No business logic in controllers**: thin delegation to handlers only

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `typeorm` | `^0.3.x` | ORM for PostgreSQL persistence |
| `@nestjs/typeorm` | `^11.x` | NestJS TypeORM integration |
| `pg` | `^8.x` | PostgreSQL driver |
| `prom-client` | `^15.x` | Prometheus metrics (Counter, Histogram, Gauge) |
| `class-validator` | `^0.14.x` | DTO input validation |
| `class-transformer` | `^0.5.x` | DTO transformation |
| `@nestjs/throttler` | `^6.x` | Rate limiting |
| `@nestjs/config` | `^4.x` | Environment configuration |
| `uuid` | `^11.x` | UUID generation |
| `@ecommerce/core` | `workspace:*` | Shared logger, utilities (already present) |
| `@ecommerce/events` | `workspace:*` | Shared event types (already present) |

## Risks

| Risk | Mitigation |
|------|-----------|
| Auth/User data inconsistency | Consume `user.registered` event to auto-create; use eventual consistency |
| Username uniqueness across distributed DB | Unique constraint on `username` column; handle conflict errors gracefully |
| Soft-delete leaves orphan references | Other services reference `userId` only; user status check on sensitive operations |
| Outbox table growth | Background relay + cleanup job (matches order-service pattern) |
| Missing test coverage | Mandatory domain unit tests and handler tests before marking complete |

## Ready for Planning

- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
- [x] Auth/User boundary clarified
- [x] Domain model designed
- [x] Event contracts defined
- [x] Established patterns documented
