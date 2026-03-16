import { BaseDomainEvent } from './base-domain.event';

export class NotificationRetryScheduledEvent extends BaseDomainEvent {
  public readonly eventType = 'notification.retry_scheduled';

  constructor(
    public readonly notificationId: string,
    public readonly channel: string,
    public readonly recipientId: string,
    public readonly attempt: number,
    public readonly nextRetryAt: Date,
  ) {
    super();
  }
}
