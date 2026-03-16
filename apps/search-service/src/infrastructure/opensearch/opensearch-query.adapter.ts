import { Injectable, Inject, Logger } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { OPENSEARCH_CLIENT } from './opensearch-client.provider';
import { PRODUCT_INDEX_ALIAS } from './index-mappings';
import { QueryBuilder } from './query-builder';
import { ISearchQueryPort } from '../../domain/ports/search-query.port';
import { SearchDocument } from '../../domain/entities/search-document.entity';
import { SearchResult } from '../../domain/entities/search-result.entity';
import { SearchQuery } from '../../domain/value-objects/search-query.vo';

@Injectable()
export class OpenSearchQueryAdapter implements ISearchQueryPort {
  private readonly logger = new Logger(OpenSearchQueryAdapter.name);

  constructor(
    @Inject(OPENSEARCH_CLIENT)
    private readonly client: Client,
  ) {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const body = QueryBuilder.buildSearchBody(query);

    const response = await this.client.search({
      index: PRODUCT_INDEX_ALIAS,
      body,
    });

    const hits = (response.body as any).hits;
    const total =
      typeof hits.total === 'number' ? hits.total : hits.total?.value ?? 0;

    const documents = hits.hits.map((hit: any) =>
      SearchDocument.create({
        id: hit._source.id,
        name: hit._source.name,
        description: hit._source.description,
        price: hit._source.price,
        status: hit._source.status,
        categoryId: hit._source.categoryId,
        attributes: hit._source.attributes,
        indexedAt: new Date(hit._source.indexedAt),
      }),
    );

    // Extract cursor from last hit's sort values for search_after
    const lastHit = hits.hits[hits.hits.length - 1];
    const cursor = lastHit?.sort
      ? JSON.stringify(lastHit.sort)
      : null;

    return SearchResult.create({
      documents,
      total,
      page: query.pagination.cursor ? 1 : query.pagination.page,
      limit: query.pagination.limit,
      cursor,
      took: (response.body as any).took ?? 0,
    });
  }

  async suggest(prefix: string, limit: number = 10): Promise<string[]> {
    const body = QueryBuilder.buildSuggestBody(prefix, limit);

    const response = await this.client.search({
      index: PRODUCT_INDEX_ALIAS,
      body,
    });

    const suggestions =
      (response.body as any).suggest?.product_suggest?.[0]?.options ?? [];

    return suggestions.map((s: any) => s.text);
  }

  async findById(id: string): Promise<SearchDocument | null> {
    try {
      const response = await this.client.get({
        index: PRODUCT_INDEX_ALIAS,
        id,
      });

      const source = (response.body as any)._source;
      return SearchDocument.create({
        id: source.id,
        name: source.name,
        description: source.description,
        price: source.price,
        status: source.status,
        categoryId: source.categoryId,
        attributes: source.attributes,
        indexedAt: new Date(source.indexedAt),
      });
    } catch (err: any) {
      if (err.meta?.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }
}
