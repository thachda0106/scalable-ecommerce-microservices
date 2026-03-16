import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { IPaymentService } from '../../application/ports/payment-service.port';

@Injectable()
export class KafkaPaymentService
  implements IPaymentService, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(KafkaPaymentService.name);
  private producer: Producer;

  constructor() {
    const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:29092';
    const kafka = new Kafka({
      clientId: 'order-service-payment-cmd',
      brokers: KAFKA_BROKERS.split(','),
    });
    this.producer = kafka.producer();
  }

  async onApplicationBootstrap() {
    await this.producer.connect();
    this.logger.log('Payment command producer connected');
  }

  async onApplicationShutdown() {
    await this.producer.disconnect();
  }

  async requestPayment(
    orderId: string,
    amountInCents: number,
    currency: string,
    userId: string,
  ): Promise<void> {
    await this.producer.send({
      topic: 'payment.commands',
      messages: [
        {
          key: orderId,
          value: JSON.stringify({
            type: 'ProcessPayment',
            payload: { orderId, amountInCents, currency, userId },
          }),
        },
      ],
    });
    this.logger.log(`Sent ProcessPayment command for order ${orderId}`);
  }
}
