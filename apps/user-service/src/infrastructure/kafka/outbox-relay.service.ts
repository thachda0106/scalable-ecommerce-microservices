import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';
import { KafkaClientFactory } from './kafka-client.factory';
import { publishWithResilience, setCorrelationHeaders } from '@ecommerce/core';

const MAX_RETRIES = 5;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isProcessing = false;

  constructor(
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
    private readonly kafkaClient: KafkaClientFactory,
  ) {}

  @Cron('*/5 * * * * *')
  async processOutbox(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const events = await this.outboxRepo.find({
        where: { processed: false },
        order: { createdAt: 'ASC' },
        take: 100,
      });

      if (events.length === 0) return;

      // Filter out events that have exceeded max retries (dead letter)
      const processable = events.filter((e) => e.retryCount < MAX_RETRIES);
      const deadLettered = events.filter((e) => e.retryCount >= MAX_RETRIES);

      // Mark dead-lettered events as processed with error
      if (deadLettered.length > 0) {
        const deadLetterIds = deadLettered.map((e) => e.id);
        await this.outboxRepo.update(
          { id: In(deadLetterIds) },
          { processed: true, error: `Exceeded max retries (${MAX_RETRIES})` },
        );
        this.logger.warn(
          `${deadLettered.length} event(s) dead-lettered after ${MAX_RETRIES} retries`,
        );
      }

      if (processable.length === 0) return;

      const producer = await this.kafkaClient.getProducer();

      // Send all events to Kafka
      for (const event of processable) {
        await publishWithResilience(producer, {
          topic: 'user.events',
          messages: [
            {
              key: event.id,
              value: JSON.stringify(event.payload),
              headers: {
                ...setCorrelationHeaders(event.id),
                eventType: event.type,
              },
            },
          ],
        });
      }

      // Bulk mark all as processed in one update
      const processedIds = processable.map((e) => e.id);
      await this.outboxRepo.update(
        { id: In(processedIds) },
        { processed: true },
      );

      this.logger.debug(`Relayed ${processable.length} event(s) to Kafka`);
    } catch (error) {
      this.logger.error('Outbox relay error', (error as Error).stack);

      // Increment retry counts on failure
      try {
        const events = await this.outboxRepo.find({
          where: { processed: false },
          take: 100,
        });
        for (const event of events) {
          event.retryCount += 1;
          event.error = (error as Error).message;
        }
        await this.outboxRepo.save(events);
      } catch (retryError) {
        this.logger.error(
          'Failed to update retry counts',
          (retryError as Error).stack,
        );
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
