import { DomainException } from './domain-exception';

export class ItemNotInCartException extends DomainException {
  public readonly code = 'ITEM_NOT_IN_CART';

  constructor(public readonly productId: string) {
    super(`Item ${productId} not found in cart`);
  }
}
