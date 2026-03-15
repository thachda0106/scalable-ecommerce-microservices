import { DomainException } from './domain-exception';

export class ProductNotFoundException extends DomainException {
  public readonly code = 'PRODUCT_NOT_FOUND';

  constructor(public readonly productId: string) {
    super(`Product ${productId} does not exist`);
  }
}
