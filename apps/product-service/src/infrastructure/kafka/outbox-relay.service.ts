import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';
import { KafkaClientFactory } from './kafka-client.factory';
import { publishWithResilience, setCorrelationHeaders } from '@ecommerce/core';

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly batchSize: number;

  constructor(
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepository: Repository<OutboxEventOrmEntity>,
    private readonly kafkaClientFactory: KafkaClientFactory,
  ) {
    this.batchSize = parseInt(process.env.OUTBOX_BATCH_SIZE || '50', 10);
  }

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents() {
    const events = await this.outboxRepository.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: this.batchSize,
    });

    if (events.length === 0) {
      return;
    }

    const producer = this.kafkaClientFactory.getProducer();

    for (const event of events) {
      try {
        const correlationId =
          event.payload?.productId || event.payload?.id || event.id;
        await publishWithResilience(producer, {
          topic: 'product.events',
          messages: [
            {
              key: correlationId,
              value: JSON.stringify({
                eventId: event.id,
                type: event.type,
                payload: event.payload,
                timestamp: event.createdAt,
              }),
              headers: setCorrelationHeaders(correlationId),
            },
          ],
        });

        // Mark as processed immediately after successful Kafka send
        event.processed = true;
        await this.outboxRepository.save(event);
      } catch (error) {
        this.logger.error(
          `Failed to relay event ${event.id}: ${(error as Error).message}`,
        );
        // Stop processing remaining events to preserve ordering
        break;
      }
    }

    const processedCount = events.filter((e) => e.processed).length;
    if (processedCount > 0) {
      this.logger.log(`Relayed ${processedCount} events to Kafka`);
    }
  }
}
