export type FilterOperator = 'eq' | 'in' | 'range' | 'gte' | 'lte';

export type FilterValue =
  | string
  | string[]
  | { min?: number; max?: number };

export class SearchFilter {
  private constructor(
    public readonly field: string,
    public readonly operator: FilterOperator,
    public readonly value: FilterValue,
  ) {}

  static eq(field: string, value: string): SearchFilter {
    return new SearchFilter(field, 'eq', value);
  }

  static in(field: string, values: string[]): SearchFilter {
    return new SearchFilter(field, 'in', values);
  }

  static range(field: string, min?: number, max?: number): SearchFilter {
    return new SearchFilter(field, 'range', { min, max });
  }

  static gte(field: string, value: string): SearchFilter {
    return new SearchFilter(field, 'gte', value);
  }

  static lte(field: string, value: string): SearchFilter {
    return new SearchFilter(field, 'lte', value);
  }

  static create(field: string, operator: FilterOperator, value: FilterValue): SearchFilter {
    return new SearchFilter(field, operator, value);
  }
}
