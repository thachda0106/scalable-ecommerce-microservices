---
phase: 17
plan: 3
wave: 2
---

# Plan 17.3: Application Handlers — Command & Query Handlers

## Objective
Implement the CQRS handlers that orchestrate domain logic, repository access, cache interactions, and event publishing.
Each handler is an `@Injectable()` class with an `execute()` method, injecting ports via `@Inject(SYMBOL)`.

## Context
- .gsd/SPEC.md
- .gsd/phases/17/RESEARCH.md
- apps/product-service/src/domain/ (from Plan 17.1)
- apps/product-service/src/application/commands/ (from Plan 17.2)
- apps/product-service/src/application/queries/ (from Plan 17.2)
- apps/product-service/src/application/ports/ (from Plan 17.2)
- apps/order-service/src/application/handlers/create-order.handler.ts (established handler pattern)

## Tasks

<task type="auto">
  <name>Create Command Handlers</name>
  <files>
    apps/product-service/src/application/handlers/create-product.handler.ts
    apps/product-service/src/application/handlers/update-product.handler.ts
    apps/product-service/src/application/handlers/delete-product.handler.ts
    apps/product-service/src/application/handlers/update-product-status.handler.ts
  </files>
  <action>
    Follow order-service handler pattern exactly:

    **CreateProductHandler:**
    - Inject: IProductRepository (PRODUCT_REPOSITORY), IEventPublisher (EVENT_PUBLISHER), IProductCache (PRODUCT_CACHE), ProductMetricsService
    - execute(command: CreateProductCommand): Promise<string>
    - Create Product aggregate via Product.create(), save to repo, pull domain events, publishAll, return product id
    - Increment products_created metric

    **UpdateProductHandler:**
    - Inject: IProductRepository, IEventPublisher, IProductCache, ProductMetricsService
    - execute(command: UpdateProductCommand): Promise<void>
    - Find product by id (throw ProductNotFoundError if null), call product.updateDetails(), save, pull & publish events, invalidate cache
    - Increment products_updated metric

    **DeleteProductHandler:**
    - Inject: IProductRepository, IEventPublisher, IProductCache
    - execute(command: DeleteProductCommand): Promise<void>
    - Find product by id (throw ProductNotFoundError if null), delete from repo, create ProductDeletedEvent manually, publish, invalidate cache

    **UpdateProductStatusHandler:**
    - Inject: IProductRepository, IEventPublisher, IProductCache, ProductMetricsService
    - execute(command: UpdateProductStatusCommand): Promise<void>
    - Find product, call the appropriate domain method based on `action` field (activate/deactivate/markOutOfStock/archive/restock), save, pull & publish events, invalidate cache

    All handlers use Logger for structured logging.
    All write handlers invalidate cache after mutation.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 command handlers created. All delegate to domain aggregate for business logic, publish events via IEventPublisher, and invalidate cache on writes.</done>
</task>

<task type="auto">
  <name>Create Query Handlers</name>
  <files>
    apps/product-service/src/application/handlers/get-product-by-id.handler.ts
    apps/product-service/src/application/handlers/get-products.handler.ts
    apps/product-service/src/application/handlers/index.ts
  </files>
  <action>
    **GetProductByIdHandler:**
    - Inject: IProductRepository (PRODUCT_REPOSITORY), IProductCache (PRODUCT_CACHE), ProductMetricsService
    - execute(query: GetProductByIdQuery): Promise<Product>
    - Cache-aside pattern: check cache first → if hit, return; if miss, query repo, populate cache, return
    - Throw ProductNotFoundError if product not found in repo
    - Record cache hit/miss metrics

    **GetProductsHandler:**
    - Inject: IProductRepository (PRODUCT_REPOSITORY), ProductMetricsService
    - execute(query: GetProductsQuery): Promise<PaginatedResult<Product>>
    - Delegate directly to repository.findAll() — NO caching for paginated queries (per RESEARCH.md decision)
    - Apply defaults: page=1, limit=20, sortBy='createdAt', sortOrder='DESC'
    - Record query duration metric

    Barrel export from index.ts including all 6 handlers.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>2 query handlers created. GetProductById uses cache-aside pattern. GetProducts bypasses cache for paginated queries. All metric tracking integrated.</done>
</task>

## Success Criteria
- [ ] 4 command handlers (Create, Update, Delete, UpdateStatus)
- [ ] 2 query handlers (GetById with cache-aside, GetProducts without cache)
- [ ] All handlers inject ports via Symbol tokens
- [ ] Cache invalidated on every write operation
- [ ] Cache-aside pattern: cache check → repo fallback → cache populate
- [ ] Structured logging in all handlers
- [ ] `npx tsc --noEmit` passes
