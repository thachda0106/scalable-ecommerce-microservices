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
  private consecutiveFailures = 0;

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
        headers: {
          'x-correlation-id': (event.payload as any).orderId || event.id,
          'x-event-type': event.type,
        },
      }));

      // Send to Kafka — only mark processed after successful ack
      await this.producer.send({
        topic: 'payment.events',
        messages,
      });

      // Kafka send succeeded — now mark events as processed
      const eventIds = events.map((e) => e.id);
      await this.outboxRepo
        .createQueryBuilder()
        .update(OutboxEventOrmEntity)
        .set({ processed: true })
        .whereInIds(eventIds)
        .execute();

      this.consecutiveFailures = 0;
      this.logger.log(`Relayed ${events.length} payment events to Kafka`);
    } catch (error) {
      this.consecutiveFailures++;
      this.logger.error(
        `Failed to relay events (attempt ${this.consecutiveFailures}): ${(error as Error).message}`,
      );
      if (this.consecutiveFailures >= 10) {
        this.logger.warn(
          'Outbox relay has failed 10+ consecutive times — check Kafka connectivity',
        );
      }
      // Events remain unprocessed and will be retried on next cron tick
    }
  }
}

