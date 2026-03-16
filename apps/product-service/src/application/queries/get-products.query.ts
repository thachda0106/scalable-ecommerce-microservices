export class GetProductsQuery {
  constructor(
    public readonly page?: number,
    public readonly limit?: number,
    public readonly sortBy?: string,
    public readonly sortOrder?: 'ASC' | 'DESC',
    public readonly status?: string,
    public readonly categoryId?: string,
    public readonly minPrice?: number,
    public readonly maxPrice?: number,
    public readonly search?: string,
  ) {}
}
