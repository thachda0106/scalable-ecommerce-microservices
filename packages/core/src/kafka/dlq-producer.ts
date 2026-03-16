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
  }): Promise<void>;
}

export class KafkaDlqProducer {
  constructor(private readonly producer: KafkaProducer) {}

  async sendToDlq(
    originalTopic: string,
    message: KafkaMessage,
    error: Error,
  ): Promise<void> {
    await this.producer.send({
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
          },
        },
      ],
    });
  }
}
