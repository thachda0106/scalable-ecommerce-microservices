import { SearchFilter } from './search-filter.vo';
import { SearchSort } from './search-sort.vo';
import { Pagination } from './pagination.vo';

export class SearchQuery {
  private constructor(
    public readonly query: string,
    public readonly filters: SearchFilter[],
    public readonly sort: SearchSort | null,
    public readonly pagination: Pagination,
  ) {}

  static create(params?: {
    query?: string;
    filters?: SearchFilter[];
    sort?: SearchSort | null;
    pagination?: Pagination;
  }): SearchQuery {
    return new SearchQuery(
      params?.query ?? '',
      params?.filters ?? [],
      params?.sort ?? null,
      params?.pagination ?? Pagination.create(),
    );
  }

  get hasQuery(): boolean {
    return this.query.trim().length > 0;
  }

  get hasFilters(): boolean {
    return this.filters.length > 0;
  }
}
