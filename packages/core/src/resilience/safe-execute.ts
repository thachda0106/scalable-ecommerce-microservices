import { Logger } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Counter, Histogram } from 'prom-client';
import { StrategyType, applyStrategy } from './strategies';
import { withRetry, RetryOptions } from './retry';
import { withTimeout } from './timeout';
import { withCircuitBreaker, CircuitBreakerOptions, CircuitState } from './circuit-breaker';

// ─── Options ────────────────────────────────────────────────────────────────

export interface SafeExecuteOptions<T> {
  /** Failure strategy. Default: FAIL_CLOSE */
  strategy?: StrategyType;
  /** Retry config. Example: { attempts: 3, backoffMs: 200 } */
  retry?: RetryOptions;
  /** Timeout in milliseconds. 0 or undefined = no timeout */
  timeout?: number;
  /** Circuit breaker key. Calls with the same key share state. */
  circuitBreakerKey?: string;
  /** Circuit breaker tuning (optional, has sane defaults) */
  circuitBreakerOptions?: CircuitBreakerOptions;
  /** Fallback value factory — required for FAIL_OPEN */
  fallback?: () => T | Promise<T>;
  /** Optional label for logging/tracing (defaults to 'anonymous') */
  label?: string;
}

// ─── Prometheus Metrics (lazy singletons) ───────────────────────────────────

let execCounter: Counter | undefined;
let execDuration: Histogram | undefined;
let retryCounter: Counter | undefined;

function getMetrics() {
  if (!execCounter) {
    execCounter = new Counter({
      name: 'resilience_exec_total',
      help: 'Total safeExecute calls',
      labelNames: ['strategy', 'status', 'label'],
    });
  }
  if (!execDuration) {
    execDuration = new Histogram({
      name: 'resilience_exec_duration_seconds',
      help: 'safeExecute execution duration',
      labelNames: ['strategy', 'label'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });
  }
  if (!retryCounter) {
    retryCounter = new Counter({
      name: 'resilience_retry_total',
      help: 'Total retry attempts',
      labelNames: ['label'],
    });
  }
  return { execCounter, execDuration, retryCounter };
}

// ─── Logger ──────────────────────────────────────────────────────────────────

const logger = new Logger('Resilience');

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Executes an async function with configurable resilience:
 *
 * - **Timeout** — caps individual execution time
 * - **Retry** — exponential backoff with jitter
 * - **Circuit Breaker** — per-key failure tracking
 * - **Strategy** — determines behaviour on final failure
 * - **Observability** — auto-logs, emits metrics, creates OTel span
 *
 * Composition order: Circuit Breaker → Retry → Timeout → fn()
 *
 * @example
 * // Redis — graceful degradation
 * await safeExecute(() => redis.get(key), {
 *   strategy: 'FAIL_OPEN',
 *   timeout: 1000,
 *   fallback: () => cachedValue,
 *   circuitBreakerKey: 'redis',
 * });
 *
 * // DB — strict consistency
 * await safeExecute(() => db.query(sql), {
 *   strategy: 'FAIL_CLOSE',
 *   retry: { attempts: 3, backoffMs: 200 },
 *   circuitBreakerKey: 'db-primary',
 * });
 *
 * // Kafka — fire-and-forget
 * await safeExecute(() => producer.send(record), {
 *   strategy: 'NON_BLOCKING',
 * });
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  options: SafeExecuteOptions<T> = {},
): Promise<T | undefined> {
  const {
    strategy = StrategyType.FAIL_CLOSE,
    retry,
    timeout,
    circuitBreakerKey,
    circuitBreakerOptions,
    fallback,
    label = 'anonymous',
  } = options;

  const metrics = getMetrics();
  const tracer = trace.getTracer('resilience');
  const startTime = Date.now();
  let retryCount = 0;

  return tracer.startActiveSpan(`safeExecute:${label}`, async (span) => {
    span.setAttribute('resilience.strategy', strategy);
    span.setAttribute('resilience.label', label);
    if (circuitBreakerKey) span.setAttribute('resilience.circuitBreakerKey', circuitBreakerKey);

    try {
      // Build the execution pipeline (innermost → outermost)
      let pipeline = fn;

      // 1. Timeout — closest to actual execution
      if (timeout && timeout > 0) {
        const baseFn = pipeline;
        pipeline = () => withTimeout(baseFn, timeout);
      }

      // 2. Retry — wraps timeout
      if (retry && retry.attempts > 1) {
        const baseFn = pipeline;
        pipeline = () =>
          withRetry(baseFn, retry, (attempt, delay, err) => {
            retryCount = attempt;
            metrics.retryCounter?.inc({ label });
            logger.warn(`[${label}] Retry ${attempt}/${retry.attempts} in ${delay}ms — ${err.message}`);
            span.addEvent('retry', { attempt, delay, error: err.message });
          });
      }

      // 3. Circuit Breaker — outermost
      if (circuitBreakerKey) {
        const baseFn = pipeline;
        pipeline = () =>
          withCircuitBreaker(circuitBreakerKey, baseFn, circuitBreakerOptions, (key, from, to) => {
            logger.warn(`[${label}] Circuit '${key}': ${from} → ${to}`);
            span.addEvent('circuit_state_change', { key, from, to });
          });
      }

      const result = await pipeline();

      // ── Success path ──
      const durationMs = Date.now() - startTime;
      const durationSec = durationMs / 1000;

      metrics.execCounter?.inc({ strategy, status: 'success', label });
      metrics.execDuration?.observe({ strategy, label }, durationSec);

      logger.debug(`[${label}] OK in ${durationMs}ms (retries: ${retryCount})`);
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      // ── Failure path ──
      const durationMs = Date.now() - startTime;
      const durationSec = durationMs / 1000;

      metrics.execCounter?.inc({ strategy, status: 'failure', label });
      metrics.execDuration?.observe({ strategy, label }, durationSec);

      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);

      if (strategy === StrategyType.NON_BLOCKING) {
        logger.error(`[${label}] Non-blocking error (${durationMs}ms): ${err.message}`);
      } else {
        logger.error(`[${label}] Failed after ${durationMs}ms (retries: ${retryCount}): ${err.message}`);
      }

      const applied = applyStrategy<T>(strategy, err, fallback);
      if (applied instanceof Promise) {
        return await applied as T | undefined;
      }
      return applied as T | undefined;
    } finally {
      span.end();
    }
  });
}
