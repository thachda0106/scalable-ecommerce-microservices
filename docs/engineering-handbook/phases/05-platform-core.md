# Phase 05 — Platform Core (Shared Libraries)

---

## 1. Overview

Build the shared npm packages that every microservice imports. This is infrastructure code —
logging, error handling, database, Kafka, resilience patterns. Service teams write zero
boilerplate for these concerns.

## 2. Goals

- Three published packages: `@ecommerce/core`, `@ecommerce/events`, `@ecommerce/shared-types`
- Every module uses NestJS `DynamicModule.forRoot(options)` pattern
- Production-grade: outbox/inbox, circuit breaker, rate limiting
- 100% unit test coverage on shared modules

## 3. Architecture Design

Three-layer shared package architecture:

```
@ecommerce/shared-types     ← Enums, DTOs, basic types (no NestJS dependency)
      ↓
@ecommerce/events           ← Event schemas, envelope, topic constants
      ↓
@ecommerce/core             ← NestJS modules (database, kafka, security, health, etc.)
```

## 4. Technology Choices

| Module | Library | Why |
|--------|---------|-----|
| Logger | Custom (JSON stdout) | CloudWatch compatible, no heavy deps |
| ORM | TypeORM | NestJS-native, migrations |
| Redis | ioredis | Cluster support, pipelining |
| Kafka | kafkajs | Pure Node.js, idempotent producer |
| Metrics | prom-client | Prometheus standard |
| Tracing | @opentelemetry/sdk-node | Vendor-neutral |
| Validation | class-validator | Decorator-based |
| Health | @nestjs/terminus | Built-in indicators |

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-017 | DynamicModule pattern | Service configures per-need (DB host, Kafka brokers) |
| ADR-018 | Outbox with polling (not CDC) | Simple, sufficient for < 10K events/sec |
| ADR-019 | Inbox in PostgreSQL (not Redis) | Same-transaction dedup → stronger consistency |

## 6. Data Flow / Request Flow

See [Event Flows](../global/event-flows.md) for Outbox → Kafka → Inbox data flow.

## 7. Components Involved

17 modules across 3 packages — see detailed list in Phase 03 of `app-build-core/`.

## 8. Implementation Plan

| Week | Steps |
|------|-------|
| Week 1 | Package scaffolding, shared-types, events, logger, config, error handling |
| Week 2 | Database module, base entity/repo, Redis module, security (JWT/RBAC), health |
| Week 3 | Kafka producer, outbox, inbox, base event consumer |
| Week 4 | Circuit breaker, retry, rate limiter, idempotency, metrics, tracing, integration test |

## 9. Tasks Checklist

```
- [ ] pnpm workspace setup + 3 package scaffolds
- [ ] @ecommerce/shared-types (pagination, API response, enums)
- [ ] @ecommerce/events (envelope, all event types, topic constants)
- [ ] Logger module (structured JSON stdout)
- [ ] Config module (env loading, validation)
- [ ] Global exception filter
- [ ] Database module (TypeORM dynamic module)
- [ ] Base entity + tenant-aware entity
- [ ] Base repository (CRUD, pagination, tenant-scoped)
- [ ] Redis module
- [ ] JWT auth guard + roles guard + decorators
- [ ] Health module (DB, Redis, memory indicators)
- [ ] Kafka producer (idempotent)
- [ ] Outbox entity + service + relay (5s poll)
- [ ] Inbox entity + service + processor + cleanup
- [ ] Base event consumer (dedup + error handling)
- [ ] Circuit breaker + retry + rate limiter + idempotency
- [ ] Metrics service + tracing module
- [ ] Logging interceptor + timeout interceptor
- [ ] Integration test: all modules boot together
- [ ] README documentation for each module
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| All 3 packages build | `pnpm -r build` succeeds |
| Test service boots with all modules | `pnpm start:dev` no errors |
| Health endpoint | `curl /health` returns 200 |
| Outbox→Kafka works | Event appears in topic after DB save |
| Inbox dedup works | Duplicate event skipped |
| Circuit breaker works | Opens after failure threshold |

## 11. Dependencies

- Phase 01 (event schemas, data models)
- Phase 02 (architecture patterns: outbox, inbox, CQRS)
- Phase 04 (running dev environment for integration testing)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Breaking change in core affects all services | Semver, build all services in CI |
| Over-abstraction in base classes | Keep base classes thin (CRUD only) |
| Outbox relay latency | Monitor outbox_pending_count metric |

## 13. Common Mistakes

- Putting business logic in core packages
- Not testing modules in isolation before services depend on them
- Publishing events outside DB transactions (use Outbox!)
- No logging during module initialization (silent startup hides boot failures)

## 14. Best Practices

- Every config value has a sensible default
- Log "✅ Module connected to {target}" on startup
- Core never imports from `apps/` (dependency flows one way)
- One module = one concern (don't combine DB + Kafka in one module)
