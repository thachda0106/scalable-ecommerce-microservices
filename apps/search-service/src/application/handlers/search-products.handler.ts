import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SearchProductsQuery } from '../queries/search-products.query';
import { SEARCH_QUERY_PORT, ISearchQueryPort } from '../../domain/ports';
import { SEARCH_CACHE_PORT, ISearchCachePort } from '../../domain/ports';
import { SearchResult } from '../../domain/entities';
import {
  SearchQuery,
  SearchFilter,
  SearchSort,
  Pagination,
} from '../../domain/value-objects';
import {
  FilterOperator,
  FilterValue,
} from '../../domain/value-objects/search-filter.vo';
import { InvalidSearchQueryError } from '../../domain/errors';
import { SearchMetricsService } from '../../infrastructure/metrics/search-metrics.service';

const SEARCH_CACHE_TTL = 60; // seconds

@QueryHandler(SearchProductsQuery)
export class SearchProductsHandler implements IQueryHandler<SearchProductsQuery> {
  private readonly logger = new Logger(SearchProductsHandler.name);

  constructor(
    @Inject(SEARCH_QUERY_PORT)
    private readonly searchQueryPort: ISearchQueryPort,
    @Inject(SEARCH_CACHE_PORT)
    private readonly searchCachePort: ISearchCachePort,
    private readonly metricsService: SearchMetricsService,
  ) {}

  async execute(query: SearchProductsQuery): Promise<SearchResult> {
    const startTime = Date.now();

    const searchQuery = this.buildSearchQuery(query);
    const cacheKey = this.searchCachePort.generateKey(searchQuery);

    // Cache-first pattern
    const cached = await this.searchCachePort.get<SearchResult>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for query: ${cacheKey}`);
      const durationMs = Date.now() - startTime;
      this.metricsService.recordSearch('search', durationMs, true);
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

    const durationMs = Date.now() - startTime;
    this.metricsService.recordSearch('search', durationMs, false);

    return result;
  }

  private buildSearchQuery(query: SearchProductsQuery): SearchQuery {
    // Validate filter operators
    const validOperators = ['eq', 'in', 'range', 'gte', 'lte'];
    for (const f of query.filters ?? []) {
      if (!validOperators.includes(f.operator)) {
        throw new InvalidSearchQueryError(
          `Invalid filter operator: ${f.operator}`,
        );
      }
    }

    const filters = (query.filters ?? []).map((f) =>
      SearchFilter.create(
        f.field,
        f.operator as FilterOperator,
        f.value as FilterValue,
      ),
    );

    const sort = query.sort
      ? SearchSort.create(query.sort.field, query.sort.order)
      : null;

    const pagination = Pagination.create({
      page: query.page,
      limit: query.limit,
      cursor: query.cursor,
    });

    return SearchQuery.create({
      query: query.query,
      filters,
      sort,
      pagination,
    });
  }
}
