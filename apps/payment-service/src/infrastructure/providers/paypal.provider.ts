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

const PROVIDER_TIMEOUT_MS = parseInt(
  process.env.PAYMENT_TIMEOUT_MS || '30000',
  10,
);

@Injectable()
export class PayPalProvider implements IPaymentProvider {
  constructor(@Inject(Logger) private readonly logger: Logger) {}

  async processPayment(
    request: PaymentProviderRequest,
  ): Promise<PaymentProviderResult> {
    this.logger.log(
      `[PAYPAL] Processing payment ${request.paymentId} — $${(request.amountInCents / 100).toFixed(2)} ${request.currency}`,
    );

    // TODO: Replace with real PayPal SDK call
    // const paypal = require('@paypal/checkout-server-sdk');
    // const client = new paypal.core.PayPalHttpClient(environment);
    // ...

    const result = await this.withTimeout(
      this.simulatePayPalCall(request),
      PROVIDER_TIMEOUT_MS,
    );

    return result;
  }

  async refundPayment(
    transactionId: string,
    amount: Money,
  ): Promise<RefundResult> {
    this.logger.log(
      `[PAYPAL] Refunding ${amount.toString()} for transaction ${transactionId}`,
    );

    // TODO: Replace with real PayPal SDK call

    const result = await this.withTimeout(
      this.simulatePayPalRefund(transactionId),
      PROVIDER_TIMEOUT_MS,
    );

    return result;
  }

  getName(): PaymentProviderEnum {
    return PaymentProviderEnum.PAYPAL;
  }

  private async simulatePayPalCall(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _request: PaymentProviderRequest,
  ): Promise<PaymentProviderResult> {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      success: true,
      transactionId: `paypal_${uuidv4()}`,
      providerResponse: { provider: 'paypal', simulated: true },
    };
  }

  private async simulatePayPalRefund(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _transactionId: string,
  ): Promise<RefundResult> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      success: true,
      refundId: `paypal_refund_${uuidv4()}`,
      providerResponse: { provider: 'paypal', simulated: true },
    };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`PayPal request timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }
}
