import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  private readonly logger = new Logger(KafkaEventPublisher.name);

  constructor(
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
  ) {}

  async publish(event: BaseDomainEvent): Promise<void> {
    try {
      const entity = new OutboxEventOrmEntity();
      entity.id = crypto.randomUUID();
      entity.type = event.eventType;
      entity.payload = this.serializeEvent(event);
      entity.processed = false;
      await this.outboxRepo.save(entity);
    } catch (error) {
      this.logger.warn(
        `Failed to save event to outbox: ${(error as Error).message}`,
      );
    }
  }

  async publishBatch(events: BaseDomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    try {
      const entities = events.map((event) => {
        const entity = new OutboxEventOrmEntity();
        entity.id = crypto.randomUUID();
        entity.type = event.eventType;
        entity.payload = this.serializeEvent(event);
        entity.processed = false;
        return entity;
      });
      await this.outboxRepo.save(entities);
    } catch (error) {
      this.logger.warn(
        `Failed to save ${events.length} events to outbox: ${(error as Error).message}`,
      );
    }
  }

  private serializeEvent(event: BaseDomainEvent): Record<string, unknown> {
    return JSON.parse(JSON.stringify(event));
  }
}
