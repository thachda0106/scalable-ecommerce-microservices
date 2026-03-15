import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';

import { PassportModule } from '@nestjs/passport';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import Redis from 'ioredis';
import { getLoggerModule } from '@ecommerce/core';
import { GatewayConfig } from './config/gateway.config';
import { AggregationModule } from './modules/aggregation/aggregation.module';
import { JwtStrategy } from './common/guards/jwt.strategy';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { HttpClientModule } from './common/http-client.module';
import { GatewayController } from './controllers/gateway.controller';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { HealthController } from './controllers/health.controller';
import { REDIS_CLIENT } from './common/constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [GatewayConfig],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(
          `redis://${config.get<string>(
            'gateway.redis.host',
            'localhost',
          )}:${config.get<number>('gateway.redis.port', 6379)}`,
        ),
      }),
    }),
    HttpClientModule,
    TerminusModule,

    getLoggerModule(),
    AggregationModule,
  ],
  controllers: [GatewayController, HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new TimeoutInterceptor(
          config.get<number>('gateway.timeout', 5000),
        );
      },
    },
    JwtStrategy,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('gateway.redis.host', 'localhost');
        const port = config.get<number>('gateway.redis.port', 6379);
        return new Redis({ host, port, lazyConnect: true });
      },
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
