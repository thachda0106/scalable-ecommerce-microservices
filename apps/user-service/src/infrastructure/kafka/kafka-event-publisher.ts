import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IEventPublisher } from '../../application/ports/event-publisher.port';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';

@Injectable()
export class KafkaEventPublisher implements IEventPublisher {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
  ) {}

  async publish(event: BaseDomainEvent): Promise<void> {
    await this.publishAll([event]);
  }

  async publishAll(events: BaseDomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const outboxEntries = events.map((event) => {
      const entry = new OutboxEventOrmEntity();
      entry.type = event.eventType;
      entry.payload = {
        eventType: event.eventType,
        occurredOn: event.occurredOn.toISOString(),
        data: Object.entries(event)
          .filter(([key]) => key !== 'occurredOn' && key !== 'eventType')
          .reduce<Record<string, unknown>>((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {}),
      };
      entry.processed = false;
      return entry;
    });

    await this.outboxRepo.save(outboxEntries);
    this.logger.debug(`${events.length} event(s) written to outbox`);
  }
}
