import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ICartRepository } from '../../domain/repositories/cart-repository.interface';
import { Cart } from '../../domain/entities/cart.entity';
import { CartItem } from '../../domain/entities/cart-item.entity';
import { ProductId } from '../../domain/value-objects/product-id.vo';
import { Quantity } from '../../domain/value-objects/quantity.vo';
import { VersionConflictException } from '../../domain/exceptions';
import { CartDocument } from '../persistence/cart.schema';

/** Cart data TTL in seconds — 30 days. */
const CART_DATA_TTL = 30 * 24 * 60 * 60;

/**
 * Redis-backed cart repository with optimistic locking.
 *
 * Uses WATCH/MULTI/EXEC to detect concurrent modifications.
 * Key pattern: `cart:data:{userId}` (separate from cache namespace).
 */
@Injectable()
export class RedisCartRepository implements ICartRepository {
  private readonly logger = new Logger(RedisCartRepository.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async findByUserId(userId: string): Promise<Cart | null> {
    const raw = await this.redis.get(this.key(userId));
    if (!raw) return null;

    return this.toDomain(JSON.parse(raw) as CartDocument);
  }

  /**
   * Saves a cart with optimistic locking via Redis WATCH/MULTI/EXEC.
   *
   * Flow:
   *   1. WATCH the key — Redis monitors it for external changes
   *   2. Verify the stored version matches `cart.version` (no concurrent update)
   *   3. MULTI → SET with incremented version + EX TTL → EXEC
   *   4. If EXEC returns null, another client modified the key → throw VersionConflictException
   */
  async save(cart: Cart): Promise<void> {
    const key = this.key(cart.userId);

    // WATCH the key for changes during our transaction
    await this.redis.watch(key);

    try {
      // Read current version from Redis (within WATCH)
      const currentRaw = await this.redis.get(key);
      const currentVersion = currentRaw
        ? (JSON.parse(currentRaw) as CartDocument).version
        : -1; // -1 means key doesn't exist (new cart)

      // For existing carts, check version hasn't changed since we loaded it
      if (currentRaw && currentVersion !== cart.version) {
        await this.redis.unwatch();
        throw new VersionConflictException(cart.userId);
      }

      const json = cart.toJSON();
      const doc: CartDocument = {
        id: json.id,
        userId: json.userId,
        items: json.items,
        version: cart.version + 1,
        createdAt: json.createdAt,
        expiresAt: json.expiresAt,
        updatedAt: new Date().toISOString(),
      };

      // Execute atomically — EXEC returns null if WATCH detected a change
      const result = await this.redis
        .multi()
        .set(key, JSON.stringify(doc), 'EX', CART_DATA_TTL)
        .exec();

      if (result === null) {
        throw new VersionConflictException(cart.userId);
      }

      // Bump the in-memory version to match what's persisted
      cart.incrementVersion();
    } catch (err) {
      if (err instanceof VersionConflictException) {
        throw err;
      }
      // Ensure WATCH is released on unexpected errors
      await this.redis.unwatch().catch(() => {});
      throw err;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private key(userId: string): string {
    return `cart:data:${userId}`;
  }

  private toDomain(doc: CartDocument): Cart {
    const items = doc.items.map((i) =>
      CartItem.create(
        ProductId.create(i.productId),
        Quantity.create(i.quantity),
        i.snapshottedPrice,
      ),
    );

    return Cart.reconstitute(
      doc.id,
      doc.userId,
      items,
      doc.version,
      new Date(doc.createdAt),
      new Date(doc.expiresAt),
    );
  }
}
