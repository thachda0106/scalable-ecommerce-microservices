import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { DataSource } from 'typeorm';
import { Consumer, EachMessagePayload } from 'kafkajs';
import {
  InboxService,
  InboxEventMetadata,
  KafkaDlqProducer,
} from '@ecommerce/core';
import { KafkaClientFactory } from '../kafka-client.factory';
import { ProcessPaymentHandler } from '../../../application/handlers/process-payment.handler';
import { ProcessPaymentCommand } from '../../../application/commands/process-payment.command';

/**
 * Kafka consumer for payment commands.
 *
 * Uses the Inbox Pattern for idempotent command processing.
 * Handles: ProcessPayment.
 *
 * Replaces the previous manual ProcessedEventOrmEntity + in-memory retry map.
 */
@Injectable()
export class PaymentCommandConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly inboxService: InboxService;
  private consumer: Consumer;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly kafkaFactory: KafkaClientFactory,
    private readonly processPaymentHandler: ProcessPaymentHandler,
    private readonly dataSource: DataSource,
  ) {
    const dlqProducer = new KafkaDlqProducer(
      { send: (record: any) => this.kafkaFactory.createProducer().send(record) },
      'payment-service',
    );
    this.inboxService = new InboxService(this.dataSource, dlqProducer, 'payment-service');
  }

  async onModuleInit(): Promise<void> {
    try {
      this.consumer = this.kafkaFactory.createConsumer({
        groupId: 'payment-service-commands',
      });

      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['payment.commands'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log(
        'Payment command consumer started (with Inbox Pattern) — listening on payment.commands',
      );
    } catch (error) {
      this.logger.error(
        `Failed to start payment command consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString());
      const eventId = this.extractEventId(event, message.headers);
      const eventType = event.type;

      if (!eventId) {
        this.logger.warn('Received payment command without ID, skipping');
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
        source: 'order-service',
        handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
          await this.processCommand(data, meta);
        },
      });
    } catch (error) {
      this.logger.error(
        `Error processing payment command: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async processCommand(
    event: Record<string, unknown>,
    meta: InboxEventMetadata,
  ): Promise<void> {
    const eventPayload = (event as any).payload || event;

    switch (meta.eventType) {
      case 'ProcessPayment': {
        const { orderId, amountInCents, currency, userId } = eventPayload;
        await this.processPaymentHandler.execute(
          new ProcessPaymentCommand(
            orderId,
            userId,
            amountInCents,
            currency,
            undefined, // provider — use default
            orderId,   // idempotencyKey — use orderId for dedup
          ),
        );
        break;
      }

      default:
        this.logger.debug(`Unhandled command type: ${meta.eventType}`);
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
    return event.eventId || event.id || `${event.type}_${event.payload?.orderId}`;
  }
}
