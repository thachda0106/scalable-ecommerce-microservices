import { BaseDomainEvent } from './base-domain.event';

export class NotificationSentEvent extends BaseDomainEvent {
  public readonly eventType = 'notification.sent';

  constructor(
    public readonly notificationId: string,
    public readonly channel: string,
    public readonly recipientId: string,
    public readonly templateSlug: string,
    public readonly sentAt: Date,
  ) {
    super();
  }
}
