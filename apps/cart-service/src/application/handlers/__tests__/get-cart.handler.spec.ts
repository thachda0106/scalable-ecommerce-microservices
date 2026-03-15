import { GetCartHandler } from '../get-cart.handler';
import { GetCartQuery } from '../../queries/get-cart.query';
import { ICartRepository } from '../../ports/cart-repository.port';
import { ICartCache } from '../../ports/cart-cache.port';
import { Cart } from '../../../domain/entities/cart.entity';

describe('GetCartHandler', () => {
  let handler: GetCartHandler;
  let mockRepo: jest.Mocked<ICartRepository>;
  let mockCache: jest.Mocked<ICartCache>;

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

    handler = new GetCartHandler(mockCache, mockRepo);
  });

  describe('Cache HIT path', () => {
    it('should return cached cart without calling repository', async () => {
      const cachedCart = Cart.reconstitute('cart-1', 'user-1', []);
      mockCache.get.mockResolvedValue(cachedCart);

      const result = await handler.execute(new GetCartQuery('user-1'));

      expect(mockRepo.findByUserId).not.toHaveBeenCalled();
      expect(mockCache.set).not.toHaveBeenCalled();
      expect(result.userId).toBe('user-1');
      expect(result.items).toHaveLength(0);
    });
  });

  describe('Cache MISS path', () => {
    it('should fetch from repo and warm cache', async () => {
      mockCache.get.mockResolvedValue(null);
      const dbCart = Cart.reconstitute('cart-1', 'user-1', []);
      mockRepo.findByUserId.mockResolvedValue(dbCart);

      const result = await handler.execute(new GetCartQuery('user-1'));

      expect(mockRepo.findByUserId).toHaveBeenCalledWith('user-1');
      expect(mockCache.set).toHaveBeenCalledWith('user-1', dbCart);
      expect(result.userId).toBe('user-1');
    });

    it('should return empty cart if not found in repo either', async () => {
      mockCache.get.mockResolvedValue(null);
      mockRepo.findByUserId.mockResolvedValue(null);

      const result = await handler.execute(new GetCartQuery('user-404'));

      expect(result.items).toEqual([]);
      expect(result.userId).toBe('user-404');
      // Should NOT call cache.set for a non-existent cart
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });
});
