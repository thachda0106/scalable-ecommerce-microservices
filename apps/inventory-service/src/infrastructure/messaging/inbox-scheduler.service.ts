import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  Logger,
  InboxProcessor,
  InboxCleanupService,
  KafkaDlqProducer,
} from '@ecommerce/core';

/**
 * Scheduled service for inbox retry processing and cleanup.
 *
 * - Retries failed inbox events every 30 seconds
 * - Cleans up old processed events daily at 3 AM
 */
@Injectable()
export class InboxSchedulerService implements OnModuleInit {
  private readonly inboxProcessor: InboxProcessor;
  private readonly inboxCleanup: InboxCleanupService;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly dataSource: DataSource,
  ) {
    // DLQ producer for retry escalation
    const dlqProducer = new KafkaDlqProducer(
      { send: async () => [] }, // Placeholder — retries go through InboxService which has its own DLQ
      'inventory-service',
    );

    this.inboxProcessor = new InboxProcessor(
      this.dataSource,
      dlqProducer,
      'inventory-service',
    );

    this.inboxCleanup = new InboxCleanupService(this.dataSource);
  }

  onModuleInit(): void {
    this.logger.log('Inbox scheduler initialized for inventory-service');
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processRetries(): Promise<void> {
    const retried = await this.inboxProcessor.processRetries();
    if (retried > 0) {
      this.logger.log(`Inbox retry: processed ${retried} event(s)`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanup(): Promise<void> {
    const deleted = await this.inboxCleanup.cleanup();
    if (deleted > 0) {
      this.logger.log(`Inbox cleanup: deleted ${deleted} old event(s)`);
    }
  }
}
