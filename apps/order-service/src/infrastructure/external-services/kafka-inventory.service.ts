import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { IInventoryService } from '../../application/ports/inventory-service.port';

@Injectable()
export class KafkaInventoryService
  implements IInventoryService, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(KafkaInventoryService.name);
  private producer: Producer;

  constructor() {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';
    const kafka = new Kafka({
      clientId: 'order-service-inventory-cmd',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.producer = kafka.producer();
  }

  async onApplicationBootstrap() {
    await this.producer.connect();
    this.logger.log('Inventory command producer connected');
  }

  async onApplicationShutdown() {
    await this.producer.disconnect();
  }

  async reserveInventory(
    orderId: string,
    items: { productId: string; quantity: number }[],
  ): Promise<void> {
    await this.producer.send({
      topic: 'inventory.commands',
      messages: [
        {
          key: orderId,
          value: JSON.stringify({
            type: 'ReserveInventory',
            payload: { orderId, items },
          }),
        },
      ],
    });
    this.logger.log(`Sent ReserveInventory command for order ${orderId}`);
  }

  async releaseInventory(orderId: string): Promise<void> {
    await this.producer.send({
      topic: 'inventory.commands',
      messages: [
        {
          key: orderId,
          value: JSON.stringify({
            type: 'ReleaseInventory',
            payload: { orderId },
          }),
        },
      ],
    });
    this.logger.log(`Sent ReleaseInventory command for order ${orderId}`);
  }
}
