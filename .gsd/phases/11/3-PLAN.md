---
phase: 11
plan: 3
wave: 2
depends_on: [1, 2]
files_modified:
  - apps/inventory-service/src/infrastructure/persistence/entities/product-inventory.orm-entity.ts
  - apps/inventory-service/src/infrastructure/persistence/entities/stock-reservation.orm-entity.ts
  - apps/inventory-service/src/infrastructure/persistence/entities/stock-movement.orm-entity.ts
  - apps/inventory-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts
  - apps/inventory-service/src/infrastructure/persistence/entities/processed-event.orm-entity.ts
  - apps/inventory-service/src/infrastructure/persistence/mappers/inventory.mapper.ts
  - apps/inventory-service/src/infrastructure/persistence/mappers/reservation.mapper.ts
  - apps/inventory-service/src/infrastructure/persistence/repositories/typeorm-inventory.repository.ts
autonomous: true
user_setup: []

must_haves:
  truths:
    - "TypeORM entities map to domain entities via mappers — domain is never polluted with ORM decorators"
    - "saveWithReservationAndMovement() uses a single QueryRunner transaction"
    - "OCC is enforced with @VersionColumn() on product_inventory and WHERE version = :expected AND available_stock >= :quantity in UPDATE"
    - "ProductInventoryOrmEntity has CHECK constraints matching the SQL schema: available_stock >= 0, reserved_stock >= 0, stock invariant"
    - "Repository implements IInventoryRepository from the domain port"
  artifacts:
    - "apps/inventory-service/src/infrastructure/persistence/repositories/typeorm-inventory.repository.ts implements IInventoryRepository"
    - "5 ORM entities exist with proper TypeORM decorators"
    - "2 mapper files exist (inventory.mapper.ts, reservation.mapper.ts)"
---

# Plan 11.3: Infrastructure — TypeORM Persistence Layer

<objective>
Implement the PostgreSQL persistence layer: TypeORM ORM entities (separate from domain entities), mappers to convert between ORM and domain, and the repository implementing IInventoryRepository.

Purpose: This is the durable storage backbone. All stock mutations are persisted atomically in PostgreSQL with OCC and transactional writes.
Output: 5 ORM entities, 2 mappers, 1 repository.
</objective>

<context>
Load for context:
- apps/inventory-service/src/domain/entities/product-inventory.ts  (domain aggregate)
- apps/inventory-service/src/domain/entities/stock-reservation.ts
- apps/inventory-service/src/domain/entities/stock-movement.ts
- apps/inventory-service/src/domain/ports/inventory-repository.port.ts  (interface to implement)
- apps/inventory-service/src/inventory/entities/stock.entity.ts  (current entity — replace with new ORM entity)
- apps/inventory-service/src/outbox/entities/outbox-event.entity.ts  (current outbox entity — upgrade)
</context>

<tasks>

