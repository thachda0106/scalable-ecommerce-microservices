import { Logger } from '@nestjs/common';
import { safeExecute } from '../resilience';
import { StrategyType } from '../resilience/strategies';
import { getCorrelationId } from './correlation';

/**
 * Shared KafkaDlqProducer — routes failed messages to dead-letter queue topics.
 *
 * Convention: DLQ topic = `<original-topic>.dlq`
 *
 * Usage:
 * ```typescript
 * const dlqProducer = new KafkaDlqProducer(kafkaProducer);
 * await dlqProducer.sendToDlq('order.events', message, error);
 * ```
 */
export interface KafkaMessage {
  key?: Buffer | string | null;
  value: Buffer | string | null;
  headers?: Record<string, string | Buffer | undefined>;
}

export interface KafkaProducer {
  send(record: {
    topic: string;
    messages: Array<{
      key?: string | Buffer | null;
      value: string | Buffer | null;
      headers?: Record<string, string | Buffer>;
    }>;
  }): Promise<unknown>;
}

export class KafkaDlqProducer {
  private readonly logger = new Logger(KafkaDlqProducer.name);

  constructor(
    private readonly producer: KafkaProducer,
    private readonly serviceName: string = 'unknown-service',
  ) {}

  async sendToDlq(
    originalTopic: string,
    message: KafkaMessage,
    error: Error,
    retryCount?: number,
  ): Promise<void> {
    const correlationId = getCorrelationId(message.headers as Record<string, Buffer | string | undefined>);

    await safeExecute(
      () =>
        this.producer.send({
          topic: `${originalTopic}.dlq`,
          messages: [
            {
              key: message.key as string | Buffer | null,
              value: message.value,
              headers: {
                ...(message.headers as Record<string, string | Buffer> | undefined),
                'x-dlq-reason': error.message,
                'x-dlq-timestamp': new Date().toISOString(),
                'x-dlq-original-topic': originalTopic,
                'x-dlq-service': this.serviceName,
                'x-correlation-id': correlationId,
                ...(retryCount !== undefined && { 'x-retry-count': String(retryCount) }),
              },
            },
          ],
        }),
      {
        strategy: StrategyType.NON_BLOCKING,
        retry: { attempts: 2, backoffMs: 500 },
        label: `dlq:${originalTopic}`,
      },
    );
  }
}
