import { UpdateItemQuantityHandler } from '../update-item-quantity.handler';
import { UpdateItemQuantityCommand } from '../../commands/update-item-quantity.command';
import { ICartRepository } from '../../ports/cart-repository.port';
import { ICartCache } from '../../ports/cart-cache.port';
import { ICartOutbox } from '../../ports/cart-outbox.port';
import { Cart } from '../../../domain/entities/cart.entity';
import { ProductId } from '../../../domain/value-objects/product-id.vo';
import { Quantity } from '../../../domain/value-objects/quantity.vo';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('UpdateItemQuantityHandler', () => {
  let handler: UpdateItemQuantityHandler;
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

    handler = new UpdateItemQuantityHandler(mockRepo, mockCache, mockOutbox);
  });

  it('should update quantity of an existing item', async () => {
    const cart = Cart.create('user-1');
    cart.addItem(ProductId.create(VALID_UUID), Quantity.create(2), 9.99);
    cart.pullEvents();
    mockRepo.findByUserId.mockResolvedValue(cart);

    const result = await handler.execute(
      new UpdateItemQuantityCommand('user-1', VALID_UUID, 5),
    );

    expect(result.items[0].quantity).toBe(5);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCache.set).toHaveBeenCalledWith('user-1', expect.any(Object));
  });

  it('should throw CartNotFoundException when cart does not exist', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    await expect(
      handler.execute(new UpdateItemQuantityCommand('user-1', VALID_UUID, 5)),
    ).rejects.toThrow('not found');
  });

  it('should throw ItemNotInCartException when item is not in cart', async () => {
    const cart = Cart.create('user-1');
    mockRepo.findByUserId.mockResolvedValue(cart);

    await expect(
      handler.execute(new UpdateItemQuantityCommand('user-1', VALID_UUID, 5)),
    ).rejects.toThrow('not found in cart');
  });

  it('should append event with correct old and new quantities', async () => {
    const cart = Cart.create('user-1');
    cart.addItem(ProductId.create(VALID_UUID), Quantity.create(2), 9.99);
    cart.pullEvents();
    mockRepo.findByUserId.mockResolvedValue(cart);

    await handler.execute(
      new UpdateItemQuantityCommand('user-1', VALID_UUID, 7),
    );

    const events = mockOutbox.append.mock.calls[0][0];
    expect(events[0].eventType).toBe('cart.item_quantity_updated');
    expect((events[0] as any).oldQuantity).toBe(2);
    expect((events[0] as any).newQuantity).toBe(7);
  });
});
