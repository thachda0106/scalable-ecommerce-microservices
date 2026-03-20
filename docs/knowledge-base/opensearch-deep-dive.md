# OpenSearch Deep Dive — Production-Grade Guide

> **Audience**: Backend engineers (Node.js / TypeScript / NestJS) integrating OpenSearch into a microservices architecture (DDD + CQRS + Event-driven)  
> **Reference Implementation**: [search-service](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src)

---

## PHASE 1: CORE THEORY (SEARCH ENGINE FUNDAMENTALS)

---

### 1.1 What is OpenSearch?

OpenSearch is a **distributed search and analytics engine** — a fork of Elasticsearch 7.10.2 created by AWS in 2021 after Elastic changed its license from Apache 2.0 to SSPL. Functionally, they are nearly identical at the API level. The `search-service` uses `@opensearch-project/opensearch` (the official Node.js client).

**Key distinction from a relational DB:**

| Concern | PostgreSQL | OpenSearch |
|---|---|---|
| Primary use case | Transactional CRUD (ACID) | Full-text search + analytics |
| Data structure | Rows in tables with B-Tree indexes | Documents in inverted indices |
| Query strength | Exact lookups, JOINs, aggregations | Fuzzy text matching, relevance ranking, faceting |
| Consistency | Strong (ACID transactions) | Eventual (near real-time, `refresh_interval`) |
| Write speed | Fast (single-row INSERT) | Slower (segment merge, analyze pipeline) |
| Read pattern | Point lookups by PK/index | Scatter-gather across shards |

**Real-world analogy:** PostgreSQL is a **filing cabinet** — you open drawer "Users", find folder "user-123", pull out the exact document. OpenSearch is a **book index** — you look up "distributed systems" in the back of the book, it tells you pages 47, 112, 245. The *index* was pre-built by analyzing every page.

---

### 1.2 The Inverted Index — The Core Data Structure

This is **the single most important concept** in search engineering. Everything else is built on top of it.

#### How a traditional (forward) index works

A PostgreSQL `products` table works like this:

```
Document ID → Content
─────────────────────────────────
doc_1       → "Wireless Bluetooth Headphones"
doc_2       → "Bluetooth Speaker Portable"
doc_3       → "Wireless Mouse Ergonomic"
```

To find all products containing "Bluetooth", PostgreSQL must **scan every single row** and check if the text contains the word. This is `O(N)` — catastrophic at scale.

#### How an inverted index works

OpenSearch **inverts** the relationship:

```
Term          → Document IDs
───────────────────────────────
bluetooth     → [doc_1, doc_2]
ergonomic     → [doc_3]
headphones    → [doc_1]
mouse         → [doc_3]
portable      → [doc_2]
speaker       → [doc_2]
wireless      → [doc_1, doc_3]
```

Now finding "Bluetooth" is an **O(1) dictionary lookup** — instantly returns `[doc_1, doc_2]`. Finding "wireless bluetooth" is an **intersection** of two posting lists: `[doc_1, doc_3] ∩ [doc_1, doc_2] = [doc_1]`.

#### What's actually stored (production-level detail)

Each entry in the inverted index isn't just a list of doc IDs. It's a **posting list** containing:

```
Term: "bluetooth"
├── doc_1: { termFrequency: 1, position: [1], fieldLength: 3 }
├── doc_2: { termFrequency: 1, position: [0], fieldLength: 3 }
```

- **Term Frequency (TF):** How many times this term appears in this document
- **Position:** Where in the field the term appears (needed for phrase queries like `"bluetooth headphones"`)
- **Field Length:** Total terms in the field (used for normalization — a term in a 3-word title is more significant than in a 500-word description)

**Real-world analogy:** Think of it like the index at the back of a textbook. The textbook author didn't write "page 47 contains: distributed, systems, architecture." Instead, they wrote:
- "distributed → pages 47, 112"
- "systems → pages 47, 89, 112"
- "architecture → pages 47, 200"

If you want pages about "distributed systems", you take the intersection: pages 47, 112.

#### How this maps to the search-service code

In [index-mappings.ts](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/infrastructure/opensearch/index-mappings.ts):

```typescript
name: {
  type: 'search_as_you_type',  // Creates MULTIPLE inverted indices per field
  max_shingle_size: 3,
},
description: {
  type: 'text',                // Creates ONE inverted index
  analyzer: 'standard',
},
status: { type: 'keyword' },   // Creates a DIFFERENT kind of index (not inverted)
```

- `text` fields → analyzed, tokenized, stored in an inverted index
- `keyword` fields → stored as-is in a **doc values** column (like a column-oriented DB), used for exact match, sorting, and aggregations
- `search_as_you_type` → actually creates **4 sub-fields** automatically: `name`, `name._2gram`, `name._3gram`, `name._index_prefix`

---

