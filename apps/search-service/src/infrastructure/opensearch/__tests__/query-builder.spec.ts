import { QueryBuilder } from '../query-builder';
import { SearchQuery } from '../../../domain/value-objects/search-query.vo';
import { SearchFilter } from '../../../domain/value-objects/search-filter.vo';
import { SearchSort } from '../../../domain/value-objects/search-sort.vo';
import { Pagination } from '../../../domain/value-objects/pagination.vo';

describe('QueryBuilder', () => {
  describe('buildSearchBody', () => {
    it('should produce multi_match for text query', () => {
      const query = SearchQuery.create({ query: 'laptop' });
      const body = QueryBuilder.buildSearchBody(query);

      expect((body.query as any).bool.must[0]).toEqual({
        multi_match: {
          query: 'laptop',
          fields: ['name', 'name._2gram', 'name._3gram', 'description'],
          type: 'best_fields',
        },
      });
    });

    it('should produce match_all for empty query', () => {
      const query = SearchQuery.create();
      const body = QueryBuilder.buildSearchBody(query);

      expect(body.query).toEqual({ match_all: {} });
    });

    it('should produce bool.filter for term filter', () => {
      const query = SearchQuery.create({
        filters: [SearchFilter.eq('status', 'ACTIVE')],
      });
      const body = QueryBuilder.buildSearchBody(query);

      expect((body.query as any).bool.filter[0]).toEqual({
        term: { status: 'ACTIVE' },
      });
    });

    it('should produce terms filter for in operator', () => {
      const query = SearchQuery.create({
        filters: [SearchFilter.in('status', ['ACTIVE', 'DRAFT'])],
      });
      const body = QueryBuilder.buildSearchBody(query);

      expect((body.query as any).bool.filter[0]).toEqual({
        terms: { status: ['ACTIVE', 'DRAFT'] },
      });
    });

    it('should produce range filter', () => {
      const query = SearchQuery.create({
        filters: [SearchFilter.range('price', 10, 100)],
      });
      const body = QueryBuilder.buildSearchBody(query);

      expect((body.query as any).bool.filter[0]).toEqual({
        range: { price: { gte: 10, lte: 100 } },
      });
    });

    it('should produce sort array with _id tiebreaker', () => {
      const query = SearchQuery.create({
        sort: SearchSort.create('price', 'desc'),
      });
      const body = QueryBuilder.buildSearchBody(query);

      expect(body.sort).toEqual([
        { price: { order: 'desc' } },
        { _id: { order: 'asc' } },
      ]);
    });

    it('should use search_after for cursor pagination', () => {
      const query = SearchQuery.create({
        pagination: Pagination.create({
          cursor: '[1234, "abc"]',
          limit: 10,
        }),
      });
      const body = QueryBuilder.buildSearchBody(query);

      expect(body.search_after).toEqual([1234, 'abc']);
      expect(body.size).toBe(10);
      expect(body.from).toBeUndefined();
    });

    it('should use from/size for offset pagination', () => {
      const query = SearchQuery.create({
        pagination: Pagination.create({ page: 3, limit: 10 }),
      });
      const body = QueryBuilder.buildSearchBody(query);

      expect(body.from).toBe(20);
      expect(body.size).toBe(10);
      expect(body.search_after).toBeUndefined();
    });
  });

  describe('buildSuggestBody', () => {
    it('should produce completion suggest query', () => {
      const body = QueryBuilder.buildSuggestBody('lap', 5);

      expect(body.suggest).toEqual({
        product_suggest: {
          prefix: 'lap',
          completion: {
            field: 'name_suggest',
            size: 5,
            skip_duplicates: true,
          },
        },
      });
      expect(body._source).toBe(false);
    });
  });
});
