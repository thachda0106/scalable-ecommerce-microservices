import { DeleteProductHandler } from '../delete-product.handler';
import { DeleteProductCommand } from '../../commands/delete-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../../domain/errors';

describe('DeleteProductHandler', () => {
  let handler: DeleteProductHandler;
  let mockRepository: any;
  let mockEventPublisher: any;
  let mockCache: any;
  let mockMetrics: any;

  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockEventPublisher = { publishAll: jest.fn().mockResolvedValue(undefined) };
    mockCache = { invalidateById: jest.fn().mockResolvedValue(undefined) };
    mockMetrics = {
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      incrementProductsDeleted: jest.fn(),
    };

    handler = new DeleteProductHandler(
      mockRepository,
      mockEventPublisher,
      mockCache,
      mockMetrics,
    );
  });

  it('should archive (soft-delete) the product', async () => {
    const product = Product.create({
      name: 'Test Product',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(new DeleteProductCommand(product.id.value));

    expect(product.status.value).toBe('ARCHIVED');
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should publish domain events after archiving', async () => {
    const product = Product.create({
      name: 'Test Product',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    product.pullDomainEvents(); // clear creation event
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(new DeleteProductCommand(product.id.value));

    expect(mockEventPublisher.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'product.updated' }),
      ]),
    );
  });

  it('should invalidate cache after soft-delete', async () => {
    const product = Product.create({
      name: 'Test Product',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(new DeleteProductCommand(product.id.value));

    expect(mockCache.invalidateById).toHaveBeenCalledWith(product.id.value);
  });

  it('should throw ProductNotFoundError for non-existent product', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new DeleteProductCommand('non-existent')),
    ).rejects.toThrow(ProductNotFoundError);
  });

  it('should increment deleted metric', async () => {
    const product = Product.create({
      name: 'Test Product',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(new DeleteProductCommand(product.id.value));

    expect(mockMetrics.incrementProductsDeleted).toHaveBeenCalledTimes(1);
  });
});
