import { BaseDomainEvent } from './base-domain.event';

export class StockReservedEvent extends BaseDomainEvent {
  public readonly eventType = 'inventory.reserved';

  constructor(
    public readonly productId: string,
    public readonly quantity: number,
    public readonly reservationId: string,
    public readonly referenceId: string,
    public readonly referenceType: string,
    public readonly availableStock: number,
  ) {
    super();
  }
}
