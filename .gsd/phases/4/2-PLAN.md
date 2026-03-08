---
phase: 4
plan: 2
wave: 1
---

# Plan 4.2: Search Service Scaffolding & OpenSearch Setup

## Objective
Implement the Search Service which will serve read queries via OpenSearch for low-latency product searches.

## Context
- .gsd/SPEC.md
- .gsd/ARCHITECTURE.md

## Tasks

<task type="auto">
  <name>Scaffold Search Service</name>
  <files>c:\source\apps\search-service, c:\source\apps\search-service\package.json, c:\source\apps\search-service\src\main.ts</files>
  <action>
    - Initialize standard NestJS boilerplate for `search-service` under `apps/` using the `@nestjs/cli`.
    - Modify `main.ts` to import CloudWatch JSON logging from `@ecommerce/core`.
    - Setup a minimal Controller for the `/health` check.
    - Wire `@ecommerce/core`, `@ecommerce/events` as structural dependencies in its `package.json`.
  </action>
  <verify>Test-Path c:\source\apps\search-service\src\main.ts</verify>
  <done>Search Service application is scaffolded and imports shared libraries</done>
</task>

<task type="auto">
  <name>Configure OpenSearch Client</name>
  <files>c:\source\apps\search-service\src\opensearch\opensearch.module.ts</files>
  <action>
    - Install OpenSearch client (`@opensearch-project/opensearch`) in the Search Service.
    - Create a module to instantiate and export the OpenSearch client instance using the `OPENSEARCH_URL` and `OPENSEARCH_PASSWORD` env vars.
    - Create a provider to initialize the `products` index with basic mappings (e.g., text for name/description, float for price) on startup if the index does not exist.
  </action>
  <verify>Test-Path c:\source\apps\search-service\src\opensearch\opensearch.module.ts</verify>
  <done>OpenSearch client is configured and index initialization logic exists</done>
</task>

## Success Criteria
- [ ] Search Service is scaffolded and runs.
- [ ] OpenSearch client is connected and index mapping initialization logic is implemented.
