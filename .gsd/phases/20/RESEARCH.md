---
phase: 20
level: 3
researched_at: 2026-03-16
---

# Phase 20 Research — Architecture Review & Cross-Cutting Production Hardening

## Questions Investigated

1. Which services still use `synchronize: true` and lack TypeORM migrations?
2. Which outbox implementations are atomic (same DB transaction) vs non-atomic?
3. Which ORM entities have `@VersionColumn` for optimistic locking?
4. What event naming conventions are in use, and do any events have `schemaVersion`?
5. Which consumers have idempotent processing (`processed_events` table)?
6. Which consumers have DLQ routing?
7. Which services integrate observability (logging, tracing, metrics)?
8. Which services have graceful shutdown hooks?
9. Which services have Dockerfiles? Are any migrations present?
10. How is `correlationId` propagated across services?

---

## Findings

### Wave 1: Data Safety

#### TypeORM `synchronize` Status

| Service | Value | Risk |
|---|---|---|
| order-service | `process.env.NODE_ENV !== 'production'` | 🔴 True in dev — can drop columns |
| product-service | `process.env.NODE_ENV !== 'production'` | 🔴 Same risk |
| auth-service | `process.env.NODE_ENV !== 'production'` | 🔴 Same risk |
| user-service | `false` (hardcoded) | ✅ Safe |
| inventory-service | `config.get('database.synchronize', false)` | ✅ Safe (default false) |
| payment-service | `process.env.DB_SYNC === 'true'` | ✅ Safe (default false) |

**Recommendation:** Set `synchronize: false` in all services. Introduce TypeORM migration CLI config. No migration files exist in the repo today — all schema changes rely on app-level sync.

#### `@VersionColumn` (Optimistic Locking)

| Service | Has @VersionColumn | Entity |
|---|---|---|
| order-service | ✅ | `order.orm-entity.ts` |
| product-service | ✅ | `product.orm-entity.ts` |
| user-service | ✅ | `user.orm-entity.ts` |
| payment-service | ✅ | `payment.orm-entity.ts` |
| inventory-service | ✅ | `product-inventory.orm-entity.ts` |
| auth-service | ❌ | `user.orm-entity.ts` — no version column |
| notification-service | ❌ | Uses in-memory repo — no ORM entities |

**Recommendation:** Add `@VersionColumn()` to auth-service `user.orm-entity.ts`. Notification-service is fine (in-memory or TypeORM with no concurrent writes).

#### Outbox Transaction Atomicity

| Service | Pattern | Atomic? |
|---|---|---|
| user-service | `UnitOfWork` — entity + outbox in single `DataSource.transaction()` | ✅ Atomic |
| cart-service | Outbox written separately by `OutboxRelayService` | ⚠️ Non-atomic |
| order-service | `KafkaEventPublisher.publishAll()` — creates its own `queryRunner.startTransaction()` | ⚠️ Separate TX from entity save |
| product-service | Same pattern as order-service | ⚠️ Separate TX |
| payment-service | Same pattern as order-service | ⚠️ Separate TX |
| inventory-service | `OutboxRelayService` polls outbox — outbox write during entity save uses repo transaction | ✅ Atomic (uses repo.save within QueryRunner) |

**Recommendation:** Adopt user-service `UnitOfWork` pattern across order, product, payment services. The handler should call `unitOfWork.execute(entitySave, events)` instead of separate `repo.save()` + `publisher.publishAll()`.

**Decision:** Create a shared `UnitOfWork` in `packages/core` that takes a DataSource, saves entities, and writes outbox rows in a single transaction.

---

### Wave 2: Event Architecture Consistency

#### Current Event Naming

Domain events use **PascalCase** class names:
```
OrderCreated, OrderPaid, OrderCancelled, OrderShipped, OrderCompleted
PaymentCreated, PaymentCompleted, PaymentFailed, PaymentRefunded
StockReserved, StockReleased, StockConfirmed
UserCreated, UserUpdated, UserDeleted
```

Shared `packages/events` topics use **dot-notation**:
```
order.created, order.updated, order.cancelled, order.completed
inventory.reserved, inventory.reservation_failed, inventory.released
payment.processed, payment.failed
```

Consumers handle **both** formats via dual `case` blocks. There is no single source of truth.

#### Schema Versioning

