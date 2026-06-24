import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Kafka, Consumer } from 'kafkajs';
import { DataSource } from 'typeorm';
import {
  InboxService,
  InboxEventMetadata,
  KafkaDlqProducer,
} from '@ecommerce/core';
import { KAFKA_CLIENT } from '../kafka.module';
import { kafkaConfig } from '../kafka.config';
import { NotificationOrchestrator } from '../../../application/services/notification-orchestrator.service';

/**
 * Kafka consumer for user events in notification-service.
 * Uses Inbox Pattern for idempotent event processing.
 */
@Injectable()
export class UserEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly inboxService: InboxService;
  private consumer: Consumer;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly dataSource: DataSource,
  ) {
    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig.consumerGroups.userEvents,
    });

    const dlqProducer = new KafkaDlqProducer(
      { send: (record: any) => this.kafka.producer().send(record) },
      'notification-service',
    );
    this.inboxService = new InboxService(this.dataSource, dlqProducer, 'notification-service');
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
            const eventId = this.extractEventId(event, message.headers);
            const eventType = event.type || event.eventType;

            if (!eventId) {
              this.logger.warn('User event without ID, skipping');
              return;
            }

            await this.inboxService.handleIncoming({
              eventId,
              eventType,
              aggregateId: event.payload?.userId,
              payload: event,
              topic: kafkaConfig.topics.userEvents,
              headers: message.headers as Record<string, Buffer | string | undefined>,
              source: 'user-service',
              handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
                await this.processEvent(data, meta);
              },
            });
          } catch (error) {
            this.logger.error(
              `Error processing ${kafkaConfig.topics.userEvents} message: ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        },
      });

      this.logger.log(
        `Consumer connected (with Inbox Pattern), listening to ${kafkaConfig.topics.userEvents}`,
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

  private async processEvent(event: Record<string, unknown>, meta: InboxEventMetadata) {
    const eventPayload = (event as any).payload || event;

    switch (meta.eventType) {
      case 'UserRegistered':
      case 'user.registered':
        await this.orchestrator.handleUserRegistered(eventPayload);
        break;

      default:
        this.logger.debug(`Unhandled user event type: ${meta.eventType}`);
    }
  }

  private extractEventId(
    event: any,
    headers?: Record<string, Buffer | string | undefined>,
  ): string | undefined {
    if (headers?.['x-event-id']) {
      const raw = headers['x-event-id'];
      return Buffer.isBuffer(raw) ? raw.toString('utf-8') : (raw as string);
    }
    return event.id || event.eventId;
  }
}
