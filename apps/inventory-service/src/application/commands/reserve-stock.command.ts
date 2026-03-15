export class ReserveStockCommand {
  constructor(
    public readonly items: { productId: string; quantity: number }[],
    public readonly referenceId: string,
    public readonly referenceType: 'CART' | 'ORDER',
    public readonly idempotencyKey: string,
    public readonly ttlMinutes: number = 15,
    public readonly correlationId?: string,
  ) {}
}
