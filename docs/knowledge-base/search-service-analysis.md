# Search Service — Production-Level Deep Analysis

> **Scope**: [search-service](file:///c:/source/apps/search-service/src) — NestJS CQRS service with DDD architecture  
> **Stack**: TypeScript · NestJS 11 · OpenSearch · Redis (ioredis) · Kafka (KafkaJS) · PostgreSQL (TypeORM, Inbox Pattern) · prom-client (Prometheus) · OpenTelemetry

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
| Eventual consistency intake | Kafka consumer on `product.events` topic → Inbox Pattern → `IndexProductCommand` / `RemoveProductCommand` |
| Idempotent event processing | **Inbox Pattern** with PostgreSQL-backed dedup, CAS state transitions, exponential backoff retries, and DLQ escalation |
| Index lifecycle management | Versioned index creation, alias swapping, health checks via `IndexManagementService` |
| Prometheus metrics | `search_queries_total`, `search_latency_seconds`, `index_operations_total`, `cache_operations_total` via `prom-client` + `http_request_total`, `http_request_duration_seconds`, `http_request_errors_total` via `MetricsInterceptor` |

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

All endpoints live under the `search` controller prefix, behind global `ThrottlerGuard` (60 req/60s via `ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])`). A controller-scoped `DomainExceptionFilter` maps domain errors (`IndexNotFoundError` → `404`, `InvalidSearchQueryError` → `400`), and a global `GlobalExceptionFilter` from `@ecommerce/core` handles all remaining unhandled exceptions.

### `GET /search`

| Aspect | Detail |
|---|---|
| **Purpose** | Primary product discovery endpoint |
| **Request** | `query?` string, `filters[]?` (`{ field, operator, value }`), `sortField?`, `sortOrder?` (`asc`\|`desc`), `page?` (default `1`), `limit?` (default `20`), `cursor?` |
| **Response** | `200 { data: SearchDocumentDto[], total, page, limit, totalPages, cursor, took }` — **Note:** `SearchDocumentDto` only includes `id`, `name`, `description`, `price`, `status`, `categoryId` (no `attributes`) |
| **Validation** | `@IsOptional @IsString` query, `@IsIn(['eq','in','range','gte','lte'])` filter operator, `@IsInt @Min(1) @Max(100)` limit, `@IsInt @Min(1)` page |
| **Idempotency** | Naturally idempotent (Safe GET method) |
| **Rate limiting** | Global ThrottlerGuard (60/60s) |
| **Handler** | [SearchProductsHandler](file:///c:/source/apps/search-service/src/application/handlers/search-products.handler.ts) |

### `GET /search/suggest`

| Aspect | Detail |
|---|---|
| **Purpose** | Auto-complete dropdown for users typing in the search bar |
| **Request** | `prefix` (required, `@MinLength(1) @MaxLength(100)`), `limit?` (default `10`, `@Min(1) @Max(20)`) |
| **Response** | `200 string[]` |
| **Validation** | Prefix string length bounds strictly enforced |
| **Idempotency** | Safe GET method |
| **Handler** | [GetSuggestionsHandler](file:///c:/source/apps/search-service/src/application/handlers/get-suggestions.handler.ts) |

### `GET /search/:id`

| Aspect | Detail |
|---|---|
| **Purpose** | Fetch a single product from the search index by ID |
| **Response** | `200 SearchDocument` (includes `attributes`) or `404 NotFoundException` |
| **Note** | Unlike `GET /search`, this endpoint returns the full `SearchDocument` entity including `attributes`. This can leak internal data — see Section 10.3 |
| **Handler** | [GetProductByIdHandler](file:///c:/source/apps/search-service/src/application/handlers/get-product-by-id.handler.ts) |

### `GET /search/health`

| Aspect | Detail |
|---|---|
| **Purpose** | Liveness/readiness check exposing OpenSearch index health |
| **Response** | `200 { status: 'ok', index: { docCount, sizeInBytes, status } }` |
| **Note** | Gracefully returns `{ docCount: 0, sizeInBytes: 0, status: 'unavailable' }` inside `index` if OpenSearch is down (handled via try/catch in `IndexManagementService.getIndexHealth()`) |

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
| **Handler** | [RebuildIndexHandler](file:///c:/source/apps/search-service/src/application/handlers/rebuild-index.handler.ts) |

---

## 3. DATA MODEL (SOURCE OF TRUTH)

### 3.1 `products` index (OpenSearch)

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

### 3.2 `inbox_events` table (PostgreSQL — Inbox Pattern)

The search-service now uses **PostgreSQL** via TypeORM for the Inbox Pattern. The `inbox_events` table is the single persistence layer for idempotent event processing.

```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ Column        │ Type / Constraints                                          │
├───────────────┼──────────────────────────────────────────────────────────────┤
│ id            │ uuid PRIMARY KEY                                            │
│ eventId       │ varchar(255) UNIQUE — deduplication key                     │
│ eventType     │ varchar(100)                                                │
│ aggregateId   │ varchar(255) NULLABLE — e.g. productId                      │
│ source        │ varchar(100) NULLABLE — e.g. 'product-service'              │
│ payload       │ jsonb — full event payload                                  │
│ status        │ varchar(20) DEFAULT 'RECEIVED' — lifecycle state            │
│ retryCount    │ int DEFAULT 0                                               │
│ maxRetries    │ int DEFAULT 5                                               │
│ errorMessage  │ text NULLABLE                                               │
│ correlationId │ varchar(255) NULLABLE — from Kafka headers                  │
│ nextRetryAt   │ timestamptz NULLABLE — exponential backoff schedule         │
│ processedAt   │ timestamptz NULLABLE                                        │
│ createdAt     │ timestamptz (auto)                                          │
│ updatedAt     │ timestamptz (auto)                                          │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

**Indexes:**
- `UNIQUE(eventId)` — atomic deduplication via `INSERT ... ON CONFLICT DO NOTHING`
- `idx_inbox_status_created(status, createdAt)` — retry processor queries
- `idx_inbox_event_type(eventType)` — filtering by event type
- `idx_inbox_aggregate_id(aggregateId)` — querying by product
- `idx_inbox_correlation_id(correlationId)` — distributed tracing correlation

**Status lifecycle:**
```
RECEIVED → PROCESSING → PROCESSED
                      → FAILED → (retry, backoff) → PROCESSING → ...
                      → FAILED → DEAD_LETTER (after maxRetries exhausted)
```

**TypeORM connection** (configured in `app.module.ts`):
```typescript
TypeOrmModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    url: configService.get('DATABASE_URL') || 'postgres://postgres:postgres@localhost:5432/search_db',
    entities: [InboxEventEntity],
    synchronize: configService.get('DB_SYNC') === 'true',
  }),
})
```

### Why this data belongs here

**OpenSearch**: Relational DBs (PostgreSQL in `product-service`) use B-Trees, which are terrible at full-text ranking, TF/IDF algorithms, and unstructured multi-field scoring. OpenSearch uses **Inverted Indices** to solve this at scale. The `search_as_you_type` field automatically generates 2-gram and 3-gram sub-fields, enabling efficient partial matching without expensive wildcard queries.

**PostgreSQL (inbox_events)**: The Inbox Pattern requires **persistent, transactional storage** for event deduplication and retry state. OpenSearch is not suitable for this because it lacks ACID transactions and UNIQUE constraints. PostgreSQL provides the atomicity needed for CAS (compare-and-swap) state transitions that prevent concurrent processing of the same event.

### Read/write patterns

| Operation | Pattern | Frequency |
|---|---|---|
| `search()` — `multi_match` + `bool` filter | Read (OpenSearch) | Extremely heavy (~99% of traffic) |
| `suggest()` — completion suggester | Read (OpenSearch) | Heavy (keystroke-per-request) |
| `findById()` — direct `GET /_doc/:id` | Read (OpenSearch) | Moderate |
| `indexDocument()` — `PUT /_doc/:id` with `refresh: false` | Write (OpenSearch) | Light (event-driven, ~1%) |
| `removeDocument()` — `DELETE /_doc/:id` with `refresh: false` | Write (OpenSearch) | Rare |
| `indexDocumentsBulk()` — bulk API in batches of 1000 | Write (OpenSearch) | Rare (reindex only) |
| `inbox tryInsert()` — `INSERT ON CONFLICT DO NOTHING` | Write (PostgreSQL) | Light (per Kafka event) |
| `inbox markProcessing/Processed/Failed` — CAS updates | Write (PostgreSQL) | Light (per Kafka event) |
| `inbox findRetryable()` — poll failed events | Read (PostgreSQL) | Every 30 seconds (cron) |

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

- [IndexProductHandler L38](file:///c:/source/apps/search-service/src/application/handlers/index-product.handler.ts#L38): `await this.searchCachePort.invalidateAll()`
- [RemoveProductHandler L27](file:///c:/source/apps/search-service/src/application/handlers/remove-product.handler.ts#L27): `await this.searchCachePort.invalidateAll()`

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

## 5. ASYNC COMMUNICATION (EVENTS / KAFKA + INBOX PATTERN)

### Events Consumed

| Topic | Event Types | Command Dispatched | Handler |
|---|---|---|---|
| `product.events` | `ProductCreated` / `product.created` | `IndexProductCommand` | [IndexProductHandler](file:///c:/source/apps/search-service/src/application/handlers/index-product.handler.ts) |
| `product.events` | `ProductUpdated` / `product.updated` | `IndexProductCommand` | Same (upsert) |
| `product.events` | `ProductDeleted` / `product.deleted` | `RemoveProductCommand` | [RemoveProductHandler](file:///c:/source/apps/search-service/src/application/handlers/remove-product.handler.ts) |

The consumer supports dual event formats: `{ type, payload }` and `{ eventType, data }`.

### Events Produced

| Topic | When | Purpose |
|---|---|---|
| `product.events.dlq` | After inbox event exhausts all retries (default: 5) | Dead Letter Queue for failed events |

Internally, the service publishes domain events via `EventBus` (`DocumentIndexedEvent`, `DocumentRemovedEvent`, `IndexRebuiltEvent`) but does NOT emit regular events to Kafka.

### Inbox Pattern (Idempotent Event Processing)

The [ProductEventConsumer](file:///c:/source/apps/search-service/src/infrastructure/kafka/consumers/product-event.consumer.ts) now uses the **Inbox Pattern** from `@ecommerce/core` for idempotent, reliable event processing. This replaces the previous in-memory retry map.

#### Event processing flow

```
Kafka message arrives
        │
        ▼
┌─────────────────────┐
│ Extract eventId     │ ← from x-event-id header or event.id/event.eventId
│ Extract eventType   │ ← from event.type or event.eventType
└─────────┬───────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│ InboxService.handleIncoming()                       │
│                                                     │
│ 1. INSERT INTO inbox_events ON CONFLICT DO NOTHING  │ ← Atomic dedup
│ 2. CAS: RECEIVED → PROCESSING                      │ ← Prevents concurrent processing
│ 3. BEGIN TRANSACTION                                │
│    └── Execute domain handler (IndexProductCommand) │
│ 4. Mark PROCESSED (on success)                      │
│    OR Mark FAILED + schedule retry (on error)       │
│    OR Mark DEAD_LETTER + send to DLQ (max retries)  │
└─────────────────────────────────────────────────────┘
```

#### Deduplication mechanism

- **Unique constraint** on `eventId` column in `inbox_events` table
- Uses PostgreSQL `INSERT ... ON CONFLICT (event_id) DO NOTHING` for atomic dedup
- If the event already exists and is `PROCESSED` → skip silently
- If the event is `PROCESSING` or `DEAD_LETTER` → skip (another worker handling or exhausted)
- If the event is `FAILED` → will be retried by `InboxProcessor` background job

#### CAS (compare-and-swap) state transitions

All status transitions use `UPDATE ... WHERE status = :expected` for safe concurrent access:
- `markProcessing()`: `RECEIVED → PROCESSING` (returns `false` if another worker claimed it)
- `markRetryProcessing()`: `FAILED → PROCESSING` (for retry attempts)
- `markProcessed()`: sets `processedAt` timestamp
- `markFailed()`: increments `retryCount`, calculates `nextRetryAt` with exponential backoff
- `markDeadLetter()`: terminal state, event sent to DLQ

#### Retry mechanism

| Aspect | Detail |
|---|---|
| **Max retries** | 5 (configurable via `InboxConfig.maxRetries`) |
| **Backoff** | Exponential: `backoffMs * 2^retryCount` (default base: 1000ms) |
| **Retry schedule** | `nextRetryAt` column — processor only picks events where `nextRetryAt <= NOW` |
| **Retry polling** | [InboxSchedulerService](file:///c:/source/apps/search-service/src/infrastructure/kafka/inbox-scheduler.service.ts) runs `@Cron(EVERY_30_SECONDS)` |
| **Batch size** | 50 events per processor cycle (configurable via `InboxConfig.processorBatchSize`) |
| **Persistence** | All retry state is in PostgreSQL — **survives pod restarts** |

#### DLQ (Dead Letter Queue)

When an event exhausts all retries:
1. Inbox event marked as `DEAD_LETTER` in PostgreSQL
2. Message published to `product.events.dlq` Kafka topic via [KafkaDlqProducer](file:///c:/source/packages/core/src/kafka/dlq-producer.ts)
3. DLQ message includes headers: `x-dlq-reason`, `x-dlq-timestamp`, `x-dlq-original-topic`, `x-dlq-service`, `x-correlation-id`, `x-retry-count`

The `KafkaDlqProducer` uses `safeExecute` with `NON_BLOCKING` strategy and 2 retry attempts.

#### Cleanup

[InboxSchedulerService](file:///c:/source/apps/search-service/src/infrastructure/kafka/inbox-scheduler.service.ts) runs `@Cron(EVERY_DAY_AT_3AM)` to delete `PROCESSED` and `DEAD_LETTER` events older than 30 days (configurable via `InboxConfig.retentionDays`).

### Delivery Guarantees

- **Exactly-once processing semantics** via Inbox Pattern deduplication (at-least-once delivery from Kafka + idempotent processing via `eventId` UNIQUE constraint)
- `fromBeginning` configurable via `KAFKA_FROM_BEGINNING` env var (default: `false`)

### Idempotency handling for consumers

Two layers of idempotency protection:

1. **Inbox-level**: `INSERT ON CONFLICT DO NOTHING` prevents processing the same `eventId` twice
2. **OpenSearch-level**: `IndexProductCommand` performs an **UPSERT** — `client.index({ id: doc.id })` inherently overwrites the existing document
3. `RemoveProductCommand` gracefully handles `404` (document not found), making deletes idempotent

### Ordering concerns

- Messages are processed inside `eachMessage` (sequential per partition)
- **No explicit message key** is set by the Kafka producer — if the producer uses round-robin partitioning, events for the same `productId` can land on different partitions → **no ordering guarantee**
- Since the service uses UPSERT without external versioning, a late `v1` event arriving after `v2` will silently overwrite with stale data
- The Inbox Pattern does not add ordering guarantees — it adds deduplication and reliable retry

---

## 6. REQUEST FLOW (END-TO-END)

### Flow: Admin Updates Product → User Sees Updated Search Result

```
Admin                 API Gateway          product-service            Kafka                search-service           PostgreSQL       Redis            OpenSearch
  │                       │                       │                     │                        │                    │                │                  │
  │── PUT /products/123 ─▶│                       │                     │                        │                    │                │                  │
  │                       │── Forward ───────────▶│                     │                        │                    │                │                  │
  │                       │                       │─ DB update ────     │                        │                    │                │                  │
  │                       │                       │─ outbox write ─┘    │                        │                    │                │                  │
  │                       │◀── 200 ───────────────│                     │                        │                    │                │                  │
  │◀── 200 ───────────────│                       │                     │                        │                    │                │                  │
  │                       │                       │                     │                        │                    │                │                  │
  │                       │                       │── relay publish ───▶│                        │                    │                │                  │
  │                       │                       │                     │── eachMessage ─────────▶│                    │                │                  │
  │                       │                       │                     │                        │── inbox INSERT ────▶│                │                  │
  │                       │                       │                     │                        │── CAS: PROCESSING ─▶│                │                  │
  │                       │                       │                     │                        │── BEGIN TX ─────────▶│                │                  │
  │                       │                       │                     │                        │── indexDocument ────────────────────────────────────────▶│
  │                       │                       │                     │                        │── invalidateAll ────────────────────▶│                  │
  │                       │                       │                     │                        │◀── SCAN+DEL ────────────────────────│                  │
  │                       │                       │                     │                        │── COMMIT (PROCESSED)▶│                │                  │
  │                       │                       │                     │                        │                    │                │                  │
  ·                       ·                       ·                     ·                        ·                    ·                ·                  ·
  · (user searches)       ·                       ·                     ·                        ·                    ·                ·                  ·
  │                       │                       │                     │                        │                    │                │                  │
User ─ GET /search?q=.. ─▶│                       │                     │                        │                    │                │                  │
  │                       │── Forward ───────────────────────────────────────────────────────────▶│                    │                │                  │
  │                       │                       │                     │                        │── cache GET ────────────────────────▶│                  │
  │                       │                       │                     │                        │◀── null (miss) ─────────────────────│                  │
  │                       │                       │                     │                        │── _search ──────────────────────────────────────────────▶│
  │                       │                       │                     │                        │◀── hits ────────────────────────────────────────────────│
  │                       │                       │                     │                        │── cache SET ────────────────────────▶│                  │
  │                       │◀── 200 results ─────────────────────────────────────────────────────│                    │                │                  │
User ◀─ 200 ──────────────│                       │                     │                        │                    │                │                  │
```

### Where latency happens

| Step | Typical Latency | Why |
|---|---|---|
| Redis `GET search:{hash}` | < 1ms | Single key lookup via `safeExecute` |
| OpenSearch `_search` (multi_match + filters) | 10–50ms | BM25 ranking, tokenization, filter evaluation |
| Redis `SET` (cache result) | < 1ms | Non-blocking fire-and-forget |
| PostgreSQL inbox `INSERT ON CONFLICT` | < 2ms | Single row insert with UNIQUE check |
| PostgreSQL inbox CAS `UPDATE` | < 1ms | Indexed status column |
| OpenSearch `PUT /_doc` (index) | 5–15ms | Async write, `refresh: false` |
| **OpenSearch refresh** | **~1000ms** | `refresh_interval: 1s` — minimum delay before new doc is searchable |
| Redis `SCAN` + `DEL` (invalidateAll) | 1–100ms+ | Depends on cache size. Blocks Redis during SCAN |
| Kafka → consumer poll | 0–500ms | Depends on Kafka poll interval and consumer lag |
| **Total end-to-end latency (event → searchable)** | **~1.5–2s** | Kafka poll + inbox dedup + indexing + refresh interval |

### Where failures can happen

1. **Redis down at `GET`** → `FAIL_OPEN` returns `null` → falls through to OpenSearch. No user impact.
2. **OpenSearch down at `_search`** → Exception caught by `GlobalExceptionFilter` → `500` with structured error response. No Stale-While-Revalidate fallback.
3. **OpenSearch down at `PUT /_doc`** → Inbox marks event as `FAILED` → retried every 30s with exponential backoff → DLQ after 5 failures. **No data loss.**
4. **PostgreSQL down** → Inbox cannot deduplicate or persist state → consumer catches error and logs it. Events may be reprocessed after recovery (safe due to UPSERT idempotency).
5. **Kafka down** → Consumer logs error but doesn't crash. Search index becomes stale until Kafka recovers.
6. **`invalidateAll` SCAN blocks Redis** → Other Redis operations (cache reads from concurrent requests) experience elevated latency.

---

## 7. CONSISTENCY & TRANSACTIONS

### Local transactions

The Inbox Pattern introduces a **local PostgreSQL transaction** that wraps the domain handler execution:

```typescript
await this.dataSource.transaction(async (_manager: EntityManager) => {
  await handler(payload, metadata);  // IndexProductCommand or RemoveProductCommand
});
```

> [!NOTE]
> The transaction boundary covers the handler execution, but the OpenSearch write **is not part of the same transaction** (OpenSearch doesn't support ACID transactions). This means: if the handler succeeds (OpenSearch indexing completes) but the `markProcessed()` call fails, the event will be retried and re-indexed — which is safe due to UPSERT semantics.

### Eventual consistency model

The search index is a **derived, eventually consistent projection** of the product catalog. The consistency gap is:

```
product-service DB commit → outbox relay → Kafka → consumer poll → inbox dedup → OpenSearch index → refresh_interval
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
| `indexDocument` succeeds but `markProcessed` fails | Event retried → re-indexed (UPSERT) | Benign — no data corruption |
| `indexDocument` fails → retry scheduled | Event stays `FAILED` in inbox, retried every 30s | **Self-healing** — no manual intervention needed |
| `indexDocument` fails after all retries | Event marked `DEAD_LETTER`, sent to `product.events.dlq` | Requires DLQ investigation |
| Reindex swaps to empty index | All search queries return 0 results | **Severe** — until Kafka events repopulate |

---

## 8. FAILURE MODES (CRITICAL)

### 8.1 OpenSearch Down

| What happens now | Impact | How to improve |
|---|---|---|
| Index writes fail → inbox marks as `FAILED` → retried every 30s with exponential backoff → DLQ after 5 attempts | **No data loss** — events persist in PostgreSQL | Already handled via Inbox Pattern. Consider increasing `maxRetries` for transient OpenSearch maintenance windows. |
| Search reads fail → `GlobalExceptionFilter` returns structured `500` | **Total search outage** | Serve stale data from Redis cache if OpenSearch circuit breaker trips (Stale-While-Revalidate). |
| Health endpoint returns `{ status: 'unavailable' }` | Orchestrator can detect | Already handled gracefully |

### 8.2 Redis Down

| What happens now | Impact | How to improve |
|---|---|---|
| `get()` returns `null` (FAIL_OPEN) | All requests hit OpenSearch | Already handled. Monitor Redis health to prevent this from becoming the norm. |
| `set()` silently fails (NON_BLOCKING) | Cache never populated | Already handled. |
| `invalidateAll()` silently fails | Stale cache for up to 60s | Already handled. Acceptable degradation. |

### 8.3 PostgreSQL Down

| What happens now | Impact | How to improve |
|---|---|---|
| Inbox `tryInsert` fails → consumer catches error | Events not deduplicated, may build up in Kafka | Monitor consumer error rate. On recovery, replay may cause duplicate processing (safe due to UPSERT). |
| Inbox `markProcessing` fails | Event stuck in `RECEIVED` state | Processor will retry on recovery. |
| Inbox processor cannot poll retryable events | Failed events not retried | Events remain in `FAILED` state until PostgreSQL recovers. No data loss. |

### 8.4 Kafka Down

| What happens now | Impact | How to improve |
|---|---|---|
| Consumer logs error, stops receiving events | Search index becomes stale | Monitor consumer lag metric. Alert when lag exceeds threshold. |
| Consumer reconnects on recovery | Events resume processing | Already handled by kafkajs reconnect. |
| **DLQ publish fails** | `NON_BLOCKING` + 2 retries via `safeExecute`. Event still marked `DEAD_LETTER` in PostgreSQL. | DLQ message lost but event state is preserved in inbox table. Can query `DEAD_LETTER` events directly. |

### 8.5 Duplicate Kafka Events

| What happens now | Impact | How to improve |
|---|---|---|
| `INSERT ON CONFLICT DO NOTHING` silently deduplicates | **No duplicate processing** | Already handled via Inbox Pattern. |

### 8.6 Race Conditions (Out-of-order events)

| What happens now | Impact | How to improve |
|---|---|---|
| Late `v1` event arrives after `v2` → stale overwrite | Product shows old data until next event | Pass event `timestamp` into OpenSearch's `version` field with `version_type: external`. OpenSearch rejects older versions automatically. |

### 8.7 Poison-pill Kafka Messages

| What happens now | Impact | How to improve |
|---|---|---|
| Malformed JSON → caught in consumer catch block | Event logged as error, not persisted to inbox | Currently logged but not tracked. Consider inserting parse failures into inbox with special status. |
| Valid JSON but handler fails → inbox retries → DLQ | Message preserved in PostgreSQL with error details, sent to DLQ topic | Already handled. Monitor `DEAD_LETTER` count in inbox table. |

---

## 9. CONCURRENCY & DATA RACE

### 9.1 Out-of-order event overwrites

**Where**: High-frequency updates to the same `productId` from concurrent Kafka partitions.

**Current mitigation**: None at OpenSearch level. UPSERT guarantees the document exists, but has no ordering semantics. Last-write-wins regardless of event freshness.

**Inbox Pattern impact**: The inbox deduplicates by `eventId` (per event), not by `aggregateId` (per product). Two different events for the same product (e.g., `v1` update and `v2` update with different `eventId`s) will both be processed.

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

### 9.3 Concurrent inbox event processing

**Where**: Multiple service instances processing the same Kafka message or retry.

**Mitigation**: CAS (compare-and-swap) via `UPDATE ... WHERE status = 'RECEIVED'`. Only one worker can transition `RECEIVED → PROCESSING`. The loser gets `affected = 0` and skips processing.

### 9.4 Locking strategy

| Mechanism | Where | Type |
|---|---|---|
| OpenSearch document-level locking | UPSERT writes | Last-write-wins (no locking) |
| **Inbox CAS state transitions** | `markProcessing()`, `markRetryProcessing()` | Optimistic concurrency control via `UPDATE ... WHERE status = :expected` |
| No distributed locks | — | Not needed — CAS provides sufficient coordination |

### 9.5 Idempotency keys

**Inbox-level**: `eventId` in `inbox_events` table with `UNIQUE` constraint. Event ID is extracted from:
1. Kafka header `x-event-id` (preferred)
2. `event.id` or `event.eventId` from payload (fallback)

**OpenSearch-level**: Document ID (`doc.id`) used as UPSERT key.

---

## 10. SECURITY

### 10.1 Authentication & Authorization

| Layer | Implementation |
|---|---|
| Public endpoints | `GET /search`, `GET /search/suggest`, `GET /search/:id`, `GET /search/health`, `GET /search/metrics` — **no auth required** |
| Admin endpoints | `POST /search/reindex` — protected by `ServiceAuthGuard` |

### 10.2 `ServiceAuthGuard` analysis

The [ServiceAuthGuard](file:///c:/source/apps/search-service/src/interfaces/guards/service-auth.guard.ts) has **critical security TODOs**:

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

If `product-service` emits `{ attributes: { supplier_cost: 4.00, margin_pct: 60 } }`, these are indexed into OpenSearch.

> [!NOTE]
> The main search endpoint (`GET /search`) does **NOT** return `attributes` — the controller maps results to `SearchDocumentDto` which only includes `id`, `name`, `description`, `price`, `status`, `categoryId`. However, the `GET /search/:id` endpoint returns the full `SearchDocument` entity which **does** include `attributes`. **No field filtering or sanitization exists** at the ingestion layer.

Additionally, the `inbox_events` table stores the full event payload as JSONB, which may contain sensitive data. PostgreSQL access controls and encryption-at-rest should be configured appropriately.

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
| PostgreSQL (inbox) | Single instance sufficient for moderate event throughput | Inbox table is small — most events are `PROCESSED` and cleaned up daily. |

### Stateless vs stateful

| Part | Type |
|---|---|
| NestJS service instances | Stateless |
| OpenSearch (data) | Stateful |
| Redis (cache) | Stateful (ephemeral) |
| PostgreSQL (inbox_events) | **Stateful (durable)** — event dedup and retry state |

> [!NOTE]
> The previous in-memory `retryCountMap` was **stateful and volatile** (lost on pod restart). The Inbox Pattern replaces this with PostgreSQL-backed state that **survives restarts** — a significant reliability improvement.

### Bottlenecks under high load

| Bottleneck | Threshold | Mitigation |
|---|---|---|
| **`invalidateAll()` on every event** | >10 product events/sec ≈ cache permanently empty | Switch to granular key invalidation or pure TTL expiration |
| **Single OpenSearch shard** | ~50 GB / 50M docs | Increase `number_of_shards` (requires reindex) |
| **Redis cache key non-determinism** | `{"a":1,"b":2}` hashes differently than `{"b":2,"a":1}` | Sort JSON keys before hashing |
| **OpenSearch `from/size` deep pagination** | `from` > 10,000 → memory exhaustion | Enforce max `from` limit and require `search_after` cursor for deep pages |
| **Kafka single partition** | 1 consumer max | Increase partition count for `product.events` |
| **Inbox table growth** | High event throughput without cleanup | Daily cleanup job already configured. Monitor table size. |
| **PostgreSQL connection pool** | TypeORM default pool under many concurrent events | Configure pool size via TypeORM options if needed |

---

## 12. OBSERVABILITY

### Metrics (Prometheus)

#### Service-specific metrics (via `prom-client` in [SearchMetricsService](file:///c:/source/apps/search-service/src/infrastructure/metrics/search-metrics.service.ts))

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `search_queries_total` | Counter | `status: hit\|miss` | Track cache hit rate |
| `search_latency_seconds` | Histogram | `type: search\|suggest\|get` | Latency distribution (buckets: 10ms–2.5s) |
| `index_operations_total` | Counter | `operation: index\|bulk\|delete`, `status: success\|failure` | Index write health |
| `cache_operations_total` | Counter | `operation: get\|set`, `result: hit\|miss\|error` | Cache operation tracking |
| Node.js default metrics | Various | — | Heap, event loop lag, GC stats |

#### HTTP-level metrics (via `MetricsInterceptor` from `@ecommerce/core`)

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `http_request_total` | Counter | `service`, `method`, `path`, `status` | Total HTTP requests with status codes |
| `http_request_duration_seconds` | Histogram | `service`, `method`, `path` | HTTP request duration (buckets: 10ms–10s) |
| `http_request_errors_total` | Counter | `service`, `method`, `path`, `error_type` | Failed HTTP request tracking |

> [!NOTE]
> Path labels are normalized (`:id` → `{id}`) to avoid cardinality explosion.

### Logging strategy

- NestJS `Logger` used throughout all handlers and infrastructure adapters
- Structured log messages: `Indexed product ${id}`, `Cache hit for query: ${key}`, `Bulk indexed: N success, M failed`
- **Inbox logging**: `Inbox: processed event eventId=X`, `Inbox: retry succeeded`, `Inbox: event moved to DLQ`, `Inbox retry: processed N event(s)`, `Inbox cleanup: deleted N old event(s)`
- **`HttpLoggingInterceptor`** (from `@ecommerce/core`) is registered globally in `main.ts` and provides request-level logging with:
  - Correlation ID propagation (`x-correlation-id` or `x-request-id` headers)
  - Request method, URL, status code, user agent, and latency
  - Log format: `[correlationId] METHOD /url statusCode - userAgent [latencyMs]`
- **`GlobalExceptionFilter`** (from `@ecommerce/core`) handles unhandled exceptions globally with structured error responses and stack trace logging

### Tracing (OpenTelemetry)

`main.ts` calls `initTracing('search-service')` which initializes the **OpenTelemetry NodeSDK** with:
- OTLP HTTP trace exporter (configurable via `OTEL_EXPORTER_OTLP_ENDPOINT`, defaults to `http://localhost:4318/v1/traces`)
- Auto-instrumentations for Node.js (`@opentelemetry/auto-instrumentations-node`) — automatically instruments HTTP, gRPC, and other common libraries
- Graceful shutdown on `SIGTERM`

> [!NOTE]
> While auto-instrumentations cover HTTP and common libraries, there are no **custom spans** explicitly created around OpenSearch queries or Redis calls within the search-service code itself. The auto-instrumentation may capture HTTP-level calls to OpenSearch, but fine-grained spans (e.g., query building, cache logic, inbox processing) require manual instrumentation.

### What to monitor in production

| Alert | Condition | Severity |
|---|---|---|
| `search_queries_total{status="miss"}` rate > 90% | Cache miss rate spike (thundering herd) | P1 — check invalidation pattern |
| `search_latency_seconds` p99 > 500ms | OpenSearch under stress | P2 |
| `index_operations_total{status="failure"}` > 0 | Index writes failing | P1 — data staleness |
| Kafka consumer lag > 1000 messages | Measured externally (not in service) | P1 — search results increasingly stale |
| `/search/health` returns `status: unavailable` | OpenSearch unreachable | P0 — search outage |
| `http_request_errors_total` increasing | HTTP-level failures | P1 — service degradation |
| **`inbox_events` WHERE `status='FAILED'` count > 10** | Events failing persistently | P1 — check OpenSearch health or handler bugs |
| **`inbox_events` WHERE `status='DEAD_LETTER'` count > 0** | Events exhausted all retries | P1 — investigate DLQ, manual replay may be needed |
| **`inbox_events` table size > 100K rows** | Table not being cleaned up | P2 — verify cleanup cron is running |

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
| ~~**Implement real Kafka DLQ**~~ | ✅ **DONE** — Inbox Pattern now routes failed events to `product.events.dlq` via `KafkaDlqProducer` after exhausting 5 retries. | — |
| **OpenSearch external versioning** | Pass event `timestamp` as `version` with `version_type: external` to reject out-of-order stale overwrites. | Producers must include monotonic timestamps. Slightly more complex indexing. |
| **Protect `/search/metrics` endpoint** | Hide behind `ServiceAuthGuard` or bind to internal-only port. Currently exposes Node.js internals publicly. | Minor config change. No trade-off. |
| **Standardize cache key generation** | Sort JSON keys alphabetically in `RedisCacheAdapter.generateKey()` before hashing. Currently `{"a":1,"b":2}` and `{"b":2,"a":1}` produce different cache keys. | Negligible CPU cost. Saves potentially significant Redis memory. |
| **Sanitize `attributes` in `SearchDocument.fromProductEvent()`** | Whitelist allowed attribute keys before indexing. Prevent leaking internal data (supplier costs, margins) — especially via `GET /search/:id` which returns the full entity. | Requires defining an allowed-fields contract with product-service. |
| **Register retry handlers in InboxProcessor** | The `InboxSchedulerService` creates an `InboxProcessor` but does not call `registerHandler()` for any event types. Background retries will skip all events with `no handler registered` warning. | Must register handlers for `ProductCreated`, `ProductUpdated`, `ProductDeleted`, etc. |

### P2 — Nice to have

| Improvement | What | Trade-off |
|---|---|---|
| **Custom OpenTelemetry spans** | Add manual spans around OpenSearch queries, Redis operations, inbox processing, and Kafka consumer processing. | Minor performance overhead. Fine-grained observability improvement. |
| **Stale-While-Revalidate on OpenSearch down** | If circuit breaker trips, serve stale Redis cache regardless of TTL. | Users see stale data vs. seeing a 500 error. Requires cache-aside logic changes. |
| **Kafka message key by `productId`** | Ensure product-service sets `key: productId` on events for partition-level ordering. | Requires producer change. Ensures event ordering per product. |
| **Inbox metrics** | Add Prometheus counters for inbox operations: `inbox_events_received`, `inbox_events_processed`, `inbox_events_failed`, `inbox_events_dlq`. | Improves visibility into inbox health and throughput. |

---

## 14. TL;DR FOR SENIOR ENGINEER

### What matters most

1. **Architecture is sound**: Clean CQRS Materialized View with proper DDD boundaries (domain entities, value objects, ports/adapters). OpenSearch handles full-text search, Redis handles caching, Kafka handles event intake, **PostgreSQL handles inbox dedup/retry state**.
2. **Inbox Pattern provides reliable event processing**: Events are atomically deduplicated via `UNIQUE(eventId)`, processed within DB transactions, retried with exponential backoff, and escalated to DLQ after max retries. **No more in-memory retry state** — all state survives pod restarts.
3. **Resilience is well-implemented**: Redis operations wrapped in `safeExecute` with `FAIL_OPEN` / `NON_BLOCKING` strategies. Cache failures gracefully degrade to OpenSearch. Failed event processing is automatically retried via inbox.
4. **Prometheus metrics are production-ready**: Service-specific metrics (`search_queries_total`, `search_latency_seconds`, `index_operations_total`, `cache_operations_total`) plus HTTP-level metrics (`http_request_total`, `http_request_duration_seconds`, `http_request_errors_total`) via `MetricsInterceptor`.
5. **Cursor pagination exists**: `search_after` already implemented in `QueryBuilder` with `_id` tiebreaker.
6. **Observability stack is integrated**: OpenTelemetry tracing (`initTracing`), HTTP request logging with correlation ID propagation (`HttpLoggingInterceptor`), and global exception handling (`GlobalExceptionFilter`) are all wired up in `main.ts`.

### What is risky

1. **`invalidateAll()` on every single product event** — This is the **#1 risk**. Under any meaningful product update rate, the cache is permanently empty, and every search query hammers OpenSearch directly. The entire caching layer is effectively disabled.
2. **`ServiceAuthGuard` has broken auth paths** — `x-service-token` and `Bearer` headers bypass all verification. The reindex endpoint can be triggered by anyone who knows the header convention, resulting in a temporary empty search index.
3. **Reindex swaps to an empty index** — The `RebuildIndexHandler` creates a new versioned index but does not copy existing data. Triggering it empties all search results.
4. **InboxProcessor has no registered handlers** — The `InboxSchedulerService` creates an `InboxProcessor` but never calls `registerHandler()`. Background retries (every 30s cron) will find failed events but skip them all because no handler is registered for any event type.

### What changed (Inbox Pattern migration)

| Before | After |
|---|---|
| In-memory `Map<string, number>` for retry counts | PostgreSQL `inbox_events` table — persistent across pod restarts |
| Max 3 retries, then silently dropped | Max 5 retries with exponential backoff, then DLQ |
| No deduplication (relied on UPSERT idempotency only) | Atomic dedup via `UNIQUE(eventId)` + CAS state transitions |
| No DLQ — poison messages lost | Real DLQ: `product.events.dlq` Kafka topic with rich headers |
| Stateful (volatile) | Stateful (durable) |
| No cleanup | Daily cleanup of processed events older than 30 days |
| No new infrastructure dependency | **Added PostgreSQL dependency** (`search_db`) + TypeORM |

### What to watch in production

- **Cache miss ratio** (`search_queries_total{status="miss"}`) — if consistently >90%, the `invalidateAll` pattern is the likely cause
- **Kafka consumer lag** — indicates search staleness relative to product catalog truth
- **`search_latency_seconds` p99** — spikes indicate deep pagination or complex queries hitting OpenSearch
- **`/search/metrics` endpoint security** — publicly exposing Prometheus data
- **`http_request_errors_total`** — HTTP-level error rate tracking via `MetricsInterceptor`
- **`inbox_events` with `status=FAILED`** — events actively failing, check OpenSearch health
- **`inbox_events` with `status=DEAD_LETTER`** — events that gave up, investigate root cause
- **`inbox_events` table size** — should stay small with daily cleanup; large tables indicate cleanup failure
