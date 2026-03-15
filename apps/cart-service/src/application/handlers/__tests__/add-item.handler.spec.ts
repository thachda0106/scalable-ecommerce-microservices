import { AddItemHandler } from '../add-item.handler';
import { AddItemCommand } from '../../commands/add-item.command';
import { ICartRepository } from '../../ports/cart-repository.port';
import { ICartCache } from '../../ports/cart-cache.port';
import { ICartEventsProducer } from '../../ports/cart-events.port';
import { Cart } from '../../../domain/entities/cart.entity';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('AddItemHandler', () => {
  let handler: AddItemHandler;
  let mockRepo: jest.Mocked<ICartRepository>;
  let mockCache: jest.Mocked<ICartCache>;
  let mockProducer: jest.Mocked<ICartEventsProducer>;

  beforeEach(() => {
    mockRepo = {
      findByUserId: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockCache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };
    mockProducer = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    handler = new AddItemHandler(mockRepo, mockCache, mockProducer);
  });

  it('should create a new cart if one does not exist', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    const cmd = new AddItemCommand('user-1', VALID_UUID, 2, 19.99);
    const result = await handler.execute(cmd);

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCache.invalidate).toHaveBeenCalledWith('user-1');
    expect(mockProducer.publish).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(2);
  });

  it('should add to an existing cart', async () => {
    const existingCart = Cart.create('user-1');
    mockRepo.findByUserId.mockResolvedValue(existingCart);

    const cmd = new AddItemCommand('user-1', VALID_UUID, 1, 9.99);
    const result = await handler.execute(cmd);

    expect(result.items).toHaveLength(1);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should merge quantity for duplicate items in existing cart', async () => {
    const existingCart = Cart.create('user-1');
    // Pre-populate with 2 of the same product
    const { ProductId } = jest.requireActual(
      '../../../domain/value-objects/product-id.vo',
    );
    const { Quantity } = jest.requireActual(
      '../../../domain/value-objects/quantity.vo',
    );
    existingCart.addItem(
      ProductId.create(VALID_UUID),
      Quantity.create(2),
      9.99,
    );
    existingCart.pullEvents(); // drain pre-existing events

    mockRepo.findByUserId.mockResolvedValue(existingCart);

    const cmd = new AddItemCommand('user-1', VALID_UUID, 3, 9.99);
    const result = await handler.execute(cmd);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(5);
  });

  it('should invalidate cache after save', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);
    const cmd = new AddItemCommand('user-1', VALID_UUID, 1, 9.99);
    await handler.execute(cmd);

    expect(mockCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('should publish exactly one ItemAddedEvent', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);
    const cmd = new AddItemCommand('user-1', VALID_UUID, 1, 9.99);
    await handler.execute(cmd);

    expect(mockProducer.publish).toHaveBeenCalledTimes(1);
    const publishedEvent = mockProducer.publish.mock.calls[0][0];
    expect(publishedEvent.eventType).toBe('cart.item_added');
  });
});
