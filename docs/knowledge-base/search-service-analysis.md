# Search Service — Production-Level Deep Analysis

> **Scope**: [search-service](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src) — NestJS CQRS service with DDD architecture  
> **Stack**: TypeScript · NestJS 11 · OpenSearch · Redis (ioredis) · Kafka (KafkaJS) · prom-client (Prometheus)

---

## 1. BUSINESS RESPONSIBILITY

### What it owns

The search-service is the **single source of truth for product discovery** in the platform. Concretely, it owns:

| Capability | Implementation |
|---|---|
| Full-text product search | OpenSearch `products` index with BM25 scoring, `multi_match` across `name`, `name._2gram`, `name._3gram`, `description` |
| Auto-suggestions (search-as-you-type) | `name_suggest` completion suggester via `completion` field type |
| Filtered & sorted queries | Bool query with `term`, `terms`, `range`, `gte`, `lte` filters + arbitrary sort fields |
| Cursor-based pagination | `search_after` with `_id` tiebreaker for deterministic deep pagination |
| Search result caching | Redis-based query response caching (`search:*`, `suggest:*`) with `safeExecute` resilience |
| Eventual consistency intake | Kafka consumer on `product.events` topic → `IndexProductCommand` / `RemoveProductCommand` |
| Index lifecycle management | Versioned index creation, alias swapping, health checks via `IndexManagementService` |
| Prometheus metrics | `search_queries_total`, `search_latency_seconds`, `index_operations_total`, `cache_operations_total` via `prom-client` |

### What it should NEVER own

| Concern | Why it belongs elsewhere |
|---|---|
| Product master data (CRUD) | Belongs to `product-service` — search holds a **read-optimized projection**, not the source of truth |
| Pricing & discounts | Promos are dynamic; search only holds the base `price` for ranking. Final price is computed by `order-service` / `pricing-service` |
| Real-time inventory status | Stock checks require strong consistency. Search holds `status` (e.g., `ACTIVE`) which may be seconds stale |
| Cart management | Search helps users *find* items, `cart-service` handles checkout intent |
| Authorization / RBAC | Access control is handled at the API Gateway or `auth-service` |

### Real-world analogy

Search-service is a **Library Catalog Index**. It shows you what book exists, what category it belongs to, and roughly where to find it. But to actually "check out" the book or verify if it was literally just stolen 2 seconds ago, you go to the checkout desk (Product/Inventory Service).

---

## 2. API SURFACE (SYNC LAYER)

All endpoints live under the `search` controller prefix, behind global `ThrottlerGuard` (60 req/60s). A custom `DomainExceptionFilter` maps domain errors (`IndexNotFoundError` → `404`, `InvalidSearchQueryError` → `400`).

### `GET /search`

| Aspect | Detail |
|---|---|
| **Purpose** | Primary product discovery endpoint |
| **Request** | `query?` string, `filters[]?` (`{ field, operator, value }`), `sortField?`, `sortOrder?` (`asc`\|`desc`), `page?` (default `1`), `limit?` (default `20`), `cursor?` |
| **Response** | `200 { data: SearchDocumentDto[], total, page, limit, totalPages, cursor, took }` |
| **Validation** | `@IsOptional @IsString` query, `@IsIn(['eq','in','range','gte','lte'])` filter operator, `@IsInt @Min(1) @Max(100)` limit, `@IsInt @Min(1)` page |
| **Idempotency** | Naturally idempotent (Safe GET method) |
| **Rate limiting** | Global ThrottlerGuard (60/60s) |
| **Handler** | [SearchProductsHandler](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/search-products.handler.ts) |

### `GET /search/suggest`

| Aspect | Detail |
|---|---|
| **Purpose** | Auto-complete dropdown for users typing in the search bar |
| **Request** | `prefix` (required, `@MinLength(1) @MaxLength(100)`), `limit?` (default `10`, `@Min(1) @Max(20)`) |
| **Response** | `200 string[]` |
| **Validation** | Prefix string length bounds strictly enforced |
| **Idempotency** | Safe GET method |
| **Handler** | [GetSuggestionsHandler](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/get-suggestions.handler.ts) |

### `GET /search/:id`

