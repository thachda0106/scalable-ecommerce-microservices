import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { KAFKA_CLIENT } from '../kafka.module';
import { kafkaConfig } from '../kafka.config';
import { NotificationOrchestrator } from '../../../application/services/notification-orchestrator.service';

/**
 * Kafka consumer for cart.events topic.
 *
 * Note: CartAbandoned event does NOT yet exist in cart-service.
 * This consumer is scaffolded for future use when cart abandonment
 * detection is implemented.
 */
@Injectable()
export class CartEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CartEventsConsumer.name);
  private consumer: Consumer;

  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    private readonly orchestrator: NotificationOrchestrator,
  ) {
    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig.consumerGroups.cartEvents,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: kafkaConfig.topics.cartEvents,
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const event = JSON.parse(message.value.toString());
            await this.handleEvent(event);
          } catch (error) {
            this.logger.error(
              `Error processing ${kafkaConfig.topics.cartEvents} message: ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        },
      });

      this.logger.log(
        `Consumer connected, listening to ${kafkaConfig.topics.cartEvents}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start cart-events consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.logger.log('Cart events consumer disconnected');
    } catch (error) {
      this.logger.warn(
        `Error disconnecting cart-events consumer: ${(error as Error).message}`,
      );
    }
  }

  private async handleEvent(event: {
    type?: string;
    eventType?: string;
    payload?: any;
  }) {
    const eventType = event.type || event.eventType;

    switch (eventType) {
      case 'CartAbandoned':
      case 'cart.abandoned':
        await this.orchestrator.handleCartAbandoned(event.payload || event);
        break;

      default:
        this.logger.debug(`Unhandled cart event type: ${eventType}`);
    }
  }
}
