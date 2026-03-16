import { BaseDomainEvent } from './base-domain.event';

export class NotificationFailedEvent extends BaseDomainEvent {
  public readonly eventType = 'notification.failed';

  constructor(
    public readonly notificationId: string,
    public readonly channel: string,
    public readonly recipientId: string,
    public readonly reason: string,
    public readonly attempt: number,
    public readonly maxRetries: number,
  ) {
    super();
  }
}
