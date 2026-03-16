import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { IndexProductCommand } from '../commands/index-product.command';
import { SEARCH_INDEX_PORT, ISearchIndexPort } from '../../domain/ports';
import { SEARCH_CACHE_PORT, ISearchCachePort } from '../../domain/ports';
import { SearchDocument } from '../../domain/entities';
import { DocumentIndexedEvent } from '../../domain/events';
import { SearchMetricsService } from '../../infrastructure/metrics/search-metrics.service';

@CommandHandler(IndexProductCommand)
export class IndexProductHandler implements ICommandHandler<IndexProductCommand> {
  private readonly logger = new Logger(IndexProductHandler.name);

  constructor(
    @Inject(SEARCH_INDEX_PORT)
    private readonly searchIndexPort: ISearchIndexPort,
    @Inject(SEARCH_CACHE_PORT)
    private readonly searchCachePort: ISearchCachePort,
    private readonly eventBus: EventBus,
    private readonly metricsService: SearchMetricsService,
  ) {}

  async execute(command: IndexProductCommand): Promise<void> {
    const doc = SearchDocument.fromProductEvent({
      id: command.id,
      name: command.name,
      description: command.description,
      price: command.price,
      status: command.status,
      categoryId: command.categoryId,
      attributes: command.attributes,
    });

    await this.searchIndexPort.indexDocument(doc);
    this.logger.log(`Indexed product ${command.id}`);

    // Invalidate search cache so stale results aren't served
    await this.searchCachePort.invalidateAll();

    // Publish domain event
    this.eventBus.publish(new DocumentIndexedEvent(command.id));

    // Record metrics
    this.metricsService.recordIndex('index', true);
  }
}
