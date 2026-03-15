import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ReleaseStockCommand } from '../commands/release-stock.command';
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
import { StockMovement, MovementType } from '../../domain/entities/stock-movement';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';

@CommandHandler(ReleaseStockCommand)
export class ReleaseStockHandler
  implements ICommandHandler<ReleaseStockCommand>
{
  private readonly logger = new Logger(ReleaseStockHandler.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: IInventoryRepository,
    @Inject(STOCK_CACHE) private readonly cache: IStockCache,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: ReleaseStockCommand) {
    // 1. Idempotency check
    if (await this.repo.checkIdempotencyKey(cmd.idempotencyKey)) {
      this.logger.log(`Idempotent release request: ${cmd.idempotencyKey}`);
      return { success: true, idempotent: true, releasedCount: 0, releasedItems: [] };
    }

    // 2. Find active reservations for this reference
    let reservations = await this.repo.findReservationsByReference(
      cmd.referenceId,
      cmd.referenceType,
    );

    // 3. Filter by product IDs if specified
    if (cmd.productIds && cmd.productIds.length > 0) {
      reservations = reservations.filter((r) =>
        cmd.productIds!.includes(r.productId),
      );
    }

    if (reservations.length === 0) {
      this.logger.log(`No active reservations to release for ${cmd.referenceId}`);
      return { success: true, releasedCount: 0, releasedItems: [] };
    }

    const allEvents: BaseDomainEvent[] = [];
    const releasedItems: Array<{ productId: string; quantityReleased: number }> = [];

    for (const reservation of reservations) {
      // 4. Load inventory
      const inventory = await this.repo.findByProductId(reservation.productId);
      if (!inventory) {
        this.logger.warn(`Inventory not found for product ${reservation.productId}, skipping`);
        continue;
      }

      const prevAvailable = inventory.availableStock;
      const prevReserved = inventory.reservedStock;

      // 5. Domain mutation
      inventory.release(
        reservation.quantity,
        reservation.id,
        cmd.referenceId,
        cmd.reason,
      );

      // 6. Update reservation status
      reservation.release();

      // 7. Create audit movement
      const movement = StockMovement.create({
        productId: reservation.productId,
        movementType: MovementType.RELEASE,
        quantity: reservation.quantity,
        referenceId: reservation.id,
        previousAvailable: prevAvailable,
        newAvailable: inventory.availableStock,
        previousReserved: prevReserved,
        newReserved: inventory.reservedStock,
        reason: cmd.reason,
        performedBy: 'inventory-service',
        correlationId: cmd.correlationId || '',
      });

      // 8. Atomic save
      await this.repo.saveWithMovement(inventory, movement);
      await this.repo.saveReservation(reservation);

      // 9. Invalidate cache
      await this.cache.invalidate(reservation.productId);

      allEvents.push(...inventory.pullEvents());
      releasedItems.push({
        productId: reservation.productId,
        quantityReleased: reservation.quantity,
      });
    }

    // 10. Publish events (non-blocking)
    try {
      await this.publisher.publishBatch(allEvents);
    } catch (error) {
      this.logger.warn(`Failed to publish events: ${(error as Error).message}`);
    }

    // 11. Save idempotency key
    await this.repo.saveIdempotencyKey(cmd.idempotencyKey);

    this.logger.log(
      `Released ${releasedItems.length} items for ${cmd.referenceType} ${cmd.referenceId}`,
    );

    return { success: true, releasedCount: releasedItems.length, releasedItems };
  }
}
