import { BaseDomainEvent } from './base-domain.event';

export class StockConfirmedEvent extends BaseDomainEvent {
  public readonly eventType = 'inventory.confirmed';

  constructor(
    public readonly productId: string,
    public readonly quantity: number,
    public readonly reservationId: string,
    public readonly referenceId: string,
    public readonly availableStock: number,
    public readonly soldStock: number,
  ) {
    super();
  }
}
