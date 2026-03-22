import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Consumer, EachMessagePayload } from 'kafkajs';
import {
  InboxService,
  InboxEventMetadata,
  KafkaDlqProducer,
} from '@ecommerce/core';
import { CancelOrderHandler } from '../../../application/handlers/cancel-order.handler';
import { CancelOrderCommand } from '../../../application/commands/cancel-order.command';
import { CheckoutSagaOrchestrator } from '../saga/checkout-saga.orchestrator';
import { KafkaClientFactory } from '../kafka-client.factory';

/**
 * Kafka consumer for inventory events in the order service.
 *
 * Uses the Inbox Pattern for idempotent event processing.
 * Handles: InventoryReserved, InventoryReservationFailed.
 */
@Injectable()
export class InventoryEventConsumer implements OnModuleInit {
  private readonly logger = new Logger(InventoryEventConsumer.name);
  private readonly inboxService: InboxService;
  private consumer: Consumer;

  constructor(
    private readonly cancelOrderHandler: CancelOrderHandler,
    private readonly sagaOrchestrator: CheckoutSagaOrchestrator,
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
        groupId: 'order-service-inventory',
      });
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['inventory.events'],
        fromBeginning: false,
      });

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.logger.log('Inventory event consumer started (with Inbox Pattern)');
    } catch (error) {
      this.logger.error(
        `Failed to start inventory consumer: ${(error as Error).message}`,
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
        this.logger.warn('Received inventory event without ID, skipping');
        return;
      }

      const headers = message.headers as Record<string, Buffer | string | undefined>;

      await this.inboxService.handleIncoming({
        eventId,
        eventType,
        aggregateId: event.payload?.orderId || event.payload?.referenceId,
        payload: event,
        topic,
        headers,
        source: 'inventory-service',
        handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
          await this.processEvent(data, meta);
        },
      });
    } catch (error) {
      this.logger.error(
        `Error processing inventory message: ${(error as Error).message}`,
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
      case 'InventoryReserved':
      case 'stock.reserved':
        await this.sagaOrchestrator.onInventoryReserved(
          eventPayload.orderId || eventPayload.referenceId,
        );
        break;

      case 'InventoryReservationFailed':
      case 'stock.reservation.failed':
        await this.cancelOrderHandler.execute(
          new CancelOrderCommand(
            eventPayload.orderId || eventPayload.referenceId,
            'Inventory reservation failed',
          ),
        );
        break;

      default:
        this.logger.debug(`Unhandled inventory event type: ${meta.eventType}`);
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
