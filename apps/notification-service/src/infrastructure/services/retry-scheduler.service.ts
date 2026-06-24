import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Logger } from '@ecommerce/core';
import { CommandBus } from '@nestjs/cqrs';
import {
  NOTIFICATION_REPOSITORY,
  INotificationRepository,
} from '../../domain/ports/notification-repository.port';
import { RetryNotificationCommand } from '../../application/commands/retry-notification.command';
import { NotificationMetricsService } from '../metrics/notification-metrics.service';

/**
 * Periodically polls for RETRYING notifications whose nextRetryAt has passed
 * and dispatches retry commands.
 */
@Injectable()
export class RetrySchedulerService implements OnModuleInit, OnModuleDestroy {
  private intervalId: ReturnType<typeof setInterval>;

  constructor(
    @Inject(Logger) private readonly logger: Logger,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: INotificationRepository,
    private readonly commandBus: CommandBus,
    private readonly metricsService: NotificationMetricsService,
  ) {}

  onModuleInit(): void {
    const intervalMs = parseInt(process.env.RETRY_INTERVAL_MS || '10000', 10);
    this.intervalId = setInterval(() => this.processRetries(), intervalMs);
    this.logger.log(`Retry scheduler started (interval: ${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async processRetries(): Promise<void> {
    try {
      const retries = await this.repo.findPendingRetries(10);
      if (retries.length === 0) return;

      this.logger.log(`Processing ${retries.length} pending retries`);

      for (const notification of retries) {
        try {
          await this.commandBus.execute(
            new RetryNotificationCommand(notification.id),
          );
          this.metricsService.incrementRetries();
        } catch (error) {
          this.logger.error(
            `Retry failed for ${notification.id}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Retry scheduler error: ${(error as Error).message}`);
    }
  }
}
