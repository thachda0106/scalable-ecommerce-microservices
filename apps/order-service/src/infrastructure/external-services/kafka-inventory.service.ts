import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Producer } from 'kafkajs';
import { IInventoryService } from '../../application/ports/inventory-service.port';
import { KafkaClientFactory } from '../kafka/kafka-client.factory';
import { publishWithResilience, setCorrelationHeaders } from '@ecommerce/core';

@Injectable()
export class KafkaInventoryService
  implements IInventoryService, OnApplicationBootstrap
{
  private producer: Producer;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly kafkaFactory: KafkaClientFactory,
  ) {}

  async onApplicationBootstrap() {
    this.producer = this.kafkaFactory.createProducer();
    await this.producer.connect();
    this.logger.log('Inventory command producer connected');
  }

  async reserveInventory(
    orderId: string,
    items: { productId: string; quantity: number }[],
  ): Promise<void> {
    await publishWithResilience(this.producer, {
      topic: 'inventory.commands',
      messages: [
        {
          key: orderId,
          value: JSON.stringify({
            type: 'ReserveInventory',
            payload: { orderId, items },
          }),
          headers: setCorrelationHeaders(orderId),
        },
      ],
    });
    this.logger.log(`Sent ReserveInventory command for order ${orderId}`);
  }

  async releaseInventory(orderId: string): Promise<void> {
    await publishWithResilience(this.producer, {
      topic: 'inventory.commands',
      messages: [
        {
          key: orderId,
          value: JSON.stringify({
            type: 'ReleaseInventory',
            payload: { orderId },
          }),
          headers: setCorrelationHeaders(orderId),
        },
      ],
    });
    this.logger.log(`Sent ReleaseInventory command for order ${orderId}`);
  }
}
