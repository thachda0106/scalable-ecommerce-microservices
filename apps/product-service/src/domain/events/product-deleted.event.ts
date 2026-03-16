import { BaseDomainEvent } from './base-domain.event';

export class ProductDeletedEvent extends BaseDomainEvent {
  public readonly eventType = 'product.deleted';

  constructor(
    public readonly productId: string,
  ) {
    super();
  }
}