- Zero events have `schemaVersion` anywhere in the codebase
- No Zod, Joi, or class-validator schemas exist for event payloads
- The `packages/events` package has zero runtime dependencies (just TypeScript interfaces)

**Recommendation:**
1. Standardize on **dot-notation** for Kafka topic/event types: `<domain>.<entity>.<action>` (e.g., `order.order.created`)
2. Add `schemaVersion: 1` to every event interface in `packages/events`
3. Add `zod` as a dependency to `packages/events` and export validation schemas alongside interfaces
4. Remove PascalCase handling from all consumers after migration

**Decision:** Use the `packages/events` dot-notation as the canonical format. Map domain event class names to dot-notation in outbox writers.

#### Shared Event Coverage

| Domain | In packages/events? | Events Defined |
|---|---|---|
| Order | ✅ | 2 interfaces (OrderCreated, OrderStateChanged) |
| Payment | ✅ | 2 interfaces (PaymentProcessed, PaymentFailed) |
| Inventory | ✅ | 3 interfaces (Reserved, ReservationFailed, Released) |
| User | ❌ | 0 — only local domain events |
| Cart | ❌ | 0 — only local domain events |
| Product | ❌ | 0 — only local domain events |
| Notification | ❌ | 0 |
| Search | ❌ | 0 |

**Decision:** Add shared contracts for all 8 domains with Zod validation.

---

### Wave 3: Security

#### JWT Secret Handling

```typescript
// gateway.config.ts
jwt: {
  secret: process.env.JWT_SECRET || 'super-secret-key-change-in-prod',
}
```

This is the **only** hardcoded secret in the codebase. All other services use `process.env` without fallbacks.

**Recommendation:** Throw `Error('JWT_SECRET env var required')` if undefined. Also add startup validation for `DATABASE_URL`, `KAFKA_BROKERS`, and `REDIS_HOST`.

#### Service-to-Service Auth

Currently: Gateway forwards `x-user-id` and `x-user-roles` as plaintext headers. Downstream services **trust these headers** without verification.

Attack vector: Any internal service can be called directly (bypassing gateway) with forged headers.

**Options evaluated:**

| Approach | Complexity | Security Level |
|---|---|---|
| Shared HMAC signing of internal headers | Low | Medium |
| mTLS between services | Medium | High |
| Service mesh (Istio) | High | Very High |
| Token exchange (OAuth2 token relay) | Medium | High |

**Decision:** Start with **HMAC-signed internal headers** (a shared secret signs `x-user-id + timestamp` → `x-internal-signature`). This is the simplest approach that prevents header forgery. Move to mTLS when deploying to ECS (handled by Terraform security groups + service mesh later).

---

### Wave 4: Reliability Patterns

#### Idempotent Consumers

| Service | Consumer | Has processed_events | Idempotent? |
|---|---|---|---|
| order-service | `InventoryEventConsumer` | ✅ | ✅ |
| order-service | `PaymentEventConsumer` | ✅ | ✅ |
| payment-service | `PaymentCommandConsumer` | ✅ | ✅ |
| inventory-service | `OrderEventConsumer` | ✅ | ✅ |
| notification-service | `OrderEventsConsumer` | ❌ | ❌ |
| notification-service | `UserEventsConsumer` | ❌ | ❌ |
| notification-service | `CartEventsConsumer` | ❌ | ❌ |
| search-service | `ProductEventConsumer` | ❌ | ❌ (has retry but no dedup) |

**Decision:** Add `processed_events` table to notification-service and search-service. Both need TypeORM + PostgreSQL persistence (notification currently uses in-memory repo). Search-service can use `processed_events` with a simple in-memory Set as fallback.

#### DLQ Implementation

| Service | Consumer DLQ | Mechanism |
|---|---|---|
| payment-service | ✅ | Kafka DLQ producer → `payment.commands.dlq` topic |
| notification-service | ✅ | `DlqProcessorService` + `KafkaDlqPublisher` → Kafka DLQ topic |
| user-service | ⚠️ | Outbox relay marks events as dead-lettered after max retries (in DB, not Kafka) |
| order-service | ❌ | Errors logged, no DLQ |
| inventory-service | ❌ | Errors logged, no DLQ |
| search-service | ⚠️ | Logged as TODO: "In production: publish to product.events.dlq topic" |

**Decision:** Extract a shared `KafkaDlqProducer` utility into `packages/core`. Each consumer should delegate to it after max retries. Convention: `<original-topic>.dlq`.

