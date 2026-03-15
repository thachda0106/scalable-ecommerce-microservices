import { Test, TestingModule } from '@nestjs/testing';
import { LogoutHandler } from '../logout.handler';
import { LogoutCommand } from '../../commands/logout.command';
import { TokenStoreService } from '../../../infrastructure/redis/token-store.service';

describe('LogoutHandler', () => {
  let handler: LogoutHandler;
  let tokenStore: { revokeRefreshToken: jest.Mock; blocklistJti: jest.Mock };

  beforeEach(async () => {
    tokenStore = {
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      blocklistJti: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutHandler,
        { provide: TokenStoreService, useValue: tokenStore },
      ],
    }).compile();

    handler = module.get<LogoutHandler>(LogoutHandler);
  });

  it('should revoke the refresh token with userId and tokenId', async () => {
    // LogoutCommand now requires refreshToken + userId (+ optional jti)
    const command = new LogoutCommand('my-refresh-token', 'user-id-1');
    const result = await handler.execute(command);

    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith(
      'user-id-1',
      'my-refresh-token',
    );
    expect(result).toEqual({ message: 'Logged out successfully' });
  });

  it('should blocklist the jti if provided', async () => {
    const command = new LogoutCommand('my-refresh-token', 'user-id-1', 'my-jti');
    await handler.execute(command);

    expect(tokenStore.blocklistJti).toHaveBeenCalledWith('my-jti', 900);
    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith(
      'user-id-1',
      'my-refresh-token',
    );
  });

  it('should not call blocklistJti when jti is not provided', async () => {
    const command = new LogoutCommand('my-refresh-token', 'user-id-1');
    await handler.execute(command);

    expect(tokenStore.blocklistJti).not.toHaveBeenCalled();
  });

  it('should propagate errors from token store', async () => {
    tokenStore.revokeRefreshToken.mockRejectedValue(new Error('Redis error'));

    const command = new LogoutCommand('any-token', 'user-id-1');
    await expect(handler.execute(command)).rejects.toThrow('Redis error');
  });
});
