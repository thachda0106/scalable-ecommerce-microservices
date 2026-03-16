---
phase: 15
plan: 1
wave: 1
---

# Plan 15.1: README.md & .env.example

## Objective
Replace the default NestJS README with a comprehensive, order-service-specific README and expand `.env.example` from 3 variables to a fully commented configuration reference. These are the first files a new developer encounters.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md (Phase 15 description)
- apps/order-service/README.md (current: default NestJS boilerplate)
- apps/order-service/.env.example (current: 3 vars — PORT, DATABASE_URL, KAFKA_BROKERS)
- apps/order-service/src/main.ts (PORT usage)
- apps/order-service/src/interfaces/order.module.ts (module wiring, config references)
- apps/order-service/src/infrastructure/kafka/ (Kafka config)
- apps/order-service/src/infrastructure/persistence/ (DB config)
- apps/order-service/src/infrastructure/observability/ (metrics config)
- apps/order-service/docs/ (existing 4 doc files to cross-reference)

## Tasks

<task type="auto">
  <name>Rewrite README.md</name>
  <files>apps/order-service/README.md</files>
  <action>
    Replace the entire file with a professional README containing these sections:

    1. **Service Overview** — 2-3 sentence summary of what order-service does
    2. **Responsibilities** — bullet list (creating orders, managing lifecycle, emitting events, saga orchestration, idempotent event processing)
    3. **Architecture Overview** — mermaid diagram showing the DDD layered architecture and the dependency rule. Reference docs/order-service-architecture.md
    4. **Order Lifecycle** — mermaid state diagram showing 8 statuses (CREATED → PENDING_PAYMENT → PAID → CONFIRMED → SHIPPED → DELIVERED + CANCELLED/REFUNDED) and their transitions. Reference docs/order-lifecycle.md
    5. **Folder Structure** — tree of src/ with 1-line descriptions (reuse from existing architecture doc)
    6. **Event Flow** — mermaid sequence diagram showing checkout saga flow (Order → Inventory → Payment). Reference docs/order-events.md
    7. **API Overview** — table of 7 endpoints (method, path, description): POST /orders, GET /orders/:id, GET /orders/user/:userId, PATCH /orders/:id/ship, PATCH /orders/:id/deliver, PATCH /orders/:id/cancel, PATCH /orders/:id/refund
    8. **Setup Instructions** — prerequisites (Node 18+, pnpm, PostgreSQL, Kafka), install deps, database setup
    9. **Local Development** — pnpm run start:dev, docker-compose reference
    10. **Running the Service** — pnpm run start, pnpm run start:prod
    11. **Environment Variables** — table referencing .env.example with descriptions
    12. **Testing** — pnpm test, npx tsc --noEmit
    13. **Observability** — Prometheus metrics at /metrics, structured logging, OpenTelemetry tracing
    14. **Related Documentation** — links to docs/ files

    DO NOT include default NestJS boilerplate, badges, or Mau deployment sections.
    DO use mermaid diagrams for architecture, lifecycle, and event flow.
    Keep it professional and concise — a new engineer should understand the service in 5 minutes.
  </action>
  <verify>Check that README.md contains all 14 sections, at least 3 mermaid diagrams, and no NestJS boilerplate text.</verify>
  <done>README.md has all 14 sections, 3+ mermaid diagrams, and zero boilerplate. A new dev can understand the service in 5 minutes.</done>
</task>

<task type="auto">
  <name>Expand .env.example</name>
  <files>apps/order-service/.env.example</files>
  <action>
    Expand .env.example from 3 vars to a fully commented configuration file. Group variables by category with header comments. Include:

    ## Application
    - APP_NAME=order-service
    - PORT=3006

    ## Database (PostgreSQL)
    - DATABASE_URL=postgres://postgres:postgres@localhost:5432/order_db

    ## Redis
    - REDIS_HOST=localhost
    - REDIS_PORT=6379

    ## Kafka
    - KAFKA_BROKERS=localhost:29092
    - KAFKA_CLIENT_ID=order-service
    - KAFKA_GROUP_ID=order-service-group

    ## Order Configuration
    - ORDER_TIMEOUT_SECONDS=900

    ## Observability
    - LOG_LEVEL=info
    - METRICS_ENABLED=true

    Every variable MUST have a comment above it explaining its purpose and default value.
    Scan infrastructure files to verify actual env var names used.
  </action>
  <verify>Check that .env.example has at least 10 variables, all with comments, grouped by category.</verify>
  <done>.env.example has 10+ commented variables grouped into categories (Application, Database, Redis, Kafka, Order Config, Observability).</done>
</task>

## Success Criteria
- [ ] README.md replaces default NestJS boilerplate with order-service-specific content
- [ ] README.md contains all 14 required sections
- [ ] README.md includes 3+ mermaid diagrams (architecture, lifecycle, event flow)
- [ ] .env.example has 10+ variables with explanatory comments
- [ ] Both files are well-structured and easy for new engineers to understand
