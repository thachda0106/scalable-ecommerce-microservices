import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class TokenStoreService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getTokenKey(tokenId: string): string {
    return `refresh:${tokenId}`;
  }

  /** Store token → userId mapping with 7-day TTL */
  async storeRefreshToken(tokenId: string, userId: string): Promise<void> {
    const key = this.getTokenKey(tokenId);
    await this.redis.set(key, userId, 'EX', 604800);
  }

  /** Retrieve the userId for a given refresh token (null if not found/expired) */
  async getUserIdByRefreshToken(tokenId: string): Promise<string | null> {
    const key = this.getTokenKey(tokenId);
    return this.redis.get(key);
  }

  /** Revoke a single refresh token */
  async revokeRefreshToken(tokenId: string): Promise<void> {
    const key = this.getTokenKey(tokenId);
    await this.redis.del(key);
  }

  /**
   * Revoke all refresh tokens belonging to a user.
   * Uses SCAN to avoid blocking the Redis server with KEYS.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const keysToDelete: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'refresh:*',
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await this.redis.mget(...keys);
        keys.forEach((key, index) => {
          if (values[index] === userId) {
            keysToDelete.push(key);
          }
        });
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete);
    }
  }
}
