---
phase: 17
level: 2
researched_at: 2026-03-16
---

# Phase 17 Research — Production-Grade Product Service

## Questions Investigated

1. What is the current state of the product-service and what gaps exist vs. production readiness?
2. What architectural patterns are established by sibling services (order, cart, notification) that must be followed?
3. How should Redis caching be implemented for a read-heavy product catalog at scale?
4. What domain model best represents products with variants, attributes, categories, and status lifecycle?
5. How should pagination, filtering, and sorting be implemented for large catalogs (50M+ products)?
6. What Kafka event topics and schemas should the product-service publish?

## Findings

### 1. Current Product-Service State (Gap Analysis)

The existing product-service has **12 source files** in a flat NestJS structure:

| Component | Current State | Target State |
|-----------|--------------|--------------|
| Architecture | Flat `products/` + `outbox/` modules | 4-layer DDD (domain/application/infrastructure/interfaces) |
| Entity | Single TypeORM `Product` entity (coupled to ORM) | Pure domain `Product` aggregate + separate ORM entity |
| Status | 2 statuses: `ACTIVE`, `INACTIVE` | 4 statuses: `ACTIVE`, `INACTIVE`, `OUT_OF_STOCK`, `ARCHIVED` |
| Service | God-class `ProductsService` (133 LOC, couples business logic, DB access, outbox writing) | CQRS handlers + domain aggregate + repository port |
| Controller | Direct service calls, no DTOs with validation | Thin controller delegating to command/query handlers, class-validator DTOs |
| Caching | None | Redis cache-aside pattern with TTL and write-through invalidation |
| Pagination | None (`findAll()` returns all products) | Cursor/offset pagination with filtering and sorting |
| Events | Outbox pattern exists but tightly coupled | Domain events → `IEventPublisher` port → Outbox infra |
| Tests | Only `app.controller.spec.ts` (NestJS boilerplate) | Domain unit tests, handler tests, caching tests |
| Observability | Basic `@ecommerce/core` logger only | Structured logging + Prometheus metrics + tracing |

**Recommendation:** Full redesign following sibling service conventions. Keep outbox pattern concept but refactor into Clean Architecture.

### 2. Established Architecture Patterns (from order-service, cart-service, notification-service)

**Domain Layer** (zero framework imports):
- Aggregate root with private constructor + `static create()` / `static reconstitute()`
- `BaseDomainEvent` abstract class: `occurredOn: Date`, abstract `eventType: string`
- `pullDomainEvents()` method on aggregates
- Value objects: private `_value`, factory `create()`, `equals()`, `toString()`
- Repository port: `interface` + `Symbol` token (e.g., `ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY')`)
- Domain errors extending base `DomainException`

**Application Layer**:
- Command classes: plain data objects (e.g., `CreateOrderCommand`)
- Query classes: plain data objects (e.g., `GetOrderByIdQuery`)
- Handlers: `@Injectable()` classes with `execute()` method, inject ports via `@Inject(SYMBOL)`
- Application ports: `IEventPublisher` with `publish()` / `publishAll()` + Symbol token

**Infrastructure Layer**:
- `*OrmEntity` classes (TypeORM decorated) — separate from domain entities
- `*Mapper` with `static toDomain(orm)` / `static toPersistence(domain)` methods
- `TypeOrm*Repository` implementing domain port interface
- `KafkaEventPublisher` implementing `IEventPublisher` via Transactional Outbox
- `OutboxRelayService` polling outbox table and publishing to Kafka
- `*MetricsService` using `prom-client` (Counter, Histogram, Gauge with Registry)
- `MetricsController` exposing `/metrics` endpoint

**Interface Layer**:
- Thin controllers delegating to handlers
- DTOs with `class-validator` decorators
- `DomainExceptionFilter` for error handling
- Module file wiring all layers

**Recommendation:** Follow these patterns exactly for consistency. No deviations.

### 3. Redis Caching Strategy for Product Catalog

