export class IndexProductCommand {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly price: number,
    public readonly status: string,
    public readonly categoryId?: string,
    public readonly attributes?: Record<string, unknown>,
  ) {}
}
