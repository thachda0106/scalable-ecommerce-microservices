import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { DataSource } from 'typeorm';
import { Consumer, EachMessagePayload } from 'kafkajs';
import {
  InboxService,
  InboxEventMetadata,
  KafkaDlqProducer,
} from '@ecommerce/core';
import { ConfirmPaymentHandler } from '../../../application/handlers/confirm-payment.handler';
import { CancelOrderHandler } from '../../../application/handlers/cancel-order.handler';
import { ConfirmPaymentCommand } from '../../../application/commands/confirm-payment.command';
import { CancelOrderCommand } from '../../../application/commands/cancel-order.command';
import { KafkaClientFactory } from '../kafka-client.factory';

/**
 * Kafka consumer for payment events in the order service.
 *
 * Uses the Inbox Pattern for idempotent event processing.
 * Handles: PaymentProcessed, PaymentFailed.
 */
@Injectable()
export class PaymentEventConsumer implements OnModuleInit {
  private readonly inboxService: InboxService;
  private consumer: Consumer;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly confirmPaymentHandler: ConfirmPaymentHandler,
    private readonly cancelOrderHandler: CancelOrderHandler,
    private readonly kafkaFactory: KafkaClientFactory,
    private readonly dataSource: DataSource,
  ) {
    const dlqProducer = new KafkaDlqProducer(
      { send: (record: any) => this.kafkaFactory.createProducer().send(record) },
      'order-service',
    );
    this.inboxService = new InboxService(this.dataSource, dlqProducer, 'order-service');
  }

  async onModuleInit(): Promise<void> {
    try {
      this.consumer = this.kafkaFactory.createConsumer({
        groupId: 'order-service-payment',
      });
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['payment.events'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log('Payment event consumer started (with Inbox Pattern)');
    } catch (error) {
      this.logger.error(
        `Failed to start payment consumer: ${(error as Error).message}`,
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
        this.logger.warn('Received payment event without ID, skipping');
        return;
      }

      const headers = message.headers as Record<string, Buffer | string | undefined>;

      await this.inboxService.handleIncoming({
        eventId,
        eventType,
        aggregateId: event.payload?.orderId,
        payload: event,
        topic,
        headers,
        source: 'payment-service',
        handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
          await this.processEvent(data, meta);
        },
      });
    } catch (error) {
      this.logger.error(
        `Error processing payment message: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async processEvent(
    event: Record<string, unknown>,
    meta: InboxEventMetadata,
  ): Promise<void> {
    const eventPayload = (event as any).payload || event;

    switch (meta.eventType) {
      case 'PaymentProcessed':
      case 'payment.completed':
        await this.confirmPaymentHandler.execute(
          new ConfirmPaymentCommand(
            eventPayload.orderId,
            eventPayload.paymentId || meta.eventId,
          ),
        );
        break;

      case 'PaymentFailed':
      case 'payment.failed':
        await this.cancelOrderHandler.execute(
          new CancelOrderCommand(eventPayload.orderId, 'Payment failed'),
        );
        break;

      default:
        this.logger.debug(`Unhandled payment event type: ${meta.eventType}`);
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
    return event.eventId || event.id;
  }
}
