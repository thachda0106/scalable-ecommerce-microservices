import { BaseDomainEvent } from './base-domain.event';

export class OrderConfirmedEvent extends BaseDomainEvent {
  public readonly eventType = 'order.confirmed';

  constructor(public readonly orderId: string) {
    super();
  }
}
