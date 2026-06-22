import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { OutboxEventEntity } from './outbox/outbox-event.entity';

/**
 * Base domain event interface — services must implement this.
 * Kept minimal so packages/core has no service-specific imports.
 */
export interface IDomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly occurredOn: Date;
}

/**
 * Generic Unit of Work — executes arbitrary persistence work + domain event outbox write
 * in a single DB transaction.
 *
 * Usage:
 * ```typescript
 * await unitOfWork.execute(
 *   (manager) => manager.save(OrderOrmEntity, ormOrder),
 *   order.pullDomainEvents(),
 * );
 * ```
 *
 * Guarantees: either both entity changes AND outbox entries commit, or neither does.
 */
@Injectable()
export class UnitOfWork {
  private readonly logger = new Logger(UnitOfWork.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Execute work and persist domain events atomically in a single transaction.
   *
   * @param work - Callback receiving the transactional EntityManager. Perform all saves here.
   * @param events - Domain events to write to the outbox table.
   * @returns The result of the work callback.
   */
  async execute<T>(
    work: (manager: EntityManager) => Promise<T>,
    events: IDomainEvent[] = [],
  ): Promise<T> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // 1. Execute the business-logic persistence
      const result = await work(manager);

      // 2. Write domain events to outbox within the same transaction
      if (events.length > 0) {
        const outboxEntries = events.map((event) => {
          const entry = new OutboxEventEntity();
          entry.id = randomUUID();
          entry.type = event.eventType;
          entry.payload = this.serializeEvent(event);
          entry.processed = false;
          return entry;
        });
        await manager.save(OutboxEventEntity, outboxEntries);
      }

      this.logger.debug(
        `UnitOfWork committed with ${events.length} outbox event(s)`,
      );

      return result;
    });
  }

  private serializeEvent(event: IDomainEvent): Record<string, unknown> {
    return JSON.parse(JSON.stringify(event));
  }
}
