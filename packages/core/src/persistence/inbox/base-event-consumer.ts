import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InboxService } from './inbox.service';
import { InboxHandlerFn, InboxEventMetadata, InboxConfig } from './inbox.types';
import { KafkaDlqProducer } from '../../kafka/dlq-producer';
import { getCorrelationId } from '../../kafka/correlation';

/**
 * Abstract base class for Kafka event consumers with built-in Inbox Pattern.
 *
 * Services extend this to get automatic idempotent event processing:
 * - Deduplication via UNIQUE constraint on eventId
 * - Transactional processing with CAS locking
 * - Automatic retry scheduling and DLQ escalation
 * - Correlation ID propagation
 *
 * @example
 * ```typescript
 * // inventory-service/src/application/consumers/order-created.consumer.ts
 *
 * @Injectable()
 * export class OrderCreatedConsumer extends BaseEventConsumer {
 *   readonly eventType = ORDER_TOPICS.CREATED;
 *   readonly topic = 'order.events';
 *
 *   constructor(
 *     dataSource: DataSource,
 *     dlqProducer: KafkaDlqProducer,
 *     private readonly inventoryService: InventoryService,
 *   ) {
 *     super(dataSource, dlqProducer, 'inventory-service');
 *   }
 *
 *   async handle(payload: OrderCreatedEvent, meta: InboxEventMetadata): Promise<void> {
 *     await this.inventoryService.reserveStock(payload.items);
 *   }
 * }
 *
 * // In the Kafka consumer controller:
 * @EventPattern(ORDER_TOPICS.CREATED)
 * async onOrderCreated(@Payload() data, @Ctx() context) {
 *   await this.orderCreatedConsumer.consume(data, context);
 * }
 * ```
 */
export abstract class BaseEventConsumer {
  private readonly logger: Logger;
  private readonly inboxService: InboxService;

  /** The event type this consumer handles (e.g., 'order.created') */
  abstract readonly eventType: string;

  /** The Kafka topic this consumer listens to (for DLQ routing) */
  abstract readonly topic: string;

  constructor(
    dataSource: DataSource,
    dlqProducer: KafkaDlqProducer,
    serviceName: string,
    config?: InboxConfig,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.inboxService = new InboxService(dataSource, dlqProducer, serviceName, config);
  }

  /**
   * Domain handler — implement this in concrete consumers.
   *
   * This method is called within a DB transaction, after deduplication.
   * If it throws, the event will be retried with exponential backoff.
   *
   * @param payload - Deserialized event payload.
   * @param metadata - Event metadata (eventId, correlationId, etc.).
   */
  abstract handle(
    payload: Record<string, unknown>,
    metadata: InboxEventMetadata,
  ): Promise<void>;

  /**
   * Entry point called from the Kafka consumer controller.
   *
   * Extracts event ID and metadata from the Kafka message and delegates
   * to InboxService for deduplication and transactional processing.
   *
   * @param payload - Deserialized message value from Kafka.
   * @param kafkaHeaders - Raw Kafka message headers.
   */
  async consume(
    payload: Record<string, unknown>,
    kafkaHeaders?: Record<string, Buffer | string | undefined>,
  ): Promise<void> {
    const eventId = this.extractEventId(kafkaHeaders, payload);
    const aggregateId = this.extractAggregateId(payload);

    if (!eventId) {
      this.logger.error(
        `Inbox: missing event ID in headers/payload for type=${this.eventType}, ` +
          `rejecting message to trigger Kafka retry`,
      );
      throw new Error(
        `Missing event ID for event type ${this.eventType} — cannot deduplicate without event ID`,
      );
    }

    this.logger.debug(
      `Inbox: consuming event eventId=${eventId} type=${this.eventType}`,
    );

    const handler: InboxHandlerFn = (data, meta) => this.handle(data, meta);

    await this.inboxService.handleIncoming({
      eventId,
      eventType: this.eventType,
      aggregateId,
      payload,
      topic: this.topic,
      headers: kafkaHeaders,
      handler,
      source: this.extractSource(kafkaHeaders),
    });
  }

  /**
   * Returns the handler function for use in InboxProcessor registration.
   */
  getHandler(): InboxHandlerFn {
    return (data, meta) => this.handle(data, meta);
  }

  // ─── Extraction Helpers ────────────────────────────────────────────────

  /**
   * Extracts event ID from Kafka headers or payload.
   * Override this in subclasses if your events use a different convention.
   */
  protected extractEventId(
    headers?: Record<string, Buffer | string | undefined>,
    payload?: Record<string, unknown>,
  ): string | undefined {
    // Try Kafka header first (set by OutboxProcessor)
    if (headers?.['x-event-id']) {
      const raw = headers['x-event-id'];
      return Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw;
    }

    // Fallback: look in payload
    if (payload?.eventId && typeof payload.eventId === 'string') {
      return payload.eventId;
    }

    return undefined;
  }

  /**
   * Extracts aggregate ID from the payload.
   * Override this in subclasses if your events use different field names.
   */
  protected extractAggregateId(
    payload: Record<string, unknown>,
  ): string | undefined {
    // Common conventions
    return (
      (payload.aggregateId as string) ??
      (payload.orderId as string) ??
      (payload.userId as string) ??
      (payload.productId as string) ??
      undefined
    );
  }

  /**
   * Extracts source service name from Kafka headers.
   */
  protected extractSource(
    headers?: Record<string, Buffer | string | undefined>,
  ): string | undefined {
    if (!headers?.['x-source']) return undefined;
    const raw = headers['x-source'];
    return Buffer.isBuffer(raw) ? raw.toString('utf-8') : raw;
  }
}
