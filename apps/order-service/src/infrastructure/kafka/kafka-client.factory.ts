import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Kafka, Producer, Consumer, ConsumerConfig } from 'kafkajs';

/**
 * Shared Kafka client factory — creates a single Kafka instance
 * and reuses it for all producers and consumers in the service.
 */
@Injectable()
export class KafkaClientFactory implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaClientFactory.name);
  private readonly kafka: Kafka;
  private readonly producers: Producer[] = [];
  private readonly consumers: Consumer[] = [];

  constructor() {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';
    this.kafka = new Kafka({
      clientId: 'order-service',
      brokers: KAFKA_BROKERS.split(','),
    });
  }

  async onApplicationBootstrap() {
    this.logger.log('Kafka client factory initialized');
  }

  async onApplicationShutdown() {
    for (const producer of this.producers) {
      try {
        await producer.disconnect();
      } catch (error) {
        this.logger.warn(`Error disconnecting producer: ${(error as Error).message}`);
      }
    }
    for (const consumer of this.consumers) {
      try {
        await consumer.disconnect();
      } catch (error) {
        this.logger.warn(`Error disconnecting consumer: ${(error as Error).message}`);
      }
    }
    this.logger.log('All Kafka connections closed');
  }

  createProducer(): Producer {
    const producer = this.kafka.producer();
    this.producers.push(producer);
    return producer;
  }

  createConsumer(config: ConsumerConfig): Consumer {
    const consumer = this.kafka.consumer(config);
    this.consumers.push(consumer);
    return consumer;
  }
}
