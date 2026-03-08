import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class NotificationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly notificationService: NotificationService) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';

    this.kafka = new Kafka({
      clientId: 'notification-service-consumer',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = this.kafka.consumer({ groupId: 'notification-service-orders' });
  }

  async onModuleInit() {
    await this.consumer.connect();
    // Listen to order outcome events
    await this.consumer.subscribe({ topic: 'order.events', fromBeginning: true });

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

    this.logger.log('Notification Consumer connected and listening to order.events');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleEvent(event: any) {
    const { type, payload } = event;

    if (type === 'OrderConfirmed') {
      const emailQuery = `user-${payload.userId}@example.com`; // Mock mapping userId to email
      await this.notificationService.sendEmail(
        emailQuery,
        `Receipt for Order ${payload.id}`,
        `Your order for $${payload.totalAmount} has been successfully processed and confirmed. Thank you for shopping with us!`
      );
    } 
    else if (type === 'OrderFailed') {
      const emailQuery = `user-${payload.userId}@example.com`; 
      await this.notificationService.sendEmail(
        emailQuery,
        `Update on Order ${payload.id}`,
        `We're sorry, but your order could not be processed due to a payment or inventory issue. You have not been charged.`
      );
    }
  }
}
