import { SearchQuery } from '../search-query.vo';
import { SearchFilter } from '../search-filter.vo';
import { SearchSort } from '../search-sort.vo';
import { Pagination } from '../pagination.vo';

describe('SearchQuery', () => {
  it('should create with all parameters', () => {
    const filters = [SearchFilter.eq('status', 'ACTIVE')];
    const sort = SearchSort.create('price', 'asc');
    const pagination = Pagination.create({ page: 2, limit: 10 });

    const query = SearchQuery.create({
      query: 'laptop',
      filters,
      sort,
      pagination,
    });

    expect(query.query).toBe('laptop');
    expect(query.filters).toHaveLength(1);
    expect(query.sort).toBe(sort);
    expect(query.pagination.page).toBe(2);
    expect(query.hasQuery).toBe(true);
    expect(query.hasFilters).toBe(true);
  });

  it('should create with defaults', () => {
    const query = SearchQuery.create();

    expect(query.query).toBe('');
    expect(query.filters).toHaveLength(0);
    expect(query.sort).toBeNull();
    expect(query.pagination.page).toBe(1);
    expect(query.pagination.limit).toBe(20);
    expect(query.hasQuery).toBe(false);
    expect(query.hasFilters).toBe(false);
  });

  it('should handle empty query (browse mode)', () => {
    const query = SearchQuery.create({ query: '  ' });
    expect(query.hasQuery).toBe(false);
  });
});

describe('Pagination', () => {
  it('should create with defaults', () => {
    const pagination = Pagination.create();
    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(20);
    expect(pagination.cursor).toBeNull();
    expect(pagination.offset).toBe(0);
  });

  it('should compute offset correctly', () => {
    const pagination = Pagination.create({ page: 3, limit: 20 });
    expect(pagination.offset).toBe(40);
  });

  it('should clamp limit to max 100', () => {
    const pagination = Pagination.create({ limit: 500 });
    expect(pagination.limit).toBe(100);
  });

  it('should handle cursor-based pagination', () => {
    const pagination = Pagination.create({
      cursor: '[1234, "abc"]',
    });
    expect(pagination.cursor).toBe('[1234, "abc"]');
  });

  it('should enforce minimum page of 1', () => {
    const pagination = Pagination.create({ page: -5 });
    expect(pagination.page).toBe(1);
  });
});

describe('SearchFilter', () => {
  it('should create eq filter', () => {
    const filter = SearchFilter.eq('status', 'ACTIVE');
    expect(filter.field).toBe('status');
    expect(filter.operator).toBe('eq');
    expect(filter.value).toBe('ACTIVE');
  });

  it('should create in filter', () => {
    const filter = SearchFilter.in('status', ['ACTIVE', 'DRAFT']);
    expect(filter.operator).toBe('in');
    expect(filter.value).toEqual(['ACTIVE', 'DRAFT']);
  });

  it('should create range filter', () => {
    const filter = SearchFilter.range('price', 10, 100);
    expect(filter.operator).toBe('range');
    expect(filter.value).toEqual({ min: 10, max: 100 });
  });
});
