import { Injectable, Inject, OnApplicationBootstrap } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { Producer } from 'kafkajs';
import { IPaymentService } from '../../application/ports/payment-service.port';
import { KafkaClientFactory } from '../kafka/kafka-client.factory';
import { publishWithResilience, setCorrelationHeaders } from '@ecommerce/core';

@Injectable()
export class KafkaPaymentService
  implements IPaymentService, OnApplicationBootstrap
{
  private producer: Producer;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly kafkaFactory: KafkaClientFactory,
  ) {}

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
    await publishWithResilience(this.producer, {
      topic: 'payment.commands',
      messages: [
        {
          key: orderId,
          value: JSON.stringify({
            type: 'ProcessPayment',
            payload: { orderId, amountInCents, currency, userId },
          }),
          headers: setCorrelationHeaders(orderId),
        },
      ],
    });
    this.logger.log(`Sent ProcessPayment command for order ${orderId}`);
  }
}
