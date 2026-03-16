---
phase: 18
plan: 6
wave: 3
---

# Plan 18.6: Tests — Domain Unit Tests, Handler Tests, Query Builder Tests

## Objective
Write comprehensive unit tests for the search service covering:
- Domain layer (value objects, entities)
- Application layer (command/query handlers)
- Infrastructure (query builder)
Ensure `npx tsc --noEmit` and `pnpm test` pass.

## Context
- apps/search-service/src/domain/ (from Plan 18.1)
- apps/search-service/src/application/ (from Plan 18.2)
- apps/search-service/src/infrastructure/opensearch/query-builder.ts (from Plan 18.3)
- apps/notification-service/src/application/handlers/__tests__/ (reference test pattern)
- apps/order-service/src/domain/entities/__tests__/ (reference domain test pattern)

## Tasks

<task type="auto">
  <name>Create Domain Layer Unit Tests</name>
  <files>
    apps/search-service/src/domain/value-objects/__tests__/search-query.vo.spec.ts
    apps/search-service/src/domain/value-objects/__tests__/pagination.vo.spec.ts
    apps/search-service/src/domain/entities/__tests__/search-document.spec.ts
    apps/search-service/src/domain/entities/__tests__/search-result.spec.ts
  </files>
  <action>
    **SearchQuery tests:**
    - Creates with all parameters
    - Creates with defaults (empty filters, null sort, default pagination)
    - Validates non-empty query string when provided
    - Handles empty query (browse mode)

    **Pagination tests:**
    - Creates with defaults (page 1, limit 20)
    - Computes offset correctly (page 3, limit 20 → offset 40)
    - Clamps limit to max 100
    - Handles cursor-based pagination

    **SearchDocument tests:**
    - Creates from product event payload via `fromProductEvent()`
    - Handles missing optional fields (categoryId, attributes)
    - Sets indexedAt to current date

    **SearchResult tests:**
    - Computes totalPages correctly (total 55, limit 20 → 3 pages)
    - hasNextPage returns true when more pages exist
    - hasNextPage returns false on last page
    - Handles empty results (total 0)
  </action>
  <verify>cd apps/search-service && npx jest --testPathPattern="domain" --passWithNoTests 2>&1 | tail -20</verify>
  <done>Domain layer tests cover value objects and entities with edge cases.</done>
</task>

<task type="auto">
  <name>Create Handler and Query Builder Tests</name>
  <files>
    apps/search-service/src/application/handlers/__tests__/index-product.handler.spec.ts
    apps/search-service/src/application/handlers/__tests__/search-products.handler.spec.ts
    apps/search-service/src/infrastructure/opensearch/__tests__/query-builder.spec.ts
  </files>
  <action>
    **IndexProductHandler tests:**
    - Mock SEARCH_INDEX_PORT
    - Dispatching IndexProductCommand calls indexDocument with correct SearchDocument
    - Handles indexing errors gracefully

    **SearchProductsHandler tests:**
    - Mock SEARCH_QUERY_PORT, SEARCH_CACHE_PORT
    - Cache hit: returns cached result without calling search port
    - Cache miss: calls search port, caches result with 60s TTL
    - Handles search errors gracefully

    **QueryBuilder tests:**
    - `buildSearchBody` with query only → produces multi_match
    - `buildSearchBody` with filters → produces bool.filter terms
    - `buildSearchBody` with sort → produces sort array with _id tiebreaker
    - `buildSearchBody` with cursor → produces search_after instead of from/size
    - `buildSearchBody` with range filter → produces range query
    - `buildSuggestBody` → produces completion suggest query

    Use jest mocks. Follow same test structure as notification-service handler tests.
  </action>
  <verify>cd apps/search-service && npx jest --passWithNoTests 2>&1 | tail -20</verify>
  <done>Handler tests verify cache-first pattern and port delegation. Query builder tests verify all OpenSearch DSL generation paths.</done>
</task>

## Success Criteria
- [ ] `pnpm test` passes in search-service (or npx jest passes)
- [ ] `npx tsc --noEmit` shows zero errors
- [ ] Domain tests: SearchQuery, Pagination, SearchDocument, SearchResult
- [ ] Handler tests: IndexProductHandler, SearchProductsHandler with cache behavior
- [ ] QueryBuilder tests: multi_match, filters, sort, search_after, suggest