### 1.3 Tokenization, Analyzers, and Filters

#### The Analysis Pipeline

When you index a document, the text doesn't go directly into the inverted index. It passes through an **analysis pipeline**:

```
Input Text: "Wireless Bluetooth Headphones HD-500"
                          │
                    ┌─────▼─────┐
                    │ Char Filter│   (Optional: strip HTML, normalize chars)
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │ Tokenizer  │   Split text into tokens
                    └─────┬─────┘
                          │
              ["Wireless", "Bluetooth", "Headphones", "HD", "500"]
                          │
                    ┌─────▼─────┐
                    │Token Filter│   Transform tokens
                    └─────┬─────┘
                          │
              ["wireless", "bluetooth", "headphones", "hd", "500"]
```

#### The `standard` analyzer (what the search-service uses)

The `description` field uses `analyzer: 'standard'`. This is the default and does:

1. **Standard Tokenizer:** Splits on whitespace and punctuation. `"HD-500"` → `["HD", "500"]`
2. **Lowercase Token Filter:** `"Wireless"` → `"wireless"`

**That's it.** No stemming, no stop-word removal, no synonym expansion. This is deliberately conservative.

#### Why this matters in production

Consider a user searching for `"running shoes"` in a product catalog:

| Analyzer | Indexed Term | Matches "running"? |
|---|---|---|
| `standard` | "running" | ✅ Yes (exact) |
| `standard` | "runs" | ❌ No |
| `english` (with stemmer) | "run" (stemmed) | ✅ Yes (both "running" and "runs" stem to "run") |

The search-service's `description` field uses `standard` → a search for "running" will NOT match a product described as "runs great". If you want that, you need the `english` analyzer.

#### Common Analyzers Comparison

| Analyzer | Tokenizer | Token Filters | Best For |
|---|---|---|---|
| `standard` | Standard | Lowercase | General purpose, safe default |
| `simple` | Letter-only | Lowercase | Text without numbers |
| `whitespace` | Whitespace | None | Case-sensitive, preserves hyphens |
| `english` | Standard | Lowercase, stop words, stemmer, possessive | English prose (blog, descriptions) |
| `keyword` | Noop (entire string) | None | Exact match (IDs, enums) |

#### The `search_as_you_type` field (what the `name` field uses)

This is a specialized type that creates n-gram sub-fields automatically:

```
Input: "Wireless Bluetooth Headphones"

name (root):       ["wireless", "bluetooth", "headphones"]
name._2gram:       ["wireless bluetooth", "bluetooth headphones"]
name._3gram:       ["wireless bluetooth headphones"]
name._index_prefix: ["w", "wi", "wir", "wire", ... "wireless", "b", "bl", ...]
```

The [query-builder.ts](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/infrastructure/opensearch/query-builder.ts) uses this:

```typescript
multi_match: {
  query: query.query,
  fields: ['name', 'name._2gram', 'name._3gram', 'description'],
  type: 'best_fields',
}
```

This queries all 4 fields simultaneously and takes the **best score** from any matching field.

---

### 1.4 Full-Text Search vs. Keyword Search

This is where engineers coming from SQL make 90% of their mistakes.

#### `text` type = Analyzed = Full-text search

```typescript
description: { type: 'text', analyzer: 'standard' }
```

- The value `"Ergonomic Wireless Mouse"` is tokenized into `["ergonomic", "wireless", "mouse"]`
- Searching for `"wireless"` matches via inverted index lookup
- Searching for `"Ergonomic Wireless Mouse"` (exact string) does NOT guarantee exact match — it matches any document containing any of those tokens

#### `keyword` type = Not analyzed = Exact match

```typescript
status: { type: 'keyword' }
categoryId: { type: 'keyword' }
```

- The value `"ACTIVE"` is stored as-is: `"ACTIVE"`
- Only an exact match works: `{ term: { status: "ACTIVE" } }`
- Searching for `"active"` (lowercase) → **no match** (keywords are not analyzed)

#### How this maps to the filter implementation

In [query-builder.ts](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/infrastructure/opensearch/query-builder.ts):

```typescript
case 'eq':
  return { term: { [filter.field]: filter.value } };  // keyword exact match
case 'in':
  return { terms: { [filter.field]: filter.value } };  // keyword multi-value
```

These use `term`/`terms` queries — they work **only** on `keyword` fields. If you accidentally created `status` as `text`, a `term` query for `"ACTIVE"` would fail because the indexed value would be `"active"` (lowercased by the standard analyzer).

> [!IMPORTANT]
> **Production rule:** Always use `keyword` for IDs, statuses, enums, categories. Always use `text` for human-readable prose that users will search through.

---

### 1.5 Relevance Scoring — BM25

When a user searches for `"wireless bluetooth headphones"`, OpenSearch doesn't just find matching documents — it **ranks** them by relevance. The algorithm is **BM25** (Best Matching 25).

