export type SortOrder = 'asc' | 'desc';

export class SearchSort {
  private constructor(
    public readonly field: string,
    public readonly order: SortOrder,
  ) {}

  static create(field: string, order: SortOrder = 'asc'): SearchSort {
    return new SearchSort(field, order);
  }
}
