export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly items: {
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: number;
      currency?: string;
    }[],
  ) {}
}