#### BM25 Formula (Intuition)

For each term in the query, BM25 calculates a score based on three factors:

```
Score(term, doc) = IDF(term) × [ TF(term, doc) × (k1 + 1) ] / [ TF(term, doc) + k1 × (1 - b + b × fieldLen/avgFieldLen) ]
```

Don't memorize the formula. Understand the **three signals:**

**1. Term Frequency (TF):** How many times does this term appear in this document?
- A product named `"Bluetooth Bluetooth Speaker"` scores higher for "bluetooth" than `"Bluetooth Speaker"`
- But BM25 has **diminishing returns** — the 10th occurrence adds less score than the 2nd

**2. Inverse Document Frequency (IDF):** How rare is this term across ALL documents?
- If "bluetooth" appears in 90% of products → low IDF (not distinctive)
- If "ergonomic" appears in 2% of products → high IDF (very distinctive)
- This is why searching "the" doesn't return meaningful results — "the" appears everywhere

**3. Field Length Normalization:** How long is the field?
- "bluetooth" appearing in a 3-word title is more significant than in a 500-word description
- Controlled by parameter `b` (default 0.75). Set `b=0` to disable length normalization.

#### Real-world example

```
Query: "wireless headphones"

Product A: "Wireless Headphones"        ← short title, both terms present → HIGH score
Product B: "Wireless Bluetooth Speaker" ← only 1 term matches → LOWER score
Product C: "Premium Noise-Canceling Wireless Over-Ear Headphones for Professional Studio Use"
                                         ← both terms, but field is long → MEDIUM score
```

#### BM25 Parameters

| Parameter | Default | Effect |
|---|---|---|
| `k1` | 1.2 | Controls TF saturation. Higher = more weight on term frequency |
| `b` | 0.75 | Controls field length normalization. 0 = disabled, 1 = full normalization |

**Production implication:** The `multi_match` with `type: 'best_fields'` takes the highest score from any single field. A match in the short `name` field will often outscore a match in the longer `description` field because of length normalization.

---

### 1.6 Shards, Replicas, and Distributed Search

#### Shards = Horizontal partitioning

An OpenSearch index is split into **shards** (like partitions in Kafka or database sharding). Each shard is a self-contained Lucene index with its own inverted index.

```
products index (1 shard, 0 replicas — current config)
┌─────────────────────────┐
│ Shard 0 (Primary)       │
│ ┌─────────────────────┐ │
│ │ Inverted Index       │ │
│ │ Doc Values           │ │
│ │ Stored Fields        │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

From [index-mappings.ts](file:///c:/sources/personal-source/scalable-ecommerce-microservices/apps/search-service/src/infrastructure/opensearch/index-mappings.ts):
```typescript
number_of_shards: 1,           // All data in one shard
number_of_replicas: replicas,  // Configurable via OPENSEARCH_INDEX_REPLICAS
```

#### When to use multiple shards

| Scenario | Recommended Shards | Why |
|---|---|---|
| < 50GB data, < 1M docs | 1 shard | Less overhead, simpler scoring |
| 50-200GB data | 3-5 shards | Distribute storage + parallelize search |
| > 200GB data | Scale proportionally | ~30-50GB per shard is the sweet spot |

**Why not always use many shards?** Each shard has overhead:
- ~50MB heap per shard just for metadata
- 100 shards × 50MB = 5GB heap consumed by metadata alone
- BM25 scoring is **per-shard** — with few documents per shard, IDF becomes inaccurate (a term appearing in 1 of 10 docs on shard A has different IDF than 1 of 10,000 on shard B)

#### Replicas = Redundancy + Read throughput

Replicas are copies of primary shards:
- **Fault tolerance:** If a node dies, the replica promotes to primary
- **Read throughput:** Search queries can be served by replicas, effectively multiplying read capacity

```
With 1 primary + 1 replica:

Node A                    Node B
┌──────────────────┐     ┌──────────────────┐
│ Shard 0 (Primary)│────▶│ Shard 0 (Replica)│
└──────────────────┘     └──────────────────┘
        │                         │
    Handles writes          Handles reads
    + reads                 (load balanced)
```

#### How a distributed search works

When a search query arrives at a multi-shard index:

1. **Scatter phase:** The coordinating node forwards the query to ALL shards (primary or replica)
2. **Shard-local execution:** Each shard searches its local inverted index, scores documents, returns top-N results
3. **Gather phase:** The coordinating node merges all shard results, re-sorts globally, returns final top-N

```
Client ── search("wireless") ──▶ Coordinating Node
                                      │
                          ┌───────────┼───────────┐
                          ▼           ▼           ▼
                       Shard 0     Shard 1     Shard 2
                       top 10      top 10      top 10
                          │           │           │
                          └───────────┼───────────┘
                                      ▼
                              Merge + Re-sort
                              Return top 10
