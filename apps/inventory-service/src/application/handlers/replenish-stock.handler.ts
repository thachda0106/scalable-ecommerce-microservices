import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ReplenishStockCommand } from '../commands/replenish-stock.command';
import {
  INVENTORY_REPOSITORY,
  IInventoryRepository,
} from '../../domain/ports/inventory-repository.port';
import {
  STOCK_CACHE,
  IStockCache,
} from '../../domain/ports/stock-cache.port';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
} from '../ports/event-publisher.port';
import { ProductInventory } from '../../domain/entities/product-inventory';
import { StockMovement, MovementType } from '../../domain/entities/stock-movement';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';

@CommandHandler(ReplenishStockCommand)
export class ReplenishStockHandler
  implements ICommandHandler<ReplenishStockCommand>
{
  private readonly logger = new Logger(ReplenishStockHandler.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: IInventoryRepository,
    @Inject(STOCK_CACHE) private readonly cache: IStockCache,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: ReplenishStockCommand) {
    // 1. Idempotency check
    if (await this.repo.checkIdempotencyKey(cmd.idempotencyKey)) {
      this.logger.log(`Idempotent replenish request: ${cmd.idempotencyKey}`);
      return { success: true, idempotent: true, replenished: [] };
    }

    const allEvents: BaseDomainEvent[] = [];
    const replenished: Array<{
      productId: string;
      previousAvailable: number;
      newAvailable: number;
    }> = [];

    for (const item of cmd.items) {
      // 2. Load or create inventory
      let inventory = await this.repo.findByProductId(item.productId);
      const isNew = !inventory;

      if (!inventory) {
        inventory = ProductInventory.create({
          productId: item.productId,
          sku: `SKU-${item.productId.substring(0, 8).toUpperCase()}`,
          initialStock: 0,
        });
      }

      const prevAvailable = inventory.availableStock;

      // 3. Domain mutation
      inventory.replenish(item.quantity);

      // 4. Create audit movement
      const movement = StockMovement.create({
        productId: item.productId,
        movementType: MovementType.REPLENISH,
        quantity: item.quantity,
        referenceId: cmd.idempotencyKey,
        previousAvailable: prevAvailable,
        newAvailable: inventory.availableStock,
        previousReserved: inventory.reservedStock,
        newReserved: inventory.reservedStock,
        reason: item.reason,
        performedBy: cmd.performedBy,
        correlationId: cmd.correlationId || '',
      });

      // 5. Save
      if (isNew) {
        await this.repo.save(inventory);
      }
      await this.repo.saveWithMovement(inventory, movement);

      // 6. Invalidate cache
      await this.cache.invalidate(item.productId);

      allEvents.push(...inventory.pullEvents());
      replenished.push({
        productId: item.productId,
        previousAvailable: prevAvailable,
        newAvailable: inventory.availableStock,
      });
    }

    // 7. Publish events
    try {
      await this.publisher.publishBatch(allEvents);
    } catch (error) {
      this.logger.warn(`Failed to publish events: ${(error as Error).message}`);
    }

    // 8. Save idempotency key
    await this.repo.saveIdempotencyKey(cmd.idempotencyKey);

    this.logger.log(
      `Replenished ${replenished.length} products by ${cmd.performedBy}`,
    );

    return { success: true, replenished };
  }
}
