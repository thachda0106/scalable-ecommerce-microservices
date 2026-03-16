import { Injectable } from '@nestjs/common';
import { IPaymentProvider } from '../../domain/ports/payment-provider.port';
import { PaymentProviderEnum } from '../../domain/enums/payment-provider.enum';
import { IPaymentProviderFactory } from '../../application/ports/payment-provider-factory.port';
import { MockProvider } from './mock.provider';
import { StripeProvider } from './stripe.provider';
import { PayPalProvider } from './paypal.provider';

@Injectable()
export class PaymentProviderFactory implements IPaymentProviderFactory {
  private readonly providers: Map<PaymentProviderEnum, IPaymentProvider>;

  constructor(
    private readonly mockProvider: MockProvider,
    private readonly stripeProvider: StripeProvider,
    private readonly paypalProvider: PayPalProvider,
  ) {
    this.providers = new Map<PaymentProviderEnum, IPaymentProvider>([
      [PaymentProviderEnum.MOCK, this.mockProvider],
      [PaymentProviderEnum.STRIPE, this.stripeProvider],
      [PaymentProviderEnum.PAYPAL, this.paypalProvider],
    ]);
  }

  getProvider(providerName: PaymentProviderEnum): IPaymentProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Payment provider "${providerName}" is not registered`);
    }
    return provider;
  }
}
