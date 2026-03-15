import { BaseDomainEvent } from './base-domain.event';

export class CartClearedEvent extends BaseDomainEvent {
  public readonly eventType = 'cart.cleared';

  constructor(
    public readonly cartId: string,
    public readonly userId: string,
  ) {
    super();
  }
}
