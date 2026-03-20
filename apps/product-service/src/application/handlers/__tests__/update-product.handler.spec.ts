import { UpdateProductHandler } from '../update-product.handler';
import { UpdateProductCommand } from '../../commands/update-product.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../../domain/errors';

describe('UpdateProductHandler', () => {
  let handler: UpdateProductHandler;
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
      incrementProductsUpdated: jest.fn(),
    };

    handler = new UpdateProductHandler(
      mockRepository,
      mockEventPublisher,
      mockCache,
      mockMetrics,
    );
  });

  it('should update product details', async () => {
    const product = Product.create({
      name: 'Original',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    const command = new UpdateProductCommand(
      product.id.value,
      'Updated',
      undefined,
      undefined,
      undefined,
      undefined,
    );

    await handler.execute(command);

    expect(product.name).toBe('Updated');
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should invalidate cache after update', async () => {
    const product = Product.create({
      name: 'Original',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductCommand(product.id.value, 'Updated'),
    );

    expect(mockCache.invalidateById).toHaveBeenCalledWith(product.id.value);
  });

  it('should publish ProductUpdatedEvent', async () => {
    const product = Product.create({
      name: 'Original',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    product.pullDomainEvents(); // clear creation event
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductCommand(product.id.value, 'Updated'),
    );

    expect(mockEventPublisher.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'product.updated' }),
      ]),
    );
  });

  it('should throw ProductNotFoundError for non-existent product', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(new UpdateProductCommand('non-existent', 'Name')),
    ).rejects.toThrow(ProductNotFoundError);
  });
});
