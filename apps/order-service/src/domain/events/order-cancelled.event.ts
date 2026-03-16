import { BaseDomainEvent } from './base-domain.event';

export class OrderCancelledEvent extends BaseDomainEvent {
  public readonly eventType = 'order.cancelled';

  constructor(
    public readonly orderId: string,
    public readonly reason: string,
  ) {
    super();
  }
}
