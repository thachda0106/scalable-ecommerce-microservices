import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { InboxEventEntity } from './inbox-event.entity';
import { InboxRepository } from './inbox.repository';
import {
  InboxEventStatus,
  InboxHandlerFn,
  InboxEventMetadata,
  InboxConfig,
  DEFAULT_INBOX_CONFIG,
} from './inbox.types';
import { KafkaDlqProducer, KafkaMessage } from '../../kafka/dlq-producer';
import { getCorrelationId } from '../../kafka/correlation';

/**
 * Orchestration service for the Inbox Pattern.
 *
 * Provides the main entry point `handleIncoming()` that:
 * 1. Atomically deduplicates via UNIQUE constraint on eventId
 * 2. Marks event as PROCESSING (CAS)
 * 3. Executes the domain handler within a DB transaction
 * 4. Marks as PROCESSED on success
 * 5. Marks as FAILED on error → retry or DLQ escalation
 *
 * @example
 * ```typescript
 * const inboxService = new InboxService(dataSource, dlqProducer, 'inventory-service');
 *
 * await inboxService.handleIncoming({
 *   eventId: headers['x-event-id'],
 *   eventType: 'order.created',
 *   aggregateId: payload.orderId,
 *   payload,
 *   topic: 'order.events',
 *   headers: kafkaHeaders,
 *   handler: async (data, meta) => {
 *     await inventoryService.reserve(data.items);
 *   },
 * });
 * ```
 */
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  private readonly inboxRepo: InboxRepository;
  private readonly config: Required<InboxConfig>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly dlqProducer: KafkaDlqProducer,
    private readonly serviceName: string,
    config?: InboxConfig,
  ) {
    this.inboxRepo = new InboxRepository(dataSource);
    this.config = { ...DEFAULT_INBOX_CONFIG, ...config };
  }

  /**
   * Main entry point — handles an incoming Kafka event with full inbox guarantees.
   *
   * @param options.eventId    - Unique event identifier from producer (x-event-id header)
   * @param options.eventType  - Event type string (e.g. 'order.created')
   * @param options.aggregateId - Aggregate ID for ordering/querying (e.g. orderId)
   * @param options.payload    - Deserialized event payload
   * @param options.topic      - Original Kafka topic (for DLQ routing)
   * @param options.headers    - Raw Kafka headers (for correlation ID extraction)
   * @param options.handler    - Domain handler function to execute
   * @param options.source     - Source service name (optional)
   */
  async handleIncoming(options: {
    eventId: string;
    eventType: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    topic: string;
    headers?: Record<string, Buffer | string | undefined>;
    handler: InboxHandlerFn;
    source?: string;
  }): Promise<void> {
    const {
      eventId,
      eventType,
      aggregateId,
      payload,
      topic,
      headers,
      handler,
      source,
    } = options;

    const correlationId = getCorrelationId(headers);

    // 1. Build inbox event entity
    const inboxEvent = new InboxEventEntity();
    inboxEvent.id = randomUUID();
    inboxEvent.eventId = eventId;
    inboxEvent.eventType = eventType;
    inboxEvent.topic = topic;
    inboxEvent.aggregateId = aggregateId;
    inboxEvent.source = source;
    inboxEvent.payload = payload;
    inboxEvent.status = InboxEventStatus.RECEIVED;
    inboxEvent.retryCount = 0;
    inboxEvent.maxRetries = this.config.maxRetries;
    inboxEvent.correlationId = correlationId;

    // 2. Atomic deduplication — INSERT ON CONFLICT DO NOTHING
    const isNew = await this.inboxRepo.tryInsert(inboxEvent);

    if (!isNew) {
      // Event already exists — check if it was processed
      const existing = await this.inboxRepo.findByEventId(eventId);
      if (existing?.status === InboxEventStatus.PROCESSED) {
        this.logger.debug(
          `Inbox: skipping already-processed event eventId=${eventId}`,
        );
        return;
      }
      // If RECEIVED or FAILED, another worker may be processing or it will be retried
      if (
        existing?.status === InboxEventStatus.PROCESSING ||
        existing?.status === InboxEventStatus.DEAD_LETTER
      ) {
        this.logger.debug(
          `Inbox: event eventId=${eventId} is in status=${existing.status}, skipping`,
        );
        return;
      }
      // If FAILED, the background InboxProcessor will retry it
      if (existing?.status === InboxEventStatus.FAILED) {
        this.logger.debug(
          `Inbox: event eventId=${eventId} is FAILED, will be retried by processor`,
        );
        return;
      }
      // If RECEIVED (inserted by another concurrent worker), try to pick it up
    }

    // 3. CAS: RECEIVED → PROCESSING (prevents concurrent processing)
    let entityId: string;
    if (isNew) {
      entityId = inboxEvent.id;
    } else {
      const existing = await this.inboxRepo.findByEventId(eventId);
      if (!existing) {
        this.logger.error(`Inbox: eventId=${eventId} vanished between insert check and CAS`);
        return;
      }
      entityId = existing.id;
    }
    const acquired = await this.inboxRepo.markProcessing(entityId);
    if (!acquired) {
      this.logger.debug(
        `Inbox: failed to acquire lock for eventId=${eventId}, another worker processing`,
      );
      return;
    }

    // 4. Execute handler within DB transaction
    const metadata: InboxEventMetadata = {
      eventId,
      eventType,
      aggregateId,
      correlationId,
      source,
      receivedAt: inboxEvent.createdAt ?? new Date(),
    };

    try {
      await this.dataSource.transaction(async (_manager: EntityManager) => {
        await handler(payload, metadata);
      });

      // 5. Mark as PROCESSED
      await this.inboxRepo.markProcessed(entityId);

      this.logger.debug(
        `Inbox: processed event eventId=${eventId} type=${eventType}`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.handleFailure(entityId, eventId, eventType, topic, payload, headers, err);
    }
  }

  /**
   * Retry a previously failed event with a registered handler.
   * Used by InboxProcessor for background retries.
   */
  async retryEvent(
    event: InboxEventEntity,
    handler: InboxHandlerFn,
  ): Promise<void> {
    // CAS: FAILED → PROCESSING
    const acquired = await this.inboxRepo.markRetryProcessing(event.id);
    if (!acquired) {
      return; // Another worker picked it up
    }

    const metadata: InboxEventMetadata = {
      eventId: event.eventId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      correlationId: event.correlationId,
      source: event.source,
      receivedAt: event.createdAt,
    };

    try {
      await this.dataSource.transaction(async (_manager: EntityManager) => {
        await handler(event.payload, metadata);
      });

      await this.inboxRepo.markProcessed(event.id);

      this.logger.log(
        `Inbox: retry succeeded for eventId=${event.eventId} (attempt ${event.retryCount + 1})`,
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.handleFailure(
        event.id,
        event.eventId,
        event.eventType,
        event.topic ?? `${event.eventType}.events`,
        event.payload,
        event.correlationId
          ? { 'x-correlation-id': event.correlationId }
          : undefined,
        err,
      );
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async handleFailure(
    entityId: string,
    eventId: string,
    eventType: string,
    topic: string,
    payload: Record<string, unknown>,
    headers: Record<string, Buffer | string | undefined> | undefined,
    error: Error,
  ): Promise<void> {
    const existing = await this.inboxRepo.findByEventId(eventId);
    const newRetryCount = (existing?.retryCount ?? 0) + 1;
    const maxRetries = existing?.maxRetries ?? this.config.maxRetries;

    if (newRetryCount >= maxRetries) {
      // Exhausted all retries — move to DLQ
      await this.inboxRepo.markDeadLetter(entityId, error.message);

      const dlqMessage: KafkaMessage = {
        key: eventId,
        value: JSON.stringify(payload),
        headers: headers as Record<string, string | Buffer | undefined>,
      };

      await this.dlqProducer.sendToDlq(topic, dlqMessage, error, newRetryCount);

      this.logger.error(
        `Inbox: event eventId=${eventId} moved to DLQ after ${newRetryCount} attempts: ${error.message}`,
      );
    } else {
      // Schedule for retry with exponential backoff
      await this.inboxRepo.markFailed(
        entityId,
        error.message,
        newRetryCount,
        this.config.retryBackoffMs,
      );

      this.logger.warn(
        `Inbox: event eventId=${eventId} failed (attempt ${newRetryCount}/${maxRetries}): ${error.message}`,
      );
    }
  }
}
