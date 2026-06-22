export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;
  /** Time in ms to wait before transitioning OPEN → HALF_OPEN. Default: 10000 */
  resetTimeoutMs?: number;
}

interface CircuitData {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 10_000;

/** Global per-key circuit breaker registry */
const registry = new Map<string, CircuitData>();

/** Per-key locks to prevent concurrent state mutations */
const locks = new Map<string, Promise<void>>();

function acquireLock(key: string): Promise<() => void> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  locks.set(key, next);
  return prev.then(() => release!);
}

/** Returns the registry (useful for testing/monitoring) */
export function getCircuitRegistry(): ReadonlyMap<string, CircuitData> {
  return registry;
}

function getOrCreateCircuit(key: string): CircuitData {
  let circuit = registry.get(key);
  if (!circuit) {
    circuit = { state: CircuitState.CLOSED, failures: 0, successes: 0 };
    registry.set(key, circuit);
  }
  return circuit;
}

/**
 * Wraps an async function with circuit breaker protection.
 *
 * States:
 * - CLOSED: normal operation, failures are counted
 * - OPEN: all calls are rejected immediately
 * - HALF_OPEN: one probe call is allowed; success → CLOSED, failure → OPEN
 */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  options?: CircuitBreakerOptions,
  onStateChange?: (key: string, from: CircuitState, to: CircuitState) => void,
): Promise<T> {
  if (!key) return fn();

  const threshold = options?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
  const resetTimeout = options?.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS;
  const circuit = getOrCreateCircuit(key);

  // Check OPEN state and possibly transition to HALF_OPEN under lock
  if (circuit.state === CircuitState.OPEN) {
    const elapsed = Date.now() - (circuit.lastFailureTime ?? 0);
    if (elapsed > resetTimeout) {
      const unlock = await acquireLock(key);
      try {
        // Re-check state after acquiring lock
        if (circuit.state === CircuitState.OPEN) {
          const elapsed2 = Date.now() - (circuit.lastFailureTime ?? 0);
          if (elapsed2 > resetTimeout) {
            const prev = circuit.state;
            circuit.state = CircuitState.HALF_OPEN;
            onStateChange?.(key, prev, CircuitState.HALF_OPEN);
          } else {
            throw new Error(`CircuitBreaker '${key}' is OPEN — rejecting call`);
          }
        }
      } finally {
        unlock();
      }
    } else {
      throw new Error(`CircuitBreaker '${key}' is OPEN — rejecting call`);
    }
  }

  try {
    const result = await fn();

    // Success: reset on HALF_OPEN → CLOSED, or just clear failure count
    const unlock = await acquireLock(key);
    try {
      if (circuit.state === CircuitState.HALF_OPEN) {
        const prev = circuit.state;
        circuit.state = CircuitState.CLOSED;
        circuit.failures = 0;
        circuit.successes++;
        onStateChange?.(key, prev, CircuitState.CLOSED);
      } else {
        circuit.failures = 0;
        circuit.successes++;
      }
    } finally {
      unlock();
    }

    return result;
  } catch (error) {
    const unlock = await acquireLock(key);
    try {
      circuit.failures++;
      circuit.lastFailureTime = Date.now();

      if (circuit.state === CircuitState.HALF_OPEN || circuit.failures >= threshold) {
        const prev = circuit.state;
        circuit.state = CircuitState.OPEN;
        onStateChange?.(key, prev, CircuitState.OPEN);
      }
    } finally {
      unlock();
    }

    throw error;
  }
}
