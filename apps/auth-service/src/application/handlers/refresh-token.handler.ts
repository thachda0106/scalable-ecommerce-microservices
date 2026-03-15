import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokenCommand } from '../commands/refresh-token.command';
import { UnauthorizedException } from '@nestjs/common';
import {
  JwtAdapterService,
  AuthTokens,
} from '../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../infrastructure/redis/token-store.service';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user-repository.port';
import { Inject } from '@nestjs/common';

/** Access token TTL in seconds — used to size the jti blocklist entry */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand>
{
  constructor(
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    const { userId, refreshToken, currentJti } = command.dto;

    // 1. Verify token exists in Redis (namespaced key)
    const storedUserId = await this.tokenStoreService.getUserIdByRefreshToken(
      userId,
      refreshToken,
    );
    if (!storedUserId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Fetch user via domain port to ensure they are still active
    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    // 3. Blocklist the old access token (jti) so it cannot be reused
    if (currentJti) {
      await this.tokenStoreService.blocklistJti(
        currentJti,
        ACCESS_TOKEN_TTL_SECONDS,
      );
    }

    // 4. Revoke the old refresh token (rotation)
    await this.tokenStoreService.revokeRefreshToken(userId, refreshToken);

    // 5. Generate new tokens
    const newTokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email.getValue(),
      role: user.role,
      tenantId: user.tenantId,
      orgId: user.orgId,
    });

    // 6. Store the new refresh token
    await this.tokenStoreService.storeRefreshToken(
      user.id,
      newTokens.refreshToken,
    );

    return newTokens;
  }
}
