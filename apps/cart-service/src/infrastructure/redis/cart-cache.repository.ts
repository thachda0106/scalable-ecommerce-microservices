import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ICartCache } from '../../application/ports/cart-cache.port';
import { Cart } from '../../domain/entities/cart.entity';
import { CartItem } from '../../domain/entities/cart-item.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Quantity } from '../../domain/value-objects/quantity.vo';

const CART_TTL_SECONDS = 604800; // 7 days (per ARCHITECTURE.md)

@Injectable()
export class CartCacheRepository implements ICartCache {
  private readonly logger = new Logger(CartCacheRepository.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async get(userId: string): Promise<Cart | null> {
    try {
      const raw = await this.redis.get(`cart:${userId}`);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as {
        id: string;
        userId: string;
        items: { productId: string; quantity: number; snapshottedPrice: number }[];
      };

      const items = parsed.items.map((i) =>
        CartItem.create(
          ProductId.create(i.productId),
          Quantity.create(i.quantity),
          i.snapshottedPrice,
        ),
      );

      return Cart.reconstitute(parsed.id, parsed.userId, items);
    } catch (err) {
      this.logger.warn(`Cache get failed for user ${userId}: ${err}`);
      return null;
    }
  }

  async set(userId: string, cart: Cart): Promise<void> {
    try {
      await this.redis.setex(
        `cart:${userId}`,
        CART_TTL_SECONDS,
        JSON.stringify(cart.toJSON()),
      );
    } catch (err) {
      this.logger.warn(`Cache set failed for user ${userId}: ${err}`);
    }
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(`cart:${userId}`);
    } catch (err) {
      this.logger.warn(`Cache invalidate failed for user ${userId}: ${err}`);
    }
  }
}
