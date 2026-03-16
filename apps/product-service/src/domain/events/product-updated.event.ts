import { BaseDomainEvent } from './base-domain.event';

export class ProductUpdatedEvent extends BaseDomainEvent {
  public readonly eventType = 'product.updated';

  constructor(
    public readonly productId: string,
    public readonly name: string,
    public readonly price: number,
    public readonly currency: string,
    public readonly categoryId: string,
    public readonly status: string,
  ) {
    super();
  }
}
