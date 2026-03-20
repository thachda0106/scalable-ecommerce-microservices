import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { RetryNotificationCommand } from '../commands/retry-notification.command';
import {
  NOTIFICATION_REPOSITORY,
  INotificationRepository,
} from '../../domain/ports/notification-repository.port';
import {
  CHANNEL_PROVIDER_FACTORY,
  IChannelProviderFactory,
} from '../../domain/ports/channel-provider.port';
import {
  EVENT_PUBLISHER,
  IEventPublisher,
} from '../../domain/ports/event-publisher.port';

@CommandHandler(RetryNotificationCommand)
export class RetryNotificationHandler implements ICommandHandler<RetryNotificationCommand> {
  private readonly logger = new Logger(RetryNotificationHandler.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
    @Inject(CHANNEL_PROVIDER_FACTORY)
    private readonly providerFactory: IChannelProviderFactory,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(cmd: RetryNotificationCommand) {
    const notification = await this.notificationRepo.findById(
      cmd.notificationId,
    );
    if (!notification) {
      throw new Error(`Notification ${cmd.notificationId} not found`);
    }

    if (!notification.canRetry()) {
      this.logger.warn(
        `Notification ${cmd.notificationId} cannot be retried (status: ${notification.status}, attempt: ${notification.attempt})`,
      );
      return notification.toJSON();
    }

    // Re-dispatch to the same channel provider
    const provider = this.providerFactory.getProvider(notification.channel);
    const result = await provider.send({
      recipientId: notification.recipientId,
      recipientEmail: notification.recipientEmail,
      recipientPhone: notification.recipientPhone,
      subject: notification.subject,
      body: notification.body,
    });

    if (result.success) {
      notification.markSent();
      this.logger.log(
        `Notification ${notification.id} retry succeeded on attempt ${notification.attempt}`,
      );
    } else {
      notification.markFailed(result.errorMessage ?? 'Retry delivery failed');
      this.logger.warn(
        `Notification ${notification.id} retry failed: ${result.errorMessage}`,
      );
    }

    await this.notificationRepo.save(notification);

    const events = notification.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    return notification.toJSON();
  }
}
