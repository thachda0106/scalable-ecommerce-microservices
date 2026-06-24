import {
  Injectable,
  Inject,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaClientFactory
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private kafka: Kafka;
  private producer: Producer;

  constructor(@Inject(Logger) private readonly logger: Logger) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';

    this.kafka = new Kafka({
      clientId: 'product-service',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onApplicationBootstrap() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka Producer connected');
    } catch (err) {
      this.logger.error(`Kafka Producer connection failed: ${err}`);
    }
  }

  async onApplicationShutdown() {
    try {
      await this.producer.disconnect();
    } catch {
      // Ignore disconnect errors during shutdown
    }
  }

  getProducer(): Producer {
    return this.producer;
  }
}
