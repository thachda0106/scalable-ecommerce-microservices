import { BaseDomainEvent } from './base-domain.event';

export class ItemQuantityUpdatedEvent extends BaseDomainEvent {
  public readonly eventType = 'cart.item_quantity_updated';

  constructor(
    public readonly cartId: string,
    public readonly userId: string,
    public readonly productId: string,
    public readonly oldQuantity: number,
    public readonly newQuantity: number,
  ) {
    super();
  }
}
