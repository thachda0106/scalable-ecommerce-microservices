import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../../../domain/entities/notification';
import { NotificationStatus } from '../../../domain/enums/notification-status.enum';
import { INotificationRepository } from '../../../domain/ports/notification-repository.port';

@Injectable()
export class InMemoryNotificationRepository implements INotificationRepository {
  private readonly logger = new Logger(InMemoryNotificationRepository.name);
  private readonly notifications: Map<string, Notification> = new Map();

  async save(notification: Notification): Promise<void> {
    this.notifications.set(notification.id, notification);
    this.logger.debug(
      `Notification ${notification.id} saved (status: ${notification.status})`,
    );
  }

  async findById(id: string): Promise<Notification | null> {
    return this.notifications.get(id) || null;
  }

  async findByCorrelationId(correlationId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(
      (n) => n.correlationId === correlationId,
    );
  }

  async findPendingRetries(limit: number): Promise<Notification[]> {
    const now = new Date();
    return Array.from(this.notifications.values())
      .filter((n) => {
        const json = n.toJSON();
        return (
          n.status === NotificationStatus.RETRYING &&
          json.nextRetryAt &&
          new Date(json.nextRetryAt) <= now
        );
      })
      .slice(0, limit);
  }

  async findFailedForDlq(limit: number): Promise<Notification[]> {
    return Array.from(this.notifications.values())
      .filter((n) => n.status === NotificationStatus.FAILED)
      .slice(0, limit);
  }
}
