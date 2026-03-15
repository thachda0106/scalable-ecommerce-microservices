import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import {
  IInventoryRepository,
} from '../../../domain/ports/inventory-repository.port';
import { ProductInventory } from '../../../domain/entities/product-inventory';
import { StockReservation } from '../../../domain/entities/stock-reservation';
import { StockMovement } from '../../../domain/entities/stock-movement';
import { ProductInventoryOrmEntity } from '../entities/product-inventory.orm-entity';
import { StockReservationOrmEntity } from '../entities/stock-reservation.orm-entity';
import { StockMovementOrmEntity } from '../entities/stock-movement.orm-entity';
import { OutboxEventOrmEntity } from '../entities/outbox-event.orm-entity';
import { ProcessedEventOrmEntity } from '../entities/processed-event.orm-entity';
import { InventoryMapper } from '../mappers/inventory.mapper';
import { ReservationMapper } from '../mappers/reservation.mapper';

@Injectable()
export class TypeOrmInventoryRepository implements IInventoryRepository {
  private readonly logger = new Logger(TypeOrmInventoryRepository.name);

  constructor(
    @InjectRepository(ProductInventoryOrmEntity)
    private readonly inventoryRepo: Repository<ProductInventoryOrmEntity>,
    @InjectRepository(StockReservationOrmEntity)
    private readonly reservationRepo: Repository<StockReservationOrmEntity>,
    @InjectRepository(StockMovementOrmEntity)
    private readonly movementRepo: Repository<StockMovementOrmEntity>,
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findByProductId(productId: string): Promise<ProductInventory | null> {
    const orm = await this.inventoryRepo.findOneBy({ productId });
    return orm ? InventoryMapper.toDomain(orm) : null;
  }

  async save(inventory: ProductInventory): Promise<void> {
    await this.inventoryRepo.save(InventoryMapper.toOrm(inventory));
  }

  async saveWithReservationAndMovement(
    inventory: ProductInventory,
    reservation: StockReservation,
    movement: StockMovement,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Save inventory with OCC (@VersionColumn auto-checks)
      await queryRunner.manager.save(
        ProductInventoryOrmEntity,
        InventoryMapper.toOrm(inventory),
      );

      // Save reservation
      await queryRunner.manager.save(
        StockReservationOrmEntity,
        ReservationMapper.toOrm(reservation),
      );

      // Save movement
      const movementOrm = this.mapMovementToOrm(movement);
      await queryRunner.manager.save(StockMovementOrmEntity, movementOrm);

      // Save outbox event (transactional outbox pattern)
      const outbox = new OutboxEventOrmEntity();
      outbox.id = crypto.randomUUID();
      outbox.type = `inventory.${movement.movementType.toLowerCase()}`;
      outbox.payload = {
        productId: inventory.productId,
        quantity: movement.quantity,
        referenceId: reservation.referenceId,
        reservationId: reservation.id,
        movementType: movement.movementType,
      };
      outbox.processed = false;
      await queryRunner.manager.save(OutboxEventOrmEntity, outbox);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async saveWithMovement(
    inventory: ProductInventory,
    movement: StockMovement,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.save(
        ProductInventoryOrmEntity,
        InventoryMapper.toOrm(inventory),
      );

      const movementOrm = this.mapMovementToOrm(movement);
      await queryRunner.manager.save(StockMovementOrmEntity, movementOrm);

      // Outbox event
      const outbox = new OutboxEventOrmEntity();
      outbox.id = crypto.randomUUID();
      outbox.type = `inventory.${movement.movementType.toLowerCase()}`;
      outbox.payload = {
        productId: inventory.productId,
        quantity: movement.quantity,
        referenceId: movement.referenceId,
        movementType: movement.movementType,
      };
      outbox.processed = false;
      await queryRunner.manager.save(OutboxEventOrmEntity, outbox);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findReservationsByReference(
    referenceId: string,
    referenceType: string,
  ): Promise<StockReservation[]> {
    const orms = await this.reservationRepo.find({
      where: { referenceId, referenceType, status: 'ACTIVE' },
    });
    return orms.map(ReservationMapper.toDomain);
  }

  async findActiveReservation(
    referenceId: string,
    productId: string,
  ): Promise<StockReservation | null> {
    const orm = await this.reservationRepo.findOneBy({
      referenceId,
      productId,
      status: 'ACTIVE',
    });
    return orm ? ReservationMapper.toDomain(orm) : null;
  }

  async findExpiredReservations(limit: number): Promise<StockReservation[]> {
    const orms = await this.reservationRepo.find({
      where: {
        status: 'ACTIVE',
        expiresAt: LessThan(new Date()),
      },
      take: limit,
      order: { expiresAt: 'ASC' },
    });
    return orms.map(ReservationMapper.toDomain);
  }

  async saveReservation(reservation: StockReservation): Promise<void> {
    await this.reservationRepo.save(ReservationMapper.toOrm(reservation));
  }

  async checkIdempotencyKey(key: string): Promise<boolean> {
    const existing = await this.processedRepo.findOneBy({ eventId: key });
    return !!existing;
  }

  async saveIdempotencyKey(key: string): Promise<void> {
    const entity = new ProcessedEventOrmEntity();
    entity.eventId = key;
    await this.processedRepo.save(entity);
  }

  private mapMovementToOrm(movement: StockMovement): StockMovementOrmEntity {
    const orm = new StockMovementOrmEntity();
    orm.id = movement.id;
    orm.productId = movement.productId;
    orm.movementType = movement.movementType;
    orm.quantity = movement.quantity;
    orm.referenceId = movement.referenceId;
    orm.previousAvailable = movement.previousAvailable;
    orm.newAvailable = movement.newAvailable;
    orm.previousReserved = movement.previousReserved;
    orm.newReserved = movement.newReserved;
    orm.reason = movement.reason;
    orm.performedBy = movement.performedBy;
    orm.correlationId = movement.correlationId;
    return orm;
  }
}
