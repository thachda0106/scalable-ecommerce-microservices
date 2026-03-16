export class SearchProductsQuery {
  constructor(
    public readonly query?: string,
    public readonly filters?: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>,
    public readonly sort?: { field: string; order: 'asc' | 'desc' },
    public readonly page?: number,
    public readonly limit?: number,
    public readonly cursor?: string,
  ) {}
}
