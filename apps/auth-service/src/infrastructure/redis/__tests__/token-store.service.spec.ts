import { TokenStoreService } from '../token-store.service';

describe('TokenStoreService', () => {
  let service: TokenStoreService;
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    smembers: jest.Mock;
    expire: jest.Mock;
    exists: jest.Mock;
  };

  beforeEach(() => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    service = new TokenStoreService(redis as any);
  });

  describe('storeRefreshToken', () => {
    it('should store token with namespaced key and 7-day TTL', async () => {
      await service.storeRefreshToken('user-123', 'my-token');

      // Key must be namespaced: refresh:{userId}:{tokenId}
      expect(redis.set).toHaveBeenCalledWith(
        'refresh:user-123:my-token',
        'user-123',
        'EX',
        604800,
      );
    });

    it('should add tokenId to the user session index', async () => {
      await service.storeRefreshToken('user-123', 'my-token');

      expect(redis.sadd).toHaveBeenCalledWith('sessions:user-123', 'my-token');
      expect(redis.expire).toHaveBeenCalledWith('sessions:user-123', 604800);
    });
  });

  describe('getUserIdByRefreshToken', () => {
    it('should return userId for existing token', async () => {
      redis.get.mockResolvedValue('user-123');

      const result = await service.getUserIdByRefreshToken('user-123', 'my-token');

      expect(result).toBe('user-123');
      expect(redis.get).toHaveBeenCalledWith('refresh:user-123:my-token');
    });

    it('should return null for missing token', async () => {
      redis.get.mockResolvedValue(null);

      const result = await service.getUserIdByRefreshToken('user-123', 'gone-token');

      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should delete the namespaced token key and remove from session index', async () => {
      await service.revokeRefreshToken('user-123', 'my-token');

      expect(redis.del).toHaveBeenCalledWith('refresh:user-123:my-token');
      expect(redis.srem).toHaveBeenCalledWith('sessions:user-123', 'my-token');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens using the session index (no SCAN)', async () => {
      redis.smembers.mockResolvedValue(['token-a', 'token-b']);

      await service.revokeAllUserTokens('user-123');

      // Must delete both namespaced keys directly (not via SCAN)
      expect(redis.del).toHaveBeenCalledWith(
        'refresh:user-123:token-a',
        'refresh:user-123:token-b',
      );
      // Session index itself must be deleted
      expect(redis.del).toHaveBeenCalledWith('sessions:user-123');
    });

    it('should do nothing for keys if no tokens exist for user', async () => {
      redis.smembers.mockResolvedValue([]);

      await service.revokeAllUserTokens('user-nobody');

      // del is only called once — to delete the empty session index
      expect(redis.del).toHaveBeenCalledWith('sessions:user-nobody');
      expect(redis.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('jti blocklist', () => {
    it('should store jti in blocklist with given TTL', async () => {
      await service.blocklistJti('test-jti', 900);

      expect(redis.set).toHaveBeenCalledWith(
        'blocklist:jti:test-jti',
        '1',
        'EX',
        900,
      );
    });

    it('should return true if jti is blocked', async () => {
      redis.exists.mockResolvedValue(1);

      const blocked = await service.isJtiBlocked('test-jti');

      expect(blocked).toBe(true);
      expect(redis.exists).toHaveBeenCalledWith('blocklist:jti:test-jti');
    });

    it('should return false if jti is not blocked', async () => {
      redis.exists.mockResolvedValue(0);

      const blocked = await service.isJtiBlocked('clean-jti');

      expect(blocked).toBe(false);
    });
  });
});
