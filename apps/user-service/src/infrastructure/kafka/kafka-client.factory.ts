import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer, logLevel } from 'kafkajs';

@Injectable()
export class KafkaClientFactory implements OnModuleDestroy {
  private readonly logger = new Logger(KafkaClientFactory.name);
  private producer: Producer | null = null;
  private readonly kafka: Kafka;

  constructor() {
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
