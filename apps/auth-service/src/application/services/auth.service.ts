import { Injectable } from '@nestjs/common';
import { LoginAttemptStore } from '../../infrastructure/redis/login-attempt.store';

/**
 * Application service providing per-user brute-force protection.
 * Wraps LoginAttemptStore with business-level semantics.
 */
@Injectable()
export class LoginAttemptService {
  constructor(private readonly store: LoginAttemptStore) {}

  async recordFailedAttempt(email: string): Promise<void> {
    await this.store.recordFailedAttempt(email);
  }

  async isLocked(email: string): Promise<boolean> {
    return this.store.isLocked(email);
  }

  async clearAttempts(email: string): Promise<void> {
    await this.store.clearAttempts(email);
  }
}
