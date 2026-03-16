import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consumer, EachMessagePayload } from 'kafkajs';
import { KafkaClientFactory } from '../kafka-client.factory';
import { ProcessedEventOrmEntity } from '../../persistence/entities/processed-event.orm-entity';
import { ProcessPaymentHandler } from '../../../application/handlers/process-payment.handler';
import { ProcessPaymentCommand } from '../../../application/commands/process-payment.command';

@Injectable()
export class PaymentCommandConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentCommandConsumer.name);
  private consumer: Consumer;

  constructor(
    private readonly kafkaFactory: KafkaClientFactory,
    private readonly processPaymentHandler: ProcessPaymentHandler,
    @InjectRepository(ProcessedEventOrmEntity)
    private readonly processedRepo: Repository<ProcessedEventOrmEntity>,
  ) {}

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

      this.logger.log('Payment command consumer started — listening on payment.commands');
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
    const { message } = payload;
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString());
      const eventId = event.eventId || event.id || `${event.type}_${event.payload?.orderId}`;

      if (!eventId) {
        this.logger.warn('Received payment command without ID, skipping');
        return;
      }

      // Idempotency check
      const alreadyProcessed = await this.processedRepo.findOneBy({ eventId });
      if (alreadyProcessed) {
        this.logger.debug(`Command ${eventId} already processed, skipping`);
        return;
      }

      const eventType = event.type;

      switch (eventType) {
        case 'ProcessPayment': {
          const { orderId, amountInCents, currency, userId } = event.payload;
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
          this.logger.debug(`Unhandled command type: ${eventType}`);
          return;
      }

      // Mark as processed
      const processed = new ProcessedEventOrmEntity();
      processed.eventId = eventId;
      processed.eventType = eventType;
      await this.processedRepo.save(processed);

      this.logger.log(`Processed command: ${eventType} (${eventId})`);
    } catch (error) {
      this.logger.error(
        `Error processing payment command: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // DO NOT re-throw — prevents consumer crash loop
      // TODO: Route to payment.commands.dlq after max retries
    }
  }
}
