import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { ICartEventsProducer } from '../../application/ports/cart-events.port';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';

@Injectable()
export class CartEventsProducer
  implements ICartEventsProducer, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CartEventsProducer.name);
  private readonly kafka: Kafka;
  private producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'cart-service',
      brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
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

  /**
   * Publishes a domain event to Kafka.
   * Key = userId for partition-based ordering.
   * Non-blocking: logs error but DOES NOT throw — domain flow must not be affected by Kafka availability.
   */
  async publish(event: BaseDomainEvent): Promise<void> {
    try {
      const payload = JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.userId,
        occurredOn: event.occurredOn.toISOString(),
        ...event,
      });

      await this.producer.send({
        topic: event.eventType,
        messages: [
          {
            key: event.userId,
            value: payload,
          },
        ],
      });

      this.logger.debug(`Published event: ${event.eventType}`);
    } catch (err) {
      this.logger.warn(`Failed to publish event ${event.eventType}: ${err}`);
      // Non-blocking — do NOT re-throw
    }
  }
}
