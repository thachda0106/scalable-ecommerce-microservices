import { safeExecute, SafeExecuteOptions } from '../resilience';
import { StrategyType } from '../resilience/strategies';
import { KafkaProducer } from './dlq-producer';

export interface PublishRecord {
  topic: string;
  messages: Array<{
    key?: string | Buffer | null;
    value: string | Buffer | null;
    headers?: Record<string, string | Buffer>;
  }>;
}

/**
 * Publishes a Kafka record wrapped with resilience.
 * Default: NON_BLOCKING strategy + retry 2 attempts.
 *
 * @example
 * await publishWithResilience(producer, {
 *   topic: 'order.events',
 *   messages: [{ value: JSON.stringify(event) }],
 * });
 */
export async function publishWithResilience(
  producer: KafkaProducer,
  record: PublishRecord,
  overrides?: Partial<SafeExecuteOptions<void>>,
): Promise<void> {
  await safeExecute<void>(
    () => producer.send(record),
    {
      strategy: StrategyType.NON_BLOCKING,
      retry: { attempts: 2, backoffMs: 300 },
      timeout: 5000,
      circuitBreakerKey: 'kafka',
      label: `kafka:${record.topic}`,
      ...overrides,
    },
  );
}
