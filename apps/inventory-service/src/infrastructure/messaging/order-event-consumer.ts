import {
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DataSource } from 'typeorm';
import { ConfigType } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import {
  InboxService,
  InboxEventMetadata,
  KafkaDlqProducer,
  getCorrelationId,
} from '@ecommerce/core';
import { ConfirmStockCommand } from '../../application/commands/confirm-stock.command';
import { ReleaseStockCommand } from '../../application/commands/release-stock.command';
import { kafkaConfig } from '../../config/inventory.config';

/**
 * Kafka consumer for order/cart events in the inventory service.
 *
 * Uses the Inbox Pattern from @ecommerce/core for:
 * - Idempotent event processing (deduplication via UNIQUE constraint)
 * - Transactional processing with CAS locking
 * - Automatic retry with exponential backoff
 * - Dead letter queue escalation
 *
 * Replaces the previous manual ProcessedEventOrmEntity-based idempotency.
 */
@Injectable()
export class OrderEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventConsumer.name);
  private readonly inboxService: InboxService;
  private consumer: Consumer;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly dataSource: DataSource,
    @Inject(kafkaConfig.KEY)
    private readonly config: ConfigType<typeof kafkaConfig>,
  ) {
    const kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
    });
    this.consumer = kafka.consumer({
      groupId: this.config.consumerGroupId,
    });

    // Create DLQ producer for failed events
    const dlqKafkaProducer = kafka.producer();
    const dlqProducer = new KafkaDlqProducer(
      { send: (record: any) => dlqKafkaProducer.send(record) },
      'inventory-service',
    );

    this.inboxService = new InboxService(
      this.dataSource,
      dlqProducer,
      'inventory-service',
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['order.events', 'cart.events'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log('Order event consumer started (with Inbox Pattern)');
    } catch (error) {
      this.logger.error(
        `Failed to start consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.logger.log('Order event consumer disconnected');
    } catch (error) {
      this.logger.warn(
        `Error disconnecting consumer: ${(error as Error).message}`,
      );
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString());
      const eventId = this.extractEventId(event, message.headers);
      const eventType = event.type || event.eventType;

      if (!eventId) {
        this.logger.warn('Received event without ID, skipping');
        return;
      }

      const headers = message.headers as Record<string, Buffer | string | undefined>;

      await this.inboxService.handleIncoming({
        eventId,
        eventType,
        aggregateId: event.payload?.orderId || event.payload?.cartId || event.payload?.referenceId,
        payload: event,
        topic,
        headers,
        source: 'order-service',
        handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
          await this.processEvent(data, meta);
        },
      });
    } catch (error) {
      this.logger.error(
        `Error processing message: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async processEvent(
    event: Record<string, unknown>,
    meta: InboxEventMetadata,
  ): Promise<void> {
    const eventType = meta.eventType;
    const eventPayload = (event as any).payload || event;

    switch (eventType) {
      case 'OrderConfirmed':
      case 'order.confirmed':
        await this.commandBus.execute(
          new ConfirmStockCommand(
            eventPayload.orderId || eventPayload.referenceId,
            'ORDER',
            `confirm-${meta.eventId}`,
            meta.correlationId,
          ),
        );
        break;

      case 'OrderFailed':
      case 'OrderCancelled':
      case 'order.failed':
      case 'order.cancelled':
        await this.commandBus.execute(
          new ReleaseStockCommand(
            eventPayload.orderId || eventPayload.referenceId,
            'ORDER',
            undefined,
            `release-order-${meta.eventId}`,
            'order_failed',
            meta.correlationId,
          ),
        );
        break;

      case 'CartExpired':
      case 'cart.expired':
        await this.commandBus.execute(
          new ReleaseStockCommand(
            eventPayload.cartId || eventPayload.referenceId,
            'CART',
            undefined,
            `release-cart-${meta.eventId}`,
            'cart_expired',
            meta.correlationId,
          ),
        );
        break;

      default:
        this.logger.debug(`Unhandled event type: ${eventType}`);
    }
  }

  private extractEventId(
    event: any,
    headers?: Record<string, Buffer | string | undefined>,
  ): string | undefined {
    // Prefer x-event-id from Kafka headers (set by OutboxProcessor)
    if (headers?.['x-event-id']) {
      const raw = headers['x-event-id'];
      return Buffer.isBuffer(raw) ? raw.toString('utf-8') : (raw as string);
    }
    return event.id || event.eventId || event.payload?.idempotencyKey;
  }
}
