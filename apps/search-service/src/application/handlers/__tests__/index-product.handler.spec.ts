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

  beforeEach(() => {
    mockSearchIndexPort = {
      indexDocument: jest.fn().mockResolvedValue(undefined),
      indexDocumentsBulk: jest.fn(),
      removeDocument: jest.fn(),
      documentExists: jest.fn(),
    };
    handler = new IndexProductHandler(mockSearchIndexPort);
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
