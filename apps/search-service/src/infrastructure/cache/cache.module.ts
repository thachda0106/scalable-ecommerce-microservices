import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisCacheAdapter, REDIS_CLIENT } from './redis-cache.adapter';
import { SEARCH_CACHE_PORT } from '../../domain/ports/search-cache.port';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisClient');
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD', '');

        const redis = new Redis({
          host,
          port,
          password: password || undefined,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 3) return null; // Stop retrying
            return Math.min(times * 200, 2000);
          },
          lazyConnect: true,
        });

        redis.on('error', (err: Error) => {
          logger.warn(`Redis connection error: ${err.message}`);
        });

        redis.on('connect', () => {
          logger.log('Redis connected');
        });

        // Connect but don't block startup if Redis is unavailable
        redis.connect().catch((err: Error) => {
          logger.warn(`Redis initial connection failed: ${err.message}`);
        });

        return redis;
      },
      inject: [ConfigService],
    },
    {
      provide: SEARCH_CACHE_PORT,
      useClass: RedisCacheAdapter,
    },
  ],
  exports: [SEARCH_CACHE_PORT],
})
export class CacheModule {}
