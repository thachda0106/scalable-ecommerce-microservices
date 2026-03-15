import { DomainException } from './domain-exception';

export class CartFullException extends DomainException {
  public readonly code = 'CART_FULL';

  constructor(public readonly maxItems: number) {
    super(`Cart cannot contain more than ${maxItems} distinct items`);
  }
}
