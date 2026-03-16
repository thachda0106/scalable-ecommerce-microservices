import { SearchQuery } from '../../domain/value-objects/search-query.vo';
import { SearchFilter } from '../../domain/value-objects/search-filter.vo';

export class QueryBuilder {
  static buildSearchBody(query: SearchQuery): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    // Build the bool query
    const must: unknown[] = [];
    const filter: unknown[] = [];

    // Full-text search
    if (query.hasQuery) {
      must.push({
        multi_match: {
          query: query.query,
          fields: ['name', 'name._2gram', 'name._3gram', 'description'],
          type: 'best_fields',
        },
      });
    }

    // Filters
    if (query.hasFilters) {
      for (const f of query.filters) {
        filter.push(QueryBuilder.buildFilter(f));
      }
    }

    // Assemble bool query
    const boolQuery: Record<string, unknown> = {};
    if (must.length > 0) boolQuery.must = must;
    if (filter.length > 0) boolQuery.filter = filter;

    if (Object.keys(boolQuery).length > 0) {
      body.query = { bool: boolQuery };
    } else {
      body.query = { match_all: {} };
    }

    // Sort
    const sort: unknown[] = [];
    if (query.sort) {
      sort.push({ [query.sort.field]: { order: query.sort.order } });
    }
    // Always add _id as tiebreaker for search_after determinism
    sort.push({ _id: { order: 'asc' } });
    body.sort = sort;

    // Pagination
    if (query.pagination.cursor) {
      // Use search_after for cursor-based pagination
      try {
        body.search_after = JSON.parse(query.pagination.cursor);
      } catch {
        // fallback: treat cursor as single value
        body.search_after = [query.pagination.cursor];
      }
      body.size = query.pagination.limit;
    } else {
      body.from = query.pagination.offset;
      body.size = query.pagination.limit;
    }

    return body;
  }

  static buildSuggestBody(
    prefix: string,
    limit: number = 10,
  ): Record<string, unknown> {
    return {
      suggest: {
        product_suggest: {
          prefix,
          completion: {
            field: 'name_suggest',
            size: limit,
            skip_duplicates: true,
          },
        },
      },
      _source: false,
    };
  }

  private static buildFilter(filter: SearchFilter): Record<string, unknown> {
    switch (filter.operator) {
      case 'eq':
        return { term: { [filter.field]: filter.value } };
      case 'in':
        return { terms: { [filter.field]: filter.value } };
      case 'range': {
        const rangeVal = filter.value as { min?: number; max?: number };
        const range: Record<string, unknown> = {};
        if (rangeVal.min !== undefined) range.gte = rangeVal.min;
        if (rangeVal.max !== undefined) range.lte = rangeVal.max;
        return { range: { [filter.field]: range } };
      }
      case 'gte':
        return { range: { [filter.field]: { gte: filter.value } } };
      case 'lte':
        return { range: { [filter.field]: { lte: filter.value } } };
      default:
        return { term: { [filter.field]: filter.value } };
    }
  }
}
