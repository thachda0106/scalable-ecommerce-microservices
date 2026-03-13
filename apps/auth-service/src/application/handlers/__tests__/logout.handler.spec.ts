import { Test, TestingModule } from '@nestjs/testing';
import { LogoutHandler } from '../logout.handler';
import { LogoutCommand } from '../../commands/logout.command';
import { TokenStoreService } from '../../../infrastructure/redis/token-store.service';

describe('LogoutHandler', () => {
  let handler: LogoutHandler;
  let tokenStore: { revokeRefreshToken: jest.Mock };

  beforeEach(async () => {
    tokenStore = { revokeRefreshToken: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogoutHandler,
        { provide: TokenStoreService, useValue: tokenStore },
      ],
    }).compile();

    handler = module.get<LogoutHandler>(LogoutHandler);
  });

  it('should call revokeRefreshToken with the provided token', async () => {
    const command = new LogoutCommand('my-refresh-token');
    const result = await handler.execute(command);

    expect(tokenStore.revokeRefreshToken).toHaveBeenCalledWith(
      'my-refresh-token',
    );
    expect(result).toEqual({ message: 'Logged out successfully' });
  });

  it('should propagate errors from token store', async () => {
    tokenStore.revokeRefreshToken.mockRejectedValue(new Error('Redis error'));

    const command = new LogoutCommand('any-token');
    await expect(handler.execute(command)).rejects.toThrow('Redis error');
  });
});