Study of cart-service `CartCacheRepository`:
- Uses `ioredis` library (already in monorepo dependencies)
- `REDIS_CLIENT` Symbol token for injection
- `ICartCache` port in application layer with `get(key)`, `set(key, value)`, `invalidate(key)`
- TTL-based expiration (`setex()`)
- Graceful degradation — swallows errors, logs warnings, returns null on miss

**Product-specific caching design:**

| Pattern | Strategy |
|---------|----------|
| Read pattern | Cache-aside (look-aside): check cache first → DB fallback → populate cache |
| Write pattern | Write-through invalidation: on any product mutation, delete cached entry |
| Key format | `product:{id}` for individual products |
| TTL | 1 hour (3600s) — products change less frequently than carts |
| Serialization | JSON via `toJSON()` on domain entity |
| Cache misses | Return null, handler falls through to repository (PostgreSQL) |
| Bulk queries | Do NOT cache paginated list queries (too many permutations) — only cache individual product reads |

**Recommendation:** Implement `IProductCache` port with `getById(id)`, `setById(id, product)`, `invalidateById(id)`. Only cache individual product lookups — paginated/filtered queries bypass cache and go to PostgreSQL with proper indexing.

### 4. Domain Model Design

```
Product (Aggregate Root)
├── id: ProductId (UUID value object)
├── name: string
├── description: string
├── price: Money (value object — amountInCents + currency)
├── categoryId: string
├── status: ProductStatus (value object with state machine)
├── createdAt: Date
├── updatedAt: Date
└── domainEvents: BaseDomainEvent[]
```

**ProductStatus state machine:**
```
ACTIVE ←→ INACTIVE
ACTIVE → OUT_OF_STOCK
OUT_OF_STOCK → ACTIVE (restock)
ACTIVE → ARCHIVED
INACTIVE → ARCHIVED
OUT_OF_STOCK → ARCHIVED
ARCHIVED → (terminal, no transitions out)
```

**Decision on ProductVariant, ProductAttribute, ProductCategory:**
These are mentioned in the roadmap but should be kept as lightweight/future-ready:
- `ProductCategory` — referenced by `categoryId` string (not a full entity in this service; categories are a bounded context that can evolve separately)
- `ProductVariant` — deferred to a future phase; adding the interface now would be over-engineering without clear requirements
- `ProductAttribute` — same as variant; keep as optional metadata field (JSON) for now

**Recommendation:** Implement Product aggregate with full status state machine. Use `Money` value object (reuse pattern from order-service). Keep `categoryId` as string reference. Defer variants/attributes to future phases to avoid YAGNI.

### 5. Pagination, Filtering, and Sorting

