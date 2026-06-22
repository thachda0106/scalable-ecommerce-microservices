import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { LoginQuery } from '../queries/login.query';
import * as argon2 from 'argon2';
import {
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../domain/ports/user-repository.port';
import {
  JwtAdapterService,
  AuthTokens,
} from '../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../infrastructure/redis/token-store.service';
import { LoginAttemptService } from '../services/auth.service';
import { KAFKA_SERVICE } from '../../infrastructure/kafka/kafka-producer.module';
import { ClientKafka } from '@nestjs/microservices';
import { safeExecute, StrategyType } from '@ecommerce/core';
import { firstValueFrom } from 'rxjs';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery> {
  private readonly logger = new Logger(LoginHandler.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    private readonly loginAttemptService: LoginAttemptService,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
  ) {}

  async execute(query: LoginQuery): Promise<AuthTokens> {
    const { email, password } = query.dto;

    const locked = await this.loginAttemptService.isLocked(email);
    if (locked) {
      throw new HttpException(
        'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      await this.loginAttemptService.recordFailedAttempt(email);
      this.emitLoginFailed(email, 'User not found or inactive');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password) {
      this.emitLoginFailed(email, 'OAuth-only account');
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await argon2.verify(
      user.password.getValue(),
      password,
    );
    if (!isValidPassword) {
      await this.loginAttemptService.recordFailedAttempt(email);
      this.emitLoginFailed(email, 'Wrong password');
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginAttemptService.clearAttempts(email);

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

    this.emitLoginSuccess(user.id, user.email.getValue());

    return tokens;
  }

  private emitLoginSuccess(userId: string, email: string): void {
    safeExecute(
      () => firstValueFrom(this.kafkaClient.emit('user.logged_in', {
        userId,
        email,
        timestamp: new Date().toISOString(),
      })),
      {
        strategy: StrategyType.NON_BLOCKING,
        label: 'auth:user.logged_in',
      },
    ).catch((err: unknown) => {
      this.logger.warn(
        `Failed to emit user.logged_in: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  private emitLoginFailed(email: string, reason: string): void {
    safeExecute(
      () => firstValueFrom(this.kafkaClient.emit('user.login_failed', {
        email,
        reason,
        timestamp: new Date().toISOString(),
      })),
      {
        strategy: StrategyType.NON_BLOCKING,
        retry: { attempts: 1, backoffMs: 500 },
        label: 'auth:user.login_failed',
      },
    ).catch(() => {}); // Best-effort; login failure event is non-critical
  }
}
