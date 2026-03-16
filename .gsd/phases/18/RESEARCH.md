---
phase: 18
level: 2
researched_at: 2026-03-16
---

# Phase 18 Research — Production-Grade Search Service

## Questions Investigated

1. Which search engine to use — Elasticsearch, OpenSearch, or Meilisearch?
2. How to structure the domain layer for a search-only (read-side) service?
3. What indexing strategy for event-driven sync from product-service?
4. How to implement autocomplete / search suggestions efficiently?
5. What caching strategy for search queries?
6. How to handle zero-downtime reindexing?
7. What pagination strategy to use (offset vs cursor/search_after)?

## Findings

### 1. Search Engine Selection

The project **already uses OpenSearch** (`@opensearch-project/opensearch` v3.5.1 in `package.json`). The architecture docs (ARCHITECTURE.md §2, §8) explicitly specify **OpenSearch** as the search backend, and the Terraform modules include `opensearch/` for AWS OpenSearch Service.

| Engine | Strengths | Weaknesses |
|--------|-----------|------------|
| **Elasticsearch** | Enterprise features, ML ranking, largest ecosystem | Proprietary licensing (SSPL since 7.11) |
| **OpenSearch** | Apache 2.0 license, AWS-native, API-compatible with ES 7.x | Slightly behind ES on ML features |
| **Meilisearch** | Fastest typo tolerance, simplest setup, great DX | Less mature at scale, no distributed architecture |

**Recommendation: Keep OpenSearch.**
- Already adopted in the project (no migration cost)
- Apache 2.0 license aligns with project goals
- AWS OpenSearch Service is already in Terraform
- API compatibility with Elasticsearch means patterns from ES docs apply directly
- Supports all required features: full-text search, filters, aggregations, suggesters, `search_after` pagination

### 2. Domain Layer Design for a Search Service

Unlike order/payment services, the search service is a **read-side** service in the CQRS architecture. Its domain is simpler:

- **No aggregate root with complex state machines** — documents are projections of product data
- **SearchDocument**: A read model entity representing a product in the search index
- **SearchQuery / SearchFilter / SearchSort**: Value objects encapsulating query parameters
- **SearchResult / PaginatedSearchResult**: Value objects wrapping search responses
- **Ports**: `ISearchIndexPort` (write path — index/update/delete documents), `ISearchQueryPort` (read path — search/suggest)

**Pattern from existing services:**
- Use Symbol-based injection tokens (e.g., `const SEARCH_INDEX_PORT = Symbol('SEARCH_INDEX_PORT')`)
- Domain entities/VOs stay framework-free (no `@nestjs` imports in `src/domain/`)
- Domain events are optional here since this service doesn't own data; it *consumes* events

### 3. Event-Driven Indexing Strategy

Current implementation in `ProductSyncService`:
- Consumes `product.events` topic
- Handles `ProductCreated`, `ProductUpdated`, `ProductDeleted`
- Uses individual index operations with `refresh: true`

**Problems with current approach:**
1. `refresh: true` on every operation is extremely expensive at scale — forces OpenSearch to make newly indexed docs searchable immediately, blocking writes
2. No idempotency — reprocessing events could cause inconsistencies
3. No error handling / DLQ — failed messages are just logged
4. Raw Kafka client management in a service class
5. No bulk indexing support
6. Tightly coupled to OpenSearch client (no port/adapter abstraction)

**Recommended approach:**
- Use `refresh: false` (or `refresh: wait_for` for near-real-time) in production
- Implement bulk indexing for batch processing during reindex operations
- Add idempotency via event deduplication (processed_events pattern used in order-service)
- Route failed messages to DLQ after 3 retries
- Abstract OpenSearch client behind a port interface
- Use the established Kafka consumer pattern from notification/order services

### 4. Autocomplete / Search Suggestions

Three approaches for OpenSearch autocomplete:

| Approach | Latency | Relevance | Complexity |
|----------|---------|-----------|------------|
| **Completion Suggester** | ~5ms | Low (prefix only) | Low |
| **Edge N-gram analyzer** | ~10-30ms | High | Medium |
| **Search-as-you-type field** | ~10ms | High | Low |

**Recommendation: Edge N-gram approach + Completion Suggester combo.**
- Use `search_as_you_type` field type for the product `name` field — built-in OpenSearch feature that creates edge-ngram sub-fields automatically
- For dedicated suggestion endpoint, use the Completion Suggester on a separate `suggest` field
- Both integrate naturally with the OpenSearch mapping

**Index mapping for autocomplete:**
```json
{
  "name": {
    "type": "search_as_you_type",
    "max_shingle_size": 3
  },
  "name_suggest": {
    "type": "completion"
  }
}
```

### 5. Query Caching Strategy

