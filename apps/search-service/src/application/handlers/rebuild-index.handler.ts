import { CommandHandler, ICommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { RebuildIndexCommand } from '../commands/rebuild-index.command';
import { SEARCH_INDEX_PORT, ISearchIndexPort } from '../../domain/ports';
import { IndexManagementService } from '../../infrastructure/opensearch/index-management.service';
import { IndexRebuiltEvent } from '../../domain/events';
import { SearchMetricsService } from '../../infrastructure/metrics/search-metrics.service';

@CommandHandler(RebuildIndexCommand)
export class RebuildIndexHandler implements ICommandHandler<RebuildIndexCommand> {
  private readonly logger = new Logger(RebuildIndexHandler.name);

  constructor(
    @Inject(SEARCH_INDEX_PORT)
    private readonly searchIndexPort: ISearchIndexPort,
    private readonly indexManagement: IndexManagementService,
    private readonly eventBus: EventBus,
    private readonly metricsService: SearchMetricsService,
  ) {}

  async execute(command: RebuildIndexCommand): Promise<void> {
    const startTime = Date.now();
    this.logger.log(
      `Rebuild index started with batch size ${command.batchSize}`,
    );

    try {
      // 1. Create a new versioned index
      const version = Date.now();
      const newIndex = await this.indexManagement.createVersionedIndex(version);
      this.logger.log(`Created versioned index: ${newIndex}`);

      // 2. Get current index health for doc count
      const health = await this.indexManagement.getIndexHealth();
      this.logger.log(`Current index has ${health.docCount} documents`);

      // 3. Swap the alias atomically to the new index
      // Note: In a full implementation, we'd bulk-copy all docs from the
      // product-service database here before swapping. For now, we swap
      // to the empty index so new events build it fresh.
      await this.indexManagement.swapAlias(newIndex);
      this.logger.log(`Alias swapped to ${newIndex}`);

      const durationMs = Date.now() - startTime;
      this.logger.log(`Rebuild index completed in ${durationMs}ms`);

      // 4. Publish domain event
      this.eventBus.publish(new IndexRebuiltEvent(health.docCount, durationMs));

      // 5. Record metrics
      this.metricsService.recordIndex('bulk', true);
    } catch (error: any) {
      this.logger.error(`Rebuild index failed: ${error.message}`);
      this.metricsService.recordIndex('bulk', false);
      throw error;
    }
  }
}
