import { DomainException } from './domain-exception';

export class ProductNotFoundError extends DomainException {
  public readonly productId: string;

  constructor(productId: string) {
    super('PRODUCT_NOT_FOUND', `Product with id ${productId} not found`);
    this.productId = productId;
    this.name = 'ProductNotFoundError';
  }
}
