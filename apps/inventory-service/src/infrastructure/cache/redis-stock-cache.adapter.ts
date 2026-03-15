import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { IStockCache } from '../../domain/ports/stock-cache.port';
import { ProductInventory } from '../../domain/entities/product-inventory';
import { RedisLockService } from './redis-lock.service';
import { redisConfig } from '../../config/inventory.config';

@Injectable()
export class RedisStockCacheAdapter implements IStockCache {
  private readonly logger = new Logger(RedisStockCacheAdapter.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly lockService: RedisLockService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  async get(productId: string): Promise<ProductInventory | null> {
    try {
      const raw = await this.redis.get(`inventory:stock:${productId}`);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      return ProductInventory.reconstitute({
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
      });
    } catch (error) {
      this.logger.warn(
        `Cache get failed for ${productId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async set(productId: string, inventory: ProductInventory): Promise<void> {
    try {
      await this.redis.setex(
        `inventory:stock:${productId}`,
        this.config.cacheTtlSeconds,
        JSON.stringify(inventory.toJSON()),
      );
    } catch (error) {
      this.logger.warn(
        `Cache set failed for ${productId}: ${(error as Error).message}`,
      );
    }
  }

  async invalidate(productId: string): Promise<void> {
    try {
      await this.redis.del(`inventory:stock:${productId}`);
    } catch (error) {
      this.logger.warn(
        `Cache invalidate failed for ${productId}: ${(error as Error).message}`,
      );
    }
  }

  async acquireLock(
    productId: string,
    requestId: string,
    ttlMs?: number,
  ): Promise<boolean> {
    return this.lockService.acquireLock(
      `inventory:lock:${productId}`,
      requestId,
      ttlMs ?? this.config.lockTtlMs,
    );
  }

  async releaseLock(productId: string, requestId: string): Promise<void> {
    return this.lockService.releaseLock(
      `inventory:lock:${productId}`,
      requestId,
    );
  }
}
