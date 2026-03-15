import { Injectable } from '@nestjs/common';

@Injectable()
export class RetryPolicy {
  async execute<T>(
    fn: () => Promise<T>,
    opts?: {
      maxRetries?: number;
      baseDelayMs?: number;
      retryableErrors?: string[];
    },
  ): Promise<T> {
    const maxRetries = opts?.maxRetries ?? 3;
    const baseDelay = opts?.baseDelayMs ?? 100;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) throw error;

        if (
          opts?.retryableErrors &&
          !opts.retryableErrors.includes((error as Error).name)
        ) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error('Unreachable');
  }
}
