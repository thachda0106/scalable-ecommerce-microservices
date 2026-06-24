import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Kafka, Producer } from 'kafkajs';
import { kafkaConfig } from '../kafka/kafka.config';
import { IDlqPublisher } from '../../domain/ports/dlq-publisher.port';
import { Notification } from '../../domain/entities/notification';

/**
 * Kafka-based Dead Letter Queue publisher.
 * Publishes failed notification payloads to the `notification.dlq` Kafka topic.
 */
@Injectable()
export class KafkaDlqPublisher
  implements IDlqPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(@Inject(Logger) private readonly logger: Logger) {
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.producer.connect();
      this.logger.log('DLQ Kafka producer connected');
    } catch (err) {
      this.logger.warn(`DLQ Kafka producer connect failed: ${err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.producer.disconnect();
    } catch {
      // ignore
    }
  }

  async publish(notification: Notification): Promise<void> {
    try {
      await this.producer.send({
        topic: kafkaConfig.dlq.topic,
        messages: [
          {
            key: notification.id,
            value: JSON.stringify(notification.toJSON()),
          },
        ],
      });
      this.logger.log(
        `Notification ${notification.id} published to ${kafkaConfig.dlq.topic} topic`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish ${notification.id} to DLQ topic: ${err}`,
      );
    }
  }
}
