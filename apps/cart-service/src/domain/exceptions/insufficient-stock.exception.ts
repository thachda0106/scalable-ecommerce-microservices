import { DomainException } from './domain-exception';

export class InsufficientStockException extends DomainException {
  public readonly code = 'INSUFFICIENT_STOCK';

  constructor(public readonly productId: string) {
    super(`Insufficient stock for product ${productId}`);
  }
}
