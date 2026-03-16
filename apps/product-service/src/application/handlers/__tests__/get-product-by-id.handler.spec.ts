import { GetProductByIdHandler } from '../get-product-by-id.handler';
import { GetProductByIdQuery } from '../../queries/get-product-by-id.query';
import { Product } from '../../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../../domain/errors';

describe('GetProductByIdHandler', () => {
  let handler: GetProductByIdHandler;
  let mockRepository: any;
  let mockCache: any;
  let mockMetrics: any;

  const testProduct = Product.create({
    name: 'Test Product',
    description: 'Description',
    price: 29.99,
    categoryId: 'cat-123',
  });

  beforeEach(() => {
    mockRepository = { findById: jest.fn() };
    mockCache = {
      getById: jest.fn(),
      setById: jest.fn().mockResolvedValue(undefined),
    };
    mockMetrics = {
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      incrementCacheHit: jest.fn(),
      incrementCacheMiss: jest.fn(),
    };

    handler = new GetProductByIdHandler(
      mockRepository,
      mockCache,
      mockMetrics,
    );
  });

  it('should return product from cache on hit', async () => {
    mockCache.getById.mockResolvedValue(testProduct);

    const result = await handler.execute(
      new GetProductByIdQuery('some-id'),
    );

    expect(result).toBe(testProduct);
    expect(mockRepository.findById).not.toHaveBeenCalled();
    expect(mockMetrics.incrementCacheHit).toHaveBeenCalled();
  });

  it('should fall through to repo on cache miss', async () => {
    mockCache.getById.mockResolvedValue(null);
    mockRepository.findById.mockResolvedValue(testProduct);

    const result = await handler.execute(
      new GetProductByIdQuery('some-id'),
    );

    expect(result).toBe(testProduct);
    expect(mockRepository.findById).toHaveBeenCalled();
    expect(mockMetrics.incrementCacheMiss).toHaveBeenCalled();
  });

  it('should populate cache after repo lookup', async () => {
    mockCache.getById.mockResolvedValue(null);
    mockRepository.findById.mockResolvedValue(testProduct);

    await handler.execute(new GetProductByIdQuery('some-id'));

    expect(mockCache.setById).toHaveBeenCalledWith('some-id', testProduct);
  });

  it('should throw ProductNotFoundError when not found anywhere', async () => {
    mockCache.getById.mockResolvedValue(null);
    mockRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new GetProductByIdQuery('non-existent')),
    ).rejects.toThrow(ProductNotFoundError);
  });
});
