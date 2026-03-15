import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ICartOutbox } from '../../application/ports/cart-outbox.port';
import { BaseDomainEvent } from '../../domain/events/base-domain.event';

const OUTBOX_STREAM_KEY = 'cart:outbox:stream';

/**
 * Redis Stream-backed outbox.
 *
 * Events are appended to a Redis Stream using XADD.
 * The OutboxRelayService reads from this stream and publishes to Kafka.
 * This guarantees at-least-once delivery even if Kafka is temporarily down.
 */
@Injectable()
export class RedisOutboxRepository implements ICartOutbox {
  private readonly logger = new Logger(RedisOutboxRepository.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async append(events: BaseDomainEvent[]): Promise<void> {
    if (events.length === 0) return;

    const pipeline = this.redis.pipeline();
    for (const event of events) {
      const payload = JSON.stringify({
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.userId,
        occurredOn: event.occurredOn.toISOString(),
        ...event,
      });

      pipeline.xadd(OUTBOX_STREAM_KEY, '*', 'eventType', event.eventType, 'payload', payload);
    }

    try {
      await pipeline.exec();
      this.logger.debug(`Appended ${events.length} event(s) to outbox stream`);
    } catch (err) {
      this.logger.error(`Failed to append events to outbox: ${err}`);
      throw err; // Let the handler decide how to handle outbox failures
    }
  }
}
