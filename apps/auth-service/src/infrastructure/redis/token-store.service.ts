import { Injectable, Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { TokenStorePort } from '../../domain/ports/token-store.port';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/** 7 days in seconds */
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 604 800

@Injectable()
export class TokenStoreService implements TokenStorePort {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ── Key helpers ──────────────────────────────────────────────────────────

  private tokenKey(userId: string, tokenId: string): string {
    return `refresh:${userId}:${tokenId}`;
  }

  private sessionIndexKey(userId: string): string {
    return `sessions:${userId}`;
  }

  private jtiBlocklistKey(jti: string): string {
    return `blocklist:jti:${jti}`;
  }

  // ── Refresh token lifecycle ──────────────────────────────────────────────

  /**
   * Store a refresh token under refresh:{userId}:{tokenId}.
   * Also adds tokenId to the user's session index for O(1) full revocation.
   */
  async storeRefreshToken(
    userId: string,
    tokenId: string,
    ttlSeconds = REFRESH_TOKEN_TTL,
  ): Promise<void> {
    const key = this.tokenKey(userId, tokenId);
    await this.redis.set(key, userId, 'EX', ttlSeconds);

    // Maintain a session index so revokeAllUserTokens is O(1)
    await this.redis.sadd(this.sessionIndexKey(userId), tokenId);
    await this.redis.expire(this.sessionIndexKey(userId), ttlSeconds);
  }

  /**
   * Returns the userId if the token exists and has not expired.
   */
  async getUserIdByRefreshToken(
    userId: string,
    tokenId: string,
  ): Promise<string | null> {
    return this.redis.get(this.tokenKey(userId, tokenId));
  }

  /**
   * Revoke a single refresh token and remove it from the session index.
   */
  async revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
    await this.redis.del(this.tokenKey(userId, tokenId));
    await this.redis.srem(this.sessionIndexKey(userId), tokenId);
  }

  /**
   * Revoke all refresh tokens for a user using the session index.
   * O(1) lookup vs the previous O(N) SCAN approach.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    const sessionKey = this.sessionIndexKey(userId);
    const tokenIds = await this.redis.smembers(sessionKey);

    if (tokenIds.length > 0) {
      const keys = tokenIds.map((id) => this.tokenKey(userId, id));
      await this.redis.del(...keys);
    }
    await this.redis.del(sessionKey);
  }

  // ── Access token (jti) blocklist ─────────────────────────────────────────

  /**
   * Blocklist a JWT ID so the access token cannot be used even if not expired.
   * TTL should equal the remaining lifetime of the access token (typically 900s).
   */
  async blocklistJti(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.jtiBlocklistKey(jti), '1', 'EX', ttlSeconds);
  }

  /**
   * Returns true if the JWT ID is in the blocklist (token was revoked).
   */
  async isJtiBlocked(jti: string): Promise<boolean> {
    return (await this.redis.exists(this.jtiBlocklistKey(jti))) === 1;
  }
}
