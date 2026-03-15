export class AddItemCommand {
  constructor(
    public readonly userId: string,
    public readonly productId: string,
    public readonly quantity: number,
    public readonly snapshottedPrice: number,
  ) {}
}