```

**Production implication:** A `from: 10000, size: 10` query (deep pagination) forces EVERY shard to compute and return 10,010 results to the coordinating node, which then discards 10,000. This is why `search_after` cursor pagination is critical — it avoids this problem entirely.

---

### 1.7 Index vs. Document vs. Mapping

| OpenSearch Concept | SQL Equivalent | search-service Code |
|---|---|---|
| **Index** | Database table | `products` (via `PRODUCT_INDEX_ALIAS`) |
| **Document** | Row | A single `SearchDocument` (product) |
| **Mapping** | Schema (column definitions) | `PRODUCT_INDEX_MAPPINGS` in `index-mappings.ts` |
| **Field** | Column | `name`, `price`, `status`, etc. |
| **Alias** | View | `products` alias → `products_v{timestamp}` actual index |

#### Aliases — Critical for zero-downtime reindex

The `IndexManagementService` uses aliases:

```typescript
// index-mappings.ts
export const PRODUCT_INDEX_ALIAS = 'products';

// index-management.service.ts
async swapAlias(newIndex: string, oldIndex?: string): Promise<void> {
  const actions = [
    { add: { index: newIndex, alias: PRODUCT_INDEX_ALIAS } },
  ];
  // Atomically swap
  await this.client.indices.updateAliases({ body: { actions } });
}
```

The alias `products` is like a DNS name. The application always queries `products`, but the alias can point to `products_v1705000000`. When you reindex, you create `products_v1705001000`, populate it, then atomically swap the alias. **Zero downtime.**

```
Before reindex:    products (alias) ──▶ products_v1705000000 (actual)
During reindex:    products (alias) ──▶ products_v1705000000
                   products_v1705001000 (being built, not yet aliased)
After swap:        products (alias) ──▶ products_v1705001000
                   products_v1705000000 (can be deleted)
```

---

### 1.8 Segments and Near Real-Time Search

#### How writes actually work internally

OpenSearch doesn't write directly to the inverted index. The process is:

1. **Index request arrives** → document goes into an **in-memory buffer** + **transaction log (translog)**
2. **Refresh** (every `refresh_interval`, default 1s) → buffer is flushed to a new **segment** (immutable Lucene file on disk). The document is now **searchable**.
3. **Flush** (periodically) → translog is cleared, segments are committed to durable storage
4. **Merge** (background) → small segments are merged into larger ones for efficiency

```
Write ──▶ Memory Buffer ──▶ [refresh 1s] ──▶ Segment (searchable)
              │                                    │
              └──▶ Translog (durability)     [merge] ──▶ Larger Segment
```

This is why the search-service uses `refresh: false` on index operations:

```typescript
// opensearch-index.adapter.ts
await this.client.index({
  index: PRODUCT_INDEX_ALIAS,
  id: doc.id,
  body: this.toIndexBody(doc),
  refresh: false,  // Don't force immediate refresh — rely on refresh_interval
});
```

Setting `refresh: 'true'` would force an immediate segment creation after every single document write — extremely expensive under high write throughput.

> [!NOTE]
> The ~1 second gap between write and searchability is the fundamental source of "eventual consistency" in the search-service. This is NOT a bug — it's a deliberate design choice for performance.

---

### Phase 1 — Review Questions

**1.** The `name` field is `search_as_you_type` and the `status` field is `keyword`. If a user sends a filter `{ field: "status", operator: "eq", value: "active" }` but the actual stored value is `"ACTIVE"`, will it match? Why or why not?

**2.** The current index has `number_of_shards: 1`. If the product catalog grows to 100 million documents (~80GB), what specific problems will arise, and what should change?

**3.** The `IndexProductHandler` calls `invalidateAll()` after every index operation. Given that OpenSearch's `refresh_interval` is `1s`, what happens if a user searches immediately after the cache is wiped but before the refresh completes?

---

## PHASE 2: DOCKER SETUP (HANDS-ON)

---

### 2.1 The `docker-compose.yml`

This setup provisions a single-node OpenSearch cluster and OpenSearch Dashboards (the UI), optimized for local development and mimicking production constraints.

```yaml
version: '3.8'

services:
  opensearch:
    image: opensearchproject/opensearch:2.11.0
    container_name: msa-opensearch
    environment:
      - cluster.name=msa-cluster
      - node.name=os-node-1
      - discovery.type=single-node
      - bootstrap.memory_lock=true # Disable JVM swapping (CRITICAL)
      - "OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g" # Min and Max JVM Heap
      - plugins.security.disabled=true # Disable HTTPS/auth for local dev
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536 # Required for Lucene file descriptors
        hard: 65536
    volumes:
      - opensearch-data:/usr/share/opensearch/data
    ports:
      - 9200:9200
      - 9600:9600 # Performance Analyzer metrics
    networks:
      - msa-network

  opensearch-dashboards:
    image: opensearchproject/opensearch-dashboards:2.11.0
    container_name: msa-opensearch-dashboards
    ports:
      - 5601:5601
    expose:
      - "5601"
    environment:
      - OPENSEARCH_HOSTS=["http://opensearch:9200"]
      - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
    networks:
      - msa-network
    depends_on:
      - opensearch

