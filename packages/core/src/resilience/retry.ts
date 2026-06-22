export interface RetryOptions {
  /** Number of total attempts (including the first). Default: 1 (no retry) */
  attempts: number;
  /** Base delay in ms before first retry. Doubles each attempt. Default: 100 */
  backoffMs?: number;
  /** Maximum backoff delay in ms (caps exponential growth). Default: 30000 */
  maxBackoffMs?: number;
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
  const { attempts, backoffMs = 100, maxBackoffMs = 30000 } = options;

  if (!options || attempts <= 1) {
    return fn();
  }

  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= attempts) break;

      const rawDelay = backoffMs * Math.pow(2, attempt - 1);
      const delay = jitter(Math.min(rawDelay, maxBackoffMs));
      onRetry?.(attempt, delay, lastError);
      await sleep(delay);
    }
  }

  throw lastError!;
}
