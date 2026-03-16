export class ProcessPaymentCommand {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly amountInCents: number,
    public readonly currency: string,
    public readonly provider?: string,
    public readonly idempotencyKey?: string,
  ) {}
}
