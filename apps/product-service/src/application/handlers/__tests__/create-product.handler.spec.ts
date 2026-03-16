import { CreateProductHandler } from '../create-product.handler';
import { CreateProductCommand } from '../../commands/create-product.command';

describe('CreateProductHandler', () => {
  let handler: CreateProductHandler;
  let mockRepository: any;
  let mockEventPublisher: any;
  let mockCache: any;
  let mockMetrics: any;

  beforeEach(() => {
    mockRepository = { save: jest.fn().mockResolvedValue(undefined) };
    mockEventPublisher = { publishAll: jest.fn().mockResolvedValue(undefined) };
    mockCache = { invalidateById: jest.fn().mockResolvedValue(undefined) };
    mockMetrics = {
      startTimer: jest.fn().mockReturnValue(jest.fn()),
      incrementProductsCreated: jest.fn(),
    };

    handler = new CreateProductHandler(
      mockRepository,
      mockEventPublisher,
      mockCache,
      mockMetrics,
    );
  });

  it('should create product and return id', async () => {
    const command = new CreateProductCommand(
      'Test Product',
      'Description',
      29.99,
      'USD',
      'cat-123',
    );

    const result = await handler.execute(command);

    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should save product to repository', async () => {
    const command = new CreateProductCommand(
      'Test Product',
      'Description',
      29.99,
      'USD',
      'cat-123',
    );

    await handler.execute(command);

    expect(mockRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should publish domain events', async () => {
    const command = new CreateProductCommand(
      'Test Product',
      'Description',
      29.99,
      'USD',
      'cat-123',
    );

    await handler.execute(command);

    expect(mockEventPublisher.publishAll).toHaveBeenCalledTimes(1);
    expect(mockEventPublisher.publishAll).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'product.created' }),
      ]),
    );
  });

  it('should increment created metric', async () => {
    const command = new CreateProductCommand(
      'Test Product',
      'Description',
      29.99,
      'USD',
      'cat-123',
    );

    await handler.execute(command);

    expect(mockMetrics.incrementProductsCreated).toHaveBeenCalledTimes(1);
  });
});
