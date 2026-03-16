---
phase: 18
plan: 3
wave: 2
---

# Plan 18.3: Infrastructure — OpenSearch Adapter (Index + Query)

## Objective
Implement the OpenSearch infrastructure adapters that fulfill the domain port interfaces.
Replace the current bare `OpenSearchService` with proper port/adapter pattern:
- `OpenSearchIndexAdapter` implements `ISearchIndexPort` (write path)
- `OpenSearchQueryAdapter` implements `ISearchQueryPort` (read path)
- `IndexManagementService` handles index lifecycle (create, mappings, alias, reindex)

## Context
- .gsd/phases/18/RESEARCH.md (OpenSearch decision, mapping design, alias pattern)
- apps/search-service/src/opensearch/opensearch.service.ts (current — will be replaced)
- apps/search-service/src/domain/ports/ (port interfaces from Plan 18.1)

## Tasks

<task type="auto">
  <name>Create OpenSearch Index Adapter and Index Management</name>
  <files>
    apps/search-service/src/infrastructure/opensearch/opensearch-client.provider.ts
    apps/search-service/src/infrastructure/opensearch/opensearch-index.adapter.ts
    apps/search-service/src/infrastructure/opensearch/index-management.service.ts
    apps/search-service/src/infrastructure/opensearch/index-mappings.ts
    apps/search-service/src/infrastructure/opensearch/opensearch.module.ts
  </files>
  <action>
    **OpenSearch Client Provider** (replaces current OpenSearchService constructor):
    - Use @nestjs/config ConfigService for all config (OPENSEARCH_URL, OPENSEARCH_USERNAME, OPENSEARCH_PASSWORD)
    - Export a provider factory that creates and returns the `Client` instance
    - Provider token: `OPENSEARCH_CLIENT`

    **Index Mappings** (index-mappings.ts):
    - Export the product index mapping configuration:
      ```
      id: { type: 'keyword' }
      name: { type: 'search_as_you_type', max_shingle_size: 3 }
      name_suggest: { type: 'completion' }
      description: { type: 'text', analyzer: 'standard' }
      price: { type: 'float' }
      status: { type: 'keyword' }
      categoryId: { type: 'keyword' }
      attributes: { type: 'object', enabled: true }
      indexedAt: { type: 'date' }
      ```
    - Export index settings (number_of_shards: 1, number_of_replicas: 0 for dev)

    **OpenSearchIndexAdapter** (implements ISearchIndexPort):
    - Inject `OPENSEARCH_CLIENT`
    - `indexDocument(doc)` — uses `client.index()` with `refresh: false`
    - `indexDocumentsBulk(docs)` — uses `client.bulk()` API, batches of 1000, returns success/failure count
    - `removeDocument(id)` — uses `client.delete()`, handles 404 gracefully
    - `documentExists(id)` — uses `client.exists()`
    - All operations target the alias name `products` (not versioned index name)

    **IndexManagementService**:
    - Inject `OPENSEARCH_CLIENT`
    - `ensureIndex()` — create index with mappings if not exists (called on module init)
    - `createVersionedIndex(version)` — creates `products_v{version}` with mappings
    - `swapAlias(newIndex, oldIndex)` — atomically swap `products` alias
    - `deleteIndex(name)` — delete an index
    - `getIndexHealth()` — return index stats (doc count, size)

    **OpenSearch Module**:
    - Provides: OPENSEARCH_CLIENT, SEARCH_INDEX_PORT → OpenSearchIndexAdapter, IndexManagementService
    - Exports: SEARCH_INDEX_PORT, IndexManagementService
    - OnModuleInit: calls IndexManagementService.ensureIndex()

    Delete the old `src/opensearch/` directory files after new ones are created.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>OpenSearch index adapter implements ISearchIndexPort with bulk support. Index management service handles alias-based lifecycle. Proper client provider using ConfigService.</done>
</task>

<task type="auto">
  <name>Create OpenSearch Query Adapter</name>
  <files>
    apps/search-service/src/infrastructure/opensearch/opensearch-query.adapter.ts
    apps/search-service/src/infrastructure/opensearch/query-builder.ts
  </files>
  <action>
    **QueryBuilder** (pure utility, no DI):
    - `buildSearchBody(query: SearchQuery)` — converts domain SearchQuery into OpenSearch query DSL:
      - Full-text: `multi_match` on `name`, `name._2gram`, `name._3gram`, `description` with `best_fields` type
      - Filters: `bool.filter` array — `term` for eq, `terms` for in, `range` for range/gte/lte
      - Sort: maps SearchSort to OpenSearch sort array, always append `_id` as tiebreaker for search_after
      - Pagination: `from/size` when cursor is null, `search_after` when cursor is provided
    - `buildSuggestBody(prefix: string, limit: number)` — uses Completion Suggester on `name_suggest` field
    - Returns plain objects (no OpenSearch client dependency)

    **OpenSearchQueryAdapter** (implements ISearchQueryPort):
    - Inject `OPENSEARCH_CLIENT`
    - `search(query)`:
      1. Build query body via QueryBuilder
      2. Execute `client.search({ index: 'products', body })`
      3. Map response to SearchResult entity:
         - Extract hits → SearchDocument[]
         - Extract total from `hits.total.value`
         - Extract `sort` value from last hit as cursor for search_after
         - Extract `took` from response
    - `suggest(prefix, limit)`:
      1. Build suggest body via QueryBuilder
      2. Execute `client.search({ index: 'products', body })`
      3. Extract suggestion strings from response
    - `findById(id)`:
      1. Execute `client.get({ index: 'products', id })`
      2. Map to SearchDocument or return null if 404

    Register in OpenSearch module: SEARCH_QUERY_PORT → OpenSearchQueryAdapter.
    Export SEARCH_QUERY_PORT from OpenSearch module.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>OpenSearch query adapter implements ISearchQueryPort. QueryBuilder converts domain queries to OpenSearch DSL supporting multi_match, filters, sort, search_after pagination, and completion suggestions.</done>
</task>

## Success Criteria
- [ ] OpenSearch client uses ConfigService (no hardcoded env vars)
- [ ] Index mappings include `search_as_you_type` for name and `completion` for suggestions
- [ ] ISearchIndexPort implemented with bulk support and `refresh: false`
- [ ] ISearchQueryPort implemented with full-text search, filters, sort, pagination
- [ ] QueryBuilder produces correct OpenSearch DSL for all query types
- [ ] Index management supports alias creation and rotation
- [ ] Old `src/opensearch/` files removed
- [ ] `npx tsc --noEmit` passes
