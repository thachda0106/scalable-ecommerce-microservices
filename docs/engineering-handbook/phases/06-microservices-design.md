# Phase 06 — Microservices Design

---

## 1. Overview

Build all 10 microservices using the shared modules from Phase 05. Each service is a standalone
NestJS app with its own database, Kafka consumers/producers, and API.

## 2. Goals

- 10 running services with CRUD APIs
- Event publishing via Outbox, consumption via Inbox
- Checkout Saga (Order ↔ Inventory ↔ Payment) works E2E
- CQRS (Product → Search) syncs within 10 seconds

## 3. Architecture Design

See [Service Catalog](../global/service-catalog.md) for complete service documentation.

**Build order (4 tiers):**
- Tier 1 (Foundation): Auth, User — no dependencies on other services
- Tier 2 (Core Business): Product, Search, Inventory, Cart — consume from Tier 1
- Tier 3 (Orchestration): Order, Payment — implement the Saga
- Tier 4 (Support): Notification, API Gateway — wire everything together

## 4. Technology Choices

Every service uses: NestJS v11, TypeORM, class-validator, @nestjs/swagger, Jest.

## 5. Key Design Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-020 | Build bottom-up (Foundation → Orchestration) | Dependencies flow upward |
| ADR-021 | HTTP apps (not NestJS microservice transport) | Simpler, debuggable |
| ADR-022 | OCC for Inventory (version column) | Prevents overselling on concurrent checkouts |

## 6. Data Flow / Request Flow

See [Request Flows](../global/request-flows.md) for all 7 major flows.

## 7. Components Involved

See [Service Catalog](../global/service-catalog.md) — 10 services, 5 PostgreSQL DBs, Redis, OpenSearch.

## 8. Implementation Plan

| Week | Services |
|------|----------|
| Week 1-2 | Auth Service, User Service |
| Week 3-4 | Product Service, Search Service, Inventory Service, Cart Service |
| Week 5-6 | Order Service (Saga), Payment Service |
| Week 7 | Notification Service, API Gateway |
| Week 8 | E2E integration testing |

## 9. Tasks Checklist

```
- [ ] Auth: register, login, refresh, logout, JWT (RS256), token blacklist
- [ ] User: profiles, addresses, consume UserRegistered
- [ ] Product: CRUD, categories, outbox publishing
- [ ] Search: OpenSearch indexing, full-text search, inbox consumers
- [ ] Inventory: stock management, OCC, reserve/release stock
- [ ] Cart: Redis-backed, price snapshots, TTL
- [ ] Order: checkout saga orchestrator, state machine, compensation
- [ ] Payment: process payment (Stripe mock), refunds
- [ ] Notification: consume events, send mocked emails
- [ ] API Gateway: routing, JWT validation, rate limiting, correlation IDs
- [ ] E2E: full checkout flow (success + 2 failure paths)
- [ ] E2E: CQRS sync (product → search)
- [ ] E2E: event deduplication
```

## 10. Deliverables

| Deliverable | Verification |
|-------------|-------------|
| 10 running services | All start without errors |
| CRUD APIs | Swagger UI per service |
| Checkout Saga E2E | Order → Stock → Payment → Confirmed |
| Saga compensation | Payment fails → stock released → order failed |
| CQRS sync | Product created → appears in search < 10s |
| API Gateway routes | All /api/* paths proxy correctly |

## 11. Dependencies

- Phase 05 (all shared modules published)
- Phase 04 (dev environment with PostgreSQL, Redis, Kafka, OpenSearch)

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Saga complexity | Build and test each step individually |
| OCC race conditions in Inventory | Load test concurrent reservations |
| Service coupling via HTTP | Use Kafka events, never chain HTTP calls |

## 13. Common Mistakes

- Building services in wrong order (Saga before participants)
- HTTP calls where events belong (Order → Payment should be Kafka)
- Missing Saga compensations (every forward step needs a rollback)
- Hardcoding service URLs (use env vars + service discovery)
- Skipping OCC in Inventory (overselling is the #1 e-commerce bug)
- Not storing price snapshots (cart/order must snapshot prices)

## 14. Best Practices

- Follow DDD folder structure: domain/ → application/ → infrastructure/ → presentation/
- Write the compensation BEFORE the happy path
- Each service gets its own database migration folder
- Test each consumer with duplicate events (verify idempotency)