| Aspect | Detail |
|---|---|
| **Purpose** | Fetch a single product from the search index by ID |
| **Response** | `200 SearchDocument` or `404 NotFoundException` |
| **Handler** | [GetProductByIdHandler](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/get-product-by-id.handler.ts) |

### `GET /search/health`

| Aspect | Detail |
|---|---|
| **Purpose** | Liveness/readiness check exposing OpenSearch index health |
| **Response** | `200 { status: 'ok', index: { docCount, sizeInBytes, status } }` |
| **Note** | Gracefully returns `{ status: 'unavailable' }` if OpenSearch is down |

### `GET /search/metrics`

| Aspect | Detail |
|---|---|
| **Purpose** | Prometheus metrics endpoint |
| **Response** | Prometheus-formatted text (`text/plain`) from `prom-client` registry |
| **Metrics exposed** | `search_queries_total`, `search_latency_seconds`, `index_operations_total`, `cache_operations_total`, plus Node.js default metrics |

### `POST /search/reindex`

| Aspect | Detail |
|---|---|
| **Purpose** | Trigger a full index rebuild (creates versioned index + swaps alias) |
| **Request** | `{ batchSize?: number }` (default `1000`, `@Min(100) @Max(10000)`) |
| **Response** | `200 { message: 'Reindex started' }` |
| **Auth** | Protected by `ServiceAuthGuard` (`x-api-key` or `x-service-token` or `Authorization: Bearer`) |
| **Handler** | [RebuildIndexHandler](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/rebuild-index.handler.ts) |

---

## 3. DATA MODEL (SOURCE OF TRUTH)

### `products` index (OpenSearch)

```
┌───────────────┬─────────────────────────────────────────────────────────┐
│ Field         │ Type / Constraints                                      │
├───────────────┼─────────────────────────────────────────────────────────┤
│ id            │ keyword (Exact match UUID)                              │
│ name          │ search_as_you_type (max_shingle_size: 3)                │
│ name_suggest  │ completion (Input: name.split(/\s+/))                   │
│ description   │ text (Standard analyzer)                                │
│ price         │ float                                                   │
│ status        │ keyword ('ACTIVE', etc)                                 │
│ categoryId    │ keyword                                                 │
│ attributes    │ object (enabled: true, dynamic)                         │
│ indexedAt     │ date (ISO string)                                       │
└───────────────┴─────────────────────────────────────────────────────────┘
```

**Index Settings:**
- `number_of_shards: 1`
- `refresh_interval: '1s'` (documents visible ~1 second after ingestion)
- `number_of_replicas`: configurable via `OPENSEARCH_INDEX_REPLICAS` env var (defaults to `0`)

### Why this data belongs here

Relational DBs (PostgreSQL in `product-service`) use B-Trees, which are terrible at full-text ranking, TF/IDF algorithms, and unstructured multi-field scoring. OpenSearch uses **Inverted Indices** to solve this at scale. The `search_as_you_type` field automatically generates 2-gram and 3-gram sub-fields, enabling efficient partial matching without expensive wildcard queries.

### Read/write patterns

| Operation | Pattern | Frequency |
|---|---|---|
| `search()` — `multi_match` + `bool` filter | Read | Extremely heavy (~99% of traffic) |
| `suggest()` — completion suggester | Read | Heavy (keystroke-per-request) |
| `findById()` — direct `GET /_doc/:id` | Read | Moderate |
| `indexDocument()` — `PUT /_doc/:id` with `refresh: false` | Write | Light (event-driven, ~1%) |
| `removeDocument()` — `DELETE /_doc/:id` with `refresh: false` | Write | Rare |
| `indexDocumentsBulk()` — bulk API in batches of 1000 | Write | Rare (reindex only) |

### Indexing strategy

- Single document indexing uses `refresh: false` — documents rely on `refresh_interval: 1s` for visibility, not per-request refresh
- Bulk indexing caps at `batchSize: 1000` per batch with error tracking per item
- `name_suggest` input is derived by splitting the product name on whitespace: `{ input: doc.name.split(/\s+/) }`

### Potential bottlenecks

1. **Deep offset pagination** — `from/size` queries beyond 10,000 results will exhaust OpenSearch memory. The `search_after` cursor mechanism exists but standard offset is also supported — no hard cap enforcement exists.
2. **Unbounded aggregations** — The `attributes` field is `enabled: true` which allows full indexing of all nested keys. Complex faceting on dynamic attributes can cause CPU spikes.
3. **Single shard** — Adequate for moderate data sizes but becomes a write bottleneck at scale (all writes funnel to one primary shard).