<task type="auto">
  <name>Create TypeORM ORM entities and mappers</name>
  <files>
    apps/inventory-service/src/infrastructure/persistence/entities/product-inventory.orm-entity.ts
    apps/inventory-service/src/infrastructure/persistence/entities/stock-reservation.orm-entity.ts
    apps/inventory-service/src/infrastructure/persistence/entities/stock-movement.orm-entity.ts
    apps/inventory-service/src/infrastructure/persistence/entities/outbox-event.orm-entity.ts
    apps/inventory-service/src/infrastructure/persistence/entities/processed-event.orm-entity.ts
    apps/inventory-service/src/infrastructure/persistence/mappers/inventory.mapper.ts
    apps/inventory-service/src/infrastructure/persistence/mappers/reservation.mapper.ts
  </files>
  <action>
    **product-inventory.orm-entity.ts** (`@Entity('product_inventory')`):
    - `@PrimaryColumn('uuid') productId: string`
    - `@Column({ type: 'varchar', length: 100, unique: true }) sku: string`
    - `@Column({ type: 'int', default: 0 }) availableStock: number`
    - `@Column({ type: 'int', default: 0 }) reservedStock: number`
    - `@Column({ type: 'int', default: 0 }) soldStock: number`
    - `@Column({ type: 'int', default: 0 }) totalStock: number`
    - `@Column({ type: 'int', default: 100 }) lowStockThreshold: number`
    - `@VersionColumn() version: number`
    - `@CreateDateColumn({ type: 'timestamptz' }) createdAt: Date`
    - `@UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date`

    **stock-reservation.orm-entity.ts** (`@Entity('stock_reservations')`):
    - `@PrimaryColumn('uuid') id: string`
    - `@Column('uuid') productId: string`
    - `@Column('uuid') referenceId: string`
    - `@Column({ type: 'varchar', length: 20 }) referenceType: string`
    - `@Column({ type: 'int' }) quantity: number`
    - `@Column({ type: 'varchar', length: 20, default: 'ACTIVE' }) status: string`
    - `@Column({ type: 'timestamptz', nullable: true }) expiresAt: Date`
    - `@Column({ type: 'varchar', length: 255, unique: true }) idempotencyKey: string`
    - `@CreateDateColumn({ type: 'timestamptz' }) createdAt: Date`
    - `@UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date`
    - `@Index('idx_reservations_product', ['productId'])`
    - `@Index('idx_reservations_reference', ['referenceId', 'referenceType'])`

    **stock-movement.orm-entity.ts** (`@Entity('stock_movements')`):
    - `@PrimaryColumn('uuid') id: string`
    - `@Column('uuid') productId: string`
    - `@Column({ type: 'varchar', length: 20 }) movementType: string`
    - `@Column({ type: 'int' }) quantity: number`
    - `@Column({ type: 'uuid', nullable: true }) referenceId: string`
    - `@Column({ type: 'int' }) previousAvailable: number`
    - `@Column({ type: 'int' }) newAvailable: number`
    - `@Column({ type: 'int' }) previousReserved: number`
    - `@Column({ type: 'int' }) newReserved: number`
    - `@Column({ type: 'varchar', length: 255, nullable: true }) reason: string`
    - `@Column({ type: 'varchar', length: 255, nullable: true }) performedBy: string`
    - `@Column({ type: 'varchar', length: 255, nullable: true }) correlationId: string`
    - `@CreateDateColumn({ type: 'timestamptz' }) createdAt: Date`
    - `@Index('idx_movements_product', ['productId'])`
    - `@Index('idx_movements_created', ['createdAt'])`

    **outbox-event.orm-entity.ts** (`@Entity('outbox_events')`):
    - Upgrade existing outbox entity with proper typing
    - `@PrimaryColumn('uuid') id: string`
    - `@Column({ type: 'varchar', length: 100 }) type: string`
    - `@Column({ type: 'jsonb' }) payload: Record<string, unknown>`
    - `@Column({ type: 'boolean', default: false }) processed: boolean`
    - `@CreateDateColumn({ type: 'timestamptz' }) createdAt: Date`

    **processed-event.orm-entity.ts** (`@Entity('processed_events')`):
    - `@PrimaryColumn('uuid') eventId: string`
    - `@CreateDateColumn({ type: 'timestamptz' }) processedAt: Date`

    **inventory.mapper.ts**:
    ```ts
    export class InventoryMapper {
      static toDomain(orm: ProductInventoryOrmEntity): ProductInventory {
        return ProductInventory.reconstitute({
          productId: orm.productId,
          sku: orm.sku,
          availableStock: orm.availableStock,
          reservedStock: orm.reservedStock,
          soldStock: orm.soldStock,
          totalStock: orm.totalStock,
          lowStockThreshold: orm.lowStockThreshold,
          version: orm.version,
          createdAt: orm.createdAt,
          updatedAt: orm.updatedAt,
        });
      }

      static toOrm(domain: ProductInventory): ProductInventoryOrmEntity {
        const orm = new ProductInventoryOrmEntity();
        orm.productId = domain.productId;
        orm.sku = domain.sku;
        orm.availableStock = domain.availableStock;
        orm.reservedStock = domain.reservedStock;
        orm.soldStock = domain.soldStock;
        orm.totalStock = domain.totalStock;
        orm.lowStockThreshold = domain.lowStockThreshold;
        orm.version = domain.version;
        orm.createdAt = domain.createdAt;
        orm.updatedAt = domain.updatedAt;
        return orm;
      }
    }
    ```

    **reservation.mapper.ts**: Same pattern — `toDomain(orm) → StockReservation.reconstitute(...)` and `toOrm(domain) → StockReservationOrmEntity`

    AVOID putting domain logic in ORM entities — they are pure data holders with TypeORM decorators.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep -E "orm-entity|mapper" || echo "ORM entities and mappers compile OK"</verify>
  <done>5 ORM entities created with proper TypeORM decorators and indexes. 2 mappers convert between ORM and domain cleanly. Domain entities have no TypeORM decorators. Stock invariant will be enforced at DB level via CHECK constraints in migrations.</done>
</task>

