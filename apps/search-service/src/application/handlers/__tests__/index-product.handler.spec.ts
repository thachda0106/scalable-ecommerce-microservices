import { IndexProductHandler } from '../index-product.handler';
import { IndexProductCommand } from '../../commands/index-product.command';

describe('IndexProductHandler', () => {
  let handler: IndexProductHandler;
  let mockSearchIndexPort: {
    indexDocument: jest.Mock;
    indexDocumentsBulk: jest.Mock;
    removeDocument: jest.Mock;
    documentExists: jest.Mock;
  };
  let mockSearchCachePort: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    invalidateAll: jest.Mock;
    generateKey: jest.Mock;
  };
  let mockEventBus: {
    publish: jest.Mock;
    publishAll: jest.Mock;
  };
  let mockMetricsService: {
    recordSearch: jest.Mock;
    recordIndex: jest.Mock;
    recordCacheOp: jest.Mock;
    getMetrics: jest.Mock;
  };

  beforeEach(() => {
    mockSearchIndexPort = {
      indexDocument: jest.fn().mockResolvedValue(undefined),
      indexDocumentsBulk: jest.fn(),
      removeDocument: jest.fn(),
      documentExists: jest.fn(),
    };
    mockSearchCachePort = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      invalidateAll: jest.fn().mockResolvedValue(undefined),
      generateKey: jest.fn(),
    };
    mockEventBus = {
      publish: jest.fn(),
      publishAll: jest.fn(),
    };
    mockMetricsService = {
      recordSearch: jest.fn(),
      recordIndex: jest.fn(),
      recordCacheOp: jest.fn(),
      getMetrics: jest.fn(),
    };
    handler = new IndexProductHandler(
      mockSearchIndexPort,
      mockSearchCachePort,
      mockEventBus as any,
      mockMetricsService as any,
    );
  });

  it('should index a product document', async () => {
    const command = new IndexProductCommand(
      'prod-1',
      'Test Product',
      'A description',
      29.99,
      'ACTIVE',
      'cat-1',
    );

    await handler.execute(command);

    expect(mockSearchIndexPort.indexDocument).toHaveBeenCalledTimes(1);
    const calledDoc = mockSearchIndexPort.indexDocument.mock.calls[0][0];
    expect(calledDoc.id).toBe('prod-1');
    expect(calledDoc.name).toBe('Test Product');
    expect(calledDoc.price).toBe(29.99);
  });

  it('should invalidate cache after indexing', async () => {
    const command = new IndexProductCommand(
      'prod-1',
      'Test Product',
      'A description',
      29.99,
      'ACTIVE',
    );

    await handler.execute(command);

    expect(mockSearchCachePort.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('should publish DocumentIndexedEvent', async () => {
    const command = new IndexProductCommand(
      'prod-1',
      'Test Product',
      'A description',
      29.99,
      'ACTIVE',
    );

    await handler.execute(command);

    expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
    const event = mockEventBus.publish.mock.calls[0][0];
    expect(event.documentId).toBe('prod-1');
  });

  it('should record metrics on successful indexing', async () => {
    const command = new IndexProductCommand(
      'prod-1',
      'Product',
      'Desc',
      10,
      'ACTIVE',
    );

    await handler.execute(command);

    expect(mockMetricsService.recordIndex).toHaveBeenCalledWith('index', true);
  });

  it('should handle indexing errors gracefully', async () => {
    mockSearchIndexPort.indexDocument.mockRejectedValue(
      new Error('OpenSearch unavailable'),
    );

    const command = new IndexProductCommand(
      'prod-2',
      'Product',
      'Desc',
      10,
      'ACTIVE',
    );

    await expect(handler.execute(command)).rejects.toThrow(
      'OpenSearch unavailable',
    );
  });
});
