import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisLockService {
  private readonly logger = new Logger(RedisLockService.name);

  /**
   * Lua script for safe lock release.
   * Only releases the lock if the stored value matches the requestId,
   * preventing accidental release of another client's lock.
   */
  private readonly RELEASE_LOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async acquireLock(
    key: string,
    requestId: string,
    ttlMs: number = 5000,
  ): Promise<boolean> {
    try {
      const result = await this.redis.set(key, requestId, 'PX', ttlMs, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`Failed to acquire lock ${key}: ${(error as Error).message}`);
      return false;
    }
  }

  async releaseLock(key: string, requestId: string): Promise<void> {
    try {
      await this.redis.eval(this.RELEASE_LOCK_SCRIPT, 1, key, requestId);
    } catch (error) {
      this.logger.warn(`Failed to release lock ${key}: ${(error as Error).message}`);
    }
  }
}
