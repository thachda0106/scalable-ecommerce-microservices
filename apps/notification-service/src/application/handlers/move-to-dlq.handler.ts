import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { MoveToDlqCommand } from '../commands/move-to-dlq.command';
import { NotificationStatus } from '../../domain/enums/notification-status.enum';
import {
  NOTIFICATION_REPOSITORY,
  INotificationRepository,
} from '../../domain/ports/notification-repository.port';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
} from '../../domain/ports/event-publisher.port';

@CommandHandler(MoveToDlqCommand)
export class MoveToDlqHandler implements ICommandHandler<MoveToDlqCommand> {
  private readonly logger = new Logger(MoveToDlqHandler.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(cmd: MoveToDlqCommand) {
    const notification = await this.notificationRepo.findById(
      cmd.notificationId,
    );
    if (!notification) {
      throw new Error(`Notification ${cmd.notificationId} not found`);
    }

    if (notification.status !== NotificationStatus.FAILED) {
      this.logger.warn(
        `Notification ${cmd.notificationId} is not FAILED (status: ${notification.status}), skipping DLQ`,
      );
      return notification.toJSON();
    }

    notification.markDlq();
    await this.notificationRepo.save(notification);

    const events = notification.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    this.logger.warn(
      `Notification ${notification.id} moved to DLQ | channel: ${notification.channel} | recipient: ${notification.recipientId} | template: ${notification.templateSlug}`,
    );

    return notification.toJSON();
  }
}
