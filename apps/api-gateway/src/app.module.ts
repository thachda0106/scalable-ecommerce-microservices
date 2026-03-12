import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { getLoggerModule } from '@ecommerce/core';
import { GatewayConfig } from './config/gateway.config';
import { ProxyModule } from './modules/proxy/proxy.module';
import { AggregationModule } from './modules/aggregation/aggregation.module';
import { JwtStrategy } from './common/guards/jwt.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [GatewayConfig],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 100 }],
        storage: new ThrottlerStorageRedisService(
          `redis://${config.get<string>('redis.host', 'localhost')}:${config.get<number>('redis.port', 6379)}`,
        ),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    getLoggerModule(),
    ProxyModule,
    AggregationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    JwtStrategy,
  ],
})
export class AppModule {}