#### Graceful Shutdown

| Service | `enableShutdownHooks()` | `OnModuleDestroy` on Kafka/Redis |
|---|---|---|
| user-service | ✅ | ✅ |
| cart-service | ✅ | ✅ |
| auth-service | ✅ | ✅ |
| api-gateway | ❌ | ❌ |
| order-service | ❌ | ⚠️ (Kafka consumers have it) |
| product-service | ❌ | ⚠️ (Redis cache has it) |
| payment-service | ❌ | ⚠️ (Kafka consumer has it) |
| inventory-service | ❌ | ⚠️ (some Kafka have it) |
| notification-service | ❌ | ✅ (all consumers/services) |
| search-service | ❌ | ⚠️ (Kafka consumer has it) |

**Decision:** Add `app.enableShutdownHooks()` to all `main.ts` files. This is a 1-line change per service.

---

### Wave 5: Observability

#### Integration Matrix

| Service | Pino Logging | OTel Tracing | Prometheus Metrics |
|---|---|---|---|
| api-gateway | ✅ `getLoggerModule()` | ❌ | ❌ |
| auth-service | ✅ | ❌ | ❌ |
| user-service | ❌ | ❌ | ❌ |
| product-service | ✅ | ❌ | ❌ |
| search-service | ✅ | ❌ | ❌ |
| cart-service | ✅ | ✅ `initTracing()` | ✅ `MetricsModule` |
| inventory-service | ✅ | ❌ | ✅ `InventoryMetricsModule` |
| order-service | ❌ | ❌ | ❌ (has custom `OrderMetricsService`) |
| payment-service | ✅ | ❌ | ✅ `PrometheusModule` |
| notification-service | ✅ | ❌ | ✅ `PrometheusModule` |

**Key finding:** Only cart-service calls `initTracing()`. The `@ecommerce/core` package has the setup, but it's not wired into 9/10 services.

**Decision:**
1. Add `initTracing('<service-name>')` to all `main.ts` files (before `NestFactory.create()`)
2. Add `MetricsModule` import to all `app.module.ts` files
3. Add `getLoggerModule()` to user-service and order-service
4. This gives consistent logging + tracing + metrics across all services

#### correlationId Propagation

Currently used in: inventory-service (controller headers), payment-service (Kafka headers), notification-service (per-notification).

Not propagated: API gateway doesn't set `x-correlation-id`. It sets `x-request-id` but that's a different concept.

**Decision:** 
- Gateway: set `x-correlation-id = x-request-id || uuid()` on all forwarded requests
- All Kafka producers: include `x-correlation-id` in message headers
- All consumers: extract and pass to handlers
- Logging: include `correlationId` in pino context

---

### Wave 6: Docker & CI/CD

#### Dockerfile Inventory

| Service | Has Dockerfile | Multi-stage | Non-root | Issues |
|---|---|---|---|---|
| api-gateway | ✅ | ✅ (2-stage) | ❌ | `COPY . .` copies entire monorepo |
| cart-service | ✅ | ✅ | ❌ | Same issue |
| order-service | ✅ | ✅ | ❌ | Same issue |
| product-service | ✅ | ✅ | ❌ | Same issue |
| auth-service | ❌ | — | — | — |
| user-service | ❌ | — | — | — |
| notification-service | ❌ | — | — | — |
| payment-service | ❌ | — | — | — |
| search-service | ❌ | — | — | — |
| inventory-service | ❌ | — | — | — |

**Decision:** Create a shared `Dockerfile.template` approach. Use `pnpm deploy --filter <service>` to produce a pruned workspace for each service. Add `USER node` for non-root. Generate Dockerfiles for all 10 services.

#### CI/CD

- `.github/workflows/` directory exists but is empty — zero pipeline files
- Terraform README describes a CI/CD skeleton but it's not implemented

