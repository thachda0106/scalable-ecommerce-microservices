import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Producer } from 'kafkajs';
import { KafkaClientFactory } from './kafka-client.factory';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';

@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxRelayService.name);
  private producer: Producer;

  constructor(
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
    private readonly kafkaFactory: KafkaClientFactory,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.producer = this.kafkaFactory.createProducer();
    await this.producer.connect();
    this.logger.log('Outbox relay Kafka producer connected');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents(): Promise<void> {
    const events = await this.outboxRepo.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    if (events.length === 0) return;

    try {
      const messages = events.map((event) => ({
        key: (event.payload as any).orderId || event.id,
        value: JSON.stringify({
          eventId: event.id,
          type: event.type,
          payload: event.payload,
          timestamp: event.createdAt.toISOString(),
        }),
      }));

      await this.producer.send({
        topic: 'payment.events',
        messages,
      });

      for (const event of events) {
        event.processed = true;
      }
      await this.outboxRepo.save(events);

      this.logger.log(`Relayed ${events.length} payment events to Kafka`);
    } catch (error) {
      this.logger.error(`Failed to relay events: ${(error as Error).message}`);
    }
  }
}
