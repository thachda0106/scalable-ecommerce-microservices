---
phase: 18
plan: 5
wave: 3
---

# Plan 18.5: Interface Layer — Controller, DTOs, Metrics & Module Wiring

## Objective
Create the search REST API interface layer with proper DTOs, a thin controller that delegates to CommandBus/QueryBus, Prometheus metrics, health checks, and wire everything together in the AppModule.

## Context
- .gsd/phases/18/RESEARCH.md
- apps/search-service/src/app.module.ts (current — will be rewritten)
- apps/search-service/src/app.controller.ts (current — will be replaced)
- apps/notification-service/src/interfaces/ (reference DTO/controller pattern)
- apps/notification-service/src/infrastructure/metrics/ (reference metrics pattern)

## Tasks

<task type="auto">
  <name>Create DTOs and Search Controller</name>
  <files>
    apps/search-service/src/interfaces/dto/search-request.dto.ts
    apps/search-service/src/interfaces/dto/search-response.dto.ts
    apps/search-service/src/interfaces/dto/suggestion-request.dto.ts
    apps/search-service/src/interfaces/dto/reindex-request.dto.ts
    apps/search-service/src/interfaces/dto/index.ts
    apps/search-service/src/interfaces/controllers/search.controller.ts
  </files>
  <action>
    **DTOs** with class-validator decorators:

    **SearchRequestDto**:
    - query?: string (@IsOptional, @IsString)
    - filters?: Array<{ field: string, operator: string, value: unknown }> (@IsOptional, @IsArray)
    - sortField?: string (@IsOptional, @IsString)
    - sortOrder?: 'asc' | 'desc' (@IsOptional, @IsIn(['asc', 'desc']))
    - page?: number (@IsOptional, @IsInt, @Min(1), default 1)
    - limit?: number (@IsOptional, @IsInt, @Min(1), @Max(100), default 20)
    - cursor?: string (@IsOptional, @IsString — for search_after pagination)

    **SearchResponseDto**:
    - data: SearchDocumentDto[] — { id, name, description, price, status, categoryId }
    - total: number
    - page: number
    - limit: number
    - totalPages: number
    - cursor: string | null
    - took: number (ms)

    **SuggestionRequestDto**:
    - prefix: string (@IsString, @MinLength(1), @MaxLength(100))
    - limit?: number (@IsOptional, @IsInt, @Min(1), @Max(20), default 10)

    **ReindexRequestDto**:
    - batchSize?: number (@IsOptional, @IsInt, @Min(100), @Max(10000), default 1000)

    **SearchController** (`/search`):
    - `GET /search` → dispatches SearchProductsQuery, returns SearchResponseDto
    - `GET /search/suggest` → dispatches GetSuggestionsQuery, returns string[]
    - `GET /search/:id` → dispatches GetProductByIdQuery, returns SearchDocumentDto | 404
    - `POST /search/reindex` → dispatches RebuildIndexCommand, returns { message: 'Reindex started' }
    - `GET /health` → returns { status: 'ok', index: indexHealth }
    - Controller is thin — only validates DTOs and delegates to CommandBus/QueryBus
    - Use @nestjs/common decorators: @Controller, @Get, @Post, @Query, @Param, @Body
    - Add ValidationPipe for DTO validation

    Add `class-validator` and `class-transformer` to package.json dependencies.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>5 DTOs with validation decorators and thin SearchController delegating to CQRS bus. Endpoints: search, suggest, get by id, reindex, health.</done>
</task>

<task type="auto">
  <name>Create Metrics Service and Wire AppModule</name>
  <files>
    apps/search-service/src/infrastructure/metrics/search-metrics.service.ts
    apps/search-service/src/app.module.ts
    apps/search-service/src/main.ts
  </files>
  <action>
    **SearchMetricsService** (using prom-client):
    - `search_queries_total` — Counter, labels: { status: 'hit' | 'miss' | 'error' }
    - `search_latency_seconds` — Histogram, labels: { type: 'search' | 'suggest' | 'get' }
    - `index_operations_total` — Counter, labels: { operation: 'index' | 'bulk' | 'delete', status: 'success' | 'failure' }
    - `cache_operations_total` — Counter, labels: { operation: 'get' | 'set', result: 'hit' | 'miss' | 'error' }
    - Methods: `recordSearch(type, durationMs, cacheHit)`, `recordIndex(operation, success)`, `recordCacheOp(operation, result)`
    - Register default Prometheus metrics

    **AppModule** (complete rewrite):
    - Imports: ConfigModule.forRoot({ isGlobal: true }), CqrsModule, getLoggerModule(), OpenSearchModule, KafkaModule, CacheModule
    - Controllers: SearchController
    - Providers: SearchMetricsService, all command/query handlers
    - Remove old AppController, AppService

    **main.ts** update:
    - Add global ValidationPipe with { transform: true, whitelist: true })
    - Keep existing logger setup
    - Use ConfigService for PORT

    Add `@nestjs/cqrs`, `prom-client`, `class-validator`, `class-transformer` to package.json.
    Delete old `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`.
  </action>
  <verify>npx tsc --noEmit --project apps/search-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Prometheus metrics service with 4 metrics. AppModule fully rewired with CQRS, all modules, handlers registered. Old boilerplate removed.</done>
</task>

## Success Criteria
- [ ] SearchController has 5 endpoints (search, suggest, get, reindex, health)
- [ ] Controller delegates only to CommandBus/QueryBus — no direct service injection
- [ ] DTOs use class-validator for input validation
- [ ] Prometheus metrics: search_queries_total, search_latency, index_operations, cache_operations
- [ ] AppModule imports all infrastructure modules and registers all handlers
- [ ] Global ValidationPipe enabled in main.ts
- [ ] Old AppController/AppService removed
- [ ] `npx tsc --noEmit` passes
