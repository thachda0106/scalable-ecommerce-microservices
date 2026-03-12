import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthController } from './interfaces/controllers/auth.controller';
import { getLoggerModule } from '@ecommerce/core';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { KafkaProducerModule } from './infrastructure/kafka/kafka-producer.module';
import { AuthJwtModule } from './infrastructure/jwt/jwt.module';
import { RegisterHandler } from './application/handlers/register.handler';
import { LoginHandler } from './application/handlers/login.handler';
import { RefreshTokenHandler } from './application/handlers/refresh-token.handler';
import { LogoutHandler } from './application/handlers/logout.handler';
import { OAuthRegisterHandler } from './application/handlers/oauth-register.handler';
import { OAuthLoginHandler } from './application/handlers/oauth-login.handler';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { OAuthModule } from './infrastructure/oauth/oauth.module';
import { OAuthController } from './interfaces/controllers/oauth.controller';
import { REDIS_CLIENT } from './infrastructure/redis/token-store.service';
import type { Redis } from 'ioredis';

const CommandHandlers = [
  RegisterHandler,
  RefreshTokenHandler,
  LogoutHandler,
  OAuthRegisterHandler,
  OAuthLoginHandler,
];
const QueryHandlers = [LoginHandler];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CqrsModule,
    getLoggerModule(),
    DatabaseModule,
    RedisModule,
    KafkaProducerModule,
    AuthJwtModule,
    OAuthModule,
    ThrottlerModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        // Login and Auth generic throttling: max 10 requests per 1 minute
        throttlers: [{ ttl: 60000, limit: 10 }],
        storage: new ThrottlerStorageRedisService(redis),
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [...CommandHandlers, ...QueryHandlers],
})
export class AppModule {}
