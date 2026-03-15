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
import { Logger } from '@ecommerce/core';

@CommandHandler(OAuthLoginCommand)
export class OAuthLoginHandler implements ICommandHandler<OAuthLoginCommand> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    private readonly commandBus: CommandBus,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async execute(command: OAuthLoginCommand): Promise<AuthTokens> {
    const { email, provider, providerId, firstName, lastName, picture } =
      command.profile;

    // 1. Look up by (provider, providerId) FIRST — prevents email collision attacks
    let user = await this.userRepository.findByProvider(provider, providerId);

    if (!user) {
      // 2. Fallback: look up by email for first-time linking
      const existingByEmail = await this.userRepository.findByEmail(email);

      if (existingByEmail) {
        // Existing password account — link OAuth identity to it
        // For now we emit an event and proceed with the existing account.
        // A full implementation would require an explicit linking confirmation flow.
        user = existingByEmail;
        try {
          this.kafkaClient.emit('user.oauth_linked', {
            userId: existingByEmail.id,
            provider,
            providerId,
            timestamp: new Date().toISOString(),
          });
        } catch (err: unknown) {
          this.logger.error(
            'Failed to emit user.oauth_linked event',
            err instanceof Error ? err.message : String(err),
          );
        }
      } else {
        // 3. New user — register via dedicated OAuth command
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

    // 4. Generate tokens
    const tokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email.getValue(),
      role: user.role,
      tenantId: user.tenantId,
      orgId: user.orgId,
    });

    // 5. Store refresh token using namespaced key
    await this.tokenStoreService.storeRefreshToken(user.id, tokens.refreshToken);

    // 6. Emit user.logged_in event
    try {
      this.kafkaClient.emit('user.logged_in', {
        userId: user.id,
        email: user.email.getValue(),
        provider,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      this.logger.error(
        'Failed to emit user.logged_in event (OAuth)',
        err instanceof Error ? err.message : String(err),
      );
    }

    return tokens;
  }
}
