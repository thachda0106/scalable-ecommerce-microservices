import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ProcessedEventOrmEntity } from '../../persistence/entities/processed-event.orm-entity';
import { CancelOrderHandler } from '../../../application/handlers/cancel-order.handler';
import { CancelOrderCommand } from '../../../application/commands/cancel-order.command';
import { CheckoutSagaOrchestrator } from '../saga/checkout-saga.orchestrator';

@Injectable()
export class InventoryEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryEventConsumer.name);
  private consumer: Consumer;

  constructor(
    private readonly cancelOrderHandler: CancelOrderHandler,
    private readonly sagaOrchestrator: CheckoutSagaOrchestrator,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
  ) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';
    const kafka = new Kafka({
      clientId: 'order-service-inventory-consumer',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = kafka.consumer({
      groupId: 'order-service-inventory',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
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

      this.logger.log('Inventory event consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start inventory consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
    } catch (error) {
      this.logger.warn(
        `Error disconnecting inventory consumer: ${(error as Error).message}`,
      );
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString());
      const eventId = event.eventId || event.id;

      if (!eventId) {
        this.logger.warn('Received inventory event without ID, skipping');
        return;
      }

      // Idempotency check
      const alreadyProcessed = await this.processedRepo.findOneBy({ eventId });
      if (alreadyProcessed) {
        this.logger.debug(`Inventory event ${eventId} already processed, skipping`);
        return;
      }

      const eventType = event.type || event.eventType;

      switch (eventType) {
        case 'InventoryReserved':
        case 'stock.reserved':
          // Inventory reserved → proceed to payment via Saga
          await this.sagaOrchestrator.onInventoryReserved(
            event.payload.orderId || event.payload.referenceId,
          );
          break;

        case 'InventoryReservationFailed':
        case 'stock.reservation.failed':
          await this.cancelOrderHandler.execute(
            new CancelOrderCommand(
              event.payload.orderId || event.payload.referenceId,
              'Inventory reservation failed',
            ),
          );
          break;

        default:
          this.logger.debug(`Unhandled inventory event type: ${eventType}`);
          return;
      }

      // Mark as processed
      const processed = new ProcessedEventOrmEntity();
      processed.eventId = eventId;
      await this.processedRepo.save(processed);

      this.logger.log(`Processed inventory event: ${eventType} (${eventId})`);
    } catch (error) {
      this.logger.error(
        `Error processing inventory message: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // DO NOT re-throw — prevents consumer crash loop
    }
  }
}
