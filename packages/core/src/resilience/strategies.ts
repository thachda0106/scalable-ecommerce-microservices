/**
 * Resilience strategies — determines behavior when a protected operation fails.
 */
export enum StrategyType {
  /** Return fallback value on failure (graceful degradation) */
  FAIL_OPEN = 'FAIL_OPEN',
  /** Throw the error immediately (strict consistency) */
  FAIL_CLOSE = 'FAIL_CLOSE',
  /** Log the error and continue (fire-and-forget) */
  NON_BLOCKING = 'NON_BLOCKING',
}

/**
 * Applies the chosen strategy to a caught error.
 * Returns a value for FAIL_OPEN/NON_BLOCKING, or throws for FAIL_CLOSE.
 */
export function applyStrategy<T>(
  strategy: StrategyType,
  error: Error,
  fallback?: () => T | Promise<T>,
): T | Promise<T> | undefined {
  switch (strategy) {
    case StrategyType.FAIL_OPEN:
      if (fallback) return fallback();
      throw error; // No fallback provided — cannot fail open
    case StrategyType.FAIL_CLOSE:
      throw error;
    case StrategyType.NON_BLOCKING:
      return undefined;
  }
}
