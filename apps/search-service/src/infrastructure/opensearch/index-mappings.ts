export const PRODUCT_INDEX_ALIAS = 'products';

export const PRODUCT_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0, // For local dev; production should use 1+
  refresh_interval: '1s',
};

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
