import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';
import { KafkaClientFactory } from './kafka-client.factory';

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

      const producer = await this.kafkaClient.getProducer();

      for (const event of events) {
        await producer.send({
          topic: 'user.events',
          messages: [
            {
              key: event.id,
              value: JSON.stringify(event.payload),
              headers: { eventType: event.type },
            },
          ],
        });

        event.processed = true;
        await this.outboxRepo.save(event);
      }

      this.logger.debug(`Relayed ${events.length} event(s) to Kafka`);
    } catch (error) {
      this.logger.error('Outbox relay error', (error as Error).stack);
    } finally {
      this.isProcessing = false;
    }
  }
}
