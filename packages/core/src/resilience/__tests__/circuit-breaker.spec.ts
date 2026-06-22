import { withCircuitBreaker, CircuitState, getCircuitRegistry } from '../circuit-breaker';

describe('withCircuitBreaker', () => {
  beforeEach(() => {
    const registry = getCircuitRegistry() as Map<string, unknown>;
    registry.clear();
  });

  it('should execute the function normally in CLOSED state', async () => {
    const result = await withCircuitBreaker('test', () => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('should transition CLOSED → OPEN on repeated failures', async () => {
    const failing = () => Promise.reject(new Error('fail'));
    const threshold = 3;

    for (let i = 0; i < threshold; i++) {
      await expect(withCircuitBreaker('cb1', failing, { failureThreshold: threshold }))
        .rejects.toThrow('fail');
    }

    await expect(withCircuitBreaker('cb1', () => Promise.resolve(1), { failureThreshold: threshold }))
      .rejects.toThrow('CircuitBreaker');
  });

  it('should transition HALF_OPEN → CLOSED on success after timeout', async () => {
    const circuitKey = 'cb2';
    const failing = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(withCircuitBreaker(circuitKey, failing, {
        failureThreshold: 3,
        resetTimeoutMs: 10,
      })).rejects.toThrow('fail');
    }

    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await withCircuitBreaker(circuitKey, () => Promise.resolve(99), {
      failureThreshold: 3,
      resetTimeoutMs: 10,
    });
    expect(result).toBe(99);
  });

  it('should not throw when key is empty', async () => {
    const result = await withCircuitBreaker('', () => Promise.resolve(7));
    expect(result).toBe(7);
  });

  it('should invoke onStateChange callback on state transitions', async () => {
    const onStateChange = jest.fn();
    const circuitKey = 'cb3';
    const failing = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(
        withCircuitBreaker(circuitKey, failing, {
          failureThreshold: 3,
          resetTimeoutMs: 10,
        }, onStateChange),
      ).rejects.toThrow('fail');
    }

    expect(onStateChange).toHaveBeenCalledWith(
      circuitKey,
      CircuitState.CLOSED,
      CircuitState.OPEN,
    );
  });
});
