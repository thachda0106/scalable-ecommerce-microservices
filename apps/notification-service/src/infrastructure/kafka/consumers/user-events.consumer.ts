import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { kafkaConfig } from '../kafka.config';
import { NotificationOrchestrator } from '../../../application/services/notification-orchestrator.service';

@Injectable()
export class UserEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserEventsConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly orchestrator: NotificationOrchestrator) {
    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
    });
    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig.consumerGroups.userEvents,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: kafkaConfig.topics.userEvents,
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
              `Error processing ${kafkaConfig.topics.userEvents} message: ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        },
      });

      this.logger.log(
        `Consumer connected, listening to ${kafkaConfig.topics.userEvents}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start user-events consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.logger.log('User events consumer disconnected');
    } catch (error) {
      this.logger.warn(
        `Error disconnecting user-events consumer: ${(error as Error).message}`,
      );
    }
  }

  private async handleEvent(event: { type?: string; eventType?: string; payload?: any }) {
    const eventType = event.type || event.eventType;

    switch (eventType) {
      case 'UserRegistered':
      case 'user.registered':
        await this.orchestrator.handleUserRegistered(event.payload || event);
        break;

      default:
        this.logger.debug(`Unhandled user event type: ${eventType}`);
    }
  }
}
