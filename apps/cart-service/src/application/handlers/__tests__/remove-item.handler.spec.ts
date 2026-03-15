import { RemoveItemHandler } from '../remove-item.handler';
import { RemoveItemCommand } from '../../commands/remove-item.command';
import { ICartRepository } from '../../ports/cart-repository.port';
import { ICartCache } from '../../ports/cart-cache.port';
import { ICartOutbox } from '../../ports/cart-outbox.port';
import { Cart } from '../../../domain/entities/cart.entity';
import { ProductId } from '../../../domain/value-objects/product-id.vo';
import { Quantity } from '../../../domain/value-objects/quantity.vo';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('RemoveItemHandler', () => {
  let handler: RemoveItemHandler;
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

    handler = new RemoveItemHandler(mockRepo, mockCache, mockOutbox);
  });

  it('should remove an existing item from the cart', async () => {
    const cart = Cart.create('user-1');
    cart.addItem(ProductId.create(VALID_UUID), Quantity.create(1), 9.99);
    cart.pullEvents();
    mockRepo.findByUserId.mockResolvedValue(cart);

    const result = await handler.execute(
      new RemoveItemCommand('user-1', VALID_UUID),
    );

    expect(result.items).toHaveLength(0);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCache.set).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('should throw CartNotFoundException when cart does not exist', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    await expect(
      handler.execute(new RemoveItemCommand('user-1', VALID_UUID)),
    ).rejects.toThrow('not found');
  });

  it('should throw ItemNotInCartException when item is not in cart', async () => {
    const cart = Cart.create('user-1');
    mockRepo.findByUserId.mockResolvedValue(cart);

    await expect(
      handler.execute(new RemoveItemCommand('user-1', VALID_UUID)),
    ).rejects.toThrow('not found in cart');
  });

  it('should append ItemRemovedEvent to outbox', async () => {
    const cart = Cart.create('user-1');
    cart.addItem(ProductId.create(VALID_UUID), Quantity.create(1), 9.99);
    cart.pullEvents();
    mockRepo.findByUserId.mockResolvedValue(cart);

    await handler.execute(new RemoveItemCommand('user-1', VALID_UUID));

    expect(mockOutbox.append).toHaveBeenCalledTimes(1);
    const events = mockOutbox.append.mock.calls[0][0];
    expect(events[0].eventType).toBe('cart.item_removed');
  });
});
