import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { LoginQuery } from '../queries/login.query';
import * as argon2 from 'argon2';
import {
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Inject,
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
import { Logger } from '@ecommerce/core';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryPort,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    private readonly loginAttemptService: LoginAttemptService,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async execute(query: LoginQuery): Promise<AuthTokens> {
    const { email, password } = query.dto;

    // 1. Account lockout check — before hitting the DB
    const locked = await this.loginAttemptService.isLocked(email);
    if (locked) {
      throw new HttpException(
        'Account temporarily locked due to too many failed login attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Find user via domain port (no ORM leakage)
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      await this.loginAttemptService.recordFailedAttempt(email);
      this.emitLoginFailed(email, 'User not found or inactive');
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Password verification (Argon2 — timing-safe)
    if (!user.password) {
      // OAuth-only account — cannot login with password
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

    // 4. Clear failed attempts on successful login
    await this.loginAttemptService.clearAttempts(email);

    // 5. Generate tokens
    const tokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email.getValue(),
      role: user.role,
      tenantId: user.tenantId,
      orgId: user.orgId,
    });

    // 6. Store refresh token using namespaced key
    await this.tokenStoreService.storeRefreshToken(user.id, tokens.refreshToken);

    // 7. Emit user.logged_in event
    try {
      this.kafkaClient.emit('user.logged_in', {
        userId: user.id,
        email: user.email.getValue(),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      this.logger.error(
        'Failed to emit user.logged_in event',
        err instanceof Error ? err.message : String(err),
      );
    }

    return tokens;
  }

  private emitLoginFailed(email: string, reason: string): void {
    try {
      this.kafkaClient.emit('user.login_failed', {
        email,
        reason,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Best-effort; login failure event is non-critical
    }
  }
}
