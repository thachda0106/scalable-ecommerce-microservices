export class ConfirmPaymentCommand {
  constructor(
    public readonly orderId: string,
    public readonly paymentId: string,
  ) {}
}
