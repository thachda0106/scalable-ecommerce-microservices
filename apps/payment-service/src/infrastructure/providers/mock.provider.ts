import { Injectable, Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { v4 as uuidv4 } from 'uuid';
import {
  IPaymentProvider,
  PaymentProviderRequest,
  PaymentProviderResult,
  RefundResult,
} from '../../domain/ports/payment-provider.port';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentProviderEnum } from '../../domain/enums/payment-provider.enum';

@Injectable()
export class MockProvider implements IPaymentProvider {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  async processPayment(
    request: PaymentProviderRequest,
  ): Promise<PaymentProviderResult> {
    this.logger.log(
      `[MOCK] Processing payment ${request.paymentId} for order ${request.orderId} — $${(request.amountInCents / 100).toFixed(2)} ${request.currency}`,
    );

    // Simulate processing delay
    await this.simulateDelay(100, 500);

    const transactionId = `mock_txn_${uuidv4()}`;

    this.logger.log(`[MOCK] Payment processed — txId: ${transactionId}`);

    return {
      success: true,
      transactionId,
      providerResponse: { provider: 'mock', simulated: true },
    };
  }

  async refundPayment(
    transactionId: string,
    amount: Money,
  ): Promise<RefundResult> {
    this.logger.log(
      `[MOCK] Refunding ${amount.toString()} for transaction ${transactionId}`,
    );

    await this.simulateDelay(50, 200);

    const refundId = `mock_refund_${uuidv4()}`;

    this.logger.log(`[MOCK] Refund processed — refundId: ${refundId}`);

    return {
      success: true,
      refundId,
      providerResponse: { provider: 'mock', simulated: true },
    };
  }

  getName(): PaymentProviderEnum {
    return PaymentProviderEnum.MOCK;
  }

  private simulateDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
