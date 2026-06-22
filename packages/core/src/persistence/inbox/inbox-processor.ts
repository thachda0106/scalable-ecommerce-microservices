import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InboxRepository } from './inbox.repository';
import { InboxService } from './inbox.service';
import { InboxHandlerFn, InboxConfig, DEFAULT_INBOX_CONFIG } from './inbox.types';
import { KafkaDlqProducer } from '../../kafka/dlq-producer';

/**
 * Background inbox processor — polls failed events and retries them.
 *
 * Analogous to OutboxProcessor but for the consumer side.
 * Runs on a schedule (e.g., setInterval or @Cron) and picks up events that:
 * - Have status = FAILED
 * - Have retryCount < maxRetries
 * - Have nextRetryAt <= NOW (backoff expired)
 *
 * @example
 * ```typescript
 * const processor = new InboxProcessor(dataSource, dlqProducer, 'inventory-service');
 * processor.registerHandler('order.created', async (payload, meta) => {
 *   await inventoryService.reserve(payload.items);
 * });
 *
 * // In a cron job or setInterval:
 * await processor.processRetries();
 * ```
 */
export class InboxProcessor {
  private readonly logger = new Logger(InboxProcessor.name);
  private readonly inboxRepo: InboxRepository;
  private readonly inboxService: InboxService;
  private readonly config: Required<InboxConfig>;
  private readonly handlers = new Map<string, InboxHandlerFn>();

  constructor(
    dataSource: DataSource,
    dlqProducer: KafkaDlqProducer,
    serviceName: string,
    config?: InboxConfig,
  ) {
    this.config = { ...DEFAULT_INBOX_CONFIG, ...config };
    this.inboxRepo = new InboxRepository(dataSource);
    this.inboxService = new InboxService(dataSource, dlqProducer, serviceName, config);
  }

  /**
   * Register a handler for a specific event type.
   * The processor uses this to know HOW to retry each event type.
   */
  registerHandler(eventType: string, handler: InboxHandlerFn): void {
    this.handlers.set(eventType, handler);
    this.logger.log(`Inbox handler registered for event type: ${eventType}`);
  }

  /**
   * Polls and retries failed inbox events.
   * Each event is retried individually with its registered handler.
   *
   * @returns Number of events successfully retried.
   */
  async processRetries(): Promise<number> {
    const events = await this.inboxRepo.findRetryable(
      this.config.processorBatchSize,
    );

    if (events.length === 0) return 0;

    let retried = 0;

    for (const event of events) {
      const handler = this.handlers.get(event.eventType);
      if (!handler) {
        this.logger.warn(
          `Inbox: no handler registered for event type "${event.eventType}", ` +
            `skipping eventId=${event.eventId}`,
        );
        continue;
      }

      try {
        await this.inboxService.retryEvent(event, handler);
        retried++;
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Inbox: unexpected error retrying eventId=${event.eventId}: ${err.message}`,
        );
      }
    }

    this.logger.debug(
      `Inbox processor: retried ${retried}/${events.length} events`,
    );
    return retried;
  }
}
