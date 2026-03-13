import { TokenStoreService } from '../token-store.service';

describe('TokenStoreService', () => {
  let service: TokenStoreService;
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    scan: jest.Mock;
    mget: jest.Mock;
  };

  beforeEach(() => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      scan: jest.fn(),
      mget: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    service = new TokenStoreService(redis as any);
  });

  describe('storeRefreshToken', () => {
    it('should store token with 7-day TTL', async () => {
      await service.storeRefreshToken('my-token', 'user-123');

      expect(redis.set).toHaveBeenCalledWith(
        'refresh:my-token',
        'user-123',
        'EX',
        604800,
      );
    });
  });

  describe('getUserIdByRefreshToken', () => {
    it('should return userId for existing token', async () => {
      redis.get.mockResolvedValue('user-123');

      const result = await service.getUserIdByRefreshToken('my-token');

      expect(result).toBe('user-123');
      expect(redis.get).toHaveBeenCalledWith('refresh:my-token');
    });

    it('should return null for missing token', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.getUserIdByRefreshToken('gone-token');

      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete the token key from Redis', async () => {
      await service.revokeRefreshToken('my-token');

      expect(redis.del).toHaveBeenCalledWith('refresh:my-token');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens belonging to a user via SCAN', async () => {
      // First SCAN returns cursor '0' (done) with matching key
      redis.scan.mockResolvedValue([
        '0',
        ['refresh:token-a', 'refresh:token-b'],
      ]);
      // mget returns userId for token-a, different user for token-b
      redis.mget.mockResolvedValue(['user-123', 'other-user']);

      await service.revokeAllUserTokens('user-123');

      expect(redis.del).toHaveBeenCalledWith('refresh:token-a');
      // token-b belongs to other-user, should NOT be deleted
      expect(redis.del).not.toHaveBeenCalledWith('refresh:token-b');
    });

    it('should handle multiple SCAN pages', async () => {
      redis.scan
        .mockResolvedValueOnce(['42', ['refresh:tok-1']])
        .mockResolvedValueOnce(['0', ['refresh:tok-2']]);
      redis.mget
        .mockResolvedValueOnce(['user-123'])
        .mockResolvedValueOnce(['user-123']);

      await service.revokeAllUserTokens('user-123');

      // All keys collected across pages, then deleted in one call
      expect(redis.del).toHaveBeenCalledWith('refresh:tok-1', 'refresh:tok-2');
    });

    it('should do nothing if no tokens exist for user', async () => {
      redis.scan.mockResolvedValue(['0', []]);

      await service.revokeAllUserTokens('user-nobody');

      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
