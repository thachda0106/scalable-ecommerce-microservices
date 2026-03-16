---
phase: 17
plan: 4
wave: 2
---

# Plan 17.4: Infrastructure — Persistence Layer (ORM Entities, Mapper, Repository)

## Objective
Implement the TypeORM persistence layer that fulfills the IProductRepository port.
Separate ORM entities from domain entities, connected via a ProductMapper.
Implement pagination, filtering, and sorting using TypeORM QueryBuilder.

## Context
- .gsd/phases/17/RESEARCH.md (pagination/indexing strategy)
- apps/product-service/src/domain/ports/product-repository.port.ts (from Plan 17.1)
- apps/product-service/src/domain/entities/product.entity.ts (from Plan 17.1)
- apps/order-service/src/infrastructure/persistence/ (established pattern — ORM entities, mapper, repositories)
- apps/order-service/src/infrastructure/persistence/mappers/order.mapper.ts (mapper pattern)
- apps/order-service/src/infrastructure/persistence/repositories/typeorm-order.repository.ts (repo pattern)

## Tasks

<task type="auto">
  <name>Create ORM Entity and Mapper</name>
  <files>
    apps/product-service/src/infrastructure/persistence/entities/product.orm-entity.ts
    apps/product-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts
    apps/product-service/src/infrastructure/persistence/entities/index.ts
    apps/product-service/src/infrastructure/persistence/mappers/product.mapper.ts
    apps/product-service/src/infrastructure/persistence/mappers/index.ts
  </files>
  <action>
    **ProductOrmEntity** — TypeORM decorated class mapped to `products` table:
    - id: UUID PrimaryGeneratedColumn
    - name: VARCHAR Column
    - description: TEXT Column
    - price: DECIMAL(10,2) Column (stores decimal, maps to/from Money VO via cents)
    - currency: VARCHAR Column (default 'USD')
    - categoryId: VARCHAR Column (nullable, indexed)
    - status: ENUM Column (ProductStatusEnum values, default ACTIVE, indexed)
    - version: INT Column (default 1, for optimistic locking)
    - createdAt: CreateDateColumn (indexed DESC)
    - updatedAt: UpdateDateColumn

    **OutboxEventOrmEntity** — same pattern as order-service:
    - id: UUID PrimaryColumn
    - type: VARCHAR Column
    - payload: JSONB Column
    - processed: BOOLEAN Column (default false)
    - createdAt: CreateDateColumn

    **ProductMapper** — static methods:
    - `toDomain(orm: ProductOrmEntity): Product` — converts ORM to domain via Product.reconstitute()
    - `toPersistence(domain: Product): ProductOrmEntity` — converts domain to ORM, mapping Money.toDecimal() to price, Money.currency to currency

    Follow exact pattern from apps/order-service/src/infrastructure/persistence/mappers/order.mapper.ts

    Barrel exports.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>ProductOrmEntity and OutboxEventOrmEntity created with proper indexes. ProductMapper converts between domain and persistence layers.</done>
</task>

<task type="auto">
  <name>Create TypeORM Repository Implementation</name>
  <files>
    apps/product-service/src/infrastructure/persistence/repositories/typeorm-product.repository.ts
    apps/product-service/src/infrastructure/persistence/repositories/index.ts
  </files>
  <action>
    **TypeOrmProductRepository** implements IProductRepository:
    - Inject: `@InjectRepository(ProductOrmEntity) private readonly repo: Repository<ProductOrmEntity>`
    - Use ProductMapper for all conversions

    **save(product: Product):** Convert to ORM via mapper, save with repo.save()

    **findById(id: ProductId):** findOneBy({ id: id.value }), return mapped domain or null

    **findAll(query: ProductQuery): Promise<PaginatedResult<Product>>:**
    - Use `repo.createQueryBuilder('product')`
    - Apply WHERE clauses dynamically:
      - `query.status` → `product.status = :status`
      - `query.categoryId` → `product.categoryId = :categoryId`
      - `query.minPrice` → `product.price >= :minPrice`
      - `query.maxPrice` → `product.price <= :maxPrice`
      - `query.search` → `product.name ILIKE :search` (prepend/append % wildcards)
    - Apply ORDER BY: `query.sortBy` (validate against whitelist: name, price, createdAt) + `query.sortOrder`
    - Apply pagination: `.skip((page-1)*limit).take(limit)`
    - Get total count with `.getManyAndCount()`
    - Map results through ProductMapper.toDomain()
    - Return PaginatedResult with computed `totalPages: Math.ceil(total/limit)`

    **findByCategoryId(categoryId):** Use find({ where: { categoryId } }), map all

    **delete(id: ProductId):** delete({ id: id.value })

    Barrel export.
  </action>
  <verify>npx tsc --noEmit --project apps/product-service/tsconfig.json 2>&1 | head -20</verify>
  <done>TypeOrmProductRepository implements full IProductRepository with dynamic query building, pagination, filtering, and sorting. Uses ProductMapper for all domain/persistence translation.</done>
</task>

## Success Criteria
- [ ] ProductOrmEntity with TypeORM decorators and proper column types/indexes
- [ ] OutboxEventOrmEntity for transactional outbox
- [ ] ProductMapper with toDomain/toPersistence static methods
- [ ] TypeOrmProductRepository implementing IProductRepository
- [ ] Dynamic query building with pagination, filtering, sorting
- [ ] sortBy validated against whitelist to prevent SQL injection
- [ ] `npx tsc --noEmit` passes
