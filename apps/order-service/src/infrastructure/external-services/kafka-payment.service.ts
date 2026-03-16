import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Producer } from 'kafkajs';
import { IPaymentService } from '../../application/ports/payment-service.port';
import { KafkaClientFactory } from '../kafka/kafka-client.factory';

@Injectable()
export class KafkaPaymentService
  implements IPaymentService, OnApplicationBootstrap
{
  private readonly logger = new Logger(KafkaPaymentService.name);
  private producer: Producer;

  constructor(private readonly kafkaFactory: KafkaClientFactory) {}

  async onApplicationBootstrap() {
    this.producer = this.kafkaFactory.createProducer();
    await this.producer.connect();
    this.logger.log('Payment command producer connected');
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
