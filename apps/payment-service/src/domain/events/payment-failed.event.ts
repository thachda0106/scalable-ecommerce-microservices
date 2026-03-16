import { BaseDomainEvent } from './base-domain.event';

export class PaymentFailedEvent extends BaseDomainEvent {
  constructor(
    public readonly paymentId: string,
    public readonly orderId: string,
    public readonly reason: string,
  ) {
    super();
  }

  get eventType(): string {
    return 'PaymentFailed';
  }
}
