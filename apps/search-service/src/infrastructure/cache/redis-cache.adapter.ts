import { Injectable, Inject, Logger } from '@nestjs/common';
import { ISearchCachePort } from '../../domain/ports/search-cache.port';
import { SearchQuery } from '../../domain/value-objects/search-query.vo';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisCacheAdapter implements ISearchCachePort {
  private readonly logger = new Logger(RedisCacheAdapter.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: any, // ioredis client
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error: any) {
      this.logger.warn(`Cache get error for key ${key}: ${error.message}`);
      return null; // Graceful degradation
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error: any) {
      this.logger.warn(`Cache set error for key ${key}: ${error.message}`);
      // Graceful degradation — search still works without cache
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error: any) {
      this.logger.warn(`Cache delete error for key ${key}: ${error.message}`);
    }
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