**Redis-based query cache** (consistent with project's existing Redis usage):

- Cache key: hash of normalized search query (query string + filters + sort + page)
- TTL: 60s for search results, 300s for suggestions (product names change less frequently)
- Invalidation: time-based (TTL expiry) — simpler than event-based invalidation
- Cache bypass: support a `skipCache` parameter for admin/reindex operations

**Why not OpenSearch's built-in request cache?**
- OS request cache only caches aggregation results for non-scoring queries
- OS shard-level cache is already used internally but doesn't help with repeated full-text queries
- Redis gives us control over TTL, invalidation, and works across service instances

**Additional consideration:** Need to add `ioredis` or `@nestjs/cache-manager` with Redis store to `package.json`.

### 6. Zero-Downtime Reindexing

**Alias-based reindexing pattern:**

1. Create new index with updated mappings: `products_v2`
2. Bulk reindex all products from product-service API or replay Kafka events
3. Swap alias `products` from `products_v1` → `products_v2`
4. Delete old index `products_v1`

All search queries go through the alias `products` — they never reference a versioned index directly.

**Implementation:**
- `IndexManagementService` manages index lifecycle (create, check, swap alias, delete)
- Admin endpoint `POST /search/reindex` triggers full reindex
- Track reindex progress via a simple state field in Redis

### 7. Pagination Strategy

| Strategy | Use Case | Performance |
|----------|----------|-------------|
| **Offset (from/size)** | UI pages 1-10 | Degrades at deep pages (from > 10000) |
| **search_after** | Deep pagination, infinite scroll | Consistent performance |
| **Scroll API** | Batch export / reindex | Best for bulk data retrieval |

**Recommendation: Dual strategy.**
- Default: `from/size` for first 100 pages (up to `max_result_window`)
- Deep pagination: `search_after` with a sort tiebreaker (e.g., `_id`)
- Batch/export: Scroll API for admin reindex operations only
- Return a `cursor` in the response for clients that want `search_after`

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Search engine | **OpenSearch** (keep existing) | Already adopted in project, Terraform provisioned, Apache 2.0 license |
| Autocomplete | **search_as_you_type** + **Completion Suggester** | Built-in, low latency, no custom analyzer complexity |
| Query caching | **Redis with TTL** | Consistent with project patterns, controllable, multi-instance safe |
| Pagination | **from/size** + **search_after** | Optimal for both shallow and deep pagination |
| Event handling | **Port/adapter with bulk support** | Decouple from OpenSearch, enable batch operations |
| Reindexing | **Alias rotation pattern** | Zero-downtime, industry standard |
| Index refresh | **Default interval** (1s) instead of `refresh: true` | Orders of magnitude better write throughput |

## Patterns to Follow

- **4-layer architecture**: `domain/`, `application/`, `infrastructure/`, `interfaces/` (consistent with order/notification services)
- **Symbol-based DI tokens** for port interfaces (e.g., `SEARCH_INDEX_PORT`, `SEARCH_QUERY_PORT`)
- **Framework-free domain layer** — no `@nestjs` imports in `src/domain/`
- **CQRS command/query separation** — Commands: IndexProduct, RemoveProduct, RebuildIndex; Queries: SearchProducts, GetSuggestions
- **Kafka consumer pattern** from existing services (consumer module, event handlers)
- **Prometheus metrics** via `prom-client` (search_queries_total, search_latency_histogram, index_operations_total, cache_hit_ratio)

## Anti-Patterns to Avoid

- **`refresh: true` on every write**: Kills indexing performance — use default refresh interval (1s)
- **Exposing OpenSearch client directly**: Always go through port interface for testability
- **Fat controller**: Controller should only validate DTOs and delegate to command/query handlers
- **Hardcoded config**: Use `@nestjs/config` with `ConfigService` (current code has hardcoded `process.env` reads in constructors)
- **Raw Kafka client in services**: Use the established consumer module pattern with proper lifecycle hooks
- **Over-caching**: Don't cache admin/reindex queries; use short TTLs to balance freshness vs performance
- **Synchronous reindexing**: Reindex operations should be async with progress tracking

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `@opensearch-project/opensearch` | `^3.5.1` | Already installed — OpenSearch client |
| `kafkajs` | `^2.2.4` | Already installed — Kafka consumer |
| `@nestjs/config` | `^4.0.3` | Already installed — Configuration management |
| `@nestjs/cqrs` | `^11.x` | CQRS command/query bus (to add) |
| `ioredis` | `^5.x` | Redis client for query caching (to add) |
| `class-validator` | `^0.14.x` | DTO validation (to add) |
| `class-transformer` | `^0.5.x` | DTO transformation (to add) |
| `prom-client` | `^15.x` | Prometheus metrics (to add) |
| `uuid` | `^9.x` | ID generation for search operations (to add) |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenSearch cluster not running locally | Blocks development/testing | Use Docker Compose with OpenSearch container; add health check on startup with graceful fallback |
| Kafka events lost during reindex | Stale search index | Implement full reindex from product-service API as fallback; alias rotation ensures zero data loss |
| Redis unavailable | Cache misses on all queries | Degrade gracefully — skip cache and query OpenSearch directly; never fail a search due to cache errors |
| High cardinality product data (50M+) | Slow bulk indexing | Use OpenSearch Bulk API with batches of 1000-5000 docs; parallel indexing via Kafka partitions |
| Index mapping changes require reindex | Temporary stale data | Alias-based rotation mitigates this; plan for schema evolution strategy |

## Ready for Planning

- [x] Questions answered
- [x] Approach selected (OpenSearch with 4-layer DDD architecture)
- [x] Dependencies identified (4 existing + 5 new packages)
- [x] Patterns documented (from order/notification service analysis)
- [x] Anti-patterns identified (from current code analysis)
- [x] Risks assessed with mitigations
