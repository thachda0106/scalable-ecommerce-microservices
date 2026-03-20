import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import { IStockCache } from '../../domain/ports/stock-cache.port';
import { ProductInventory } from '../../domain/entities/product-inventory';
import { RedisLockService } from './redis-lock.service';
import { redisConfig } from '../../config/inventory.config';
import { safeExecute, StrategyType } from '@ecommerce/core';

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
    return safeExecute(
      async () => {
        const raw = await this.redis.get(`inventory:stock:${productId}`);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        return ProductInventory.reconstitute({
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
        });
      },
      {
        strategy: StrategyType.FAIL_OPEN,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        fallback: () => null,
        label: `cache:get-stock:${productId}`,
      },
    );
  }

  async set(productId: string, inventory: ProductInventory): Promise<void> {
    await safeExecute(
      async () => {
        await this.redis.setex(
          `inventory:stock:${productId}`,
          this.config.cacheTtlSeconds,
          JSON.stringify(inventory.toJSON()),
        );
      },
      {
        strategy: StrategyType.NON_BLOCKING,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        label: `cache:set-stock:${productId}`,
      },
    );
  }

  async invalidate(productId: string): Promise<void> {
    await safeExecute(
      async () => {
        await this.redis.del(`inventory:stock:${productId}`);
      },
      {
        strategy: StrategyType.NON_BLOCKING,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        label: `cache:invalidate-stock:${productId}`,
      },
    );
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
