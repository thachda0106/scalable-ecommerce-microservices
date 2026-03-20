import { Money } from '../value-objects/money.vo';
import { PaymentProviderEnum } from '../enums/payment-provider.enum';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface PaymentProviderRequest {
  paymentId: string;
  orderId: string;
  amountInCents: number;
  currency: string;
}

export interface PaymentProviderResult {
  success: boolean;
  transactionId: string;
  providerResponse?: Record<string, unknown>;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  providerResponse?: Record<string, unknown>;
}

export interface IPaymentProvider {
  processPayment(
    request: PaymentProviderRequest,
  ): Promise<PaymentProviderResult>;
  refundPayment(transactionId: string, amount: Money): Promise<RefundResult>;
  getName(): PaymentProviderEnum;
}
