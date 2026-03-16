import { Injectable } from '@nestjs/common';
import { Kafka, Producer, Consumer, ConsumerConfig } from 'kafkajs';

@Injectable()
export class KafkaClientFactory {
  private readonly kafka: Kafka;

  constructor() {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:29092').split(',');
    this.kafka = new Kafka({
      clientId: 'payment-service',
      brokers,
    });
  }

  createProducer(): Producer {
    return this.kafka.producer();
  }

  createConsumer(config: ConsumerConfig): Consumer {
    return this.kafka.consumer(config);
  }
}
