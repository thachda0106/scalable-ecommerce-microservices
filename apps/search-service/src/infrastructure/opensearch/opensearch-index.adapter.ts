import { Injectable, Inject, Logger } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { OPENSEARCH_CLIENT } from './opensearch-client.provider';
import { PRODUCT_INDEX_ALIAS } from './index-mappings';
import {
  ISearchIndexPort,
  BulkIndexResult,
} from '../../domain/ports/search-index.port';
import { SearchDocument } from '../../domain/entities/search-document.entity';

@Injectable()
export class OpenSearchIndexAdapter implements ISearchIndexPort {
  private readonly logger = new Logger(OpenSearchIndexAdapter.name);

  constructor(
    @Inject(OPENSEARCH_CLIENT)
    private readonly client: Client,
  ) {}

  async indexDocument(doc: SearchDocument): Promise<void> {
    await this.client.index({
      index: PRODUCT_INDEX_ALIAS,
      id: doc.id,
      body: this.toIndexBody(doc),
      refresh: false,
    });
  }

  async indexDocumentsBulk(docs: SearchDocument[]): Promise<BulkIndexResult> {
    if (docs.length === 0) {
      return { indexed: 0, failed: 0 };
    }

    let totalIndexed = 0;
    let totalFailed = 0;
    const batchSize = 1000;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const body = batch.flatMap((doc) => [
        { index: { _index: PRODUCT_INDEX_ALIAS, _id: doc.id } },
        this.toIndexBody(doc),
      ]);

      const response = await this.client.bulk({ body, refresh: false });

      if (response.body.errors) {
        const items = response.body.items;
        for (const item of items) {
          if (item.index?.error) {
            totalFailed++;
            this.logger.warn(
              `Bulk index error for ${item.index._id}: ${item.index.error.reason}`,
            );
          } else {
            totalIndexed++;
          }
        }
      } else {
        totalIndexed += batch.length;
      }
    }

    this.logger.log(
      `Bulk indexed: ${totalIndexed} success, ${totalFailed} failed`,
    );
    return { indexed: totalIndexed, failed: totalFailed };
  }

  async removeDocument(id: string): Promise<void> {
    try {
      await this.client.delete({
        index: PRODUCT_INDEX_ALIAS,
        id,
        refresh: false,
      });
    } catch (err: any) {
      if (err.meta?.statusCode === 404) {
        this.logger.debug(`Document ${id} not found, skipping delete`);
        return;
      }
      throw err;
    }
  }

  async documentExists(id: string): Promise<boolean> {
    const response = await this.client.exists({
      index: PRODUCT_INDEX_ALIAS,
      id,
    });
    return response.body as boolean;
  }

  private toIndexBody(doc: SearchDocument): Record<string, unknown> {
    return {
      id: doc.id,
      name: doc.name,
      name_suggest: { input: doc.name.split(/\s+/) },
      description: doc.description,
      price: doc.price,
      status: doc.status,
      categoryId: doc.categoryId,
      attributes: doc.attributes,
      indexedAt: doc.indexedAt.toISOString(),
    };
  }
}
