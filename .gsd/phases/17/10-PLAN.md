---
phase: 17
plan: 10
wave: 5
---

# Plan 17.10: Documentation — Architecture, Events & Data Access

## Objective
Create comprehensive documentation for the product-service covering architecture,
event schemas, and data access patterns. Ensure a new developer can understand
the service quickly.

## Context
- apps/product-service/src/ (all implementation from Plans 17.1-17.9)
- apps/order-service/docs/ (established documentation pattern)
- apps/notification-service/docs/ (established documentation pattern)
- .gsd/phases/17/RESEARCH.md

## Tasks

<task type="auto">
  <name>Create Architecture and Events Documentation</name>
  <files>
    apps/product-service/docs/product-service-architecture.md
    apps/product-service/docs/product-service-events.md
    apps/product-service/docs/product-service-data-access.md
  </files>
  <action>
    **product-service-architecture.md:**
    - Overview of the product-service responsibility
    - Layered architecture diagram (Mermaid): interfaces → application → domain ← infrastructure
    - Domain model: Product aggregate, value objects (ProductId, Money, ProductStatus)
    - Status state machine diagram (Mermaid): ACTIVE ↔ INACTIVE, ACTIVE → OUT_OF_STOCK → ACTIVE, * → ARCHIVED
    - Caching strategy: cache-aside pattern, 1h TTL, individual reads only, graceful degradation
    - Technology stack: NestJS, TypeORM, PostgreSQL, Redis, Kafka

    **product-service-events.md:**
    - Published events table: event type, topic, trigger, payload schema
    - Event publishing mechanism: Transactional Outbox → OutboxRelayService → Kafka
    - Event flow diagram (Mermaid): ProductController → Handler → Domain Aggregate → DomainEvent → OutboxEventPublisher → outbox_events table → OutboxRelay → Kafka (product.events)
    - Consumer guidance: which services consume product events (SearchService)

    **product-service-data-access.md:**
    - Repository pattern: IProductRepository port → TypeOrmProductRepository implementation
    - Pagination: offset-based, page/limit query params, max 100 per page
    - Filtering: status, categoryId, price range, name search (ILIKE)
    - Sorting: name, price, createdAt (ASC/DESC), validated whitelist
    - Indexing strategy: which indexes exist and why
    - Query examples (curl snippets for common operations)
  </action>
  <verify>ls apps/product-service/docs/ | wc -l → 3</verify>
  <done>3 documentation files created covering architecture, events, and data access patterns with Mermaid diagrams and examples.</done>
</task>

<task type="auto">
  <name>Update README.md and Create .env.example</name>
  <files>
    apps/product-service/README.md
    apps/product-service/.env.example
  </files>
  <action>
    **README.md** — replace NestJS boilerplate with service-specific documentation:
    - Service overview and purpose
    - Architecture summary (4-layer DDD Clean Architecture)
    - Quick start: how to run locally (env vars, docker-compose, npm scripts)
    - API endpoints table (POST /products, GET /products, GET /products/:id, PATCH /products/:id, PATCH /products/:id/status, DELETE /products/:id, GET /health, GET /metrics)
    - Environment variables reference
    - Technology stack
    - Links to detailed docs in docs/

    **.env.example** — based on existing product-service/.env.example, add:
    - DATABASE_URL (PostgreSQL connection)
    - KAFKA_BROKERS (Kafka broker addresses)
    - REDIS_HOST (Redis host)
    - REDIS_PORT (Redis port)
    - PORT (HTTP port, default 3000)
    - NODE_ENV (development/production)

    Each variable should have a comment explaining its purpose.
  </action>
  <verify>head -5 apps/product-service/README.md | grep -v "Nest"</verify>
  <done>README.md replaced with service-specific documentation. .env.example updated with all required environment variables.</done>
</task>

## Success Criteria
- [ ] product-service-architecture.md with layered diagram and caching strategy
- [ ] product-service-events.md with event table and flow diagram
- [ ] product-service-data-access.md with pagination/filtering/sorting docs
- [ ] README.md is service-specific (no NestJS boilerplate)
- [ ] .env.example has all required variables with comments
- [ ] All Mermaid diagrams render correctly
