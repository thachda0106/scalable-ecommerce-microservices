import { BaseDomainEvent } from './base-domain.event';

export class StockReleasedEvent extends BaseDomainEvent {
  public readonly eventType = 'inventory.released';

  constructor(
    public readonly productId: string,
    public readonly quantity: number,
    public readonly reservationId: string,
    public readonly referenceId: string,
    public readonly reason: string,
    public readonly availableStock: number,
  ) {
    super();
  }
}
