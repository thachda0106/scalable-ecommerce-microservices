import { BaseDomainEvent } from './base-domain.event';

export class OrderPaidEvent extends BaseDomainEvent {
  public readonly eventType = 'order.paid';

  constructor(
    public readonly orderId: string,
    public readonly paymentId: string,
  ) {
    super();
  }
}
