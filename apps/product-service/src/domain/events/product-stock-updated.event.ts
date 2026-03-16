import { BaseDomainEvent } from './base-domain.event';

export class ProductStockUpdatedEvent extends BaseDomainEvent {
  public readonly eventType = 'product.stock.updated';

  constructor(
    public readonly productId: string,
    public readonly status: string,
  ) {
    super();
  }
}
