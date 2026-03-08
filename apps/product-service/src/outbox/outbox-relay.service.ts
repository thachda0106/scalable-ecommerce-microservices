import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Kafka, Producer } from 'kafkajs';
import { OutboxEvent } from './entities/outbox-event.entity';

@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private kafka: Kafka;
  private producer: Producer;

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
  ) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';
    
    this.kafka = new Kafka({
      clientId: 'product-service-relay',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onApplicationBootstrap() {
    await this.producer.connect();
    this.logger.log('Kafka Producer connected');
  }

  async onApplicationShutdown() {
    await this.producer.disconnect();
  }

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents() {
    // Find un-processed events
    const events = await this.outboxRepository.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: 50, // Batch size
    });

    if (events.length === 0) {
      return;
    }

    try {
      const messages = events.map(event => ({
        key: event.payload.id || event.id, // Partition key
        value: JSON.stringify({
          eventId: event.id,
          type: event.type,
          payload: event.payload,
          timestamp: event.createdAt,
        }),
      }));

      await this.producer.send({
        topic: 'product.events',
        messages: messages,
      });

      // Mark as processed
      for (const event of events) {
        event.processed = true;
      }
      await this.outboxRepository.save(events);
      
      this.logger.log(`Relayed ${events.length} events to Kafka`);
    } catch (error) {
      this.logger.error(`Failed to relay events: ${error.message}`);
    }
  }
}
