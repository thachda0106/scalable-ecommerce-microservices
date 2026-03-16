import { BaseDomainEvent } from './base-domain.event';

export class OrderCreatedEvent extends BaseDomainEvent {
  public readonly eventType = 'order.created';

  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: { productId: string; productName: string; quantity: number; unitPrice: number }[],
    public readonly totalPrice: number,
    public readonly currency: string,
  ) {
    super();
  }
}
