import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConfirmStockCommand } from '../commands/confirm-stock.command';
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
import { ReservationNotFoundError } from '../../domain/errors/reservation-not-found.error';

@CommandHandler(ConfirmStockCommand)
export class ConfirmStockHandler
  implements ICommandHandler<ConfirmStockCommand>
{
  private readonly logger = new Logger(ConfirmStockHandler.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: IInventoryRepository,
    @Inject(STOCK_CACHE) private readonly cache: IStockCache,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(cmd: ConfirmStockCommand) {
    // 1. Idempotency check
    if (await this.repo.checkIdempotencyKey(cmd.idempotencyKey)) {
      this.logger.log(`Idempotent confirm request: ${cmd.idempotencyKey}`);
      return { success: true, idempotent: true, confirmedItems: [] };
    }

    // 2. Find active reservations for this order
    const reservations = await this.repo.findReservationsByReference(
      cmd.referenceId,
      cmd.referenceType,
    );

    if (reservations.length === 0) {
      throw new ReservationNotFoundError(cmd.referenceId);
    }

    const allEvents: BaseDomainEvent[] = [];
    const confirmedItems: Array<{
      productId: string;
      quantity: number;
      status: string;
    }> = [];

    for (const reservation of reservations) {
      const inventory = await this.repo.findByProductId(reservation.productId);
      if (!inventory) {
        this.logger.warn(`Inventory not found for product ${reservation.productId}, skipping`);
        continue;
      }

      const prevReserved = inventory.reservedStock;

      // 3. Domain mutation — reserved → sold
      inventory.confirm(
        reservation.quantity,
        reservation.id,
        cmd.referenceId,
      );

      // 4. Update reservation status
      reservation.confirm();

      // 5. Create audit movement
      const movement = StockMovement.create({
        productId: reservation.productId,
        movementType: MovementType.CONFIRM,
        quantity: reservation.quantity,
        referenceId: reservation.id,
        previousAvailable: inventory.availableStock,
        newAvailable: inventory.availableStock,
        previousReserved: prevReserved,
        newReserved: inventory.reservedStock,
        reason: 'order_confirmed',
        performedBy: 'inventory-service',
        correlationId: cmd.correlationId || '',
      });

      // 6. Atomic save
      await this.repo.saveWithMovement(inventory, movement);
      await this.repo.saveReservation(reservation);

      // 7. Invalidate cache
      await this.cache.invalidate(reservation.productId);

      allEvents.push(...inventory.pullEvents());
      confirmedItems.push({
        productId: reservation.productId,
        quantity: reservation.quantity,
        status: reservation.status,
      });
    }

    // 8. Publish events
    try {
      await this.publisher.publishBatch(allEvents);
    } catch (error) {
      this.logger.warn(`Failed to publish events: ${(error as Error).message}`);
    }

    // 9. Save idempotency key
    await this.repo.saveIdempotencyKey(cmd.idempotencyKey);

    this.logger.log(
      `Confirmed ${confirmedItems.length} items for order ${cmd.referenceId}`,
    );

    return { success: true, confirmedItems };
  }
}
