import { BaseDomainEvent } from './base-domain.event';

export class ItemAddedEvent extends BaseDomainEvent {
  public readonly eventType = 'cart.item_added';

  constructor(
    public readonly cartId: string,
    public readonly userId: string,
    public readonly productId: string,
    public readonly quantity: number,
    public readonly snapshottedPrice: number,
  ) {
    super();
  }
}
