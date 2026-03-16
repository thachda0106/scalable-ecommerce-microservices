# Payment Providers

The `payment-service` is decoupled from concrete payment processors (like Stripe or PayPal) by implementing the classic "Strategy" software pattern in its Infrastructure layer.

## The Strategy Abstraction

The system requires that any active processor comply strictly by fulfilling exactly the contract of the interface `IPaymentProvider` mapped to the Symbol `PAYMENT_PROVIDER`.

### The Interface Contract

```typescript
export interface IPaymentProvider {
  processPayment(request: PaymentProviderRequest): Promise<PaymentProviderResult>;
  refundPayment(transactionId: string, amount: Money): Promise<RefundResult>;
  getName(): PaymentProviderEnum;
}
```

## Integrated Providers

The service currently provides three implementations:

### StripeProvider
Integrates with Stripe's REST SDK (or Webhook equivalents). Built tightly with global configured timeouts to prevent our localized Microservices Saga orchestrations from halting indefinitely.
Name enum mapping: `STRIPE`

### PayPalProvider
Integrates with the PayPal Checkout SDK.
Name enum mapping: `PAYPAL`

### MockProvider
Intended for development environments and E2E automated test scenarios. The mock provider emulates network chatter (introducing artificial time delays) and explicitly returns hard-coded success logic without invoking any real external TCP/IP connections.
Name enum mapping: `MOCK`

## Fallbacks / Configuration
A default `PAYMENT_PROVIDER` environment variable will resolve any `ProcessPaymentDto` or `ProcessPaymentCommand` objects that do not explicitly supply an over-ridden explicit string for the `provider`. If the env payload is missing, the service is engineered to default to `MOCK` passively.

## Adding a New Provider

Adding new payment logic is straight-forward and does not require touching Domain level logic:

1. Create `new_provider.provider.ts` in `src/infrastructure/providers/`.
2. Implement the `IPaymentProvider` interface.
3. Update `src/domain/enums/payment-provider.enum.ts` with your new enum mapping.
4. Add the provider to the constructor and map dictionary of the `PaymentProviderFactory` inside `payment-provider.factory.ts`.
5. Export your new provider heavily inside the NestJS `@Module` bindings structure (`payment.module.ts`).
