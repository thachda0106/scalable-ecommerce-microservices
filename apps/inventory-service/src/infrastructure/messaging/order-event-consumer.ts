import {
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigType } from '@nestjs/config';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ProcessedEventOrmEntity } from '../persistence/entities/processed-event.orm-entity';
import { ConfirmStockCommand } from '../../application/commands/confirm-stock.command';
import { ReleaseStockCommand } from '../../application/commands/release-stock.command';
import { kafkaConfig } from '../../config/inventory.config';

@Injectable()
export class OrderEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderEventConsumer.name);
  private consumer: Consumer;

  constructor(
    private readonly commandBus: CommandBus,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
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

      this.logger.log('Order event consumer started');
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
    const { message } = payload;
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString());
      const eventId = event.id || event.payload?.idempotencyKey;

      if (!eventId) {
        this.logger.warn('Received event without ID, skipping');
        return;
      }

      // Idempotency check
      const alreadyProcessed = await this.processedRepo.findOneBy({
        eventId,
      });
      if (alreadyProcessed) {
        this.logger.debug(`Event ${eventId} already processed, skipping`);
        return;
      }

      const eventType = event.type || event.eventType;

      switch (eventType) {
        case 'OrderConfirmed':
        case 'order.confirmed':
          await this.commandBus.execute(
            new ConfirmStockCommand(
              event.payload.orderId || event.payload.referenceId,
              'ORDER',
              `confirm-${eventId}`,
              event.payload.correlationId,
            ),
          );
          break;

        case 'OrderFailed':
        case 'OrderCancelled':
        case 'order.failed':
        case 'order.cancelled':
          await this.commandBus.execute(
            new ReleaseStockCommand(
              event.payload.orderId || event.payload.referenceId,
              'ORDER',
              undefined,
              `release-order-${eventId}`,
              'order_failed',
              event.payload.correlationId,
            ),
          );
          break;

        case 'CartExpired':
        case 'cart.expired':
          await this.commandBus.execute(
            new ReleaseStockCommand(
              event.payload.cartId || event.payload.referenceId,
              'CART',
              undefined,
              `release-cart-${eventId}`,
              'cart_expired',
              event.payload.correlationId,
            ),
          );
          break;

        default:
          this.logger.debug(`Unhandled event type: ${eventType}`);
          return;
      }

      // Mark as processed
      const processed = new ProcessedEventOrmEntity();
      processed.eventId = eventId;
      await this.processedRepo.save(processed);

      this.logger.log(`Processed ${eventType} event: ${eventId}`);
    } catch (error) {
      this.logger.error(
        `Error processing message: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // DO NOT re-throw — prevents consumer crash loop
    }
  }
}
