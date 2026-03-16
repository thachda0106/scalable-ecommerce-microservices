import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BaseDomainEvent } from '../../../domain/events/base-domain.event';
import { IEventPublisher } from '../../../application/ports/event-publisher.port';
import { OutboxEventOrmEntity } from '../../persistence/entities/outbox-event.orm-entity';

/**
 * KafkaEventPublisher — implements IEventPublisher via outbox pattern.
 * Does NOT publish directly to Kafka. Instead, saves events to the outbox table.
 * The OutboxRelayService picks them up and publishes to Kafka.
 */
@Injectable()
export class KafkaEventPublisher implements IEventPublisher {
  private readonly logger = new Logger(KafkaEventPublisher.name);

  constructor(
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
      entry.id = uuidv4();
      entry.type = this.mapEventType(event.eventType);
      entry.payload = this.mapEventToPayload(event);
      entry.processed = false;
      return entry;
    });

    await this.outboxRepo.save(outboxEntries);
    this.logger.debug(`Saved ${outboxEntries.length} events to outbox`);
  }

  /**
   * Maps domain event types to outbox event types that order-service understands
   */
  private mapEventType(eventType: string): string {
    switch (eventType) {
      case 'PaymentCompleted':
        return 'PaymentProcessed'; // backward compat with order-service consumer
      case 'PaymentFailed':
        return 'PaymentFailed';
      case 'PaymentRefunded':
        return 'PaymentRefunded';
      default:
        return eventType;
    }
  }

  private mapEventToPayload(event: any): Record<string, unknown> {
    // Build payload compatible with order-service's payment event consumer
    const base: Record<string, unknown> = {
      paymentId: event.paymentId,
      orderId: event.orderId,
    };

    switch (event.eventType) {
      case 'PaymentCompleted':
        return {
          ...base,
          transactionId: event.transactionId,
          success: true,
          amountInCents: event.amountInCents,
          currency: event.currency,
        };
      case 'PaymentFailed':
        return {
          ...base,
          success: false,
          reason: event.reason,
        };
      case 'PaymentRefunded':
        return {
          ...base,
          amountInCents: event.amountInCents,
          currency: event.currency,
          reason: event.reason,
        };
      default:
        return base;
    }
  }
}
