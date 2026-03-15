/**
 * Domain port for token storage.
 * Decouples application handlers from Redis implementation details.
 */
export interface TokenStorePort {
  /**
   * Store a refresh token for a user with 7-day TTL.
   * Key pattern: refresh:{userId}:{tokenId}
   */
  storeRefreshToken(userId: string, tokenId: string, ttlSeconds?: number): Promise<void>;

  /**
   * Retrieve the userId for a given refresh token (null if expired/not found).
   */
  getUserIdByRefreshToken(userId: string, tokenId: string): Promise<string | null>;

  /**
   * Revoke a single refresh token and remove from session index.
   */
  revokeRefreshToken(userId: string, tokenId: string): Promise<void>;

  /**
   * Revoke all refresh tokens for a user using the session index (O(1)).
   */
  revokeAllUserTokens(userId: string): Promise<void>;

  /**
   * Add a JWT ID to the access-token blocklist.
   * TTL should equal the remaining lifetime of the access token (typically 900s).
   */
  blocklistJti(jti: string, ttlSeconds: number): Promise<void>;

  /**
   * Check whether a JWT ID has been blocklisted (i.e., revoked before expiry).
   */
  isJtiBlocked(jti: string): Promise<boolean>;
}

export const TOKEN_STORE = 'TOKEN_STORE';
