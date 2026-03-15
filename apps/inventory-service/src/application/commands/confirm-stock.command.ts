export class ConfirmStockCommand {
  constructor(
    public readonly referenceId: string,
    public readonly referenceType: 'ORDER' = 'ORDER',
    public readonly idempotencyKey: string,
    public readonly correlationId?: string,
  ) {}
}
