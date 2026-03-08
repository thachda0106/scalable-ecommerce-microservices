---
phase: 4
plan: 1
wave: 1
---

# Plan 4.1: Product Service Scaffolding & Core Logic

## Objective
Implement the Product Service to serve as the System of Record for the product catalog. Set up the PostgreSQL schema and Outbox pattern for publishing product events to Kafka.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md

## Tasks

<task type="auto">
  <name>Scaffold Product Service</name>
  <files>c:\source\apps\product-service, c:\source\apps\product-service\package.json, c:\source\apps\product-service\src\main.ts</files>
  <action>
    - Initialize standard NestJS boilerplate for `product-service` under `apps/` using the Nest CLI.
    - Modify `main.ts` to import CloudWatch JSON logging from `@ecommerce/core`.
    - Setup a minimal Controller for the `/health` check.
    - Wire `@ecommerce/core`, `@ecommerce/events` as structural dependencies via `workspace:*` in `package.json`.
  </action>
  <verify>Test-Path c:\source\apps\product-service\src\main.ts</verify>
  <done>Product Service application is scaffolded and imports shared libraries</done>
</task>

<task type="auto">
  <name>Implement PostgreSQL DB and Outbox Pattern</name>
  <files>c:\source\apps\product-service\src\app.module.ts, c:\source\apps\product-service\src\products</files>
  <action>
    - Configure TypeORM/Prisma (or your chosen generic Postgres connection) in `app.module.ts` for the Product domain. Connect using `DATABASE_URL`.
    - Define a `Product` entity (id, name, description, price, status).
    - Define an `OutboxEvent` entity to store events before Kafka publishing.
    - Implement a basic `ProductsService` to handle creation/updates, writing to both state (`Product`) and `OutboxEvent` tables transactionally.
  </action>
  <verify>Test-Path c:\source\apps\product-service\src\app.module.ts</verify>
  <done>Database connection and transactional Outbox recording are established</done>
</task>

## Success Criteria
- [ ] Product Service is scaffolded and runs.
- [ ] Database schema for Products and OutboxEvents is defined and configured.
