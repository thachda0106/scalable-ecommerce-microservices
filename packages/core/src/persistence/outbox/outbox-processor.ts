import { getLogger } from '../../observability';
import { DataSource, Repository, LessThan } from 'typeorm';
import { OutboxEventEntity } from './outbox-event.entity';
import { publishWithResilience } from '../../kafka/kafka-resilient';
import { KafkaProducer } from '../../kafka/dlq-producer';

/**
 * Background outbox processor — polls unprocessed events and publishes them to Kafka.
 *
 * Typical usage: run in a NestJS @Cron() or setInterval schedule.
 *
 * @example
 * ```typescript
 * const processor = new OutboxProcessor(dataSource, kafkaProducer, 'order-service');
 * // In a cron job:
 * await processor.processOutbox();
 * ```
 */
export class OutboxProcessor {
  private readonly logger = getLogger('OutboxProcessor');
  private readonly repo: Repository<OutboxEventEntity>;

  constructor(
    dataSource: DataSource,
    private readonly producer: KafkaProducer,
    private readonly outboxTopic: string = 'domain-events',
    private readonly batchSize: number = 50,
  ) {
    this.repo = dataSource.getRepository(OutboxEventEntity);
  }

  /**
   * Polls and publishes unprocessed outbox events.
   * Each event is published individually with resilience (non-blocking + retry).
   * Successfully published events are marked as processed.
   */
  async processOutbox(): Promise<number> {
    const events = await this.repo.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: this.batchSize,
    });

    if (events.length === 0) return 0;

    let published = 0;

    for (const event of events) {
      try {
        await publishWithResilience(this.producer, {
          topic: this.outboxTopic,
          messages: [
            {
              key: event.id,
              value: JSON.stringify(event.payload),
              headers: {
                'x-event-type': event.type,
                'x-event-id': event.id,
              },
            },
          ],
        });

        event.processed = true;
        await this.repo.save(event);
        published++;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Failed to publish outbox event ${event.id}: ${err.message}`);
      }
    }

    this.logger.debug(`Outbox processed: ${published}/${events.length} events published`);
    return published;
  }
}
