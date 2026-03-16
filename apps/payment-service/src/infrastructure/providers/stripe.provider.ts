import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  IPaymentProvider,
  PaymentProviderRequest,
  PaymentProviderResult,
  RefundResult,
} from '../../domain/ports/payment-provider.port';
import { Money } from '../../domain/value-objects/money.vo';
import { PaymentProviderEnum } from '../../domain/enums/payment-provider.enum';

const PROVIDER_TIMEOUT_MS = parseInt(process.env.PAYMENT_TIMEOUT_MS || '30000', 10);

@Injectable()
export class StripeProvider implements IPaymentProvider {
  private readonly logger = new Logger(StripeProvider.name);

  async processPayment(request: PaymentProviderRequest): Promise<PaymentProviderResult> {
    this.logger.log(
      `[STRIPE] Processing payment ${request.paymentId} — $${(request.amountInCents / 100).toFixed(2)} ${request.currency}`,
    );

    // TODO: Replace with real Stripe SDK call
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: request.amountInCents,
    //   currency: request.currency.toLowerCase(),
    //   metadata: { orderId: request.orderId, paymentId: request.paymentId },
    // });

    const result = await this.withTimeout(
      this.simulateStripeCall(request),
      PROVIDER_TIMEOUT_MS,
    );

    return result;
  }

  async refundPayment(transactionId: string, amount: Money): Promise<RefundResult> {
    this.logger.log(
      `[STRIPE] Refunding ${amount.toString()} for transaction ${transactionId}`,
    );

    // TODO: Replace with real Stripe SDK call
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    // const refund = await stripe.refunds.create({
    //   payment_intent: transactionId,
    //   amount: amount.amountInCents,
    // });

    const result = await this.withTimeout(
      this.simulateStripeRefund(transactionId, amount),
      PROVIDER_TIMEOUT_MS,
    );

    return result;
  }

  getName(): PaymentProviderEnum {
    return PaymentProviderEnum.STRIPE;
  }

  private async simulateStripeCall(request: PaymentProviderRequest): Promise<PaymentProviderResult> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return {
      success: true,
      transactionId: `stripe_pi_${uuidv4()}`,
      providerResponse: { provider: 'stripe', simulated: true },
    };
  }

  private async simulateStripeRefund(transactionId: string, amount: Money): Promise<RefundResult> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {
      success: true,
      refundId: `stripe_re_${uuidv4()}`,
      providerResponse: { provider: 'stripe', simulated: true },
    };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Stripe request timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }
}
