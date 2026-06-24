import { Injectable, OnModuleDestroy, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Kafka, Producer, logLevel } from 'kafkajs';

@Injectable()
export class KafkaClientFactory implements OnModuleDestroy {
  private producer: Producer | null = null;
  private readonly kafka: Kafka;

  constructor(@Inject(Logger) private readonly logger: Logger) {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'user-service',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      logLevel: logLevel.WARN,
    });
  }

  async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    }
    return this.producer;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    }
  }
}
