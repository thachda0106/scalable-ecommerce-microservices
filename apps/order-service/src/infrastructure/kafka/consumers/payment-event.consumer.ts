import {
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ProcessedEventOrmEntity } from '../../persistence/entities/processed-event.orm-entity';
import { ConfirmPaymentHandler } from '../../../application/handlers/confirm-payment.handler';
import { CancelOrderHandler } from '../../../application/handlers/cancel-order.handler';
import { ConfirmPaymentCommand } from '../../../application/commands/confirm-payment.command';
import { CancelOrderCommand } from '../../../application/commands/cancel-order.command';

@Injectable()
export class PaymentEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentEventConsumer.name);
  private consumer: Consumer;

  constructor(
    private readonly confirmPaymentHandler: ConfirmPaymentHandler,
    private readonly cancelOrderHandler: CancelOrderHandler,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
  ) {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';
    const kafka = new Kafka({
      clientId: 'order-service-payment-consumer',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.consumer = kafka.consumer({
      groupId: 'order-service-payment',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
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

      this.logger.log('Payment event consumer started');
    } catch (error) {
      this.logger.error(
        `Failed to start payment consumer: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.consumer.disconnect();
    } catch (error) {
      this.logger.warn(
        `Error disconnecting payment consumer: ${(error as Error).message}`,
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
        this.logger.warn('Received payment event without ID, skipping');
        return;
      }

      // Idempotency check
      const alreadyProcessed = await this.processedRepo.findOneBy({ eventId });
      if (alreadyProcessed) {
        this.logger.debug(`Payment event ${eventId} already processed, skipping`);
        return;
      }

      const eventType = event.type || event.eventType;

      switch (eventType) {
        case 'PaymentProcessed':
        case 'payment.completed':
          await this.confirmPaymentHandler.execute(
            new ConfirmPaymentCommand(
              event.payload.orderId,
              event.payload.paymentId || eventId,
            ),
          );
          break;

        case 'PaymentFailed':
        case 'payment.failed':
          await this.cancelOrderHandler.execute(
            new CancelOrderCommand(
              event.payload.orderId,
              'Payment failed',
            ),
          );
          break;

        default:
          this.logger.debug(`Unhandled payment event type: ${eventType}`);
          return;
      }

      // Mark as processed
      const processed = new ProcessedEventOrmEntity();
      processed.eventId = eventId;
      await this.processedRepo.save(processed);

      this.logger.log(`Processed payment event: ${eventType} (${eventId})`);
    } catch (error) {
      this.logger.error(
        `Error processing payment message: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // DO NOT re-throw — prevents consumer crash loop
    }
  }
}
