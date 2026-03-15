import { Inject, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ReserveStockCommand } from '../commands/reserve-stock.command';
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
import { StockReservation } from '../../domain/entities/stock-reservation';
import { StockMovement, MovementType } from '../../domain/entities/stock-movement';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';
import { InsufficientStockError } from '../../domain/errors/insufficient-stock.error';

@CommandHandler(ReserveStockCommand)
export class ReserveStockHandler
  implements ICommandHandler<ReserveStockCommand>
{
  private readonly logger = new Logger(ReserveStockHandler.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: IInventoryRepository,
    @Inject(STOCK_CACHE) private readonly cache: IStockCache,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: ReserveStockCommand) {
    // 1. Idempotency check
    if (await this.repo.checkIdempotencyKey(cmd.idempotencyKey)) {
      this.logger.log(`Idempotent request detected: ${cmd.idempotencyKey}`);
      return { success: true, idempotent: true, reservations: [] };
    }

    const allEvents: BaseDomainEvent[] = [];
    const reservations: Array<{
      reservationId: string;
      productId: string;
      quantity: number;
      status: string;
      expiresAt: string;
    }> = [];

    for (const item of cmd.items) {
      const requestId = crypto.randomUUID();

      // 2. Acquire distributed lock
      const locked = await this.cache.acquireLock(item.productId, requestId);
      if (!locked) {
        throw new ConflictException(
          `Stock operation in progress for product ${item.productId}`,
        );
      }

      try {
        // 3. Load inventory
        const inventory = await this.repo.findByProductId(item.productId);
        if (!inventory) {
          throw new NotFoundException(
            `Inventory not found for product ${item.productId}`,
          );
        }

        // 4. Snapshot before mutation
        const prevAvailable = inventory.availableStock;
        const prevReserved = inventory.reservedStock;

        // 5. Create reservation
        const reservation = StockReservation.create({
          productId: item.productId,
          referenceId: cmd.referenceId,
          referenceType: cmd.referenceType,
          quantity: item.quantity,
          ttlMinutes: cmd.ttlMinutes,
          idempotencyKey: `${cmd.idempotencyKey}-${item.productId}`,
        });

        // 6. Domain mutation (throws InsufficientStockError if not enough stock)
        inventory.reserve(
          item.quantity,
          reservation.id,
          cmd.referenceId,
          cmd.referenceType,
        );

        // 7. Create audit movement
        const movement = StockMovement.create({
          productId: item.productId,
          movementType: MovementType.RESERVE,
          quantity: item.quantity,
          referenceId: reservation.id,
          previousAvailable: prevAvailable,
          newAvailable: inventory.availableStock,
          previousReserved: prevReserved,
          newReserved: inventory.reservedStock,
          reason: 'stock_reservation',
          performedBy: 'inventory-service',
          correlationId: cmd.correlationId || '',
        });

        // 8. Atomic save (inventory + reservation + movement in one transaction)
        await this.repo.saveWithReservationAndMovement(
          inventory,
          reservation,
          movement,
        );

        // 9. Invalidate cache
        await this.cache.invalidate(item.productId);

        // 10. Collect events
        allEvents.push(...inventory.pullEvents());
        reservations.push({
          reservationId: reservation.id,
          productId: item.productId,
          quantity: item.quantity,
          status: reservation.status,
          expiresAt: reservation.expiresAt.toISOString(),
        });
      } catch (error) {
        // Release lock on failure
        await this.cache.releaseLock(item.productId, requestId);

        if (error instanceof InsufficientStockError) {
          throw error;
        }
        throw error;
      }

      // Release lock on success
      await this.cache.releaseLock(item.productId, requestId);
    }

    // 11. Publish events (non-blocking)
    try {
      await this.publisher.publishBatch(allEvents);
    } catch (error) {
      this.logger.warn(`Failed to publish events: ${(error as Error).message}`);
    }

    // 12. Save idempotency key
    await this.repo.saveIdempotencyKey(cmd.idempotencyKey);

    this.logger.log(
      `Reserved ${reservations.length} items for ${cmd.referenceType} ${cmd.referenceId}`,
    );

    return { success: true, reservations };
  }
}
