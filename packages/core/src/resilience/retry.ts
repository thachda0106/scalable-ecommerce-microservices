export interface RetryOptions {
  /** Number of total attempts (including the first). Default: 1 (no retry) */
  attempts: number;
  /** Base delay in ms before first retry. Doubles each attempt. Default: 100 */
  backoffMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Adds jitter (±25%) to prevent thundering-herd on retries.
 */
function jitter(delay: number): number {
  const factor = 0.75 + Math.random() * 0.5; // 0.75–1.25
  return Math.round(delay * factor);
}

/**
 * Executes `fn` with exponential backoff retry.
 * Returns the number of retries performed via the `onRetry` callback.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  onRetry?: (attempt: number, delay: number, error: Error) => void,
): Promise<T> {
  const { attempts, backoffMs = 100 } = options;

  if (!options || attempts <= 1) {
    return fn();
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt >= attempts) break;

      const delay = jitter(backoffMs * Math.pow(2, attempt - 1));
      onRetry?.(attempt, delay, error);
      await sleep(delay);
    }
  }

  throw lastError!;
}
