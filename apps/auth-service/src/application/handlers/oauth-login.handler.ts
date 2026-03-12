import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { OAuthLoginCommand } from '../commands/oauth-login.command';
import { OAuthRegisterCommand } from '../commands/oauth-register.command';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOrmEntity } from '../../infrastructure/database/user.orm-entity';
import {
  JwtAdapterService,
  AuthTokens,
} from '../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../infrastructure/redis/token-store.service';
import { Role } from '../../domain/value-objects/role.enum';
import { UnauthorizedException } from '@nestjs/common';

@CommandHandler(OAuthLoginCommand)
export class OAuthLoginHandler implements ICommandHandler<OAuthLoginCommand> {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: OAuthLoginCommand): Promise<AuthTokens> {
    const { email, provider, providerId, firstName, lastName, picture } =
      command.profile;

    // 1. Find or create the user
    let user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      // Register via dedicated OAuth command — no dummy password
      await this.commandBus.execute(
        new OAuthRegisterCommand({
          email,
          provider,
          providerId,
          firstName,
          lastName,
          picture,
        }),
      );
      user = await this.userRepository.findOne({ where: { email } });
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'OAuth login failed: account is inactive',
      );
    }

    // 2. Generate tokens
    const tokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email,
      role: user.role as Role,
    });

    // 3. Store refresh token in Redis
    await this.tokenStoreService.storeRefreshToken(
      tokens.refreshToken,
      user.id,
    );

    return tokens;
  }
}
