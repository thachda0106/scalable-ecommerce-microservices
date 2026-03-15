import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './token-store.service';

/** Number of failed attempts before the account is locked */
const MAX_ATTEMPTS = 5;

/** Lockout window in seconds (15 minutes) */
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class LoginAttemptStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private attemptsKey(email: string): string {
    return `login:attempts:${email}`;
  }

  private lockedKey(email: string): string {
    return `login:locked:${email}`;
  }

  /**
   * Increment failed attempt count for the given email.
   * Locks the account after MAX_ATTEMPTS failures within LOCKOUT_WINDOW_SECONDS.
   */
  async recordFailedAttempt(email: string): Promise<void> {
    const key = this.attemptsKey(email);
    const count = await this.redis.incr(key);
    // Refresh the window on every failed attempt
    await this.redis.expire(key, LOCKOUT_WINDOW_SECONDS);

    if (count >= MAX_ATTEMPTS) {
      await this.redis.set(
        this.lockedKey(email),
        '1',
        'EX',
        LOCKOUT_WINDOW_SECONDS,
      );
    }
  }

  /**
   * Returns true if the account is currently locked.
   */
  async isLocked(email: string): Promise<boolean> {
    return (await this.redis.exists(this.lockedKey(email))) === 1;
  }

  /**
   * Clear failed attempt counter and any existing lock (called on successful login).
   */
  async clearAttempts(email: string): Promise<void> {
    await this.redis.del(this.attemptsKey(email), this.lockedKey(email));
  }
}