volumes:
  opensearch-data:

networks:
  msa-network:
    driver: bridge
```

### 2.2 Configuration Deep Dive

- **`bootstrap.memory_lock=true`**: OpenSearch memory cannot be swapped to disk. Swapping destroys performance because JVM garbage collections will have to read from disk.
- **`OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g`**: You MUST set min and max heap to the same value to prevent heap resizing pauses. Never allocate more than 50% of total system RAM to OpenSearch (it needs the other 50% for the OS filesystem cache to hold segments). Max heap across the industry is capped at 32GB (due to compressed OOPs pointers).
- **`plugins.security.disabled=true`**: Bypasses the complex SSL/RBAC setup for local ease. In production, this is strictly `false`.

### 2.3 Operations

- **Start:** `docker-compose up -d opensearch opensearch-dashboards`
- **Verify Health:** `curl -s -X GET "http://localhost:9200/_cluster/health?pretty"`
  - *Green*: All primary and replica shards allocated.
  - *Yellow*: All primary shards allocated, some replicas missing (normal for single-node).
  - *Red*: Primary shards missing (data loss/unavailable).
- **Dashboard:** Open `http://localhost:5601`. Navigate to "Dev Tools" in the left menu. This is your playground.

### Phase 2 Review Questions
1. Why do we lock the JVM heap memory (`bootstrap.memory_lock=true`)?
2. Why should you never allocate more than 32GB to the OpenSearch JVM heap?

---

## PHASE 3: BASIC OPERATIONS (API LEVEL)

---

All API operations follow the paradigm: `VERB /index_name/_endpoint`

### 3.1 Create Index with Explicit Mapping

OpenSearch will dynamically map fields if you just index a document. **Never rely on dynamic mapping in production.** Dynamic mapping often chooses wrong types (e.g., mapping a string ID as an analyzed `text` field, breaking exact matching).

In Dev Tools (`localhost:5601`):
```json
PUT /products
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "refresh_interval": "1s"
  },
  "mappings": {
    "dynamic": "strict", // CRITICAL: Reject unmapped fields
    "properties": {
      "id": { "type": "keyword" },
      "name": { 
        "type": "search_as_you_type",
        "max_shingle_size": 3
      },
      "description": { "type": "text", "analyzer": "standard" },
      "price": { "type": "float" },
      "categoryId": { "type": "keyword" }
    }
  }
}
```
**Why `dynamic: strict`?** It prevents mapping explosions where developers accidentally send varying keys in a JSON payload, causing cluster state bloat and crashing the master node.

### 3.2 Index Document

```json
PUT /products/_doc/123
{
  "id": "123",
  "name": "Sony Wireless Headphones",
  "description": "High quality noise canceling bluetooth headphones",
  "price": 299.99,
  "categoryId": "electronics"
}
```
Using `PUT /index/_doc/:id` is an **upsert**. If doc 123 exists, it's overwritten completely.

### 3.3 Get Document (Point Lookup)

```json
GET /products/_doc/123
```
This is inherently fast (bypasses the search execution context entirely).

### 3.4 Delete Document

```json
DELETE /products/_doc/123
```
Documents aren't immediately erased from disk. They are marked as deleted in a "tombstone" inside the Lucene segment. During background segment merging, deleted docs are finally pruned.

### Phase 3 Review Questions
1. What happens if a developer pushes a document with a new field `discountCode` when `dynamic` is set to `strict`? 
2. Why is deleting a document fast, but doesn't immediately reclaim disk space?

---

## PHASE 4: SEARCH QUERIES (DEEP)

---

### 4.1 Query Types: Terms vs Match

#### `term` (Exact Match)
Never analyzed. Looks directly into the inverted index for the exact token.

```json
POST /products/_search
{
  "query": {
    "term": { "categoryId": "electronics" }
  }
}
```
- **When to use:** IDs, statuses, enumerations, categories.
- **Mistake:** Running a term query against a `text` field.

#### `match` (Analyzed Search)
Passes the query string through the same analyzer used at index time.

```json
POST /products/_search
{
  "query": {
    "match": { 
      "description": "Noise Bluetooth" 
    }
  }
}
```
- *How it works:* "Noise Bluetooth" is analyzed to `["noise", "bluetooth"]`. The query becomes an implicit `OR` (match doc with either token).
- To require both tokens, use `"operator": "and"`.

### 4.2 The `bool` Query (Combining logic)

The backbone of complex searches.

