import { BaseDomainEvent } from './base-domain.event';

export class PaymentCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly userId: string,
    public readonly amountInCents: number,
    public readonly currency: string,
    public readonly provider: string,
  ) {
    super();
  }

  get eventType(): string {
    return 'PaymentCreated';
  }
}
