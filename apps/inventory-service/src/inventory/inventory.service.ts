import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Stock } from './entities/stock.entity';
import { OutboxEvent } from '../outbox/entities/outbox-event.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Stock)
    private stockRepository: Repository<Stock>,
    private dataSource: DataSource,
  ) {}

  // Used for initial stock seeding
  async createOrUpdateStock(productId: string, quantity: number) {
    let stock = await this.stockRepository.findOneBy({ productId });
    if (!stock) {
      stock = this.stockRepository.create({
        productId,
        availableQuantity: quantity,
      });
    } else {
      stock.availableQuantity += quantity;
    }
    return this.stockRepository.save(stock);
  }

  async reserveStock(
    orderId: string,
    items: { productId: string; quantity: number }[],
  ) {
    // For simplicity, we process one item type here. In a real system you'd loop or use a more robust batch reservation
    const item = items[0]; // simplistic assumption
    if (!item) return;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let success = false;

    try {
      // Find stock with OCC lock check by loading it inside transaction.
      // TypeORM's save() handles the VersionColumn increment and check automatically.
      const stock = await queryRunner.manager.findOneBy(Stock, {
        productId: item.productId,
      });

      if (stock && stock.availableQuantity >= item.quantity) {
        stock.availableQuantity -= item.quantity;
        stock.reservedQuantity += item.quantity;
        await queryRunner.manager.save(Stock, stock);
        success = true;
      }

      // Record outbox event in the same transaction
      const outboxEvent = new OutboxEvent();
      outboxEvent.id = uuidv4();
      outboxEvent.type = success
        ? 'InventoryReserved'
        : 'InventoryReservationFailed';
      outboxEvent.payload = {
        orderId,
        productId: item.productId,
        quantity: item.quantity,
        success,
      };

      await queryRunner.manager.save(OutboxEvent, outboxEvent);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Reservation for order ${orderId} ${success ? 'successful' : 'failed'}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`OCC or DB Error during reservation: ${err.message}`);

      // We could try to save a failure event outside transaction here if needed.
    } finally {
      await queryRunner.release();
    }
  }

  async compensateReservation(
    orderId: string,
    productId: string,
    quantity: number,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const stock = await queryRunner.manager.findOneBy(Stock, { productId });
      if (stock) {
        // Rollback reserved stock to available
        stock.reservedQuantity -= quantity;
        stock.availableQuantity += quantity;
        await queryRunner.manager.save(Stock, stock);
        this.logger.log(`Compensated stock for order ${orderId}`);
      }
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error compensating stock: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }
}
