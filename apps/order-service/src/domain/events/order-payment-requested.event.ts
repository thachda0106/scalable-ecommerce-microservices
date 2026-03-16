import { BaseDomainEvent } from './base-domain.event';

export class OrderPaymentRequestedEvent extends BaseDomainEvent {
  public readonly eventType = 'order.payment.requested';

  constructor(
    public readonly orderId: string,
    public readonly totalPrice: number,
    public readonly currency: string,
    public readonly userId: string,
  ) {
    super();
  }
}
