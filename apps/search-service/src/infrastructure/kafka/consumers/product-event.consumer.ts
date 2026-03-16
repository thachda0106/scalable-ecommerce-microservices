import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { Kafka, Consumer } from 'kafkajs';
import { createKafkaConfig } from '../kafka.config';
import { IndexProductCommand } from '../../../application/commands/index-product.command';
import { RemoveProductCommand } from '../../../application/commands/remove-product.command';

const MAX_RETRY_MAP_SIZE = 10000;

@Injectable()
export class ProductEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProductEventConsumer.name);
  private consumer: Consumer;
  private readonly retryCountMap = new Map<string, number>();
  private readonly MAX_RETRIES = 3;
  private readonly fromBeginning: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandBus: CommandBus,
  ) {
    const config = createKafkaConfig(this.configService);
    const kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
    });
    this.consumer = kafka.consumer({ groupId: config.groupId });
    this.fromBeginning =
      this.configService.get<string>('KAFKA_FROM_BEGINNING', 'false') === 'true';
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

          const messageKey = `${message.offset}-${message.timestamp}`;
          try {
            const event = JSON.parse(message.value.toString());
            await this.handleEvent(event);
            this.retryCountMap.delete(messageKey);
          } catch (error: any) {
            const retries = (this.retryCountMap.get(messageKey) ?? 0) + 1;
            this.retryCountMap.set(messageKey, retries);

            // Prevent unbounded memory growth
            if (this.retryCountMap.size > MAX_RETRY_MAP_SIZE) {
              const oldestKey = this.retryCountMap.keys().next().value;
              if (oldestKey) this.retryCountMap.delete(oldestKey);
            }

            if (retries >= this.MAX_RETRIES) {
              this.logger.error(
                `Message failed after ${this.MAX_RETRIES} retries, sending to DLQ: ${error.message}`,
              );
              this.retryCountMap.delete(messageKey);
              // In production: publish to product.events.dlq topic
            } else {
              this.logger.warn(
                `Error processing message (attempt ${retries}/${this.MAX_RETRIES}): ${error.message}`,
              );
            }
          }
        },
      });

      this.logger.log(
        `Kafka consumer connected, listening to product.events (fromBeginning: ${this.fromBeginning})`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to connect Kafka consumer: ${error.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handleEvent(event: {
    type?: string;
    eventType?: string;
    payload?: any;
    data?: any;
  }): Promise<void> {
    // Support both { type, payload } and { eventType, data } formats
    const eventType = event.type ?? event.eventType ?? '';
    const payload = event.payload ?? event.data ?? event;

    switch (eventType) {
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
          `Dispatched IndexProductCommand for product ${payload.id} (${eventType})`,
        );
        break;

      case 'ProductDeleted':
      case 'product.deleted':
        await this.commandBus.execute(
          new RemoveProductCommand(payload.id),
        );
        this.logger.log(
          `Dispatched RemoveProductCommand for product ${payload.id}`,
        );
        break;

      default:
        this.logger.warn(`Unknown event type: ${eventType}`);
    }
  }
}
