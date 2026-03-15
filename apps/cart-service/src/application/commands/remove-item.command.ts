export class RemoveItemCommand {
  constructor(
    public readonly userId: string,
    public readonly productId: string,
  ) {}
}
