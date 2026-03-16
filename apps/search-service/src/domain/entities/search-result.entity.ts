import { SearchDocument } from './search-document.entity';

export class SearchResult {
  private constructor(
    public readonly documents: SearchDocument[],
    public readonly total: number,
    public readonly page: number,
    public readonly limit: number,
    public readonly cursor: string | null,
    public readonly took: number,
  ) {}

  get totalPages(): number {
    if (this.limit === 0) return 0;
    return Math.ceil(this.total / this.limit);
  }

  get hasNextPage(): boolean {
    return this.page < this.totalPages;
  }

  static create(params: {
    documents: SearchDocument[];
    total: number;
    page: number;
    limit: number;
    cursor?: string | null;
    took: number;
  }): SearchResult {
    return new SearchResult(
      params.documents,
      params.total,
      params.page,
      params.limit,
      params.cursor ?? null,
      params.took,
    );
  }

  static empty(page: number = 1, limit: number = 20): SearchResult {
    return new SearchResult([], 0, page, limit, null, 0);
  }
}
