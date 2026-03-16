const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class Pagination {
  public readonly page: number;
  public readonly limit: number;
  public readonly cursor: string | null;

  private constructor(page: number, limit: number, cursor: string | null) {
    this.page = Math.max(1, page);
    this.limit = Math.min(Math.max(1, limit), MAX_LIMIT);
    this.cursor = cursor;
  }

  get offset(): number {
    return (this.page - 1) * this.limit;
  }

  static create(params?: {
    page?: number;
    limit?: number;
    cursor?: string | null;
  }): Pagination {
    return new Pagination(
      params?.page ?? DEFAULT_PAGE,
      params?.limit ?? DEFAULT_LIMIT,
      params?.cursor ?? null,
    );
  }
}
