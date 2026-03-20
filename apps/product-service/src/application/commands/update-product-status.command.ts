export class UpdateProductStatusCommand {
  constructor(
    public readonly productId: string,
    public readonly action:
      | 'activate'
      | 'deactivate'
      | 'markOutOfStock'
      | 'archive'
      | 'restock',
  ) {}
}
