import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private nextRetryAt = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeMs: number = 30000,
  ) {}

  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextRetryAt) {
        this.logger.warn('Circuit breaker is OPEN, using fallback');
        if (fallback) return fallback();
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
      this.logger.log('Circuit breaker transitioning to HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state !== 'CLOSED') {
      this.logger.log('Circuit breaker CLOSED (recovered)');
    }
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextRetryAt = Date.now() + this.resetTimeMs;
      this.logger.warn(
        `Circuit breaker OPENED after ${this.failures} failures. Reset in ${this.resetTimeMs}ms`,
      );
    }
  }

  getState(): string {
    return this.state;
  }
}
