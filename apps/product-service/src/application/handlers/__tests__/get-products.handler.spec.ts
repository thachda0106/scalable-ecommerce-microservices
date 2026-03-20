import { GetProductsHandler } from '../get-products.handler';
import { GetProductsQuery } from '../../queries/get-products.query';
import { Product } from '../../../domain/entities/product.entity';

describe('GetProductsHandler', () => {
  let handler: GetProductsHandler;
  let mockRepository: any;
  let mockMetrics: any;

  const product1 = Product.create({
    name: 'Product 1',
    description: 'Desc 1',
    price: 10,
    categoryId: 'cat-1',
  });

  const product2 = Product.create({
    name: 'Product 2',
    description: 'Desc 2',
    price: 20,
    categoryId: 'cat-2',
  });

  beforeEach(() => {
    mockRepository = {
      findAll: jest.fn(),
    };
    mockMetrics = {
      startTimer: jest.fn().mockReturnValue(jest.fn()),
    };

    handler = new GetProductsHandler(mockRepository, mockMetrics);
  });

  it('should return paginated products', async () => {
    mockRepository.findAll.mockResolvedValue({
      data: [product1, product2],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const result = await handler.execute(new GetProductsQuery());

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
  });

  it('should apply default pagination', async () => {
    mockRepository.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await handler.execute(new GetProductsQuery());

    expect(mockRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      }),
    );
  });

  it('should cap limit at 100', async () => {
    mockRepository.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 100,
      totalPages: 0,
    });

    await handler.execute(new GetProductsQuery(1, 500));

    expect(mockRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
      }),
    );
  });

  it('should pass all filter parameters', async () => {
    mockRepository.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    await handler.execute(
      new GetProductsQuery(
        2,
        10,
        'name',
        'ASC',
        'ACTIVE',
        'cat-1',
        5,
        50,
        'phone',
      ),
    );

    expect(mockRepository.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'ASC',
        status: 'ACTIVE',
        categoryId: 'cat-1',
        minPrice: 5,
        maxPrice: 50,
        search: 'phone',
      }),
    );
  });
});
