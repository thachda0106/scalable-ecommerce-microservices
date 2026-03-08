import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class PaymentConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly paymentService: PaymentService) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';

    this.kafka = new Kafka({
      clientId: 'payment-service-consumer',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = this.kafka.consumer({
      groupId: 'payment-service-inventory',
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'inventory.events',
      fromBeginning: true,
    });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString());
          await this.handleEvent(event);
        } catch (error) {
          this.logger.error(
            `Error processing message: ${(error as Error).message}`,
          );
        }
      },
    });

    this.logger.log(
      'Kafka Consumer connected and listening to inventory.events',
    );
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleEvent(event: any) {
    const { type, payload } = event;

    if (type === 'InventoryReserved') {
      this.logger.log(
        `Processing payment for reserved inventory order ${payload.orderId}`,
      );
      // Hardcode amount for simplicity. In a real system, the amount should come from the Order or Cart details
      await this.paymentService.processPayment(payload.orderId, 100);
    }
  }
}