**Query interface design:**
```typescript
interface PaginatedQuery {
  page?: number;       // 1-based, default 1
  limit?: number;      // default 20, max 100
  sortBy?: string;     // 'name' | 'price' | 'createdAt'
  sortOrder?: 'ASC' | 'DESC';
  status?: ProductStatusEnum;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;     // name ILIKE search
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**Database indexing strategy:**
```sql
CREATE INDEX idx_products_status ON products (status);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_price ON products (price);
CREATE INDEX idx_products_created_at ON products (created_at DESC);
CREATE INDEX idx_products_status_category ON products (status, category_id);  -- composite
CREATE INDEX idx_products_name_search ON products USING gin (name gin_trgm_ops);  -- trigram for ILIKE
```

**Recommendation:** Use offset-based pagination (simpler for API consumers). TypeORM `createQueryBuilder` with dynamic `where`, `orderBy`, `skip`, `take`. Indexing strategy ensures sub-100ms queries even at 50M rows.

### 6. Kafka Event Design

| Event | Topic | Trigger | Payload |
|-------|-------|---------|---------|
| `product.created` | `product.events` | Product created | Full product snapshot |
| `product.updated` | `product.events` | Product fields updated | Full product snapshot |
| `product.deleted` | `product.events` | Product deleted | `{ productId }` |
| `product.stock.updated` | `product.events` | Status changed to/from `OUT_OF_STOCK` | `{ productId, status }` |

**Existing convention:** All events go to a single domain topic (`product.events`), partitioned by `productId`. This matches `order.events`, `payment.events` patterns.

**Recommendation:** Follow existing Transactional Outbox pattern from order-service. No direct Kafka publishing. The `OutboxRelayService` poll-and-publish mechanism is already proven.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | 4-layer Clean Architecture (domain/application/infrastructure/interfaces) | Consistency with order-service, notification-service, cart-service |
| Domain model scope | Product aggregate only; defer Variant/Attribute/Category entities | YAGNI — avoid over-engineering; `categoryId` as string reference is sufficient |
| Cache strategy | Cache-aside for single-product reads only | Paginated queries have too many permutations to cache effectively; individual product reads are the high-traffic path |
| Cache library | `ioredis` | Already established in cart-service |
| Cache TTL | 3600 seconds (1 hour) | Products change infrequently vs. carts (7 days) |
| Pagination | Offset-based with `page`/`limit` | Simpler for consumers; adequate for product catalog (search-service handles advanced queries) |
| Event publishing | Transactional Outbox → Kafka relay | Established pattern; guarantees consistency |
| Status machine | 4 states with defined transitions (ARCHIVED terminal) | Covers all product lifecycle scenarios |
| Money handling | `Money` value object (cents + currency) | Reuse pattern from order-service; avoids floating-point precision issues |
| Metrics | `prom-client` with Counter/Histogram/Gauge | Established pattern from order-service |

## Patterns to Follow

- Domain entity with private constructor + `static create()` / `static reconstitute()` factory methods
- `BaseDomainEvent` abstract class with `occurredOn` and `eventType`
- `pullDomainEvents()` on aggregate root
- Symbol-based injection tokens for ports (e.g., `PRODUCT_REPOSITORY = Symbol(...)`)
- ORM entities separate from domain entities, connected via `ProductMapper` (toDomain/toPersistence)
- Application handlers as `@Injectable` classes with `execute()` method
- Cache port in application layer, implementation in infrastructure (graceful degradation)
- `DomainException` base class for domain errors
- Index barrel files (`index.ts`) in every directory

## Anti-Patterns to Avoid

- **Direct TypeORM imports in domain layer**: Domain must be framework-free
- **God-service pattern**: Current `ProductsService` handles everything — split into focused handlers
- **DTOs defined in service files**: Move to `interfaces/dto/` with proper class-validator decorators
- **Caching paginated queries**: Too many key permutations; only cache individual product reads
- **Hard-coded DB URLs in module**: Use `ConfigModule` or environment-based config
- **Synchronize: true in TypeORM config**: Use migrations for production
- **Direct Kafka publishing**: Always go through Outbox for transactional consistency

## Dependencies Identified

| Package | Version | Purpose |
|---------|---------|---------|
| `ioredis` | `^5.x` | Redis client for cache-aside implementation |
| `prom-client` | `^15.x` | Prometheus metrics (Counter, Histogram, Gauge) |
| `class-validator` | `^0.14.x` | DTO validation decorators |
| `class-transformer` | `^0.5.x` | DTO transformation |
| `@nestjs/config` | `^3.x` | Environment-based configuration |
| `@ecommerce/core` | `workspace:*` | Logger, tracing, metrics setup (existing) |
| `@ecommerce/events` | `workspace:*` | Shared event interfaces (existing) |

No new infrastructure dependencies required — Redis, Kafka, PostgreSQL already provisioned.

## Risks

| Risk | Mitigation |
|------|------------|
| Existing outbox table cannot be dropped without data loss | Use TypeORM migration; keep backward-compatible schema |
| Redis downtime degrades read performance | Graceful degradation — cache misses fall through to PostgreSQL |
| Large product catalogs (50M+) causing slow unindexed queries | Indexing strategy identified; enforce pagination limits (max 100) |
| Breaking API contract for existing consumers (search-service) | Keep same `product.events` topic and maintain backward-compatible event schema |
| Money value object precision issues during migration | Store as integer cents in DB, convert to decimal only in API responses |

## Ready for Planning

- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
- [x] Domain model designed
- [x] Caching strategy chosen
- [x] Event schema defined
- [x] Pagination/indexing strategy planned
- [x] Risks documented
