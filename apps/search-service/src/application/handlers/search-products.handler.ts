import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SearchProductsQuery } from '../queries/search-products.query';
import { SEARCH_QUERY_PORT, ISearchQueryPort } from '../../domain/ports';
import { SEARCH_CACHE_PORT, ISearchCachePort } from '../../domain/ports';
import { SearchResult } from '../../domain/entities';
import { SearchQuery, SearchFilter, SearchSort, Pagination } from '../../domain/value-objects';
import { FilterOperator, FilterValue } from '../../domain/value-objects/search-filter.vo';

const SEARCH_CACHE_TTL = 60; // seconds

@QueryHandler(SearchProductsQuery)
export class SearchProductsHandler implements IQueryHandler<SearchProductsQuery> {
  private readonly logger = new Logger(SearchProductsHandler.name);

  constructor(
    @Inject(SEARCH_QUERY_PORT)
    private readonly searchQueryPort: ISearchQueryPort,
    @Inject(SEARCH_CACHE_PORT)
    private readonly searchCachePort: ISearchCachePort,
  ) {}

  async execute(query: SearchProductsQuery): Promise<SearchResult> {
    const searchQuery = this.buildSearchQuery(query);
    const cacheKey = this.searchCachePort.generateKey(searchQuery);

    // Cache-first pattern
    const cached = await this.searchCachePort.get<SearchResult>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for query: ${cacheKey}`);
      return SearchResult.create({
        documents: cached.documents,
        total: cached.total,
        page: cached.page,
        limit: cached.limit,
        cursor: cached.cursor,
        took: cached.took,
      });
    }

    const result = await this.searchQueryPort.search(searchQuery);

    // Cache the result
    await this.searchCachePort.set(cacheKey, result, SEARCH_CACHE_TTL);
    this.logger.debug(`Cache miss, cached result for: ${cacheKey}`);

    return result;
  }

  private buildSearchQuery(query: SearchProductsQuery): SearchQuery {
    const filters = (query.filters ?? []).map((f) =>
      SearchFilter.create(f.field, f.operator as FilterOperator, f.value as FilterValue),
    );

    const sort = query.sort
      ? SearchSort.create(query.sort.field, query.sort.order)
      : null;

    const pagination = Pagination.create({
      page: query.page,
      limit: query.limit,
      cursor: query.cursor,
    });

    return SearchQuery.create({ query: query.query, filters, sort, pagination });
  }
}
