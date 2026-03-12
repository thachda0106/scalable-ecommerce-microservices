import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokenCommand } from '../commands/refresh-token.command';
import { UnauthorizedException } from '@nestjs/common';
import {
  JwtAdapterService,
  AuthTokens,
} from '../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../infrastructure/redis/token-store.service';
import { InjectRepository } from '@nestjs/typeorm';
import { UserOrmEntity } from '../../infrastructure/database/user.orm-entity';
import { Repository } from 'typeorm';
import { Role } from '../../domain/value-objects/role.enum';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<AuthTokens> {
    const { refreshToken } = command.dto;

    // 1. Verify token exists in Redis
    const userId =
      await this.tokenStoreService.getUserIdByRefreshToken(refreshToken);
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 2. Fetch user to ensure they are still active
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    // 3. Revoke the old refresh token (Rotation)
    await this.tokenStoreService.revokeRefreshToken(refreshToken);

    // 4. Generate new tokens
    const newTokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role as Role,
    });

    // 5. Store the new refresh token
    await this.tokenStoreService.storeRefreshToken(
      newTokens.refreshToken,
      user.id,
    );

    return newTokens;
  }
}
