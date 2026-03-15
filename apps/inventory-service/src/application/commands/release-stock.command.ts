export class ReleaseStockCommand {
  constructor(
    public readonly referenceId: string,
    public readonly referenceType: 'CART' | 'ORDER',
    public readonly productIds: string[] | undefined,
    public readonly idempotencyKey: string,
    public readonly reason: string = 'manual',
    public readonly correlationId?: string,
  ) {}
}
