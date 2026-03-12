import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { LoginQuery } from '../queries/login.query';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UnauthorizedException, Inject } from '@nestjs/common';
import { UserOrmEntity } from '../../infrastructure/database/user.orm-entity';
import {
  JwtAdapterService,
  AuthTokens,
} from '../../infrastructure/jwt/jwt-adapter.service';
import { TokenStoreService } from '../../infrastructure/redis/token-store.service';
import { Role } from '../../domain/value-objects/role.enum';
import { KAFKA_SERVICE } from '../../infrastructure/kafka/kafka-producer.module';
import { ClientKafka } from '@nestjs/microservices';
import { Logger } from '@ecommerce/core';

@QueryHandler(LoginQuery)
export class LoginHandler implements IQueryHandler<LoginQuery> {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly userRepository: Repository<UserOrmEntity>,
    private readonly jwtAdapterService: JwtAdapterService,
    private readonly tokenStoreService: TokenStoreService,
    @Inject(KAFKA_SERVICE)
    private readonly kafkaClient: ClientKafka,
    private readonly logger: Logger,
  ) {}

  async execute(query: LoginQuery): Promise<AuthTokens> {
    const { email, password } = query.dto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await argon2.verify(user.passwordHash!, password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const role = user.role as Role;

    // Fire & Forget: Emit login event
    try {
      this.kafkaClient.emit('identity', {
        type: 'user.logged_in',
        data: {
          userId: user.id,
          email: user.email,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      this.logger.error('Failed to emit user.logged_in event', err);
    }

    const tokens = this.jwtAdapterService.generateTokens({
      id: user.id,
      email: user.email,
      role,
    });

    // Store refresh token in Redis so it can be validated/rotated/revoked
    await this.tokenStoreService.storeRefreshToken(
      tokens.refreshToken,
      user.id,
    );

    return tokens;
  }
}
