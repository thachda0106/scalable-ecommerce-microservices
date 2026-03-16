import { BaseDomainEvent } from './base-domain.event';

export class OrderRefundedEvent extends BaseDomainEvent {
  public readonly eventType = 'order.refunded';

  constructor(
    public readonly orderId: string,
    public readonly refundAmountInCents: number,
    public readonly currency: string,
    public readonly reason: string,
  ) {
    super();
  }
}
