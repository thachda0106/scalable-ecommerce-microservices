import { DomainException } from './domain-exception';

export class CartNotFoundException extends DomainException {
  public readonly code = 'CART_NOT_FOUND';

  constructor(public readonly userId: string) {
    super(`Cart not found for user ${userId}`);
  }
}
