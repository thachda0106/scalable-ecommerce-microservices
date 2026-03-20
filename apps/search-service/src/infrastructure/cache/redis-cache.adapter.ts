import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ISearchCachePort } from '../../domain/ports/search-cache.port';
import { SearchQuery } from '../../domain/value-objects/search-query.vo';
import { safeExecute, StrategyType } from '@ecommerce/core';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisCacheAdapter implements ISearchCachePort {
  private readonly logger = new Logger(RedisCacheAdapter.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    return safeExecute(
      async () => {
        const value = await this.redis.get(key);
        if (!value) return null;
        return JSON.parse(value) as T;
      },
      {
        strategy: StrategyType.FAIL_OPEN,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        fallback: () => null,
        label: `cache:get:${key}`,
      },
    );
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await safeExecute(
      async () => {
        await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      },
      {
        strategy: StrategyType.NON_BLOCKING,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        label: `cache:set:${key}`,
      },
    );
  }

  async delete(key: string): Promise<void> {
    await safeExecute(
      async () => {
        await this.redis.del(key);
      },
      {
        strategy: StrategyType.NON_BLOCKING,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        label: `cache:delete:${key}`,
      },
    );
  }

  async invalidateAll(): Promise<void> {
    await safeExecute(
      async () => {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            'search:*',
            'COUNT',
            100,
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } while (cursor !== '0');

        // Also clear suggestion cache
        cursor = '0';
        do {
          const [nextCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            'suggest:*',
            'COUNT',
            100,
          );
          cursor = nextCursor;
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } while (cursor !== '0');

        this.logger.debug('Cache invalidated for search:* and suggest:* keys');
      },
      {
        strategy: StrategyType.NON_BLOCKING,
        timeout: 5000, // Invalidation scan might take longer
        circuitBreakerKey: 'redis',
        label: 'cache:invalidate-all',
      },
    );
  }

  generateKey(query: SearchQuery): string {
    const raw = JSON.stringify({
      q: query.query,
      f: query.filters.map((f) => ({
        field: f.field,
        op: f.operator,
        val: f.value,
      })),
      s: query.sort
        ? { field: query.sort.field, order: query.sort.order }
        : null,
      p: {
        page: query.pagination.page,
        limit: query.pagination.limit,
        cursor: query.pagination.cursor,
      },
    });

    // Simple hash function (djb2)
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 33) ^ raw.charCodeAt(i);
    }
    return `search:${(hash >>> 0).toString(36)}`;
  }
}
