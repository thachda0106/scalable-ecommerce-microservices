import { Injectable, Inject, Logger } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { OPENSEARCH_CLIENT } from './opensearch-client.provider';
import {
  PRODUCT_INDEX_ALIAS,
  PRODUCT_INDEX_SETTINGS,
  PRODUCT_INDEX_MAPPINGS,
} from './index-mappings';

@Injectable()
export class IndexManagementService {
  private readonly logger = new Logger(IndexManagementService.name);

  constructor(
    @Inject(OPENSEARCH_CLIENT)
    private readonly client: Client,
  ) {}

  async ensureIndex(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({
        index: PRODUCT_INDEX_ALIAS,
      });

      if (!exists.body) {
        this.logger.log(
          `Index "${PRODUCT_INDEX_ALIAS}" not found. Creating...`,
        );
        await this.client.indices.create({
          index: PRODUCT_INDEX_ALIAS,
          body: {
            settings: PRODUCT_INDEX_SETTINGS,
            mappings: PRODUCT_INDEX_MAPPINGS,
          } as any,
        });
        this.logger.log(`Index "${PRODUCT_INDEX_ALIAS}" created successfully`);
      } else {
        this.logger.log(`Index "${PRODUCT_INDEX_ALIAS}" already exists`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to ensure index: ${error.message}`);
    }
  }

  async createVersionedIndex(version: number): Promise<string> {
    const indexName = `${PRODUCT_INDEX_ALIAS}_v${version}`;
    await this.client.indices.create({
      index: indexName,
      body: {
        settings: PRODUCT_INDEX_SETTINGS,
        mappings: PRODUCT_INDEX_MAPPINGS,
      } as any,
    });
    this.logger.log(`Versioned index "${indexName}" created`);
    return indexName;
  }

  async swapAlias(newIndex: string, oldIndex?: string): Promise<void> {
    const actions: any[] = [
      { add: { index: newIndex, alias: PRODUCT_INDEX_ALIAS } },
    ];

    if (oldIndex) {
      actions.unshift({
        remove: { index: oldIndex, alias: PRODUCT_INDEX_ALIAS },
      });
    }

    await this.client.indices.updateAliases({ body: { actions } });
    this.logger.log(`Alias "${PRODUCT_INDEX_ALIAS}" swapped to "${newIndex}"`);
  }

  async deleteIndex(indexName: string): Promise<void> {
    await this.client.indices.delete({ index: indexName });
    this.logger.log(`Index "${indexName}" deleted`);
  }

  async getIndexHealth(): Promise<{
    docCount: number;
    sizeInBytes: number;
    status: string;
  }> {
    try {
      const stats = await this.client.indices.stats({
        index: PRODUCT_INDEX_ALIAS,
      });

      const indexStats = (stats.body as any)._all.primaries;
      return {
        docCount: indexStats.docs?.count ?? 0,
        sizeInBytes: indexStats.store?.size_in_bytes ?? 0,
        status: 'green',
      };
    } catch {
      return { docCount: 0, sizeInBytes: 0, status: 'unavailable' };
    }
  }
}
