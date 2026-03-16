import { BaseDomainEvent } from './base-domain.event';

export class PaymentCompletedEvent extends BaseDomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly transactionId: string,
    public readonly amountInCents: number,
    public readonly currency: string,
  ) {
    super();
  }

  get eventType(): string {
    return 'PaymentCompleted';
  }
}