```json
POST /products/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "name": "headphones" } }
      ],
      "filter": [
        { "term": { "categoryId": "electronics" } },
        { "range": { "price": { "lte": 300 } } }
      ],
      "should": [
        { "match": { "description": "wireless" } }
      ]
    }
  }
}
```

#### Must vs. Filter vs. Should

| Clause | Need to Match? | Contributes to Score? | Caching |
|---|---|---|---|
| `must` | Yes | **Yes** | No |
| `filter` | Yes | **No** | **Yes** (Bitset cache) |
| `should` | Optional* | **Yes** | No |
| `must_not`| Cannot match | **No** | **Yes** |

**Production Rule:** Always put exact matches (status, category, price ranges) inside `filter`, never in `must`. Filters bypass BM25 scoring entirely and are heavily cached by OpenSearch in memory (as compact bitsets), making them blazing fast.

### 4.3 Pagination: from/size vs. search_after

#### The `from/size` trap (Deep Pagination)
```json
{ "from": 10000, "size": 10 }
```
- **Why it's bad:** OpenSearch limits `from + size` to 10,000 by default (the `max_result_window`). To get page 1,000, every shard must generate 10,010 hits, send them to the coordinating node, which sorts 50,050 hits (if 5 shards), to return 10. Memory spikes, CPU burns.

#### The `search_after` solution (Cursor-based)
Instead of skipping records, you tell OpenSearch to start *exactly* after the last record of the previous page. You must have a deterministic sort (always include a unique tie-breaker like `_id`).

```json
POST /products/_search
{
  "size": 10,
  "sort": [
    { "price": "asc" },
    { "id": "asc" }
  ],
  "search_after": [299.99, "123"] 
}
```
- **Performance:** `O(size)` memory overhead, irrespective of pagination depth.

### Phase 4 Review Questions
1. Why must a price `range` query be placed inside the `filter` block rather than the `must` block?
2. If two differing products have the same exact `price`, why is adding `id` to the sort crucial for `search_after`?

---

## PHASE 5: ADVANCED SEARCH

---

### 5.1 Autocomplete / Search-As-You-Type

Autocomplete needs sub-10ms latency (triggers per keystroke). Full-text BM25 queries are too slow.

#### Strategy 1: `search_as_you_type` field (What your service uses)
Generates n-grams at index time.
- Input: "wireless mouse"
- Tokens: ["w", "wi", "wir", "wire", "wireless", "wireless m", "wireless mo"...]
- Search: Run a standard `multi_match`. It matches the exact prefix token instantly. Excellent balance of flexibility and speed.

#### Strategy 2: `completion` suggester
Uses an in-memory FST (Finite State Transducer). Lightning fast, but strict prefix matching only. Does not support middle-of-word matching well.

### 5.2 Fuzzy Search (Typo Tolerance)

```json
{
  "match": {
    "name": {
      "query": "heqdphones",
      "fuzziness": "AUTO"
    }
  }
}
```
- `AUTO`: 0 typos for 1-2 char words, 1 typo for 3-5 char words, 2 typos for 6+ chars.
- **Cost:** High CPU overhead. OpenSearch expands "heqdphones" to all possible valid terms in the inverted index within an edit distance of 2 (Levenshtein distance), generating a massive logical `OR` query.

### 5.3 Aggregations (Faceted Search)

Aggregations run on the result of the query constraint.

```json
POST /products/_search
{
  "query": { "match": { "name": "headphones" } },
  "aggs": {
    "categories": {
      "terms": { "field": "categoryId", "size": 10 }
    },
    "average_price": {
      "avg": { "field": "price" }
    }
  },
  "size": 0 // Don't return documents, only the facet counts!
}
```
- **Under the hood:** OpenSearch uses "Doc Values" (a columnar storage format on disk) to calculate aggregations, bypassing the inverted index entirely.

### Phase 5 Review Questions
1. Why is `fuzziness: AUTO` used instead of `fuzziness: 2` universally?
2. Why do aggregations operate on "Doc Values" rather than the Inverted Index?

---

## PHASE 6: NODE.JS INTEGRATION

---

Using the official `@opensearch-project/opensearch` client, wrap the complexity in a clean repository/adapter layer in NestJS (CQRS).

### Infrastructure Adapter Implementation

```typescript
import { Client } from '@opensearch-project/opensearch';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenSearchQueryAdapter implements ISearchQueryPort {
  constructor(private readonly client: Client) {}

  async searchProducts(query: SearchQuery): Promise<SearchResult> {
    const { body } = await this.client.search({
      index: 'products',
      body: this.buildEsQuery(query)
    });

    const hits = body.hits.hits;
    const documents = hits.map(hit => this.mapToEntity(hit._source));
    const lastHit = hits[hits.length - 1];

    return {
      documents,
      total: body.hits.total.value,
      cursor: lastHit?.sort ? JSON.stringify(lastHit.sort) : null
    };
  }

  private buildEsQuery(query: SearchQuery) {
    const filter = [];
    if (query.categoryId) {
      filter.push({ term: { categoryId: query.categoryId } });
    }

    return {
      query: {
        bool: {
          must: query.keyword ? [{ multi_match: { query: query.keyword, fields: ['name', 'description'] } }] : [],
          filter: filter
        }
      },
      sort: [{ price: 'asc' }, { id: 'asc' }],
      size: query.limit,
      search_after: query.cursor ? JSON.parse(query.cursor) : undefined
    };
  }
}
```

