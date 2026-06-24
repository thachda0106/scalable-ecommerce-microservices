import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { GetProductByIdQuery } from '../queries/get-product-by-id.query';
import { SEARCH_QUERY_PORT, ISearchQueryPort } from '../../domain/ports';
import { SearchDocument } from '../../domain/entities';
import { SearchMetricsService } from '../../infrastructure/metrics/search-metrics.service';

@QueryHandler(GetProductByIdQuery)
export class GetProductByIdHandler implements IQueryHandler<GetProductByIdQuery> {
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(SEARCH_QUERY_PORT)
    private readonly searchQueryPort: ISearchQueryPort,
    private readonly metricsService: SearchMetricsService,
  ) {}

  async execute(query: GetProductByIdQuery): Promise<SearchDocument | null> {
    const startTime = Date.now();
    const result = await this.searchQueryPort.findById(query.id);
    const durationMs = Date.now() - startTime;
    this.metricsService.recordSearch('get', durationMs, false);
    return result;
  }
}
