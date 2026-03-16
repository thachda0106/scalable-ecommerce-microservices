---
phase: 18
plan: 7
wave: 4
---

# Plan 18.7: Documentation — Architecture, Indexing & Query Docs

## Objective
Create comprehensive documentation for the search service covering architecture, indexing pipeline, and search query features.
Documentation should enable a new developer to understand the service quickly.

## Context
- .gsd/phases/18/RESEARCH.md (decisions and rationale)
- apps/search-service/src/ (implemented service from Plans 18.1-18.6)
- apps/notification-service/docs/ (reference documentation pattern)
- apps/order-service/docs/ (reference documentation pattern)

## Tasks

<task type="auto">
  <name>Create Search Service Architecture Documentation</name>
  <files>
    apps/search-service/docs/search-service-architecture.md
    apps/search-service/README.md
    apps/search-service/.env.example
  </files>
  <action>
    **search-service-architecture.md:**
    - Service overview: read-side search service in CQRS architecture
    - 4-layer architecture diagram (mermaid): domain, application, infrastructure, interfaces
    - Component diagram showing: Controller → CQRS Bus → Handlers → Ports → OpenSearch/Redis/Kafka
    - Technology choices with rationale (OpenSearch, Redis, KafkaJS)
    - Index management strategy (alias rotation, zero-downtime reindex)
    - Caching strategy (Redis, TTL-based, graceful degradation)
    - Performance characteristics (target latencies, throughput)

    **README.md** (replace boilerplate):
    - Service description
    - Architecture overview (brief, links to docs/)
    - Getting started (prerequisites: OpenSearch, Redis, Kafka)
    - Environment variables (link to .env.example)
    - API endpoints table (GET /search, GET /search/suggest, GET /search/:id, POST /search/reindex, GET /health)
    - Running locally, testing
    - Folder structure

    **.env.example:**
    - PORT, OPENSEARCH_URL, OPENSEARCH_USERNAME, OPENSEARCH_PASSWORD
    - KAFKA_BROKERS, KAFKA_GROUP_ID
    - REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
    - LOG_LEVEL
    - Grouped by category with comments
  </action>
  <verify>test -f apps/search-service/docs/search-service-architecture.md && test -f apps/search-service/README.md && test -f apps/search-service/.env.example</verify>
  <done>Architecture docs, README, and .env.example created with mermaid diagrams and complete API reference.</done>
</task>

<task type="auto">
  <name>Create Indexing and Search Query Documentation</name>
  <files>
    apps/search-service/docs/search-service-indexing.md
    apps/search-service/docs/search-service-queries.md
  </files>
  <action>
    **search-service-indexing.md:**
    - Event-driven indexing flow diagram (mermaid): Product Service → Kafka → Consumer → CommandBus → IndexHandler → OpenSearch
    - Consumed events: product.created, product.updated, product.deleted
    - Event payload schema
    - Bulk indexing for reindex operations
    - Index mapping reference (all fields with types)
    - Zero-downtime reindex procedure (step by step with alias rotation)
    - Error handling and DLQ strategy

    **search-service-queries.md:**
    - Full-text search: how multi_match works across name and description
    - Autocomplete: how search_as_you_type and completion suggester work
    - Filtering: supported filter operators (eq, in, range, gte, lte) with examples
    - Sorting: supported sort fields with examples
    - Pagination:
      - Offset-based (from/size) — default, use for pages 1-100
      - Cursor-based (search_after) — for deep pagination / infinite scroll
      - Example request/response for both
    - Caching: how Redis query cache works, TTLs, cache key generation
    - API examples: curl commands for search, suggest, filter, sort, paginate
  </action>
  <verify>test -f apps/search-service/docs/search-service-indexing.md && test -f apps/search-service/docs/search-service-queries.md</verify>
  <done>Indexing docs cover event-driven pipeline and reindex procedure. Query docs cover all search features with API examples.</done>
</task>

## Success Criteria
- [ ] docs/ folder contains 3 files: architecture, indexing, queries
- [ ] README.md has service description, API table, getting started, folder structure
- [ ] .env.example has all environment variables grouped by category
- [ ] Mermaid diagrams for architecture and indexing flow
- [ ] API examples with curl commands for all endpoints
- [ ] All documentation matches actual codebase (no invented features)
