import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';

const OUTBOX_STREAM_KEY = 'cart:outbox:stream';
const CONSUMER_GROUP = 'cart-relay';
const CONSUMER_NAME = 'relay-worker-1';

/**
 * Background relay that reads events from the Redis Stream outbox
 * and publishes them to Kafka.
 *
 * Uses Redis consumer groups for:
 *   - At-least-once delivery (ACK after successful Kafka publish)
 *   - Ability to scale relay workers horizontally
 *   - Automatic retry of unacknowledged messages
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly kafka: Kafka;
  private producer: Producer;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    this.kafka = new Kafka({
      clientId: 'cart-service-relay',
      brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    // Create consumer group (ignore error if already exists)
    try {
      await this.redis.xgroup(
        'CREATE',
        OUTBOX_STREAM_KEY,
        CONSUMER_GROUP,
        '0',
        'MKSTREAM',
      );
      this.logger.log('Created outbox consumer group');
    } catch (err: any) {
      if (!err.message?.includes('BUSYGROUP')) {
        this.logger.warn(`Failed to create consumer group: ${err.message}`);
      }
    }

    try {
      await this.producer.connect();
      this.logger.log('Outbox relay Kafka producer connected');
    } catch (err) {
      this.logger.warn(`Kafka connect failed: ${err}. Relay will retry.`);
    }

    this.running = true;
    this.schedulePoll();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    try {
      await this.producer.disconnect();
    } catch {
      // ignore
    }
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.pollAndRelay(), 1000);
  }

  private async pollAndRelay(): Promise<void> {
    try {
      const results = await this.redis.xreadgroup(
        'GROUP',
        CONSUMER_GROUP,
        CONSUMER_NAME,
        'COUNT',
        '10',
        'BLOCK',
        '2000',
        'STREAMS',
        OUTBOX_STREAM_KEY,
        '>',
      );

      if (results && results.length > 0) {
        const [, messages] = results[0] as [string, [string, string[]][]];

        for (const [messageId, fields] of messages) {
          const eventType = fields[1]; // field[0] = 'eventType', field[1] = value
          const payload = fields[3]; // field[2] = 'payload', field[3] = value

          try {
            const parsed = JSON.parse(payload);
            await this.producer.send({
              topic: eventType,
              messages: [
                {
                  key: parsed.userId,
                  value: payload,
                },
              ],
            });

            await this.redis.xack(OUTBOX_STREAM_KEY, CONSUMER_GROUP, messageId);
            this.logger.debug(`Relayed outbox event: ${eventType} [${messageId}]`);
          } catch (err) {
            this.logger.warn(
              `Failed to relay event ${messageId}: ${err}. Will retry on next poll.`,
            );
            // Don't ACK — message will be retried
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Outbox poll error: ${err}`);
    }

    this.schedulePoll();
  }
}