---

## 4. CACHE STRATEGY (REDIS)

Search-service uses `ioredis` wrapped in the `@ecommerce/core` `safeExecute` resilience pattern for all Redis operations.

### 4.1 Search Results Cache

| Key Pattern | Value | TTL |
|---|---|---|
| `search:{djb2_hash}` | Full `SearchResult` JSON (documents, total, page, cursor) | **60 seconds** |

### 4.2 Suggestion Cache

| Key Pattern | Value | TTL |
|---|---|---|
| `suggest:{prefix}:{limit}` | `string[]` JSON array | **300 seconds (5 min)** |

### Cache key design

Search cache keys are generated by deterministically stringifying the query AST (`q`, filters, sort, pagination`) and hashing via DJB2:

```typescript
// RedisCacheAdapter.generateKey()
const raw = JSON.stringify({ q, f: filters, s: sort, p: pagination });
let hash = 5381;
for (let i = 0; i < raw.length; i++) {
  hash = (hash * 33) ^ raw.charCodeAt(i);
}
return `search:${(hash >>> 0).toString(36)}`;
```

Suggestion cache keys use a simple template: `suggest:${prefix}:${limit}`.

### `safeExecute` resilience wrapping

| Operation | Strategy | Timeout | Circuit Breaker |
|---|---|---|---|
| `get()` | `FAIL_OPEN` (returns `null` on failure) | 1000ms | `redis` |
| `set()` | `NON_BLOCKING` (fire-and-forget) | 1000ms | `redis` |
| `delete()` | `NON_BLOCKING` | 1000ms | `redis` |
| `invalidateAll()` | `NON_BLOCKING` | 5000ms | `redis` |

### Cache invalidation strategy (CRITICAL RISK)

`invalidateAll()` is called on **every single index and remove operation**:

- [IndexProductHandler L38](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/index-product.handler.ts#L38): `await this.searchCachePort.invalidateAll()`
- [RemoveProductHandler L27](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/remove-product.handler.ts#L27): `await this.searchCachePort.invalidateAll()`

The implementation uses Redis `SCAN ... MATCH search:* COUNT 100` + bulk `DEL`, then repeats for `suggest:*`:

> [!CAUTION]
> **Thundering Herd Risk**: Every Kafka product event (create/update/delete) triggers a full cache wipe. Under moderate event throughput (e.g., 100 product updates/second), the cache is effectively permanently empty — every user search hits OpenSearch directly, defeating the entire caching layer. This is **the #1 production risk** in this service.

### Failure scenario: stale cache

| Scenario | Impact | Current Mitigation |
|---|---|---|
| Redis down on `get()` | Cache miss | `FAIL_OPEN` returns `null`, falls through to OpenSearch cleanly |
| Redis down on `set()` | Results not cached | `NON_BLOCKING` ignores failure, next request simply re-queries |
| Redis down on `invalidateAll()` | Stale cache served for up to TTL | `NON_BLOCKING` ignores failure. Stale data served for 60s max |
| Consistent invalidation under load | Cache is always empty | No mitigation — see Thundering Herd above |

---

## 5. ASYNC COMMUNICATION (EVENTS / KAFKA)

### Events Consumed

| Topic | Event Types | Command Dispatched | Handler |
|---|---|---|---|
| `product.events` | `ProductCreated` / `product.created` | `IndexProductCommand` | [IndexProductHandler](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/index-product.handler.ts) |
| `product.events` | `ProductUpdated` / `product.updated` | `IndexProductCommand` | Same (upsert) |
| `product.events` | `ProductDeleted` / `product.deleted` | `RemoveProductCommand` | [RemoveProductHandler](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/application/handlers/remove-product.handler.ts) |

The consumer supports dual event formats: `{ type, payload }` and `{ eventType, data }`.

### Events Produced

**None.** The search-service is a **pure event consumer**. It publishes domain events internally via `EventBus` (`DocumentIndexedEvent`, `DocumentRemovedEvent`, `IndexRebuiltEvent`) but does NOT emit to Kafka.

### Delivery Guarantees

- **At-least-once** via Kafka consumer group (`search-group` default)
- `fromBeginning` configurable via `KAFKA_FROM_BEGINNING` env var (default: `false`)

### Idempotency handling for consumers

The `IndexProductCommand` performs an **UPSERT** — `client.index({ id: doc.id })` inherently overwrites the existing document. Processing the same event multiple times is idempotent.

`RemoveProductCommand` gracefully handles `404` (document not found), making deletes idempotent.

### Retry & error handling

The [ProductEventConsumer](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/infrastructure/kafka/consumers/product-event.consumer.ts) tracks retries **in-memory** via a `Map<string, number>`:

- Key: `${message.offset}-${message.timestamp}`
- Max retries: `3`
- Memory safety: Map capped at 10,000 entries (evicts oldest on overflow)
- After `MAX_RETRIES`: message is logged as error, but **DLQ publishing is a TODO comment, not implemented**

> [!WARNING]
> The retry count map is in-process memory. Pod restarts wipe all retry state. There is no persistent DLQ topic — poison messages are silently dropped after 3 retries.

### Ordering concerns

- Messages are processed inside `eachMessage` (sequential per partition)
- **No explicit message key** is set by the Kafka producer — if the producer uses round-robin partitioning, events for the same `productId` can land on different partitions → **no ordering guarantee**
- Since the service uses UPSERT without external versioning, a late `v1` event arriving after `v2` will silently overwrite with stale data

---

## 6. REQUEST FLOW (END-TO-END)

### Flow: Admin Updates Product → User Sees Updated Search Result

```
Admin                 API Gateway          product-service            Kafka                search-service           Redis            OpenSearch
  │                       │                       │                     │                        │                    │                  │
  │── PUT /products/123 ─▶│                       │                     │                        │                    │                  │
  │                       │── Forward ───────────▶│                     │                        │                    │                  │
  │                       │                       │─ DB update ────     │                        │                    │                  │
  │                       │                       │─ outbox write ─┘    │                        │                    │                  │
  │                       │◀── 200 ───────────────│                     │                        │                    │                  │
  │◀── 200 ───────────────│                       │                     │                        │                    │                  │
  │                       │                       │                     │                        │                    │                  │
  │                       │                       │── relay publish ───▶│                        │                    │                  │
  │                       │                       │                     │── eachMessage ─────────▶│                    │                  │
  │                       │                       │                     │                        │── indexDocument ──────────────────────▶│
  │                       │                       │                     │                        │── invalidateAll ──▶│                  │
  │                       │                       │                     │                        │◀── SCAN+DEL ───────│                  │
  │                       │                       │                     │                        │                    │                  │
  ·                       ·                       ·                     ·                        ·                    ·                  ·
  · (user searches)       ·                       ·                     ·                        ·                    ·                  ·
  │                       │                       │                     │                        │                    │                  │
User ─ GET /search?q=.. ─▶│                       │                     │                        │                    │                  │
  │                       │── Forward ───────────────────────────────────────────────────────────▶│                    │                  │
  │                       │                       │                     │                        │── cache GET ───────▶│                  │
  │                       │                       │                     │                        │◀── null (miss) ────│                  │
  │                       │                       │                     │                        │── _search ──────────────────────────▶│
  │                       │                       │                     │                        │◀── hits ────────────────────────────│
  │                       │                       │                     │                        │── cache SET ───────▶│                  │
  │                       │◀── 200 results ─────────────────────────────────────────────────────│                    │                  │
User ◀─ 200 ──────────────│                       │                     │                        │                    │                  │
```

### Where latency happens

| Step | Typical Latency | Why |
|---|---|---|
| Redis `GET search:{hash}` | < 1ms | Single key lookup via `safeExecute` |
| OpenSearch `_search` (multi_match + filters) | 10–50ms | BM25 ranking, tokenization, filter evaluation |
| Redis `SET` (cache result) | < 1ms | Non-blocking fire-and-forget |
| OpenSearch `PUT /_doc` (index) | 5–15ms | Async write, `refresh: false` |
| **OpenSearch refresh** | **~1000ms** | `refresh_interval: 1s` — minimum delay before new doc is searchable |
| Redis `SCAN` + `DEL` (invalidateAll) | 1–100ms+ | Depends on cache size. Blocks Redis during SCAN |
| Kafka → consumer poll | 0–500ms | Depends on Kafka poll interval and consumer lag |
| **Total end-to-end latency (event → searchable)** | **~1.5–2s** | Kafka poll + indexing + refresh interval |

### Where failures can happen

1. **Redis down at `GET`** → `FAIL_OPEN` returns `null` → falls through to OpenSearch. No user impact.
2. **OpenSearch down at `_search`** → Unhandled exception → `500`. No Stale-While-Revalidate fallback.
3. **OpenSearch down at `PUT /_doc`** → Consumer retry (3 attempts in-memory) → message silently lost after max retries.
4. **Kafka down** → Consumer logs error but doesn't crash. Search index becomes stale until Kafka recovers.
5. **`invalidateAll` SCAN blocks Redis** → Other Redis operations (cache reads from concurrent requests) experience elevated latency.

---

## 7. CONSISTENCY & TRANSACTIONS

### Local transactions

None. All OpenSearch operations are single-document REST calls. There is no multi-document transaction.

### Eventual consistency model

The search index is a **derived, eventually consistent projection** of the product catalog. The consistency gap is:

```
product-service DB commit → outbox relay → Kafka → consumer poll → OpenSearch index → refresh_interval
                                                                                     └──── ~1s min ────┘
```

Minimum end-to-end staleness: **~1–2 seconds** under healthy conditions. Under Kafka lag: **unbounded**.

### Compensation logic

The `RebuildIndexHandler` provides bulk recovery:

1. Creates a versioned index (`products_v{timestamp}`)
2. Swaps the `products` alias atomically to the new index
3. Publishes `IndexRebuiltEvent` via internal `EventBus`

> [!IMPORTANT]
> **The rebuild does NOT bulk-copy data from the product-service database.** It swaps to an empty index and relies on new Kafka events to populate it. This means a reindex results in a **temporarily empty search index** until events backfill it. A proper implementation would need to call the product-service API to fetch all products and bulk-index them.

### Edge cases (partial success)

| Scenario | Result | Impact |
|---|---|---|
| `indexDocument` succeeds but `invalidateAll` fails | Stale cache for up to 60s | Minor — natural TTL cleans it |
| `indexDocument` fails → retry exhausted | Document permanently stale | Requires manual reindex or wait for next product event |
| Reindex swaps to empty index | All search queries return 0 results | **Severe** — until Kafka events repopulate |

---

## 8. FAILURE MODES (CRITICAL)

### 8.1 OpenSearch Down

| What happens now | Impact | How to improve |
|---|---|---|
| Index writes fail → consumer retries 3x → silently drops | Documents lost from search index | Implement persistent DLQ topic. Resume failed messages after OpenSearch recovers. |
| Search reads fail → unhandled exception → `500` | **Total search outage** | Serve stale data from Redis cache if OpenSearch circuit breaker trips (Stale-While-Revalidate). |
| Health endpoint returns `{ status: 'unavailable' }` | Orchestrator can detect | Already handled gracefully |

### 8.2 Redis Down

| What happens now | Impact | How to improve |
|---|---|---|
| `get()` returns `null` (FAIL_OPEN) | All requests hit OpenSearch | Already handled. Monitor Redis health to prevent this from becoming the norm. |
| `set()` silently fails (NON_BLOCKING) | Cache never populated | Already handled. |
| `invalidateAll()` silently fails | Stale cache for up to 60s | Already handled. Acceptable degradation. |

### 8.3 Kafka Down

| What happens now | Impact | How to improve |
|---|---|---|
| Consumer logs error, stops receiving events | Search index becomes stale | Monitor consumer lag metric. Alert when lag exceeds threshold. |
| Consumer reconnects on recovery | Events resume processing | Already handled by kafkajs reconnect. |

### 8.4 Duplicate Kafka Events

| What happens now | Impact | How to improve |
|---|---|---|
| UPSERT overwrites with identical data | Benign — no data corruption | No action needed for correctness. Minor CPU waste from redundant `invalidateAll()`. |

### 8.5 Race Conditions (Out-of-order events)

| What happens now | Impact | How to improve |
|---|---|---|
| Late `v1` event arrives after `v2` → stale overwrite | Product shows old data until next event | Pass event `timestamp` into OpenSearch's `version` field with `version_type: external`. OpenSearch rejects older versions automatically. |

### 8.6 Poison-pill Kafka Messages

| What happens now | Impact | How to improve |
|---|---|---|
| Malformed JSON → 3 retries → dropped | Single message lost, logged as error | Implement real DLQ Kafka topic (`product.events.dlq`). The in-memory `retryCountMap` is wiped on pod restart. |

---

## 9. CONCURRENCY & DATA RACE

### 9.1 Out-of-order event overwrites

**Where**: High-frequency updates to the same `productId` from concurrent Kafka partitions.

**Current mitigation**: None. UPSERT guarantees the document exists, but has no ordering semantics. Last-write-wins regardless of event freshness.

**Fix**: Use OpenSearch external versioning:
```typescript
await this.client.index({
  index: PRODUCT_INDEX_ALIAS,
  id: doc.id,
  body: this.toIndexBody(doc),
  version: eventTimestamp,
  version_type: 'external',
});
```

### 9.2 `invalidateAll` under concurrent writes

**Where**: Two concurrent `IndexProductCommand` executions both call `invalidateAll()`. Both SCAN the same keys, both DEL.

**Impact**: Redundant work but no data corruption. Under high throughput, Redis is perpetually busy scanning.

### 9.3 Locking strategy

| Mechanism | Where | Type |
|---|---|---|
| OpenSearch document-level locking | UPSERT writes | Last-write-wins (no locking) |
| No distributed locks | — | Gap |
| No optimistic concurrency control | — | Gap |

### 9.4 Idempotency keys

**Not implemented.** Not needed for read endpoints (GET). The Kafka consumer achieves idempotency via UPSERT semantics rather than explicit deduplication keys.

---

## 10. SECURITY

### 10.1 Authentication & Authorization

| Layer | Implementation |
|---|---|
| Public endpoints | `GET /search`, `GET /search/suggest`, `GET /search/:id`, `GET /search/health`, `GET /search/metrics` — **no auth required** |
| Admin endpoints | `POST /search/reindex` — protected by `ServiceAuthGuard` |

### 10.2 `ServiceAuthGuard` analysis

The [ServiceAuthGuard](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/interfaces/guards/service-auth.guard.ts) has **critical security TODOs**:

```typescript
// Internal service API key
if (apiKey && apiKey === process.env.INTERNAL_API_KEY) return true;  // ✅ Implemented

// Service-to-service token
if (serviceToken) return true;  // ⚠️ TODO: Validates nothing — any x-service-token value passes

// Gateway-forwarded JWT
if (authHeader?.startsWith('Bearer ')) return true;  // ⚠️ TODO: Validates nothing — any Bearer token passes
```

> [!CAUTION]
> **The `ServiceAuthGuard` auto-approves any request with an `x-service-token` or `Authorization: Bearer` header without validation.** This means the reindex endpoint is effectively unprotected if attackers know the header convention. Only the `x-api-key` path actually verifies a secret.

### 10.3 Sensitive data handling

The `SearchDocument.fromProductEvent()` mapper blindly copies `event.attributes`:

```typescript
attributes: event.attributes ?? {}
```

If `product-service` emits `{ attributes: { supplier_cost: 4.00, margin_pct: 60 } }`, these are indexed into OpenSearch and returned in API responses. **No field filtering or sanitization exists.**

### 10.4 Abuse scenarios

| Attack | Current Protection | Gap |
|---|---|---|
| **Data scraping** | ThrottlerGuard (60 req/60s per IP) | Easily bypassed by rotating proxies. No per-user rate limit. |
| **Deep pagination DoS** | `@Max(100)` on `limit` | No maximum on `page` parameter. `page=100000` with `limit=100` → OpenSearch computes `from=10000000` → OOM. |
| **Aggregation DoS** | None | If faceting/aggregations are added, unbounded terms aggregations can exhaust OpenSearch memory. |
| **Prometheus metrics leaking** | `/search/metrics` is public | Exposes Node.js internals (heap, event loop, GC stats). Should be behind auth or internal-only. |
| **Reindex abuse** | `ServiceAuthGuard` with broken token validation | Any HTTP client sending `x-service-token: anything` can trigger reindex → empty search index. |

---

## 11. SCALABILITY

### Horizontal scaling

| Component | Scaling model | Notes |
|---|---|---|
| search-service (NestJS) | **Stateless** — horizontally scalable behind LB | Low memory footprint. CPU overhead is minimal (proxying + mapping). |
| OpenSearch | Add data nodes + increase `number_of_replicas` | Replicas multiply read throughput linearly. |
| Redis | Single node → Redis Cluster | Cache keys are service-scoped (`search:*`, `suggest:*`). |
| Kafka consumer | Add partitions + consumer instances | Limited by partition count. One consumer per partition max. |

### Stateless vs stateful

| Part | Type |
|---|---|
| NestJS service instances | Stateless |
| `retryCountMap` in `ProductEventConsumer` | **Stateful (in-memory)** — lost on restart |
| OpenSearch (data) | Stateful |
| Redis (cache) | Stateful (ephemeral) |

### Bottlenecks under high load

| Bottleneck | Threshold | Mitigation |
|---|---|---|
| **`invalidateAll()` on every event** | >10 product events/sec ≈ cache permanently empty | Switch to granular key invalidation or pure TTL expiration |
| **Single OpenSearch shard** | ~50 GB / 50M docs | Increase `number_of_shards` (requires reindex) |
| **Redis cache key non-determinism** | `{"a":1,"b":2}` hashes differently than `{"b":2,"a":1}` | Sort JSON keys before hashing |
| **OpenSearch `from/size` deep pagination** | `from` > 10,000 → memory exhaustion | Enforce max `from` limit and require `search_after` cursor for deep pages |
| **Kafka single partition** | 1 consumer max | Increase partition count for `product.events` |

---

## 12. OBSERVABILITY

### Metrics (Prometheus — implemented via `prom-client`)

The [SearchMetricsService](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/infrastructure/metrics/search-metrics.service.ts) exposes:

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `search_queries_total` | Counter | `status: hit\|miss` | Track cache hit rate |
| `search_latency_seconds` | Histogram | `type: search\|suggest\|get` | Latency distribution (buckets: 10ms–2.5s) |
| `index_operations_total` | Counter | `operation: index\|bulk\|delete`, `status: success\|failure` | Index write health |
| `cache_operations_total` | Counter | `operation: get\|set`, `result: hit\|miss\|error` | Cache operation tracking |
| Node.js default metrics | Various | — | Heap, event loop lag, GC stats |

### Logging strategy

- NestJS `Logger` used throughout all handlers and infrastructure adapters
- Structured log messages: `Indexed product ${id}`, `Cache hit for query: ${key}`, `Bulk indexed: N success, M failed`
- **Missing**: No request-level logging middleware (request ID, path, duration). No correlation ID propagation from API Gateway.

### Tracing

- No explicit OpenTelemetry integration found in search-service. The `@ecommerce/core` package provides `getLoggerModule()` but no distributed tracing spans are created around OpenSearch or Redis calls.

### What to monitor in production

| Alert | Condition | Severity |
|---|---|---|
| `search_queries_total{status="miss"}` rate > 90% | Cache miss rate spike (thundering herd) | P1 — check invalidation pattern |
| `search_latency_seconds` p99 > 500ms | OpenSearch under stress | P2 |
| `index_operations_total{status="failure"}` > 0 | Index writes failing | P1 — data staleness |
| Kafka consumer lag > 1000 messages | Measured externally (not in service) | P1 — search results increasingly stale |
| `/search/health` returns `status: unavailable` | OpenSearch unreachable | P0 — search outage |
| Memory RSS > 400 MB | Node.js process | P2 — potential `retryCountMap` memory leak |

---

## 13. IMPROVEMENTS (VERY IMPORTANT)

### P0 — Must fix before production

| Improvement | What | Trade-off |
|---|---|---|
| **Fix `ServiceAuthGuard` token validation** | The `x-service-token` and `Bearer` code paths auto-approve without verifying anything. Implement actual JWT verification or remove these paths. | Requires coordination with auth-service for token validation. |
| **Replace `invalidateAll()` with granular invalidation** | Stop calling `SCAN ... MATCH search:*` on every product event. Either (a) rely on 60s TTL and never invalidate, or (b) invalidate only keys containing the specific `productId`. | Users see up to 60s stale cache, but infrastructure stays stable under load. |
| **Fix `POST /search/reindex` emptying the index** | Current implementation swaps to an empty index without bulk-copying data. Must call product-service to fetch all products and bulk-insert before swapping. | Adds cross-service dependency. Reindex becomes longer (minutes vs seconds). |
| **Enforce max `from` depth** | Add `@Max(10000)` on `page * limit` to prevent OpenSearch OOM on deep offset pagination. Force `search_after` for deep pages. | Users can't jump to arbitrary deep pages. |

### P1 — Should fix for production readiness

| Improvement | What | Trade-off |
|---|---|---|
| **Implement real Kafka DLQ** | Replace in-memory `retryCountMap` with publishing failed messages to `product.events.dlq` topic. | Additional Kafka topic. Operational overhead to monitor DLQ. |
| **OpenSearch external versioning** | Pass event `timestamp` as `version` with `version_type: external` to reject out-of-order stale overwrites. | Producers must include monotonic timestamps. Slightly more complex indexing. |
| **Protect `/search/metrics` endpoint** | Hide behind `ServiceAuthGuard` or bind to internal-only port. Currently exposes Node.js internals publicly. | Minor config change. No trade-off. |
| **Standardize cache key generation** | Sort JSON keys alphabetically in `RedisCacheAdapter.generateKey()` before hashing. Currently `{"a":1,"b":2}` and `{"b":2,"a":1}` produce different cache keys. | Negligible CPU cost. Saves potentially significant Redis memory. |
| **Sanitize `attributes` in `SearchDocument.fromProductEvent()`** | Whitelist allowed attribute keys before indexing. Prevent leaking internal data (supplier costs, margins). | Requires defining an allowed-fields contract with product-service. |

### P2 — Nice to have

| Improvement | What | Trade-off |
|---|---|---|
| **Distributed tracing** | Add OpenTelemetry spans around OpenSearch queries, Redis operations, and Kafka consumers. | Minor performance overhead. Major observability improvement. |
| **Request correlation ID** | Propagate `X-Request-Id` from API Gateway through logs and metrics. | Essential for production debugging. Trivial to implement. |
| **Stale-While-Revalidate on OpenSearch down** | If circuit breaker trips, serve stale Redis cache regardless of TTL. | Users see stale data vs. seeing a 500 error. Requires cache-aside logic changes. |
| **Kafka message key by `productId`** | Ensure product-service sets `key: productId` on events for partition-level ordering. | Requires producer change. Ensures event ordering per product. |

---

## 14. TL;DR FOR SENIOR ENGINEER

### What matters most

1. **Architecture is sound**: Clean CQRS Materialized View with proper DDD boundaries (domain entities, value objects, ports/adapters). OpenSearch handles full-text search, Redis handles caching, Kafka handles event intake.
2. **Resilience is well-implemented**: Redis operations wrapped in `safeExecute` with `FAIL_OPEN` / `NON_BLOCKING` strategies. Cache failures gracefully degrade to OpenSearch.
3. **Prometheus metrics are production-ready**: `search_queries_total`, `search_latency_seconds`, `index_operations_total`, `cache_operations_total` with proper labels and histogram buckets.
4. **Cursor pagination exists**: `search_after` already implemented in `QueryBuilder` with `_id` tiebreaker.

### What is risky

1. **`invalidateAll()` on every single product event** — This is the **#1 risk**. Under any meaningful product update rate, the cache is permanently empty, and every search query hammers OpenSearch directly. The entire caching layer is effectively disabled.
2. **`ServiceAuthGuard` has broken auth paths** — `x-service-token` and `Bearer` headers bypass all verification. The reindex endpoint can be triggered by anyone who knows the header convention, resulting in a temporary empty search index.
3. **Reindex swaps to an empty index** — The `RebuildIndexHandler` creates a new versioned index but does not copy existing data. Triggering it empties all search results.
4. **No persistent DLQ** — Poison Kafka messages silently disappear after 3 in-memory retries. Pod restart resets all counters.

### What to watch in production

- **Cache miss ratio** (`search_queries_total{status="miss"}`) — if consistently >90%, the `invalidateAll` pattern is the likely cause
- **Kafka consumer lag** — indicates search staleness relative to product catalog truth
- **`search_latency_seconds` p99** — spikes indicate deep pagination or complex queries hitting OpenSearch
- **Memory RSS** — `retryCountMap` can grow unbounded under sustained poison message scenarios
- **`/search/metrics` endpoint security** — publicly exposing Prometheus data
