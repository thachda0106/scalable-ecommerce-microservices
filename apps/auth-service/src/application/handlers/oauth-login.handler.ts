import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { OAuthLoginCommand } from '../commands/oauth-login.command';
import { OAuthRegisterCommand } from '../commands/oauth-register.command';
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
import { UnauthorizedException } from '@nestjs/common';
import { KAFKA_SERVICE } from '../../infrastructure/kafka/kafka-producer.module';
import { ClientKafka } from '@nestjs/microservices';
import { safeExecute, StrategyType, Logger } from '@ecommerce/core';
import { firstValueFrom } from 'rxjs';

@CommandHandler(OAuthLoginCommand)
export class OAuthLoginHandler implements ICommandHandler<OAuthLoginCommand> {

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    private readonly commandBus: CommandBus,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
  ) {}

  async execute(command: OAuthLoginCommand): Promise<AuthTokens> {
    const { email, provider, providerId, firstName, lastName, picture } =
      command.profile;

    let user = await this.userRepository.findByProvider(provider, providerId);

    if (!user) {
      const existingByEmail = await this.userRepository.findByEmail(email);

      if (existingByEmail) {
        user = existingByEmail;
        this.emitOAuthLinked(existingByEmail.id, provider, providerId);
      } else {
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
        user = await this.userRepository.findByProvider(provider, providerId);
      }
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'OAuth login failed: account is inactive',
      );
    }

    const tokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email.getValue(),
      role: user.role,
      tenantId: user.tenantId,
      orgId: user.orgId,
    });

    await this.tokenStoreService.storeRefreshToken(
      user.id,
      tokens.refreshToken,
    );

    this.emitOAuthLogin(user.id, user.email.getValue(), provider);

    return tokens;
  }

  private emitOAuthLogin(userId: string, email: string, provider: string): void {
    safeExecute(
      () => firstValueFrom(this.kafkaClient.emit('user.logged_in', {
        userId,
        email,
        provider,
        timestamp: new Date().toISOString(),
      })),
      {
        strategy: StrategyType.NON_BLOCKING,
        label: 'auth:user.logged_in:oauth',
      },
    ).catch((err: unknown) => {
      this.logger.warn(
        `Failed to emit user.logged_in (OAuth): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  private emitOAuthLinked(userId: string, provider: string, providerId: string): void {
    safeExecute(
      () => firstValueFrom(this.kafkaClient.emit('user.oauth_linked', {
        userId,
        provider,
        providerId,
        timestamp: new Date().toISOString(),
      })),
      {
        strategy: StrategyType.NON_BLOCKING,
        retry: { attempts: 1, backoffMs: 500 },
        label: 'auth:user.oauth_linked',
      },
    ).catch(() => {});
  }
}
