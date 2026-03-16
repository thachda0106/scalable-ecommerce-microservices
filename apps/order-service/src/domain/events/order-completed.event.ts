import { BaseDomainEvent } from './base-domain.event';

export class OrderCompletedEvent extends BaseDomainEvent {
  public readonly eventType = 'order.completed';

  constructor(
    public readonly orderId: string,
  ) {
    super();
  }
}
