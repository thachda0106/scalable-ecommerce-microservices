---
phase: 17
plan: 2
wave: 1
---

# Plan 17.2: Application Layer — Commands, Queries & Ports

## Objective
Define the CQRS command/query objects and application port interfaces.
These are plain data structures (commands/queries) and contracts (ports) that the handlers will use.
No business logic here — just declarations and interfaces.

## Context
- .gsd/SPEC.md
- .gsd/phases/17/RESEARCH.md
- apps/product-service/src/domain/ (from Plan 17.1)
- apps/order-service/src/application/commands/ (established pattern)
- apps/order-service/src/application/queries/ (established pattern)
- apps/order-service/src/application/ports/ (established pattern)

## Tasks

<task type="auto">
  <name>Create CQRS Command and Query Objects</name>
  <files>
    apps/product-service/src/application/commands/create-product.command.ts
    apps/product-service/src/application/commands/update-product.command.ts
    apps/product-service/src/application/commands/delete-product.command.ts
    apps/product-service/src/application/commands/update-product-status.command.ts
    apps/product-service/src/application/commands/index.ts
    apps/product-service/src/application/queries/get-product-by-id.query.ts
    apps/product-service/src/application/queries/get-products.query.ts
    apps/product-service/src/application/queries/index.ts
  </files>
  <action>
    **Commands** — plain data classes (no decorators):

    **CreateProductCommand:**
    - name: string, description: string, price: number, currency: string, categoryId: string

    **UpdateProductCommand:**
    - productId: string, name?: string, description?: string, price?: number, currency?: string, categoryId?: string

    **DeleteProductCommand:**
    - productId: string

    **UpdateProductStatusCommand:**
    - productId: string, action: 'activate' | 'deactivate' | 'markOutOfStock' | 'archive' | 'restock'

    **Queries** — plain data classes:

    **GetProductByIdQuery:**
    - productId: string

    **GetProductsQuery:**
    - page?: number, limit?: number, sortBy?: string, sortOrder?: 'ASC' | 'DESC', status?: string, categoryId?: string, minPrice?: number, maxPrice?: number, search?: string

    Barrel exports from index.ts files.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 command classes and 2 query classes created. All are plain data objects with no framework dependencies.</done>
</task>

<task type="auto">
  <name>Create Application Port Interfaces</name>
  <files>
    apps/product-service/src/application/ports/event-publisher.port.ts
    apps/product-service/src/application/ports/product-cache.port.ts
    apps/product-service/src/application/ports/index.ts
  </files>
  <action>
    **IEventPublisher** interface (same pattern as order-service):
    - `publish(event: BaseDomainEvent): Promise<void>`
    - `publishAll(events: BaseDomainEvent[]): Promise<void>`
    - Injection token: `EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER')`

    **IProductCache** interface (same pattern as cart-service's ICartCache):
    - `getById(productId: string): Promise<Product | null>` — get cached product
    - `setById(productId: string, product: Product): Promise<void>` — cache product with TTL
    - `invalidateById(productId: string): Promise<void>` — invalidate on writes
    - Injection token: `PRODUCT_CACHE = Symbol('PRODUCT_CACHE')`

    Barrel export from index.ts.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>2 application port interfaces created — event publisher and product cache. Clean boundary between application and infrastructure layers.</done>
</task>

## Success Criteria
- [ ] 4 command classes (CreateProduct, UpdateProduct, DeleteProduct, UpdateProductStatus)
- [ ] 2 query classes (GetProductById, GetProducts)
- [ ] IEventPublisher port for domain event publishing
- [ ] IProductCache port for Redis cache-aside pattern
- [ ] All use Symbol injection tokens
- [ ] `npx tsc --noEmit` passes
