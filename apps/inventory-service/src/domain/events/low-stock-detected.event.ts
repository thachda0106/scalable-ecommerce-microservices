import { BaseDomainEvent } from './base-domain.event';

export class LowStockDetectedEvent extends BaseDomainEvent {
  public readonly eventType = 'inventory.low_stock';

  constructor(
    public readonly productId: string,
    public readonly availableStock: number,
    public readonly threshold: number,
  ) {
    super();
  }
}