### Clean Architecture Boundaries

1. **Domain (`domain/ports/search-query.port.ts`)**: Defines `search(query: SearchQuery): Promise<SearchResult>`. No ES details leak here.
2. **Infrastructure (`infrastructure/opensearch/opensearch-query.adapter.ts`)**: Implements the port. Transforms domain `SearchQuery` into ES JSON syntax.
3. **Application (`application/handlers/search-products.handler.ts`)**: Invokes the port. Handles caching logic around it.

---

## PHASE 7: BUILD SEARCH-SERVICE (MICROSERVICE)

---

### Folder Structure (DDD)

```text
apps/search-service/src/
├── application/
│   ├── commands/ (IndexProduct, RemoveProduct)
│   ├── queries/ (SearchProducts, GetSuggestions)
│   └── handlers/ (IndexProductHandler, SearchProductsHandler)
├── domain/
│   ├── entities/ (SearchDocument, SearchResult)
│   ├── value-objects/ (SearchQuery, Filters)
│   └── ports/ (ISearchIndexPort, ISearchQueryPort)
├── infrastructure/
│   ├── opensearch/ (Adapters, Mappings, IndexManagement)
│   ├── redis/ (CacheAdapter)
│   ├── kafka/ (ProductEventConsumer)
│   └── metrics/ (Prometheus hooks)
└── interfaces/
    ├── controllers/ (SearchController)
    ├── dto/ (SearchRequestDto)
    └── guards/ (Throttler, Auth)
```

### Controller Layer

```typescript
@Controller('search')
export class SearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @UseGuards(ThrottlerGuard) // CRITICAL: Stop scrapers!
  async search(@Query() dto: SearchRequestDto): Promise<SearchResponseDto> {
    const query = new SearchProductsQuery(dto);
    const result = await this.queryBus.execute(query);
    return SearchResponseDto.fromDomain(result);
  }
}
```

---

## PHASE 8: EVENT-DRIVEN INTEGRATION

---

### Keeping Search in Sync with Database

The search service is an **event consumer**, participating in an Eventually Consistent CQRS pattern using the **Outbox Pattern**.

1. **Product API:** Updates Postgres DB and writes event to `outbox` table in a single local transaction.
2. **Outbox Relay:** Worker polls outbox table, pushes `product.updated` to Kafka `product.events` topic.
3. **Search Consumer:** Listens to Kafka topic, issues `IndexProductCommand`.

### Handling Concurrency and Ordering

If `product-service` fires `UserUpdatedPrice(10)` then `UserUpdatedPrice(20)` for the same product, Kafka guarantees ordering *only if both events have the same partition key* (the `productId`). 

If ordering is violated (late event arrival), we use **External Versioning** in OpenSearch:

```typescript
await this.client.index({
  index: 'products',
  id: event.productId,
  body: event.payload,
  version: event.timestamp,     // Millisecond timestamp of event creation
  version_type: 'external'      // OpenSearch will reject the write if current version > event.timestamp
});
```

### Handling Failures & Dead Letter Queue (DLQ)

If OpenSearch is down during Kafka consumption:
1. Consumer retries N times (currently in-memory in `search-service`).
2. If retries exhausted, send the raw event payload to a Kafka topic `product.events.dlq`.
3. An alert fires. Once OpenSearch recovers, an admin script replays the DLQ topic.

---

## PHASE 9: PERFORMANCE & SCALING

---

### 9.1 Scaling OpenSearch

- **Read limits:** CPU bound (BM25 math). Add Replicas to horizontally scale read throughput.
- **Write limits:** Disk I/O bound (segment merging). Add Shards/Data Nodes to horizontally scale indexing throughput.

### 9.2 The "Thundering Herd" Cache Pitfall

Your code uses Redis to cache complete search results for 60 seconds.

**The Anti-Pattern (Current Codebase Risk):**
Calling `await redis.keys('search:*')` and deleting them all inside the `IndexProductHandler` whenever a single product is updated. If a bulk price update hits 100 products, your cache is wiped 100 times. Result: Every single shopper query hits OpenSearch simultaneously. 

