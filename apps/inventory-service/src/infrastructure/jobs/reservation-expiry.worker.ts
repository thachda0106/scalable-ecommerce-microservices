import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
} from '../../application/ports/event-publisher.port';
import { StockMovement, MovementType } from '../../domain/entities/stock-movement';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';

@Injectable()
export class ReservationExpiryWorker {
  private readonly logger = new Logger(ReservationExpiryWorker.name);

  constructor(
    @Inject(INVENTORY_REPOSITORY) private readonly repo: IInventoryRepository,
    @Inject(STOCK_CACHE) private readonly cache: IStockCache,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  @Cron('*/10 * * * * *') // Every 10 seconds
  async handleExpiredReservations(): Promise<void> {
    try {
      const expired = await this.repo.findExpiredReservations(100);

      if (expired.length === 0) return;

      const allEvents: BaseDomainEvent[] = [];
      let processedCount = 0;

      for (const reservation of expired) {
        try {
          const inventory = await this.repo.findByProductId(
            reservation.productId,
          );
          if (!inventory) {
            this.logger.warn(
              `Inventory not found for expired reservation ${reservation.id}`,
            );
            continue;
          }

          const prevAvailable = inventory.availableStock;
          const prevReserved = inventory.reservedStock;

          // Release stock back to available
          inventory.release(
            reservation.quantity,
            reservation.id,
            reservation.referenceId,
            'reservation_expired',
          );

          // Update reservation status
          reservation.expire();

          // Create audit movement
          const movement = StockMovement.create({
            productId: reservation.productId,
            movementType: MovementType.EXPIRE,
            quantity: reservation.quantity,
            referenceId: reservation.id,
            previousAvailable: prevAvailable,
            newAvailable: inventory.availableStock,
            previousReserved: prevReserved,
            newReserved: inventory.reservedStock,
            reason: 'reservation_expired',
            performedBy: 'reservation-expiry-worker',
            correlationId: '',
          });

          // Persist
          await this.repo.saveWithMovement(inventory, movement);
          await this.repo.saveReservation(reservation);

          // Invalidate cache
          await this.cache.invalidate(reservation.productId);

          allEvents.push(...inventory.pullEvents());
          processedCount++;
        } catch (error) {
          // Log and continue — one failure shouldn't block others
          this.logger.error(
            `Failed to process expired reservation ${reservation.id}: ${(error as Error).message}`,
          );
        }
      }

      // Publish events
      if (allEvents.length > 0) {
        try {
          await this.publisher.publishBatch(allEvents);
        } catch (error) {
          this.logger.warn(
            `Failed to publish expiry events: ${(error as Error).message}`,
          );
        }
      }

      if (processedCount > 0) {
        this.logger.log(
          `Released ${processedCount} expired reservations`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Expiry worker failed: ${(error as Error).message}`,
      );
    }
  }
}
