export class CreateProductCommand {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly price: number,
    public readonly currency: string,
    public readonly categoryId: string,
  ) {}
}
