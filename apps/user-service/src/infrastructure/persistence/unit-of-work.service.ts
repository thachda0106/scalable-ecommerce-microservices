import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../../domain/entities/user.entity';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';
import { UserMapper } from './mappers/user.mapper';
import { OutboxEventOrmEntity } from './entities/outbox-event.orm-entity';
import { UserOrmEntity } from './entities/user.orm-entity';

/**
 * Unit of Work — executes domain persistence + outbox write in a single DB transaction.
 * Guarantees atomicity: either both the entity and its events are persisted, or neither is.
 */
@Injectable()
export class UnitOfWork {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Saves user aggregate and domain events atomically within a single transaction.
   */
  async commitUserWithEvents(
    user: User,
    events: BaseDomainEvent[],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      // 1. Persist the user aggregate
      const userOrm = UserMapper.toPersistence(user);
      await manager.save(UserOrmEntity, userOrm);

      // 2. Write domain events to outbox
      if (events.length > 0) {
        const outboxEntries = events.map((event) => {
          const entry = new OutboxEventOrmEntity();
          entry.type = event.eventType;
          entry.payload = {
            eventId: event.eventId,
            eventType: event.eventType,
            occurredOn: event.occurredOn.toISOString(),
            data: Object.entries(event)
              .filter(
                ([key]) =>
                  !['occurredOn', 'eventType', 'eventId'].includes(key),
              )
              .reduce<Record<string, unknown>>((acc, [key, value]) => {
                acc[key] = value;
                return acc;
              }, {}),
          };
          entry.processed = false;
          return entry;
        });
        await manager.save(OutboxEventOrmEntity, outboxEntries);
      }

      this.logger.debug(
        `Committed user ${user.id.value} with ${events.length} event(s) in single transaction`,
      );
    });
  }
}
