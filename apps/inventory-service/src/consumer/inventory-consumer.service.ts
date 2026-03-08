import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class InventoryConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly inventoryService: InventoryService) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';

    this.kafka = new Kafka({
      clientId: 'inventory-service-consumer',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = this.kafka.consumer({
      groupId: 'inventory-service-orders',
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'order.events',
      fromBeginning: true,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString());
          await this.handleEvent(event);
        } catch (error) {
          this.logger.error(`Error processing message: ${error.message}`);
        }
      },
    });

    this.logger.log('Kafka Consumer connected and listening to order.events');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleEvent(event: any) {
    const { type, payload } = event;

    if (type === 'OrderCreated') {
      // payload represents the Order object. We need to reserve stock.
      // Hardcode an item lookup for simulation as our simplistic order payload lacks items
      // In reality, an order should contain order lines with product IDs.
      this.logger.log(`Attempting reservation for order ${payload.id}`);
      await this.inventoryService.reserveStock(payload.id, [
        { productId: 'FAKE_PRODUCT', quantity: 1 },
      ]);
    } else if (type === 'OrderFailed') {
      this.logger.log(`Attempting compensation for order ${payload.id}`);
      await this.inventoryService.compensateReservation(
        payload.id,
        'FAKE_PRODUCT',
        1,
      );
    }
  }
}