**Decision:** Create GitHub Actions workflows:
1. `ci.yml` — triggered on PR: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`
2. `docker.yml` — triggered on main merge: build Docker images, push to ECR
3. `terraform.yml` — triggered on `terraform/**` changes: plan on PR, apply on merge with manual approval

---

### Wave 7: Repository & Documentation

#### Shared Packages

Current:
- `packages/core` — pino logging, OTel tracing, Prometheus metrics
- `packages/events` — 3 event type files (order, payment, inventory)

Missing:
- `packages/shared-types` — no shared TypeScript types for pagination, API responses, user context
- `packages/testing` — no shared test utilities, jest configs, or mock builders

**Decision:** Create both packages. `shared-types` will export `PaginatedResponse<T>`, `UserContext`, `ApiError`. `testing` will export base test module setup and mock builders.

#### TypeScript Strictness

`tsconfig.base.json` has partial strict checks:
```json
"strictNullChecks": true,
"noImplicitAny": true,
"strictBindCallApply": true,
"forceConsistentCasingInFileNames": true
```

Missing: `strict: true` (which enables `strictFunctionTypes`, `strictPropertyInitialization`, `noImplicitThis`, `alwaysStrict`).

**Decision:** Add `strict: true` to `tsconfig.base.json`. Fix resulting errors service-by-service.

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Outbox atomicity | Shared `UnitOfWork` in `packages/core` | User-service already has this pattern — proven approach |
| Event naming | Dot-notation (`order.created.v1`) | Already used in `packages/events`; PascalCase is internal only |
| Schema validation | Zod in `packages/events` | Lightweight, TypeScript-native, infers types from schemas |
| Service-to-service auth | HMAC-signed internal headers | Simplest effective approach; mTLS deferred to service mesh |
| DLQ implementation | Shared `KafkaDlqProducer` in `packages/core` | Eliminates per-service DLQ boilerplate |
| Graceful shutdown | `enableShutdownHooks()` in all `main.ts` | 1-line change, NestJS-native |
| Observability | `initTracing()` + `MetricsModule` + `getLoggerModule()` in all services | Already in `@ecommerce/core`, just not wired |
| Docker | `pnpm deploy --filter` + shared template | Proper monorepo pruning, minimal image size |
| CI/CD | GitHub Actions (3 workflows: CI, Docker, Terraform) | Matches Terraform README skeleton |
| TypeScript | `strict: true` in base tsconfig | Prevents entire classes of runtime errors |

## Patterns to Follow

- **Unit of Work** pattern for atomic entity-save + outbox-write
- **Transactional Outbox + Polling Relay** for guaranteed event delivery
- **CloudEvents-inspired event envelope** with `type`, `source`, `schemaVersion`, `correlationId`, `timestamp`
- **Processed Events dedup table** for at-least-once consumer idempotency
- **DLQ convention**: `<topic>.dlq` with headers `x-dlq-reason`, `x-dlq-timestamp`, `x-original-topic`
- **Circuit breaker** on all outbound HTTP calls (opossum library already used in gateway)

## Anti-Patterns to Avoid

- **`synchronize: true`**: Silent schema mutations that can drop data
- **Dual event naming (PascalCase + dot-notation)**: Consumers become fragile switch statements
- **In-memory retry counts**: Lost on restart, causing infinite retries or lost retry state
- **Trusting plaintext identity headers**: Without signing, any caller can impersonate users
- **`COPY . .` in Dockerfile**: Bloated images, cache invalidation on any file change
- **Scattered observability**: Each service independently choosing what to instrument

## Dependencies Identified

| Package | Version | Purpose |
|---|---|---|
| `zod` | `^3.22.x` | Event schema validation in `packages/events` |
| `opossum` | `^8.x` | Circuit breaker (already used in api-gateway, extend to other services) |
| `@nestjs/terminus` | `^10.x` | Health checks (already used in api-gateway, extend to all) |
| `typeorm` CLI | `^0.3.x` | Migration generation and execution |
| `crypto` (Node built-in) | N/A | HMAC signing for service-to-service auth |

## Risks

| Risk | Mitigation |
|---|---|
| `strict: true` may produce hundreds of TS errors | Fix service-by-service, starting with smallest (api-gateway) |
| Dual event naming migration requires coordinated rollout | Deploy consumers that handle both formats first, then switch producers |
| HMAC key rotation could cause auth failures | Use key versioning (send key-id in header) and support 2 active keys |
| Migration from `synchronize` to migrations requires generating baseline | Run `typeorm migration:generate` once with current schema as baseline |
| Adding PostgreSQL to notification-service changes its deployment requirements | Keep in-memory repo as fallback for dev; use PostgreSQL only in staging/prod |

## Ready for Planning

- [x] Questions answered
- [x] Approach selected for all 7 waves
- [x] Dependencies identified
- [x] Risks documented with mitigations
- [x] Patterns and anti-patterns defined
