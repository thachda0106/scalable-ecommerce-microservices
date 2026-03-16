import { ConfigService } from '@nestjs/config';

export const PRODUCT_INDEX_ALIAS = 'products';

export function createIndexSettings(configService?: ConfigService) {
  const replicas = configService
    ? parseInt(configService.get<string>('OPENSEARCH_INDEX_REPLICAS', '0'), 10)
    : 0;

  return {
    number_of_shards: 1,
    number_of_replicas: replicas,
    refresh_interval: '1s',
  };
}

// Default settings for backward compatibility
export const PRODUCT_INDEX_SETTINGS = createIndexSettings();

export const PRODUCT_INDEX_MAPPINGS = {
  properties: {
    id: { type: 'keyword' },
    name: {
      type: 'search_as_you_type',
      max_shingle_size: 3,
    },
    name_suggest: {
      type: 'completion',
    },
    description: {
      type: 'text',
      analyzer: 'standard',
    },
    price: { type: 'float' },
    status: { type: 'keyword' },
    categoryId: { type: 'keyword' },
    attributes: {
      type: 'object',
      enabled: true,
    },
    indexedAt: { type: 'date' },
  },
};