**The Fix:**
- **Option 1:** Granular invalidation. Cache keys by `productId` or specific query tags. Very difficult.
- **Option 2:** Pure TTL. Set search TTL to 60 seconds, and **never explicitly invalidate**. If a price update is 60 seconds stale from the search bar to the product detail page, business usually accepts this "eventually consistent" reality.

---

## PHASE 10: PRODUCTION BEST PRACTICES

---

### 10.1 Zero Downtime Re-indexing (The Alias Pattern)

When you need to change a field mapping (e.g., changing a `text` field to a `keyword` field), you **cannot alter existing mappings in OpenSearch**. You must completely rebuild the index.

1. Create `products_v2` with the new mappings.
2. Trigger an async worker to `_reindex` data from `products_v1` to `products_v2`, OR replay all data from the primary `product-service` Postgres database.
3. Call `POST /_aliases` to atomically point the alias `products` from `products_v1` to `products_v2`.
4. Delete `products_v1`.

Your `IndexManagementService` implements this swap properly!

### 10.2 Security

- **Do NOT expose OpenSearch `9200` to the internet.** It should sit in a private subnet, accessible only by your `search-service` Node.js backend.
- Protect your reindex endpoint (`POST /search/reindex`). If a malicious actor hits this, they wipe the live search index. Your `search-service` relies on a `ServiceAuthGuard` — ensure it actively validates tokens, not just checks for presence!

---

## PHASE 11: REAL-WORLD USE CASE

---

### Implementing E-commerce "Faceted Filtering"

When you search Amazon for "laptop", you see filters on the left: Brand, Price, RAM. You only see filters that *apply to the current search results*.

**How to implement:**
1. Send the base query (`match` on "laptop").
2. Include Aggregations for the filter fields:
```json
"aggs": {
  "brands": { "terms": { "field": "attributes.brand.keyword" } },
  "price_ranges": {
    "range": {
      "field": "price",
      "ranges": [{ "to": 500 }, { "from": 500, "to": 1000 }, { "from": 1000 }]
    }
  }
}
```
3. Return the `hits` to render the products, and return the `aggregations` to render the UI checkboxes dynamically!

---

## PHASE 12: COMMON PITFALLS

---

1. **Mapping Explosions:** Using dynamic mapping where arbitrary JSON keys are indexed. OpenSearch limits an index to 1,000 fields. Once exceeded, the index locks. Use `dynamic: strict`.
2. **The "Too Large" Shard:** A shard over 50GB takes painfully long to recover during node failures. 
3. **The "Too Many Small Shards" Issue:** A cluster with 500 indices, each with 5 shards (2,500 total shards), where each shard holds 1MB of data. Heap memory crashes. Aim for 30GB-50GB per shard.
4. **Synchronous Kafka Commits:** Waiting for `client.index()` to respond before committing the Kafka offset. This is correct for correctness, but slows down ingestion. For high throughput, use `BulkIndexResult` and batch 1000 documents per `bulk()` request.

---

## PHASE 13: INTERVIEW / SYSTEM DESIGN THINKING

---

**Q: How would you build a global product search for an e-commerce platform?**

1. **Define the Scope:** Read-heavy, requires text relevance, requires sub-100ms latency. Consistency can be eventual.
2. **Data Layer Select:** OpenSearch chosen over Postgres due to inverted indices, BM25 scoring, and distributed nature.
3. **Ingestion Pipeline:** Change Data Capture (Debezium) or Outbox Pattern to push Postgres mutations to Kafka. A Go/Node worker consumes Kafka, transforms to document shape, and bulk-inserts to OpenSearch.
4. **Serving Layer:** Node.js/NestJS stateless tier handling HTTP requests. Places a Redis layer in front of OpenSearch matching the AST-hash of the query string.
5. **Scale:** Handle deep pagination via `search_after`. Distribute OpenSearch across 3 AZs. Use index aliases for smooth schema migrations.

---

## PHASE 14: PRACTICE TASKS

---

### Beginner
1. Spin up the provided `docker-compose.yml`. Use Kibana Dev Tools to manually create a `books` index with `strict` mapping.
2. Insert 3 documents via the `PUT /_doc/:id` API, and run a `match` query.

### Intermediate
1. **Refactor Invalidation:** Go into `apps/search-service/src/application/handlers/index-product.handler.ts` and remove the `invalidateAll()` call. Let the Redis TTL handle the expiration.
2. **Implement DLQ:** In the Kafka consumer, replace the in-memory `retryCountMap` with publishing the failed message to a `product.events.dlq` Kafka topic, then committing the offset.

### Advanced
1. Implement the **External Versioning** mechanism in the OpenSearch `opensearch-index.adapter.ts`. Ensure the producer (e.g., `product-service`) attaches a high-precision timestamp to the Kafka event, and pass that to the OpenSearch `version` parameter.
2. Write a script to trigger the `POST /search/reindex` endpoint, but modify the handler to actively iterate through the primary database and `BULK` index documents into the new alias before swapping.
