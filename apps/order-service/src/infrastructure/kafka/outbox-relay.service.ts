import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Producer } from 'kafkajs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEventOrmEntity } from '../persistence/entities/outbox-event.orm-entity';
import { KafkaClientFactory } from './kafka-client.factory';

@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap {
  private producer: Producer;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @InjectRepository(OutboxEventOrmEntity)
    private readonly outboxRepo: Repository<OutboxEventOrmEntity>,
    private readonly kafkaFactory: KafkaClientFactory,
  ) {}

  async onApplicationBootstrap() {
    this.producer = this.kafkaFactory.createProducer();
    await this.producer.connect();
    this.logger.log('Outbox relay Kafka producer connected');
  }

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents() {
    const events = await this.outboxRepo.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 50,
    });

    if (events.length === 0) return;

    try {
      const messages = events.map((event) => ({
        key:
          ((event.payload as Record<string, unknown>).orderId as string) ||
          event.id,
        value: JSON.stringify({
          eventId: event.id,
          type: event.type,
          payload: event.payload,
          timestamp: event.createdAt,
        }),
      }));

      await this.producer.send({
        topic: 'order.events',
        messages,
      });

      for (const event of events) {
        event.processed = true;
      }
      await this.outboxRepo.save(events);

      this.logger.log(`Relayed ${events.length} order events to Kafka`);
    } catch (error) {
      this.logger.error(`Failed to relay events: ${(error as Error).message}`);
    }
  }
}
