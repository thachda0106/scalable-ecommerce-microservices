import { Injectable, Inject } from "@nestjs/common";
import { Redis } from "ioredis";
import { REDIS_CLIENT } from "./redis.module";

@Injectable()
export class TokenStoreService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getTokenKey(tokenId: string): string {
    return `refresh:${tokenId}`;
  }

  // Store token mapping to user ID
  async storeRefreshToken(tokenId: string, userId: string): Promise<void> {
    const key = this.getTokenKey(tokenId);
    // Refresh tokens valid for 7 days (604800 seconds)
    await this.redis.set(key, userId, "EX", 604800);
  }

  // Retrieve user ID associated with a given token, resolving if it exists
  async getUserIdByRefreshToken(tokenId: string): Promise<string | null> {
    const key = this.getTokenKey(tokenId);
    return this.redis.get(key);
  }

  // Remove the specific token
  async revokeRefreshToken(tokenId: string): Promise<void> {
    const key = this.getTokenKey(tokenId);
    await this.redis.del(key);
  }
}
