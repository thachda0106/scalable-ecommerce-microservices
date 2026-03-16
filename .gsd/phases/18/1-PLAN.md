---
phase: 18
plan: 1
wave: 1
---

# Plan 18.1: Search Domain Layer — Entities, Value Objects, Ports & Errors

## Objective
Create the search service domain layer following DDD with zero `@nestjs` imports.
Unlike write-heavy services, the search service is a **read-side** projection.
The domain models encapsulate search semantics (queries, filters, documents, results) rather than complex state machines.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md (Phase 18 description)
- .gsd/phases/18/RESEARCH.md (search engine decisions)
- apps/notification-service/src/domain/ (established 4-layer pattern)
- apps/order-service/src/domain/ (established value object + port pattern)

## Tasks

<task type="auto">
  <name>Create Search Value Objects and Entities</name>
  <files>
    apps/search-service/src/domain/value-objects/search-query.vo.ts
    apps/search-service/src/domain/value-objects/search-filter.vo.ts
    apps/search-service/src/domain/value-objects/search-sort.vo.ts
    apps/search-service/src/domain/value-objects/pagination.vo.ts
    apps/search-service/src/domain/value-objects/index.ts
    apps/search-service/src/domain/entities/search-document.entity.ts
    apps/search-service/src/domain/entities/search-result.entity.ts
    apps/search-service/src/domain/entities/index.ts
  </files>
  <action>
    **SearchQuery** value object (immutable):
    - Properties: query (string), filters (SearchFilter[]), sort (SearchSort | null), pagination (Pagination)
    - Validation: query must be non-empty string when provided
    - Static factory: `SearchQuery.create({ query, filters?, sort?, pagination? })`

    **SearchFilter** value object:
    - Properties: field (string), operator ('eq' | 'in' | 'range' | 'gte' | 'lte'), value (string | string[] | { min?: number, max?: number })
    - Static factories: `SearchFilter.eq(field, value)`, `SearchFilter.in(field, values)`, `SearchFilter.range(field, min, max)`

    **SearchSort** value object:
    - Properties: field (string), order ('asc' | 'desc')
    - Static factory: `SearchSort.create(field, order)`

    **Pagination** value object:
    - Properties: page (number, default 1), limit (number, default 20, max 100), cursor (string | null for search_after support)
    - Computed: `offset(): number` → (page - 1) * limit
    - Static factory: `Pagination.create({ page?, limit?, cursor? })`

    **SearchDocument** entity (read model):
    - Properties: id (string), name (string), description (string), price (number), status (string), categoryId (string | null), attributes (Record<string, unknown>), indexedAt (Date)
    - Static factory: `SearchDocument.fromProductEvent(event)` — maps product event payload to search document

    **SearchResult** entity:
    - Properties: documents (SearchDocument[]), total (number), page (number), limit (number), cursor (string | null), took (number, search time in ms)
    - Computed: `totalPages(): number`, `hasNextPage(): boolean`
    - Static factory: `SearchResult.create({ documents, total, page, limit, cursor?, took })`

    NO @nestjs imports. Barrel exports from index.ts files.
  </action>
  <verify>grep -r "@nestjs" apps/search-service/src/domain/ | wc -l → 0</verify>
  <done>6 value objects and 2 entities created with validation, immutability. Search semantics encapsulated in domain layer.</done>
</task>

<task type="auto">
  <name>Create Domain Ports, Events, and Errors</name>
  <files>
    apps/search-service/src/domain/ports/search-index.port.ts
    apps/search-service/src/domain/ports/search-query.port.ts
    apps/search-service/src/domain/ports/search-cache.port.ts
    apps/search-service/src/domain/ports/index.ts
    apps/search-service/src/domain/events/document-indexed.event.ts
    apps/search-service/src/domain/events/document-removed.event.ts
    apps/search-service/src/domain/events/index-rebuilt.event.ts
    apps/search-service/src/domain/events/base-domain.event.ts
    apps/search-service/src/domain/events/index.ts
    apps/search-service/src/domain/errors/search-exception.ts
    apps/search-service/src/domain/errors/invalid-search-query.error.ts
    apps/search-service/src/domain/errors/index-not-found.error.ts
    apps/search-service/src/domain/errors/index.ts
  </files>
  <action>
    **Port interfaces** using Symbol-based injection tokens:

    **ISearchIndexPort** (SEARCH_INDEX_PORT Symbol):
    - `indexDocument(doc: SearchDocument): Promise<void>`
    - `indexDocumentsBulk(docs: SearchDocument[]): Promise<{ indexed: number; failed: number }>`
    - `removeDocument(id: string): Promise<void>`
    - `documentExists(id: string): Promise<boolean>`

    **ISearchQueryPort** (SEARCH_QUERY_PORT Symbol):
    - `search(query: SearchQuery): Promise<SearchResult>`
    - `suggest(prefix: string, limit?: number): Promise<string[]>`
    - `findById(id: string): Promise<SearchDocument | null>`

    **ISearchCachePort** (SEARCH_CACHE_PORT Symbol):
    - `get<T>(key: string): Promise<T | null>`
    - `set<T>(key: string, value: T, ttlSeconds: number): Promise<void>`
    - `delete(key: string): Promise<void>`
    - `generateKey(query: SearchQuery): string`

    **Domain events** (extend BaseDomainEvent):
    - BaseDomainEvent: eventId (UUID), occurredOn (Date), eventType (string)
    - DocumentIndexedEvent: documentId, eventType = 'document.indexed'
    - DocumentRemovedEvent: documentId, eventType = 'document.removed'
    - IndexRebuiltEvent: totalDocuments, durationMs, eventType = 'index.rebuilt'

    **Domain errors** (extend Error):
    - SearchException (base)
    - InvalidSearchQueryError — invalid query parameters
    - IndexNotFoundError — index does not exist

    Barrel exports from index.ts files.
    NO @nestjs imports anywhere in domain/.
  </action>
  <verify>grep -r "@nestjs" apps/search-service/src/domain/ | wc -l → 0</verify>
  <done>3 port interfaces with Symbol tokens, 3 domain events, 3 domain errors created. All framework-independent.</done>
</task>

## Success Criteria
- [ ] 6 value objects (SearchQuery, SearchFilter, SearchSort, Pagination, SearchDocument, SearchResult — last two as entities)
- [ ] 3 port interfaces (ISearchIndexPort, ISearchQueryPort, ISearchCachePort) with Symbol tokens
- [ ] 3 domain events (DocumentIndexed, DocumentRemoved, IndexRebuilt)
- [ ] 3 domain error types
- [ ] Zero `@nestjs` imports in src/domain/
- [ ] `npx tsc --noEmit` passes
