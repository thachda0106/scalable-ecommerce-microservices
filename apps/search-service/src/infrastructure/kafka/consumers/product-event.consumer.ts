import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { Kafka, Consumer } from 'kafkajs';
import { DataSource } from 'typeorm';
import {
  InboxService,
  InboxEventMetadata,
  KafkaDlqProducer,
  Logger,
} from '@ecommerce/core';
import { createKafkaConfig } from '../kafka.config';
import { IndexProductCommand } from '../../../application/commands/index-product.command';
import { RemoveProductCommand } from '../../../application/commands/remove-product.command';

/**
 * Kafka consumer for product events in search-service.
 *
 * Uses the Inbox Pattern for idempotent event processing.
 * Handles: ProductCreated, ProductUpdated, ProductDeleted.
 *
 * Replaces the previous in-memory retry map with persistent inbox dedup.
 */
@Injectable()
export class ProductEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly inboxService: InboxService;
  private consumer: Consumer;
  private readonly fromBeginning: boolean;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly commandBus: CommandBus,
    private readonly dataSource: DataSource,
  ) {
    const config = createKafkaConfig(this.configService);
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
    this.consumer = kafka.consumer({ groupId: config.groupId });
    this.fromBeginning =
      this.configService.get<string>('KAFKA_FROM_BEGINNING', 'false') ===
      'true';

    const dlqProducer = new KafkaDlqProducer(
      { send: (record: any) => kafka.producer().send(record) },
      'search-service',
    );
    this.inboxService = new InboxService(this.dataSource, dlqProducer, 'search-service');
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: 'product.events',
        fromBeginning: this.fromBeginning,
      });

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;

          try {
            const event = JSON.parse(message.value.toString());
            const eventId = this.extractEventId(event, message.headers);
            const eventType = event.type ?? event.eventType ?? '';

            if (!eventId) {
              this.logger.warn('Product event without ID, skipping');
              return;
            }

            await this.inboxService.handleIncoming({
              eventId,
              eventType,
              aggregateId: (event.payload ?? event.data ?? event)?.id,
              payload: event,
              topic: 'product.events',
              headers: message.headers as Record<string, Buffer | string | undefined>,
              source: 'product-service',
              handler: async (data: Record<string, unknown>, meta: InboxEventMetadata) => {
                await this.processEvent(data, meta);
              },
            });
          } catch (error: any) {
            this.logger.error(
              `Error processing product event: ${error.message}`,
              error.stack,
            );
          }
        },
      });

      this.logger.log(
        `Kafka consumer connected (with Inbox Pattern), listening to product.events (fromBeginning: ${this.fromBeginning})`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to connect Kafka consumer: ${error.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async processEvent(
    event: Record<string, unknown>,
    meta: InboxEventMetadata,
  ): Promise<void> {
    const payload = (event as any).payload ?? (event as any).data ?? event;

    switch (meta.eventType) {
      case 'ProductCreated':
      case 'product.created':
      case 'ProductUpdated':
      case 'product.updated':
        await this.commandBus.execute(
          new IndexProductCommand(
            payload.id,
            payload.name,
            payload.description ?? '',
            payload.price,
            payload.status ?? 'ACTIVE',
            payload.categoryId,
            payload.attributes,
          ),
        );
        this.logger.log(
          `Dispatched IndexProductCommand for product ${payload.id} (${meta.eventType})`,
        );
        break;

      case 'ProductDeleted':
      case 'product.deleted':
        await this.commandBus.execute(new RemoveProductCommand(payload.id));
        this.logger.log(
          `Dispatched RemoveProductCommand for product ${payload.id}`,
        );
        break;

      default:
        this.logger.warn(`Unknown event type: ${meta.eventType}`);
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
