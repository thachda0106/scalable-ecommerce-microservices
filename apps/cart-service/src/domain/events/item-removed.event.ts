import { BaseDomainEvent } from './base-domain.event';

export class ItemRemovedEvent extends BaseDomainEvent {
  public readonly eventType = 'cart.item_removed';

  constructor(
    public readonly cartId: string,
    public readonly userId: string,
    public readonly productId: string,
  ) {
    super();
  }
}
