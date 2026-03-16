import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { RemoveProductCommand } from '../commands/remove-product.command';
import { SEARCH_INDEX_PORT, ISearchIndexPort } from '../../domain/ports';
import { SEARCH_CACHE_PORT, ISearchCachePort } from '../../domain/ports';
import { DocumentRemovedEvent } from '../../domain/events';
import { SearchMetricsService } from '../../infrastructure/metrics/search-metrics.service';

@CommandHandler(RemoveProductCommand)
export class RemoveProductHandler implements ICommandHandler<RemoveProductCommand> {
  private readonly logger = new Logger(RemoveProductHandler.name);

  constructor(
    @Inject(SEARCH_INDEX_PORT)
    private readonly searchIndexPort: ISearchIndexPort,
    @Inject(SEARCH_CACHE_PORT)
    private readonly searchCachePort: ISearchCachePort,
    private readonly eventBus: EventBus,
    private readonly metricsService: SearchMetricsService,
  ) {}

  async execute(command: RemoveProductCommand): Promise<void> {
    await this.searchIndexPort.removeDocument(command.id);
    this.logger.log(`Removed product ${command.id} from index`);

    // Invalidate search cache
    await this.searchCachePort.invalidateAll();

    // Publish domain event
    this.eventBus.publish(new DocumentRemovedEvent(command.id));

    // Record metrics
    this.metricsService.recordIndex('delete', true);
  }
}
