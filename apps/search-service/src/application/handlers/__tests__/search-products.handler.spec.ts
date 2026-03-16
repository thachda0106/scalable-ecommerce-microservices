import { SearchProductsHandler } from '../search-products.handler';
import { SearchProductsQuery } from '../../queries/search-products.query';
import { SearchResult } from '../../../domain/entities/search-result.entity';

describe('SearchProductsHandler', () => {
  let handler: SearchProductsHandler;
  let mockSearchQueryPort: {
    search: jest.Mock;
    suggest: jest.Mock;
    findById: jest.Mock;
  };
  let mockSearchCachePort: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    generateKey: jest.Mock;
  };

  beforeEach(() => {
    mockSearchQueryPort = {
      search: jest.fn(),
      suggest: jest.fn(),
      findById: jest.fn(),
    };
    mockSearchCachePort = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      generateKey: jest.fn().mockReturnValue('search:test-key'),
    };
    handler = new SearchProductsHandler(
      mockSearchQueryPort,
      mockSearchCachePort,
    );
  });

  it('should return cached result on cache hit', async () => {
    const cachedResult = {
      documents: [],
      total: 0,
      page: 1,
      limit: 20,
      cursor: null,
      took: 5,
    };
    mockSearchCachePort.get.mockResolvedValue(cachedResult);

    const query = new SearchProductsQuery('laptop');
    const result = await handler.execute(query);

    expect(mockSearchCachePort.get).toHaveBeenCalledWith('search:test-key');
    expect(mockSearchQueryPort.search).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });

  it('should search and cache result on cache miss', async () => {
    mockSearchCachePort.get.mockResolvedValue(null);
    const searchResult = SearchResult.create({
      documents: [],
      total: 10,
      page: 1,
      limit: 20,
      took: 15,
    });
    mockSearchQueryPort.search.mockResolvedValue(searchResult);

    const query = new SearchProductsQuery('laptop');
    const result = await handler.execute(query);

    expect(mockSearchQueryPort.search).toHaveBeenCalled();
    expect(mockSearchCachePort.set).toHaveBeenCalledWith(
      'search:test-key',
      searchResult,
      60, // 60s TTL
    );
    expect(result.total).toBe(10);
  });
});
