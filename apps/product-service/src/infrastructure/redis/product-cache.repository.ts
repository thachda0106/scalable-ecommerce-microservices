import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import Redis from 'ioredis';
import { IProductCache } from '../../application/ports/product-cache.port';
import { Product } from '../../domain/entities/product.entity';
import { ProductStatusEnum } from '../../domain/value-objects/product-status.vo';
import { safeExecute, StrategyType } from '@ecommerce/core';

const PRODUCT_CACHE_TTL = 3600; // 1 hour

@Injectable()
export class ProductCacheRepository
  implements IProductCache, OnModuleInit, OnModuleDestroy
{
  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.redis.connect();
      this.logger.log('Redis cache connected');
    } catch (err) {
      this.logger.warn(
        `Redis connect failed: ${err}. Cache will be unavailable.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      // Ignore disconnect errors during shutdown
    }
  }

  async getById(productId: string): Promise<Product | null> {
    return safeExecute(
      async () => {
        const raw = await this.redis.get(`product:${productId}`);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as {
          id: string;
          name: string;
          description: string;
          price: number;
          currency: string;
          categoryId: string;
          status: string;
          version: number;
          createdAt: string;
          updatedAt: string;
        };

        return Product.reconstitute({
          id: parsed.id,
          name: parsed.name,
          description: parsed.description,
          priceInCents: Math.round(parsed.price * 100),
          currency: parsed.currency,
          categoryId: parsed.categoryId,
          status: parsed.status as ProductStatusEnum,
          version: parsed.version,
          createdAt: new Date(parsed.createdAt),
          updatedAt: new Date(parsed.updatedAt),
        });
      },
      {
        strategy: StrategyType.FAIL_OPEN,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        fallback: () => null,
        label: `cache:get-product:${productId}`,
      },
    );
  }

  async setById(productId: string, product: Product): Promise<void> {
    await safeExecute(
      async () => {
        await this.redis.setex(
          `product:${productId}`,
          PRODUCT_CACHE_TTL,
          JSON.stringify(product.toJSON()),
        );
      },
      {
        strategy: StrategyType.NON_BLOCKING, // Fire and forget write
        timeout: 1000,
        circuitBreakerKey: 'redis',
        label: `cache:set-product:${productId}`,
      },
    );
  }

  async invalidateById(productId: string): Promise<void> {
    await safeExecute(
      async () => {
        await this.redis.del(`product:${productId}`);
      },
      {
        strategy: StrategyType.NON_BLOCKING,
        timeout: 1000,
        circuitBreakerKey: 'redis',
        label: `cache:invalidate-product:${productId}`,
      },
    );
  }
}
