import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';
import { IEventPublisher } from '../../domain/ports/event-publisher.port';
import { kafkaConfig } from '../kafka/kafka.config';

/**
 * Publishes notification domain events to Kafka.
 * Non-blocking: errors are logged, not thrown.
 * Follows the same pattern as cart-service CartEventsProducer.
 */
@Injectable()
export class KafkaEventPublisher
  implements IEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(KafkaEventPublisher.name);
  private readonly kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    } catch (err) {
      this.logger.warn(
        `Kafka producer connect failed: ${err}. Events will be silently dropped.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.producer.disconnect();
    } catch {
      // Ignore disconnect errors during shutdown
    }
  }

  async publish(event: BaseDomainEvent): Promise<void> {
    try {
      const payload = JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        occurredOn: event.occurredOn.toISOString(),
        ...event,
      });

      await this.producer.send({
        topic: 'notification.events',
        messages: [{ key: event.eventId, value: payload }],
      });

      this.logger.debug(`Published event: ${event.eventType}`);
    } catch (err) {
      this.logger.warn(`Failed to publish event ${event.eventType}: ${err}`);
      // Non-blocking — do NOT re-throw
    }
  }

  async publishBatch(events: BaseDomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
