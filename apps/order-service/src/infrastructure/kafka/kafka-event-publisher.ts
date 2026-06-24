import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { IEventPublisher } from '../../application/ports/event-publisher.port';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';

/**
 * Implements IEventPublisher via the Transactional Outbox pattern.
 * Events are NOT published directly to Kafka — they are written to the
 * outbox_events table. The OutboxRelayService polls and publishes them.
 * This ensures events are only published after the business transaction commits.
 */
@Injectable()
export class KafkaEventPublisher implements IEventPublisher {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async publish(event: BaseDomainEvent): Promise<void> {
    await this.publishAll([event]);
  }

  async publishAll(events: BaseDomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const entities = events.map((event) => {
        const entity = new OutboxEventOrmEntity();
        entity.id = crypto.randomUUID();
        entity.type = event.eventType;
        entity.payload = this.serializeEvent(event);
        entity.processed = false;
        return entity;
      });

      await queryRunner.manager.save(OutboxEventOrmEntity, entities);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to save ${events.length} events to outbox: ${(error as Error).message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private serializeEvent(event: BaseDomainEvent): Record<string, unknown> {
    return JSON.parse(JSON.stringify(event));
  }
}
