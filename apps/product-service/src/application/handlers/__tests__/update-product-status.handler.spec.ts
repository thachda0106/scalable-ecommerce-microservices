import { UpdateProductStatusHandler } from '../update-product-status.handler';
import { UpdateProductStatusCommand } from '../../commands/update-product-status.command';
import { Product } from '../../../domain/entities/product.entity';
import { ProductNotFoundError } from '../../../domain/errors';
import { ProductStatusEnum } from '../../../domain/value-objects';

describe('UpdateProductStatusHandler', () => {
  let handler: UpdateProductStatusHandler;
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
      recordStatusChange: jest.fn(),
    };

    handler = new UpdateProductStatusHandler(
      mockRepository,
      mockEventPublisher,
      mockCache,
      mockMetrics,
    );
  });

  it('should deactivate an active product', async () => {
    const product = Product.create({
      name: 'Test',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductStatusCommand(product.id.value, 'deactivate'),
    );

    expect(product.status.value).toBe(ProductStatusEnum.INACTIVE);
    expect(mockRepository.save).toHaveBeenCalled();
  });

  it('should mark product as out of stock', async () => {
    const product = Product.create({
      name: 'Test',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductStatusCommand(product.id.value, 'markOutOfStock'),
    );

    expect(product.status.value).toBe(ProductStatusEnum.OUT_OF_STOCK);
  });

  it('should archive a product', async () => {
    const product = Product.create({
      name: 'Test',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductStatusCommand(product.id.value, 'archive'),
    );

    expect(product.status.value).toBe(ProductStatusEnum.ARCHIVED);
  });

  it('should restock an out-of-stock product', async () => {
    const product = Product.create({
      name: 'Test',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    product.markOutOfStock();
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductStatusCommand(product.id.value, 'restock'),
    );

    expect(product.status.value).toBe(ProductStatusEnum.ACTIVE);
  });

  it('should invalidate cache after status change', async () => {
    const product = Product.create({
      name: 'Test',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductStatusCommand(product.id.value, 'deactivate'),
    );

    expect(mockCache.invalidateById).toHaveBeenCalledWith(product.id.value);
  });

  it('should record status change metric', async () => {
    const product = Product.create({
      name: 'Test',
      description: 'Desc',
      price: 10,
      categoryId: 'cat-1',
    });
    mockRepository.findById.mockResolvedValue(product);

    await handler.execute(
      new UpdateProductStatusCommand(product.id.value, 'deactivate'),
    );

    expect(mockMetrics.recordStatusChange).toHaveBeenCalledWith(
      'ACTIVE',
      'INACTIVE',
    );
  });

  it('should throw ProductNotFoundError for non-existent product', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(
      handler.execute(
        new UpdateProductStatusCommand('non-existent', 'activate'),
      ),
    ).rejects.toThrow(ProductNotFoundError);
  });
});
