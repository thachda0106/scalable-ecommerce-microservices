import { BaseDomainEvent } from './base-domain.event';

export class OrderShippedEvent extends BaseDomainEvent {
  public readonly eventType = 'order.shipped';

  constructor(
    public readonly orderId: string,
    public readonly trackingNumber: string,
  ) {
    super();
  }
}
