export class RefundOrderCommand {
  constructor(
    public readonly orderId: string,
    public readonly reason: string = 'No reason provided',
  ) {}
}
