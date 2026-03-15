import {
  Injectable,
  Logger,
  Inject,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigType } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';
import { kafkaConfig } from '../../config/inventory.config';

@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxRelayService.name);
  private producer: Producer;
  private isReady = false;

  constructor(
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
    @Inject(kafkaConfig.KEY)
    private readonly config: ConfigType<typeof kafkaConfig>,
  ) {
    const kafka = new Kafka({
      clientId: `${this.config.clientId}-relay`,
      brokers: this.config.brokers,
    });
    this.producer = kafka.producer();
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.producer.connect();
      this.isReady = true;
      this.logger.log('Outbox relay Kafka producer connected');
    } catch (error) {
      this.logger.error(
        `Failed to connect Kafka producer: ${(error as Error).message}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.logger.log('Outbox relay Kafka producer disconnected');
    } catch (error) {
      this.logger.warn(
        `Error disconnecting Kafka producer: ${(error as Error).message}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents(): Promise<void> {
    if (!this.isReady) return;

    try {
      // Fetch unprocessed events
      const events = await this.outboxRepo.find({
        where: { processed: false },
        order: { createdAt: 'ASC' },
        take: 50,
      });

      if (events.length === 0) return;

      // Build Kafka messages
      const messages = events.map((event) => ({
        key: (event.payload as Record<string, string>).productId || event.id,
        value: JSON.stringify({
          id: event.id,
          type: event.type,
          payload: event.payload,
          createdAt: event.createdAt.toISOString(),
        }),
      }));

      // Send to Kafka
      await this.producer.send({
        topic: 'inventory.events',
        messages,
      });

      // Mark as processed
      const ids = events.map((e) => e.id);
      await this.outboxRepo
        .createQueryBuilder()
        .update()
        .set({ processed: true })
        .whereInIds(ids)
        .execute();

      this.logger.debug(`Relayed ${events.length} events to Kafka`);
    } catch (error) {
      this.logger.error(
        `Outbox relay failed: ${(error as Error).message}`,
      );
    }
  }
}
