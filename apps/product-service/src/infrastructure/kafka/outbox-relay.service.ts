import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';
import { KafkaClientFactory } from './kafka-client.factory';

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepository: Repository<OutboxEventOrmEntity>,
    private readonly kafkaClientFactory: KafkaClientFactory,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents() {
    const events = await this.outboxRepository.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    if (events.length === 0) {
      return;
    }

    try {
      const messages = events.map((event) => ({
        key: event.payload?.productId || event.payload?.id || event.id,
        value: JSON.stringify({
          eventId: event.id,
          type: event.type,
          payload: event.payload,
          timestamp: event.createdAt,
        }),
      }));

      await this.kafkaClientFactory.getProducer().send({
        topic: 'product.events',
        messages: messages,
      });

      for (const event of events) {
        event.processed = true;
      }
      await this.outboxRepository.save(events);

      this.logger.log(`Relayed ${events.length} events to Kafka`);
    } catch (error) {
      this.logger.error(`Failed to relay events: ${(error as Error).message}`);
    }
  }
}
