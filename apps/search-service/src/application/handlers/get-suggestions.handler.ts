import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { GetSuggestionsQuery } from '../queries/get-suggestions.query';
import { SEARCH_QUERY_PORT, ISearchQueryPort } from '../../domain/ports';
import { SEARCH_CACHE_PORT, ISearchCachePort } from '../../domain/ports';
import { SearchMetricsService } from '../../infrastructure/metrics/search-metrics.service';

const SUGGEST_CACHE_TTL = 300; // seconds

@QueryHandler(GetSuggestionsQuery)
export class GetSuggestionsHandler implements IQueryHandler<GetSuggestionsQuery> {
  private readonly logger = new Logger(GetSuggestionsHandler.name);

  constructor(
    @Inject(SEARCH_QUERY_PORT)
    private readonly searchQueryPort: ISearchQueryPort,
    @Inject(SEARCH_CACHE_PORT)
    private readonly searchCachePort: ISearchCachePort,
    private readonly metricsService: SearchMetricsService,
  ) {}

  async execute(query: GetSuggestionsQuery): Promise<string[]> {
    const startTime = Date.now();
    const cacheKey = `suggest:${query.prefix}:${query.limit}`;

    const cached = await this.searchCachePort.get<string[]>(cacheKey);
    if (cached) {
      this.logger.debug(`Suggest cache hit for prefix: ${query.prefix}`);
      const durationMs = Date.now() - startTime;
      this.metricsService.recordSearch('suggest', durationMs, true);
      return cached;
    }

    const suggestions = await this.searchQueryPort.suggest(
      query.prefix,
      query.limit,
    );

    await this.searchCachePort.set(cacheKey, suggestions, SUGGEST_CACHE_TTL);
    this.logger.debug(`Suggest cache miss, cached for prefix: ${query.prefix}`);

    const durationMs = Date.now() - startTime;
    this.metricsService.recordSearch('suggest', durationMs, false);

    return suggestions;
  }
}
