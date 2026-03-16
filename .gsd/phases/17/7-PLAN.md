---
phase: 17
plan: 7
wave: 4
---

# Plan 17.7: Interface Layer — Controller, DTOs, Module Wiring & Cleanup

## Objective
Create the thin ProductController that delegates to handlers, DTOs with class-validator,
the domain exception filter, the ProductModule wiring, and update AppModule.
Remove old flat-structure files (products/, outbox/ directories, app.controller, app.service).

## Context
- .gsd/phases/17/RESEARCH.md
- apps/product-service/src/ (all new layers from Plans 17.1-17.6)
- apps/order-service/src/interfaces/ (established pattern — controllers, dto, filters, module)
- apps/order-service/src/interfaces/order.module.ts (module wiring pattern — MUST follow)
- apps/order-service/src/interfaces/dto/order.dto.ts (DTO pattern)
- apps/order-service/src/interfaces/filters/domain-exception.filter.ts (filter pattern)
- apps/order-service/src/app.module.ts (AppModule pattern)

## Tasks

<task type="auto">
  <name>Create DTOs and Domain Exception Filter</name>
  <files>
    apps/product-service/src/interfaces/dto/create-product.dto.ts
    apps/product-service/src/interfaces/dto/update-product.dto.ts
    apps/product-service/src/interfaces/dto/get-products-query.dto.ts
    apps/product-service/src/interfaces/dto/update-product-status.dto.ts
    apps/product-service/src/interfaces/dto/index.ts
    apps/product-service/src/interfaces/filters/domain-exception.filter.ts
    apps/product-service/src/interfaces/filters/index.ts
  </files>
  <action>
    **CreateProductDto** (class-validator decorators):
    - @IsString() @IsNotEmpty() name: string
    - @IsString() @IsNotEmpty() description: string
    - @IsNumber() @Min(0.01) price: number
    - @IsString() @IsOptional() currency?: string (default 'USD')
    - @IsString() @IsNotEmpty() categoryId: string

    **UpdateProductDto** (all optional):
    - @IsString() @IsOptional() name?: string
    - @IsString() @IsOptional() description?: string
    - @IsNumber() @Min(0.01) @IsOptional() price?: number
    - @IsString() @IsOptional() currency?: string
    - @IsString() @IsOptional() categoryId?: string

    **GetProductsQueryDto** (query params, all optional):
    - @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
    - @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number
    - @IsOptional() @IsString() sortBy?: string
    - @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder?: 'ASC' | 'DESC'
    - @IsOptional() @IsString() status?: string
    - @IsOptional() @IsString() categoryId?: string
    - @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number
    - @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number
    - @IsOptional() @IsString() search?: string

    **UpdateProductStatusDto:**
    - @IsIn(['activate', 'deactivate', 'markOutOfStock', 'archive', 'restock']) action: string

    **DomainExceptionFilter** — follow same pattern as order-service:
    - @Catch() ExceptionFilter that catches DomainException subtypes
    - Maps to HTTP status codes: ProductNotFoundError → 404, InvalidProductStatusTransitionError → 400, InvalidProductOperationError → 400
    - Returns JSON error response: `{ statusCode, error, message }`

    Barrel exports.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>4 DTOs with class-validator decorators and DomainExceptionFilter created. All inputs validated at interface boundary.</done>
</task>

<task type="auto">
  <name>Create ProductController and HealthController</name>
  <files>
    apps/product-service/src/interfaces/controllers/product.controller.ts
    apps/product-service/src/interfaces/controllers/health.controller.ts
    apps/product-service/src/interfaces/controllers/index.ts
  </files>
  <action>
    **ProductController** — thin controller delegating to handlers:
    - @Controller('products')
    - @UseFilters(DomainExceptionFilter)
    - Constructor inject all 6 handlers directly

    Endpoints:
    - @Post() create(@Body() dto: CreateProductDto) → CreateProductHandler.execute(new CreateProductCommand(...))
    - @Get() findAll(@Query() dto: GetProductsQueryDto) → GetProductsHandler.execute(new GetProductsQuery(...))
    - @Get(':id') findOne(@Param('id') id: string) → GetProductByIdHandler.execute(new GetProductByIdQuery(id))
    - @Patch(':id') update(@Param('id') id, @Body() dto: UpdateProductDto) → UpdateProductHandler.execute(new UpdateProductCommand(...))
    - @Patch(':id/status') updateStatus(@Param('id') id, @Body() dto: UpdateProductStatusDto) → UpdateProductStatusHandler.execute(...)
    - @Delete(':id') remove(@Param('id') id) → DeleteProductHandler.execute(new DeleteProductCommand(id))

    Controller does NO business logic — pure delegation.

    **HealthController:**
    - @Controller('health')
    - @Get() health() → { status: 'ok', service: 'product-service', timestamp: new Date().toISOString() }

    Barrel export.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>Thin ProductController with 6 endpoints delegating to handlers. HealthController with health check endpoint. Controller has zero business logic.</done>
</task>

<task type="auto">
  <name>Create ProductModule Wiring and Update AppModule</name>
  <files>
    apps/product-service/src/interfaces/product.module.ts
    apps/product-service/src/app.module.ts
  </files>
  <action>
    **ProductModule** — follow exact pattern from apps/order-service/src/interfaces/order.module.ts:
    - imports: [TypeOrmModule.forFeature([ProductOrmEntity, OutboxEventOrmEntity]), ScheduleModule.forRoot()]
    - controllers: [ProductController, HealthController, MetricsController]
    - providers: bind ALL ports to implementations via { provide: SYMBOL, useClass: Implementation }:
      - PRODUCT_REPOSITORY → TypeOrmProductRepository
      - EVENT_PUBLISHER → KafkaEventPublisher
      - PRODUCT_CACHE → ProductCacheRepository
    - Register: KafkaClientFactory, all 6 handlers, OutboxRelayService, ProductMetricsService
    - Register Redis client as custom provider: { provide: 'REDIS_CLIENT', useFactory: () => new Redis({ host, port, lazyConnect: true }) }

    **AppModule** — update to replace old modules:
    - Remove: ProductsModule, OutboxModule, AppController, AppService imports
    - Add: ProductModule
    - Keep: getLoggerModule(), TypeOrmModule.forRoot() (update entities to [ProductOrmEntity, OutboxEventOrmEntity])
    - Add: @nestjs/config ConfigModule.forRoot() at top

    **Cleanup** — DELETE old files (list them all):
    - apps/product-service/src/products/ (entire directory)
    - apps/product-service/src/outbox/ (entire directory)
    - apps/product-service/src/app.controller.ts
    - apps/product-service/src/app.controller.spec.ts
    - apps/product-service/src/app.service.ts
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>ProductModule wires all layers via DI. AppModule updated with new module and config. Old flat-structure files deleted.</done>
</task>

## Success Criteria
- [ ] 4 DTOs with class-validator decorators
- [ ] DomainExceptionFilter maps domain errors to HTTP status codes
- [ ] ProductController is thin — 6 endpoints, zero business logic
- [ ] ProductModule wires all ports to implementations via Symbol tokens
- [ ] AppModule imports ProductModule (not old ProductsModule/OutboxModule)
- [ ] Old files (products/, outbox/, app.controller, app.service) deleted
- [ ] Redis client registered as 'REDIS_CLIENT' provider
- [ ] `npx tsc --noEmit` passes
