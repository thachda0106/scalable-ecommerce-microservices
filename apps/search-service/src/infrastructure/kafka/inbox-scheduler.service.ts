import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  InboxProcessor,
  InboxCleanupService,
  KafkaDlqProducer,
  Logger,
} from '@ecommerce/core';

/**
 * Scheduled service for inbox retry processing and cleanup in search-service.
 */
@Injectable()
export class InboxSchedulerService implements OnModuleInit {
  private readonly inboxProcessor: InboxProcessor;
  private readonly inboxCleanup: InboxCleanupService;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    private readonly dataSource: DataSource,
  ) {
    const dlqProducer = new KafkaDlqProducer(
      { send: async () => [] },
      'search-service',
    );

    this.inboxProcessor = new InboxProcessor(
      this.dataSource,
      dlqProducer,
      'search-service',
    );

    this.inboxCleanup = new InboxCleanupService(this.dataSource);
  }

  onModuleInit(): void {
    this.logger.log('Inbox scheduler initialized for search-service');
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
