import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SendNotificationCommand } from '../commands/send-notification.command';
import { Notification } from '../../domain/entities/notification';
import {
  TEMPLATE_REPOSITORY,
  ITemplateRepository,
} from '../../domain/ports/template-repository.port';
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
import { TemplateNotFoundError } from '../../domain/errors/template-not-found.error';

@CommandHandler(SendNotificationCommand)
export class SendNotificationHandler
  implements ICommandHandler<SendNotificationCommand>
{
  private readonly logger = new Logger(SendNotificationHandler.name);

  constructor(
    @Inject(TEMPLATE_REPOSITORY)
    private readonly templateRepo: ITemplateRepository,
    @Inject(CHANNEL_PROVIDER_FACTORY)
    private readonly providerFactory: IChannelProviderFactory,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: INotificationRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(cmd: SendNotificationCommand) {
    // 1. Resolve template
    const template = await this.templateRepo.findBySlug(cmd.templateSlug);
    if (!template) {
      throw new TemplateNotFoundError(cmd.templateSlug);
    }

    // 2. Render content
    const { subject, body } = template.render(cmd.variables);

    // 3. Create notification aggregate
    const notification = Notification.create({
      recipientId: cmd.recipientId,
      channel: cmd.channel,
      templateSlug: cmd.templateSlug,
      subject,
      body,
      correlationId: cmd.correlationId,
      priority: cmd.priority,
      metadata: cmd.metadata,
      recipientEmail: cmd.recipientEmail,
      recipientPhone: cmd.recipientPhone,
    });

    // 4. Get channel provider
    const provider = this.providerFactory.getProvider(cmd.channel);

    // 5. Attempt delivery
    const result = await provider.send({
      recipientId: cmd.recipientId,
      recipientEmail: cmd.recipientEmail,
      recipientPhone: cmd.recipientPhone,
      subject,
      body,
      metadata: cmd.metadata,
    });

    // 6. Handle result — domain decides retry vs fail
    if (result.success) {
      notification.markSent();
      this.logger.log(
        `Notification ${notification.id} sent via ${cmd.channel} (provider: ${result.providerMessageId})`,
      );
    } else {
      notification.markFailed(result.errorMessage ?? 'Unknown delivery error');
      this.logger.warn(
        `Notification ${notification.id} delivery failed: ${result.errorMessage}`,
      );
    }

    // 7. Persist
    await this.notificationRepo.save(notification);

    // 8. Publish domain events
    const events = notification.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    return notification.toJSON();
  }
}
