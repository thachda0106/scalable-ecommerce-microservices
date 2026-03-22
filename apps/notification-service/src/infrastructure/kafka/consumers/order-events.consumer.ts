import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
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
 * Kafka consumer for order events in notification-service.
 * Uses Inbox Pattern for idempotent event processing.
 */
@Injectable()
export class OrderEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventsConsumer.name);
  private readonly inboxService: InboxService;
  private consumer: Consumer;

  constructor(
    @Inject(KAFKA_CLIENT) private readonly kafka: Kafka,
    private readonly orchestrator: NotificationOrchestrator,
    private readonly dataSource: DataSource,
  ) {
    this.consumer = this.kafka.consumer({
      groupId: kafkaConfig.consumerGroups.orderEvents,
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
        topic: kafkaConfig.topics.orderEvents,
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
              this.logger.warn('Order event without ID, skipping');
              return;
            }

            await this.inboxService.handleIncoming({
              eventId,
              eventType,
              aggregateId: event.payload?.orderId,
              payload: event,
              topic: kafkaConfig.topics.orderEvents,
              headers: message.headers as Record<string, Buffer | string | undefined>,
              source: 'order-service',
              handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
                await this.processEvent(data, meta);
              },
            });
          } catch (error) {
            this.logger.error(
              `Error processing ${kafkaConfig.topics.orderEvents} message: ${(error as Error).message}`,
              (error as Error).stack,
            );
          }
        },
      });

      this.logger.log(
        `Consumer connected (with Inbox Pattern), listening to ${kafkaConfig.topics.orderEvents}`,
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

  private async processEvent(event: Record<string, unknown>, meta: InboxEventMetadata) {
    const eventPayload = (event as any).payload || event;

    switch (meta.eventType) {
      case 'OrderCreated':
      case 'order.created':
        await this.orchestrator.handleOrderCreated(eventPayload);
        break;

      case 'OrderConfirmed':
      case 'OrderPaid':
      case 'order.confirmed':
      case 'order.paid':
        await this.orchestrator.handleOrderPaid(eventPayload);
        break;

      case 'OrderShipped':
      case 'order.shipped':
        await this.orchestrator.handleOrderShipped(eventPayload);
        break;

      case 'OrderFailed':
      case 'order.failed':
        this.logger.debug(`Order failed event received, skipping notification`);
        break;

      default:
        this.logger.debug(`Unhandled order event type: ${meta.eventType}`);
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
