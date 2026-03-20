import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consumer, EachMessagePayload, Producer } from 'kafkajs';
import { KafkaClientFactory } from '../kafka-client.factory';
import { ProcessedEventOrmEntity } from '../../persistence/entities/processed-event.orm-entity';
import { ProcessPaymentHandler } from '../../../application/handlers/process-payment.handler';
import { ProcessPaymentCommand } from '../../../application/commands/process-payment.command';

const MAX_RETRIES = 3;

@Injectable()
export class PaymentCommandConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentCommandConsumer.name);
  private consumer: Consumer;
  private dlqProducer: Producer;
  private readonly retryCounts = new Map<string, number>();

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
      this.dlqProducer = this.kafkaFactory.createProducer();

      await this.consumer.connect();
      await this.dlqProducer.connect();
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
        'Payment command consumer started — listening on payment.commands',
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
    if (this.dlqProducer) {
      await this.dlqProducer.disconnect();
    }
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;
    if (!message.value) return;

    try {
      const event = JSON.parse(message.value.toString());
      const eventId =
        event.eventId || event.id || `${event.type}_${event.payload?.orderId}`;
      const correlationId =
        message.headers?.['x-correlation-id']?.toString() || eventId;

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
              orderId, // idempotencyKey — use orderId for dedup
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

      this.retryCounts.delete(eventId);
      this.logger.log(
        `Processed command: ${eventType} (${eventId}, correlationId: ${correlationId})`,
      );
    } catch (error) {
      const event = JSON.parse(message.value!.toString());
      const eventId = event.eventId || event.id || `unknown_${Date.now()}`;
      const retryCount = (this.retryCounts.get(eventId) || 0) + 1;
      this.retryCounts.set(eventId, retryCount);

      this.logger.error(
        `Error processing payment command (retry ${retryCount}/${MAX_RETRIES}): ${(error as Error).message}`,
        (error as Error).stack,
      );

      if (retryCount >= MAX_RETRIES) {
        await this.sendToDlq(message, error as Error);
        this.retryCounts.delete(eventId);
      }
      // DO NOT re-throw — prevents consumer crash loop
    }
  }

  private async sendToDlq(message: any, error: Error): Promise<void> {
    try {
      await this.dlqProducer.send({
        topic: 'payment.commands.dlq',
        messages: [
          {
            key: message.key,
            value: message.value,
            headers: {
              ...message.headers,
              'x-dlq-reason': error.message,
              'x-dlq-timestamp': new Date().toISOString(),
              'x-original-topic': 'payment.commands',
            },
          },
        ],
      });
      this.logger.warn(`Message sent to DLQ: payment.commands.dlq`);
    } catch (dlqError) {
      this.logger.error(
        `Failed to send message to DLQ: ${(dlqError as Error).message}`,
      );
    }
  }
}
