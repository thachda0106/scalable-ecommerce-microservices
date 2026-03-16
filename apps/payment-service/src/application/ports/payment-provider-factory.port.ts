import { IPaymentProvider } from '../../domain/ports/payment-provider.port';
import { PaymentProviderEnum } from '../../domain/enums/payment-provider.enum';

export const PAYMENT_PROVIDER_FACTORY = Symbol('PAYMENT_PROVIDER_FACTORY');

export interface IPaymentProviderFactory {
  getProvider(providerName: PaymentProviderEnum): IPaymentProvider;
}
