import { BaseDomainEvent } from './base-domain.event';

export class ProductCreatedEvent extends BaseDomainEvent {
  public readonly eventType = 'product.created';

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
