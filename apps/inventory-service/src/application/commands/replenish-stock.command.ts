export class ReplenishStockCommand {
  constructor(
    public readonly items: {
      productId: string;
      quantity: number;
      reason: string;
    }[],
    public readonly performedBy: string,
    public readonly idempotencyKey: string,
    public readonly correlationId?: string,
  ) {}
}
