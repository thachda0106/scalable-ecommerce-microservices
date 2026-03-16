import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Producer } from 'kafkajs';
import { IInventoryService } from '../../application/ports/inventory-service.port';
import { KafkaClientFactory } from '../kafka/kafka-client.factory';

@Injectable()
export class KafkaInventoryService
  implements IInventoryService, OnApplicationBootstrap
{
  private readonly logger = new Logger(KafkaInventoryService.name);
  private producer: Producer;

  constructor(private readonly kafkaFactory: KafkaClientFactory) {}

  async onApplicationBootstrap() {
    this.producer = this.kafkaFactory.createProducer();
    await this.producer.connect();
    this.logger.log('Inventory command producer connected');
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
