import { NotificationChannel } from '../../domain/enums/notification-channel.enum';
import { NotificationPriority } from '../../domain/enums/notification-priority.enum';

export class SendNotificationCommand {
  constructor(
    public readonly recipientId: string,
    public readonly channel: NotificationChannel,
    public readonly templateSlug: string,
    public readonly variables: Record<string, string>,
    public readonly correlationId: string,
    public readonly priority?: NotificationPriority,
    public readonly recipientEmail?: string,
    public readonly recipientPhone?: string,
    public readonly metadata?: Record<string, unknown>,
  ) {}
}
