import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from '../commands/logout.command';
import { TokenStoreService } from '../../infrastructure/redis/token-store.service';

/** Access token lifetime in seconds (matches JWT expiresIn: '15m') */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(private readonly tokenStoreService: TokenStoreService) {}

  async execute(command: LogoutCommand): Promise<{ message: string }> {
    const { refreshToken, userId, jti } = command;

    // 1. Blocklist the access token's jti so it cannot be reused before expiry
    if (jti) {
      await this.tokenStoreService.blocklistJti(jti, ACCESS_TOKEN_TTL_SECONDS);
    }

    // 2. Revoke the refresh token
    await this.tokenStoreService.revokeRefreshToken(userId, refreshToken);

    return { message: 'Logged out successfully' };
  }
}