<task type="auto">
  <name>Implement TypeORM inventory repository</name>
  <files>
    apps/inventory-service/src/infrastructure/persistence/repositories/typeorm-inventory.repository.ts
  </files>
  <action>
    **typeorm-inventory.repository.ts** — implements `IInventoryRepository`:
    - `@Injectable()` class `TypeOrmInventoryRepository implements IInventoryRepository`
    - Inject: `@InjectRepository(ProductInventoryOrmEntity) private inventoryRepo: Repository<ProductInventoryOrmEntity>`, `@InjectRepository(StockReservationOrmEntity) private reservationRepo: Repository<StockReservationOrmEntity>`, `private dataSource: DataSource`
    - Also inject `@InjectRepository(StockMovementOrmEntity)`, `@InjectRepository(OutboxEventOrmEntity)`, `@InjectRepository(ProcessedEventOrmEntity)`

    **findByProductId(productId)**:
    - `const orm = await this.inventoryRepo.findOneBy({ productId })`
    - Return `orm ? InventoryMapper.toDomain(orm) : null`

    **save(inventory)**:
    - `await this.inventoryRepo.save(InventoryMapper.toOrm(inventory))`
    - TypeORM's @VersionColumn automatically enforces OCC (throws OptimisticLockVersionMismatchError on conflict)

    **saveWithReservationAndMovement(inventory, reservation, movement)** — CRITICAL transaction:
    ```ts
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Save inventory with OCC
      await queryRunner.manager.save(ProductInventoryOrmEntity, InventoryMapper.toOrm(inventory));
      // Save reservation
      await queryRunner.manager.save(StockReservationOrmEntity, ReservationMapper.toOrm(reservation));
      // Save movement
      const movementOrm = new StockMovementOrmEntity();
      // ... map all fields from movement domain entity
      await queryRunner.manager.save(StockMovementOrmEntity, movementOrm);
      // Save outbox event (transactional outbox pattern)
      const outbox = new OutboxEventOrmEntity();
      outbox.id = crypto.randomUUID();
      outbox.type = movement.movementType === 'RESERVE' ? 'InventoryReserved' : movement.movementType;
      outbox.payload = { productId: inventory.productId, quantity: movement.quantity, referenceId: reservation.referenceId };
      outbox.processed = false;
      await queryRunner.manager.save(OutboxEventOrmEntity, outbox);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err; // Let handler retry on OCC conflict
    } finally {
      await queryRunner.release();
    }
    ```

    **saveWithMovement(inventory, movement)** — similar but without reservation (for replenish)

    **findReservationsByReference(referenceId, referenceType)**:
    - Query `WHERE referenceId = :referenceId AND referenceType = :referenceType AND status = 'ACTIVE'`
    - Map to domain entities

    **findActiveReservation(referenceId, productId)**: Single reservation lookup

    **findExpiredReservations(limit)**:
    - Query `WHERE status = 'ACTIVE' AND expiresAt < NOW() LIMIT :limit`
    - Map to domain entities

    **saveReservation(reservation)**: Save single reservation update (status change)

    **checkIdempotencyKey(key)**: `return !!(await this.processedEventRepo.findOneBy({ eventId: key }))`

    **saveIdempotencyKey(key)**: Insert into processed_events

    AVOID doing SELECT + UPDATE in separate queries. Use queryRunner for transactional consistency.
    AVOID catching OptimisticLockVersionMismatchError — let it propagate to handler for retry logic.
  </action>
  <verify>npx tsc --noEmit 2>&1 | grep "typeorm-inventory" || echo "Repository compiles OK"</verify>
  <done>TypeOrmInventoryRepository implements all IInventoryRepository methods. saveWithReservationAndMovement uses QueryRunner for atomic 4-table writes. OCC is handled by TypeORM @VersionColumn. Expired reservation query filters by status=ACTIVE and expiresAt < NOW(). Idempotency check uses processed_events table.</done>
</task>

</tasks>

<verification>
After all tasks:
- [ ] `npx tsc --noEmit` produces zero errors for infrastructure/persistence files
- [ ] saveWithReservationAndMovement wraps 4 saves (inventory + reservation + movement + outbox) in one transaction
- [ ] TypeORM @VersionColumn is on ProductInventoryOrmEntity for OCC
- [ ] Mappers correctly convert between ORM and domain entities
- [ ] Repository methods match IInventoryRepository interface exactly
</verification>

<success_criteria>
- [ ] 5 ORM entities, 2 mappers, 1 repository created
- [ ] Repository implements IInventoryRepository completely
- [ ] Transactional writes use QueryRunner
- [ ] TypeScript compiles without errors
</success_criteria>
