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

@Injectable()
export class OrderEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsConsumer.name);
  private consumer: Consumer;

  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    private readonly orchestrator: NotificationOrchestrator,
  ) {
    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig.consumerGroups.orderEvents,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: kafkaConfig.topics.orderEvents,
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
              `Error processing ${kafkaConfig.topics.orderEvents} message: ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        },
      });

      this.logger.log(
        `Consumer connected, listening to ${kafkaConfig.topics.orderEvents}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start order-events consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.logger.log('Order events consumer disconnected');
    } catch (error) {
      this.logger.warn(
        `Error disconnecting order-events consumer: ${(error as Error).message}`,
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
      case 'OrderCreated':
      case 'order.created':
        await this.orchestrator.handleOrderCreated(event.payload || event);
        break;

      case 'OrderConfirmed':
      case 'OrderPaid':
      case 'order.confirmed':
      case 'order.paid':
        await this.orchestrator.handleOrderPaid(event.payload || event);
        break;

      case 'OrderShipped':
      case 'order.shipped':
        await this.orchestrator.handleOrderShipped(event.payload || event);
        break;

      case 'OrderFailed':
      case 'order.failed':
        // No notification for failed orders currently
        this.logger.debug(
          `Order failed event received, skipping notification`,
        );
        break;

      default:
        this.logger.debug(`Unhandled order event type: ${eventType}`);
    }
  }
}
