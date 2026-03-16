---
phase: 18
plan: 2
wave: 1
---

# Plan 18.2: Search Application Layer — Commands, Queries & Handlers

## Objective
Create the CQRS command/query layer for the search service.
Commands handle the write path (indexing documents), queries handle the read path (searching).
Handlers orchestrate domain objects and port interfaces — no direct infrastructure dependencies.

## Context
- .gsd/SPEC.md
- .gsd/ROADMAP.md (Phase 18 description)
- .gsd/phases/18/RESEARCH.md
- apps/search-service/src/domain/ (created in Plan 18.1)
- apps/notification-service/src/application/ (reference CQRS pattern)
- apps/order-service/src/application/ (reference handler pattern)

## Tasks

<task type="auto">
  <name>Create Commands and Queries</name>
  <files>
    apps/search-service/src/application/commands/index-product.command.ts
    apps/search-service/src/application/commands/remove-product.command.ts
    apps/search-service/src/application/commands/rebuild-index.command.ts
    apps/search-service/src/application/commands/index.ts
    apps/search-service/src/application/queries/search-products.query.ts
    apps/search-service/src/application/queries/get-suggestions.query.ts
    apps/search-service/src/application/queries/get-product-by-id.query.ts
    apps/search-service/src/application/queries/index.ts
  </files>
  <action>
    **Commands** (write path):

    **IndexProductCommand** — payload: { id: string, name: string, description: string, price: number, status: string, categoryId?: string, attributes?: Record<string, unknown> }
    **RemoveProductCommand** — payload: { id: string }
    **RebuildIndexCommand** — payload: { batchSize?: number } (optional, defaults to 1000)

    **Queries** (read path):

    **SearchProductsQuery** — payload: { query?: string, filters?: Array<{ field: string, operator: string, value: unknown }>, sort?: { field: string, order: 'asc' | 'desc' }, page?: number, limit?: number, cursor?: string }
    **GetSuggestionsQuery** — payload: { prefix: string, limit?: number }
    **GetProductByIdQuery** — payload: { id: string }

    Each command/query is a simple class with readonly properties and a constructor.
    Follow the same pattern as notification-service commands/queries.
    Barrel exports from index.ts files.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>3 commands and 3 queries created with type-safe payloads.</done>
</task>

<task type="auto">
  <name>Create Command and Query Handlers</name>
  <files>
    apps/search-service/src/application/handlers/index-product.handler.ts
    apps/search-service/src/application/handlers/remove-product.handler.ts
    apps/search-service/src/application/handlers/rebuild-index.handler.ts
    apps/search-service/src/application/handlers/search-products.handler.ts
    apps/search-service/src/application/handlers/get-suggestions.handler.ts
    apps/search-service/src/application/handlers/get-product-by-id.handler.ts
    apps/search-service/src/application/handlers/index.ts
  </files>
  <action>
    **Command Handlers:**

    **IndexProductHandler** (@CommandHandler(IndexProductCommand)):
    - Inject SEARCH_INDEX_PORT
    - Convert command payload to SearchDocument via `SearchDocument.fromProductEvent()`
    - Call `searchIndexPort.indexDocument(doc)`
    - Log operation

    **RemoveProductHandler** (@CommandHandler(RemoveProductCommand)):
    - Inject SEARCH_INDEX_PORT
    - Call `searchIndexPort.removeDocument(command.id)`
    - Log operation

    **RebuildIndexHandler** (@CommandHandler(RebuildIndexCommand)):
    - This is a placeholder that will be wired to full reindex logic in Wave 3
    - For now, log that rebuild was requested

    **Query Handlers:**

    **SearchProductsHandler** (@QueryHandler(SearchProductsQuery)):
    - Inject SEARCH_QUERY_PORT, SEARCH_CACHE_PORT
    - Build SearchQuery from query params using SearchQuery.create()
    - Check cache first via `cachePort.get(cachePort.generateKey(searchQuery))`
    - If cache miss, call `searchQueryPort.search(searchQuery)`
    - Cache result with 60s TTL
    - Return SearchResult

    **GetSuggestionsHandler** (@QueryHandler(GetSuggestionsQuery)):
    - Inject SEARCH_QUERY_PORT, SEARCH_CACHE_PORT
    - Check cache (300s TTL for suggestions)
    - Call `searchQueryPort.suggest(query.prefix, query.limit)`
    - Cache and return string[]

    **GetProductByIdHandler** (@QueryHandler(GetProductByIdQuery)):
    - Inject SEARCH_QUERY_PORT
    - Call `searchQueryPort.findById(query.id)`
    - Return SearchDocument | null

    Handlers use @nestjs/cqrs decorators (@CommandHandler, @QueryHandler).
    Inject ports via @Inject(SYMBOL) — never inject infrastructure directly.
    Barrel exports from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>3 command handlers and 3 query handlers created. Cache-first pattern on search/suggest. Handlers depend only on port interfaces.</done>
</task>

## Success Criteria
- [ ] 3 commands (IndexProduct, RemoveProduct, RebuildIndex)
- [ ] 3 queries (SearchProducts, GetSuggestions, GetProductById)
- [ ] 6 handlers using port injection (never direct infrastructure)
- [ ] Cache-first pattern on SearchProducts (60s TTL) and GetSuggestions (300s TTL)
- [ ] `npx tsc --noEmit` passes
