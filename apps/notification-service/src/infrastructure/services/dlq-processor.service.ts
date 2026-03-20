import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  NOTIFICATION_REPOSITORY,
  INotificationRepository,
} from '../../domain/ports/notification-repository.port';
import { MoveToDlqCommand } from '../../application/commands/move-to-dlq.command';

/**
 * Periodically moves FAILED notifications to the Dead Letter Queue.
 * First DLQ implementation in the platform.
 */
@Injectable()
export class DlqProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlqProcessorService.name);
  private intervalId: ReturnType<typeof setInterval>;

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: INotificationRepository,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    const intervalMs = parseInt(process.env.DLQ_INTERVAL_MS || '30000', 10);
    this.intervalId = setInterval(() => this.processDlq(), intervalMs);
    this.logger.log(`DLQ processor started (interval: ${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private async processDlq(): Promise<void> {
    try {
      const failed = await this.repo.findFailedForDlq(10);
      if (failed.length === 0) return;

      this.logger.log(
        `Processing ${failed.length} failed notifications for DLQ`,
      );

      for (const notification of failed) {
        try {
          await this.commandBus.execute(new MoveToDlqCommand(notification.id));
        } catch (error) {
          this.logger.error(
            `DLQ processing failed for ${notification.id}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`DLQ processor error: ${(error as Error).message}`);
    }
  }
}
