import { ClearCartHandler } from '../clear-cart.handler';
import { ClearCartCommand } from '../../commands/clear-cart.command';
import { ICartRepository } from '../../ports/cart-repository.port';
import { ICartCache } from '../../ports/cart-cache.port';
import { ICartOutbox } from '../../ports/cart-outbox.port';
import { Cart } from '../../../domain/entities/cart.entity';
import { ProductId } from '../../../domain/value-objects/product-id.vo';
import { Quantity } from '../../../domain/value-objects/quantity.vo';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('ClearCartHandler', () => {
  let handler: ClearCartHandler;
  let mockRepo: jest.Mocked<ICartRepository>;
  let mockCache: jest.Mocked<ICartCache>;
  let mockOutbox: jest.Mocked<ICartOutbox>;

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
    mockOutbox = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    handler = new ClearCartHandler(mockRepo, mockCache, mockOutbox);
  });

  it('should clear all items from the cart and return empty cart', async () => {
    const cart = Cart.create('user-1');
    cart.addItem(ProductId.create(VALID_UUID), Quantity.create(3), 15.0);
    cart.pullEvents();
    mockRepo.findByUserId.mockResolvedValue(cart);

    const result = await handler.execute(new ClearCartCommand('user-1'));

    expect(result.items).toHaveLength(0);
    expect(result.userId).toBe('user-1');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCache.set).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('should throw CartNotFoundException when cart does not exist', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    await expect(
      handler.execute(new ClearCartCommand('user-1')),
    ).rejects.toThrow('not found');
  });

  it('should append CartClearedEvent to outbox', async () => {
    const cart = Cart.create('user-1');
    cart.addItem(ProductId.create(VALID_UUID), Quantity.create(1), 5.0);
    cart.pullEvents();
    mockRepo.findByUserId.mockResolvedValue(cart);

    await handler.execute(new ClearCartCommand('user-1'));

    const events = mockOutbox.append.mock.calls[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('cart.cleared');
  });
});
