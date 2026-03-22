import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InboxRepository } from './inbox.repository';
import { DEFAULT_INBOX_CONFIG } from './inbox.types';

/**
 * Cleanup service for inbox event retention.
 *
 * Deletes PROCESSED and DEAD_LETTER events older than the configured retention
 * period to prevent unbounded table growth.
 *
 * @example
 * ```typescript
 * const cleanup = new InboxCleanupService(dataSource, { retentionDays: 30 });
 *
 * // In a daily cron job:
 * await cleanup.cleanup();
 * ```
 */
export class InboxCleanupService {
  private readonly logger = new Logger(InboxCleanupService.name);
  private readonly inboxRepo: InboxRepository;
  private readonly retentionDays: number;

  constructor(
    dataSource: DataSource,
    config?: { retentionDays?: number },
  ) {
    this.inboxRepo = new InboxRepository(dataSource);
    this.retentionDays = config?.retentionDays ?? DEFAULT_INBOX_CONFIG.retentionDays;
  }

  /**
   * Deletes processed/dead-letter events older than the retention period.
   *
   * @returns Number of deleted events.
   */
  async cleanup(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const deleted = await this.inboxRepo.deleteProcessedBefore(cutoffDate);

    if (deleted > 0) {
      this.logger.log(
        `Inbox cleanup: deleted ${deleted} events older than ${this.retentionDays} days`,
      );
    } else {
      this.logger.debug('Inbox cleanup: no events to delete');
    }

    return deleted;
  }
}
